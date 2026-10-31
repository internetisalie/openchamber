import { describe, expect, test } from "bun:test"
import assert from 'node:assert/strict'
import type { FileReadResult, FileStatResult, FilesAPI } from "@/lib/api/types"
import { FilesystemError } from '@/lib/api/files-errors'
import { createContentCachedFiles } from "./content-cache-owner"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe("content cache owner", () => {
  test("reuses only strongly validated content", async () => {
    let reads = 0
    const files = {
      readFile: async (path: string) => ({ path, content: `value-${++reads}` }),
      statFile: async () => ({ isFile: true, isDirectory: false, size: 7, mtimeMs: 1 }),
    } as unknown as FilesAPI
    const owner = createContentCachedFiles(files)

    expect((await owner.files.readFile!("file.ts")).content).toBe("value-1")
    expect((await owner.files.readFile!("file.ts")).content).toBe("value-1")
    expect(reads).toBe(1)
    owner.dispose()
  })

  test("does not retain size-only reads without mtime", async () => {
    let reads = 0
    const owner = createContentCachedFiles({
      readFile: async (path: string) => ({ path, content: `value-${++reads}` }),
      statFile: async () => ({ isFile: true, isDirectory: false, size: 7 }),
    } as unknown as FilesAPI)

    await owner.files.readFile!("file.ts")
    await owner.files.readFile!("file.ts")
    expect(reads).toBe(2)
    owner.dispose()
  })

  test("bypasses metadata cache for an authoritative read", async () => {
    let content = "old"
    let reads = 0
    const owner = createContentCachedFiles({
      readFile: async (path: string) => {
        reads += 1
        return { path, content }
      },
      statFile: async () => ({ isFile: true, isDirectory: false, size: 3, mtimeMs: 1 }),
    } as unknown as FilesAPI)

    await owner.files.readFile!("file.ts")
    content = "new"
    expect((await owner.files.readFile!("file.ts")).content).toBe("old")
    expect((await owner.files.readFile!("file.ts", { fresh: true })).content).toBe("new")
    expect(reads).toBe(2)
    owner.dispose()
  })

  test("retries a read that overlaps a write", async () => {
    const firstRead = deferred<{ path: string; content: string }>()
    let content = "old"
    let reads = 0
    const owner = createContentCachedFiles({
      readFile: async (path: string) => {
        reads += 1
        return reads === 1 ? firstRead.promise : { path, content }
      },
      statFile: async () => ({ isFile: true, isDirectory: false, size: content.length, mtimeMs: content === "old" ? 1 : 2 }),
      writeFile: async (_path: string, next: string) => { content = next },
    } as unknown as FilesAPI)

    const reading = owner.files.readFile!("file.ts")
    await owner.files.writeFile!("file.ts", "new")
    firstRead.resolve({ path: "file.ts", content: "old" })

    expect((await reading).content).toBe("new")
    expect(reads).toBe(2)
    owner.dispose()
  })

  test("separates identical paths by directory scope", async () => {
    let reads = 0
    const owner = createContentCachedFiles({
      readFile: async (path: string, options?: Parameters<NonNullable<FilesAPI['readFile']>>[1]) => ({ path, content: `${options?.directory}-${++reads}` }),
      statFile: async () => ({ isFile: true, isDirectory: false, size: 1, mtimeMs: 1 }),
    } as unknown as FilesAPI)

    const first = await owner.files.readFile!("file.ts", { directory: "/a" })
    const second = await owner.files.readFile!("file.ts", { directory: "/b" })
    expect(first.content).toBe("/a-1")
    expect(second.content).toBe("/b-2")
    owner.dispose()
  })

  test("disposed owners throw on subsequent reads", async () => {
    const owner = createContentCachedFiles({
      readFile: async (path: string) => ({ path, content: "value" }),
      statFile: async () => ({ isFile: true, isDirectory: false, size: 5, mtimeMs: 1 }),
    } as unknown as FilesAPI)

    owner.dispose()
    await expect(owner.files.readFile!("notes.txt", { optional: true, directory: "/tmp/project" }))
      .rejects.toThrow("File cache owner disposed")
  })

  test("runtime endpoint changes clear cache but keep serving reads", async () => {
    const originalWindow = globalThis.window
    const events = new EventTarget()
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
        dispatchEvent: events.dispatchEvent.bind(events),
      },
    })

    try {
      let reads = 0
      const owner = createContentCachedFiles({
        readFile: async (path: string) => ({ path, content: `value-${++reads}` }),
        statFile: async () => ({ isFile: true, isDirectory: false, size: 7, mtimeMs: 1 }),
      } as unknown as FilesAPI)

      expect((await owner.files.readFile!("notes.txt")).content).toBe("value-1")
      window.dispatchEvent(new CustomEvent("openchamber:runtime-endpoint-will-change", {
        detail: {
          apiBaseUrl: "http://127.0.0.1:3902",
          previousApiBaseUrl: "http://127.0.0.1:3901",
          runtimeKey: "url:http://127.0.0.1:3902",
          previousRuntimeKey: "url:http://127.0.0.1:3901",
        },
      }))
      expect((await owner.files.readFile!("notes.txt")).content).toBe("value-2")
      expect(reads).toBe(2)
      owner.dispose()
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      })
    }
  })
})

const remoteFixture = () => {
  let sourceIdentity = 'workspace-live-a'
  let content = 'old'
  let reads = 0
  const files: FilesAPI = {
    listDirectory: async () => ({ directory: '/repo', entries: [] }),
    search: async () => [],
    createDirectory: async (path) => ({ path, success: true }),
    resolveWorkspaceFileSource: async () => ({ kind: 'remote', sourceIdentity }),
    statFile: async (path) => ({ path, isFile: true, size: 3, mtimeMs: 1, sourceIdentity }),
    readFile: async (path) => { reads++; return { path, content, sourceIdentity } },
  }
  return { files, reads: () => reads, replace: () => { sourceIdentity = 'workspace-live-b'; content = 'new' } }
}

describe('remote content cache ownership', () => {
  test('validates opaque source identity by UTF8 byte length at the 1024-byte boundary', async () => {
    for (const identity of ['a'.repeat(1024), 'a'.repeat(1025), 'é'.repeat(512), 'é'.repeat(512) + 'x']) {
      const fixture = remoteFixture()
      let reads = 0
      fixture.files.resolveWorkspaceFileSource = async () => ({ kind: 'remote', sourceIdentity: identity })
      fixture.files.statFile = async (path) => ({ path, isFile: true, size: 3, mtimeMs: 1, sourceIdentity: identity })
      fixture.files.readFile = async (path) => { reads++; return { path, content: 'old', sourceIdentity: identity } }
      const owner = createContentCachedFiles(fixture.files)
      try {
        if (identity === 'a'.repeat(1024) || identity === 'é'.repeat(512)) {
          expect((await owner.files.readFile!('/repo/a')).sourceIdentity).toBe(identity)
          expect((await owner.files.readFile!('/repo/a')).sourceIdentity).toBe(identity)
          expect(reads).toBe(1)
        } else {
          await assert.rejects(owner.files.readFile!('/repo/a'), { status: 503, reason: 'invalid-response' })
          expect(reads).toBe(0)
        }
      } finally { owner.dispose() }
    }
  })

  test('rejects and evicts same-size/same-mtime content from another binding', async () => {
    const fixture = remoteFixture()
    const owner = createContentCachedFiles(fixture.files)
    try {
      expect((await owner.files.readFile!('/repo/a')).content).toBe('old')
      fixture.replace()
      await assert.rejects(owner.files.readFile!('/repo/a'), { status: 409, reason: 'remote-source-changed' })
      expect(fixture.reads()).toBe(1)
      expect((await owner.files.readFile!('/repo/a')).content).toBe('new')
      expect(fixture.reads()).toBe(2)
    } finally { owner.dispose() }
  })

  test('rejects missing identity and partial metadata before reading', async () => {
    for (const stat of [
      { path: '/repo/a', isFile: true, size: 3, mtimeMs: 1 },
      { path: '/repo/a', isFile: true, size: 3, sourceIdentity: 'workspace-live-a' },
      { path: '/repo/a', isFile: true, size: Number.NaN, mtimeMs: 1, sourceIdentity: 'workspace-live-a' },
    ]) {
      const fixture = remoteFixture()
      fixture.files.statFile = async () => stat
      const owner = createContentCachedFiles(fixture.files)
      try {
        await assert.rejects(owner.files.readFile!('/repo/a'), { status: 503, reason: 'invalid-response' })
        expect(fixture.reads()).toBe(0)
      } finally { owner.dispose() }
    }
  })

  test('does not swallow unavailable/conflict stat errors on a fresh read or hit', async () => {
    for (const failure of [new FilesystemError('not found while offline', { status: 503, reason: 'remote-unavailable' }),
      new FilesystemError('changed', { status: 409, reason: 'remote-source-changed' })]) {
      const fixture = remoteFixture()
      const originalStat = fixture.files.statFile!
      const owner = createContentCachedFiles(fixture.files)
      try {
        await owner.files.readFile!('/repo/a')
        fixture.files.statFile = async () => { throw failure }
        await assert.rejects(owner.files.readFile!('/repo/a'), (error) => error === failure)
        await assert.rejects(owner.files.readFile!('/repo/a', { fresh: true }), (error) => error === failure)
        expect(fixture.reads()).toBe(1)
        fixture.files.statFile = originalStat
        await owner.files.readFile!('/repo/a')
        expect(fixture.reads()).toBe(2)
      } finally { owner.dispose() }
    }
  })

  test('preserves a post-read stat failure instead of returning/cache-retaining content', async () => {
    const fixture = remoteFixture()
    const originalStat = fixture.files.statFile!
    let stats = 0
    const failure = new FilesystemError('remote unavailable', { status: 503, reason: 'remote-unavailable' })
    fixture.files.statFile = async (path, options) => {
      if (++stats === 2) throw failure
      return originalStat(path, options)
    }
    const owner = createContentCachedFiles(fixture.files)
    try {
      await assert.rejects(owner.files.readFile!('/repo/a'), (error) => error === failure)
      await owner.files.readFile!('/repo/a')
      expect(fixture.reads()).toBe(2)
    } finally { owner.dispose() }
  })

  test('requires matching read identity and after-stat identity before retaining bytes', async () => {
    for (const breakRead of [true, false]) {
      const fixture = remoteFixture()
      const originalRead = fixture.files.readFile!
      fixture.files.readFile = async (path, options) => {
        const result = await originalRead(path, options)
        if (breakRead) return { ...result, sourceIdentity: undefined }
        fixture.replace()
        return result
      }
      const owner = createContentCachedFiles(fixture.files)
      try {
        await assert.rejects(owner.files.readFile!('/repo/a'), {
          status: breakRead ? 503 : 409, reason: breakRead ? 'invalid-response' : 'remote-source-changed',
        })
      } finally { owner.dispose() }
    }
  })

  test('rechecks current source after matching operation metadata', async () => {
    const fixture = remoteFixture()
    const originalStat = fixture.files.statFile!
    let stats = 0
    fixture.files.statFile = async (path, options) => {
      const result = await originalStat(path, options)
      if (++stats === 2) fixture.replace()
      return result
    }
    const owner = createContentCachedFiles(fixture.files)
    try {
      await assert.rejects(owner.files.readFile!('/repo/a'), { status: 409, reason: 'remote-source-changed' })
      expect(fixture.reads()).toBe(1)
    } finally { owner.dispose() }
  })

  test('preserves identity-only optional absence without fabricated zero metadata or caching', async () => {
    const fixture = remoteFixture()
    fixture.files.statFile = async (path): Promise<FileStatResult> => ({ path, exists: false, isFile: false, sourceIdentity: 'workspace-live-a' })
    let reads = 0
    fixture.files.readFile = async (path) => { reads++; return { path, content: '', sourceIdentity: 'workspace-live-a' } }
    const owner = createContentCachedFiles(fixture.files)
    try {
      expect((await owner.files.readFile!('/repo/a', { optional: true })).content).toBe('')
      await owner.files.readFile!('/repo/a', { optional: true })
      expect(reads).toBe(2)
    } finally { owner.dispose() }
  })

  test('old remote normal/fresh reads reject rather than reading the new runtime', async () => {
    const originalWindow = globalThis.window
    const events = new EventTarget()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    } })
    try {
      for (const fresh of [false, true]) {
        const fixture = remoteFixture()
        const started = deferred<void>()
        const pending = deferred<FileReadResult>()
        let reads = 0
        fixture.files.readFile = async () => { reads++; started.resolve(undefined); return pending.promise }
        const owner = createContentCachedFiles(fixture.files)
        try {
          const reading = owner.files.readFile!('/repo/a', { fresh })
          const settled = reading.then((value) => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }))
          await started.promise
          events.dispatchEvent(new CustomEvent('openchamber:runtime-endpoint-will-change', { detail: {
            runtimeKey: 'url:next', previousRuntimeKey: 'url:old',
          } }))
          pending.resolve({ path: '/repo/a', content: 'old', sourceIdentity: 'workspace-live-a' })
          expect(await settled).toMatchObject({ ok: false, error: { status: 409, reason: 'remote-source-changed' } })
          expect(reads).toBe(1)
        } finally { owner.dispose() }
      }
    } finally { Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow }) }
  })
})
