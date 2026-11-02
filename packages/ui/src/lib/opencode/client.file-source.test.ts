import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test"
import * as runtimeTransport from "@/lib/runtime-fetch"
import * as runtimeUrls from "@/lib/runtime-url"
import * as runtimeIdentity from "@/lib/runtime-switch"
import * as runtimeRegistry from "@/contexts/runtimeAPIRegistry"
import * as startupTrace from "@/lib/startupTrace"
import { isAmbiguousTransportFailure, isDefiniteTransportFailure } from "@/lib/relay/transport-error"
import type { JsonValue } from "./model"

type Transport = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
const calls: Array<{ url: URL; method: string; headers: Headers; signal?: AbortSignal | null }> = []
let transport: Transport
let baseUrl = "https://files.test/runtime/selected/api"
mock.module("@/lib/runtime-fetch", () => ({
  ...runtimeTransport,
  runtimeFetch: mock<Transport>((input, init) => {
    calls.push({
      url: new URL(input instanceof Request ? input.url : String(input)),
      method: String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
      headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
      signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
    })
    return transport(input, init)
  }),
}))
mock.module("@/lib/runtime-url", () => ({ ...runtimeUrls, getRuntimeUrlResolver: () => ({ api: () => baseUrl }) }))
mock.module("@/contexts/runtimeAPIRegistry", () => ({ ...runtimeRegistry, getRegisteredRuntimeAPIs: () => null }))
mock.module("@/lib/runtime-switch", () => ({
  ...runtimeIdentity, getRuntimeApiBaseUrl: () => "", getRuntimeKey: () => "file-source-test", captureRuntimeInstance: () => () => true,
}))
mock.module("@/lib/startupTrace", () => ({ ...startupTrace, markStartupTrace: () => undefined }))

const { opencodeClient, OpencodeApiError }: typeof import("./client") = await import(`./client?file-source-test=${Date.now()}`)
const encoder = new TextEncoder()
const root = "/repo/space here"
const source = "opaque source/α?not-a-hash"
const options = { directory: root, expectedSourceIdentity: source }
const envelope = (data: Array<{ path: string; type: string }> = [], sourceIdentity = source) => ({
  location: { directory: root }, data, sourceIdentity,
})
const streamed = (bytes: Uint8Array, status = 200, contentType = "application/json") => {
  const state = { bytes: 0, cancels: 0, ended: false }
  let offset = 0
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.byteLength) { state.ended = true; controller.close(); return }
      const chunk = bytes.slice(offset, offset + 4093)
      offset += chunk.byteLength
      state.bytes += chunk.byteLength
      controller.enqueue(chunk)
    },
    cancel() { state.cancels += 1 },
  }, { highWaterMark: 0 }), { status, headers: { "content-type": contentType } })
  return { response, state }
}
const respond = (body: JsonValue, status = 200) => {
  const original = streamed(encoder.encode(JSON.stringify(body)), status)
  transport = async () => original.response
  return original
}
const failure = async <T>(pending: Promise<T>) => {
  try {
    await pending
  } catch (error) {
    if (!(error instanceof OpencodeApiError)) throw new Error("Expected source-aware API error", { cause: error })
    return error
  }
  throw new Error("Expected a rejected search, not empty results")
}
const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { resolve, promise }
}

beforeEach(() => {
  calls.length = 0
  baseUrl = "https://files.test/runtime/selected/api"
  opencodeClient.reconnectToRuntimeBaseUrl()
  opencodeClient.setDirectory(undefined)
  transport = async () => { throw new Error("Unexpected request") }
})
afterEach(() => jest.useRealTimers())

describe("source-aware real SDK file.find", () => {
  for (const empty of [true, false]) test(`retains the top-level opaque token on ${empty ? "empty" : "nonempty"} results`, async () => {
    const original = respond(envelope(empty ? [] : [{ path: "src/café.ts", type: "file" }]))
    const outcome = await opencodeClient.searchFilesWithSource("café", { ...options, type: "file", limit: 250 })
    expect(outcome).toEqual({
      sourceIdentity: source,
      files: empty ? [] : [{ name: "café.ts", path: `${root}/src/café.ts`, relativePath: "src/café.ts", extension: "ts" }],
    })
    expect(original.response.bodyUsed).toBe(true)
    expect(original.state.ended).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url.pathname).toBe("/runtime/selected/api/fs/find")
    expect([...calls[0].url.searchParams.entries()].sort()).toEqual([["limit", "100"], ["query", "café"], ["type", "file"]])
    expect(calls[0].headers.get("x-opencode-directory")).toBe(encodeURIComponent(root))
    expect([...calls[0].headers.keys()].some((key) => /source|expect/.test(key))).toBe(false)
    expect(calls[0].url.href).not.toContain(encodeURIComponent(source))
  })

  for (const empty of [true, false]) test(`matching exposed header agrees with ${empty ? "empty" : "nonempty"} JSON success`, async () => {
    const token = "opaque source/%?not-a-hash"
    const original = respond(envelope(empty ? [] : [{ path: "src/a.ts", type: "file" }], token))
    original.response.headers.set("X-OpenChamber-File-Source", token)
    const result = await opencodeClient.searchFilesWithSource("", { ...options, expectedSourceIdentity: token })
    expect(result.sourceIdentity).toBe(token)
    expect(result.files).toHaveLength(empty ? 0 : 1)
    expect(original.state.ended).toBe(true)
    expect(calls).toHaveLength(1)
  })

  for (const empty of [true, false]) test(`missing exposed header is permitted on ${empty ? "empty" : "nonempty"} JSON success`, async () => {
    const original = respond(envelope(empty ? [] : [{ path: "src/a.ts", type: "file" }]))
    expect(original.response.headers.has("X-OpenChamber-File-Source")).toBe(false)
    const result = await opencodeClient.searchFilesWithSource("", options)
    expect(result.sourceIdentity).toBe(source)
    expect(result.files).toHaveLength(empty ? 0 : 1)
    expect(calls).toHaveLength(1)
  })

  test("JSON/header contradiction is503 invalid-response before expected-token comparison", async () => {
    const original = respond(envelope([], "completed-source"))
    original.response.headers.set("X-OpenChamber-File-Source", "different-header-source")
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(503)
    expect(error.kind).toBe("invalid-response")
    expect(calls).toHaveLength(1)
  })

  for (const token of ["", "x".repeat(1025)]) test(`malformed exposed header (${token.length} bytes) is503 invalid-response`, async () => {
    const original = respond(envelope())
    original.response.headers.set("X-OpenChamber-File-Source", token)
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(503)
    expect(error.kind).toBe("invalid-response")
    expect(calls).toHaveLength(1)
  })

  test("an exposed header cannot replace the required JSON token even on empty success", async () => {
    const original = respond({ location: { directory: root }, data: [] })
    original.response.headers.set("X-OpenChamber-File-Source", "header-only-source")
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(503)
    expect(error.kind).toBe("invalid-response")
    expect(calls).toHaveLength(1)
  })

  test("consistent JSON/header replacement compared with an old expectation is409 source change", async () => {
    const original = respond(envelope([], "completed-source"))
    original.response.headers.set("X-OpenChamber-File-Source", "completed-source")
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(409)
    expect(error.kind).toBe("remote-source-changed")
    expect(calls).toHaveLength(1)
  })

  test("concurrent reversed completions keep each empty response's own token and root", async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    transport = async () => calls.length === 1 ? first.promise : second.promise
    const a = opencodeClient.searchFilesWithSource("a", options)
    const b = opencodeClient.searchFilesWithSource("b", { directory: "/other", expectedSourceIdentity: "source-B" })
    second.resolve(streamed(encoder.encode(JSON.stringify({ location: { directory: "/other" }, data: [], sourceIdentity: "source-B" }))).response)
    expect(await b).toEqual({ files: [], sourceIdentity: "source-B" })
    first.resolve(streamed(encoder.encode(JSON.stringify(envelope()))).response)
    expect(await a).toEqual({ files: [], sourceIdentity: source })
    expect(calls).toHaveLength(2)
    expect(calls.map((entry) => entry.headers.get("x-opencode-directory"))).toEqual([encodeURIComponent(root), "%2Fother"])
  })

  test("a valid completed mismatching token is a409 source change, never empty success", async () => {
    respond(envelope([], "another-source"))
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(409)
    expect(error.kind).toBe("remote-source-changed")
    expect(error.reason).toBe("remote-source-changed")
    expect(calls).toHaveLength(1)
  })

  for (const [name, body] of [
    ["missing identity", { location: { directory: root }, data: [] }],
    ["empty identity", envelope([], "")],
    ["non-string identity", { ...envelope(), sourceIdentity: 7 }],
    ["oversized identity", envelope([], "x".repeat(1025))],
    ["missing location", { data: [], sourceIdentity: source }],
    ["wrong location", { ...envelope(), location: { directory: "/other" } }],
    ["malformed location", { ...envelope(), location: { directory: 8 } }],
    ["missing data", { location: { directory: root }, sourceIdentity: source }],
    ["unknown type", envelope([{ path: "src/a", type: "symlink" }])],
    ["non-string path", { ...envelope(), data: [{ path: 7, type: "file" }] }],
    ["over-limit array", envelope(Array.from({ length: 101 }, (_, i) => ({ path: `${i}.ts`, type: "file" })))],
  ] satisfies ReadonlyArray<readonly [string, JsonValue]>) test(`${name} is503 invalid-response`, async () => {
    respond(body)
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(503)
    expect(error.kind).toBe("invalid-response")
    expect(calls).toHaveLength(1)
  })

  for (const path of ["", "/absolute", "../escape", "src/../escape", "./a", "src//a", "src/", "src\\a", "a\0b"]) {
    test(`rejects noncanonical path ${JSON.stringify(path)}`, async () => {
      respond(envelope([{ path, type: "file" }]))
      const error = await failure(opencodeClient.searchFilesWithSource("", options))
      expect(error.status).toBe(503)
      expect(error.kind).toBe("invalid-response")
    })
  }

  test("directory hits and finite remote limits use the original SDK query", async () => {
    respond(envelope([{ path: "src", type: "directory" }]))
    const result = await opencodeClient.searchFilesWithSource("s", { ...options, type: "directory", limit: 2.9 })
    expect(result.files[0].relativePath).toBe("src")
    expect(calls[0].url.searchParams.get("limit")).toBe("2")
    expect(calls[0].url.searchParams.get("type")).toBe("directory")
    expect(calls).toHaveLength(1)
  })

  test("a response contradicting the requested entry type is invalid", async () => {
    respond(envelope([{ path: "src", type: "directory" }]))
    expect((await failure(opencodeClient.searchFilesWithSource("", { ...options, type: "file" }))).kind).toBe("invalid-response")
  })

  for (const sample of [
    { status: 400, tag: "InvalidRequestError", kind: "invalid-path" },
    { status: 404, tag: "FileNotFoundError", kind: "not-found" },
    { status: 404, tag: "LocationNotFoundError", kind: "not-directory" },
    { status: 409, tag: "ConflictError", kind: "remote-source-changed" },
    { status: 503, tag: "ServiceUnavailableError", kind: "remote-unavailable" },
    { status: 503, tag: "ServiceUnavailableError", kind: "invalid-response" },
  ]) test(`consumes actual ${sample.status}/${sample.kind} before SDK cancellation`, async () => {
    const original = respond({ _tag: sample.tag, message: "wire message, no policy inference", kind: sample.kind }, sample.status)
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(sample.status)
    expect(error.tag).toBe(sample.tag)
    expect(error.kind).toBe(sample.kind)
    expect(error.detail).toBe("wire message, no policy inference")
    expect(isAmbiguousTransportFailure(error)).toBe(false)
    expect(isDefiniteTransportFailure(error)).toBe(false)
    expect(original.state.ended).toBe(true)
    expect(calls).toHaveLength(1)
  })

  for (const [name, bytes, contentType] of [
    ["malformed JSON", encoder.encode('{"location":'), "application/json"],
    ["invalid UTF8", new Uint8Array([0xff]), "application/json"],
    ["nonJSON", encoder.encode(JSON.stringify(envelope())), "text/plain"],
  ] as const) test(`${name} fails closed`, async () => {
    transport = async () => streamed(bytes, 200, contentType).response
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(503)
    expect(error.kind).toBe("invalid-response")
    expect(error.cause).toBeDefined()
    expect(calls).toHaveLength(1)
  })

  test("an interrupted body preserves its real failure", async () => {
    const cause = new Error("body connection lost")
    let reads = 0
    transport = async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) { if (reads++ === 0) controller.enqueue(encoder.encode("{")); else controller.error(cause) },
    }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } })
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.kind).toBe("invalid-response")
    expect(error.cause).toBe(cause)
  })

  for (const errorBody of [false, true]) for (const overflow of [false, true]) {
    test(`${errorBody ? "error64KiB" : "success1MiB"} ${overflow ? "overflow cancels" : "exact byte boundary passes"}`, async () => {
      const max = errorBody ? 64 * 1024 : 1024 * 1024
      const body = errorBody ? { _tag: "ServiceUnavailableError", message: "", kind: "remote-unavailable" }
        : { ...envelope(), padding: "" }
      const budget = max + Number(overflow) - encoder.encode(JSON.stringify(body)).byteLength
      const padding = "é".repeat(Math.floor(budget / 2)) + "x".repeat(budget % 2)
      const bytes = encoder.encode(JSON.stringify(errorBody ? { ...body, message: padding } : { ...body, padding }))
      expect(bytes.byteLength).toBe(max + Number(overflow))
      const original = streamed(bytes, errorBody ? 503 : 200)
      transport = async () => original.response
      if (overflow || errorBody) {
        const error = await failure(opencodeClient.searchFilesWithSource("", options))
        expect(error.status).toBe(503)
        expect(error.kind).toBe(overflow ? "invalid-response" : "remote-unavailable")
        expect(original.state.cancels).toBe(overflow ? 1 : 0)
        if (overflow) expect(error.cause).toBeInstanceOf(RangeError)
      } else expect(await opencodeClient.searchFilesWithSource("", options)).toEqual({ files: [], sourceIdentity: source })
      expect(calls).toHaveLength(1)
    })
  }

  test("a malformed error retains actual409 but not a fabricated tag or kind", async () => {
    respond({ _tag: "ConflictError", message: "remote-unavailable", kind: "invented" }, 409)
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(409)
    expect(error.kind).toBe("invalid-response")
    expect(error.tag).toBeUndefined()
  })

  test("caller abort cancels original stream and propagates the abort reason", async () => {
    const reading = deferred<void>()
    const caller = new AbortController()
    const cause = new DOMException("cancel source search", "AbortError")
    let cancels = 0
    transport = async () => new Response(new ReadableStream<Uint8Array>({
      pull() { reading.resolve() }, cancel() { cancels += 1 },
    }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } })
    const pending = opencodeClient.searchFilesWithSource("", { ...options, signal: caller.signal }).catch((cause) => {
      if (!(cause instanceof DOMException)) throw new Error("Expected caller abort reason", { cause })
      return cause
    })
    await reading.promise
    caller.abort(cause)
    expect(await pending).toBe(cause)
    expect(cancels).toBe(1)
    expect(calls[0].signal?.aborted).toBe(true)
  })

  test("five-second total operation deadline includes delayed headers and body transfer", async () => {
    jest.useFakeTimers()
    const headers = deferred<Response>()
    const entered = deferred<void>()
    const reading = deferred<void>()
    let cancels = 0
    transport = async () => { entered.resolve(); return headers.promise }
    const pending = failure(opencodeClient.searchFilesWithSource("", options))
    await entered.promise
    jest.advanceTimersByTime(3_000)
    headers.resolve(new Response(new ReadableStream<Uint8Array>({
      pull() { reading.resolve() }, cancel() { cancels += 1; return new Promise<void>(() => {}) },
    }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } }))
    await reading.promise
    jest.advanceTimersByTime(2_000)
    const error = await pending
    expect(error.status).toBe(503)
    expect(error.kind).toBe("remote-unavailable")
    expect(cancels).toBe(1)
    expect(calls).toHaveLength(1)
  })

  test("stalled headers terminate even when fetch ignores cancellation, and late body is cancelled", async () => {
    jest.useFakeTimers()
    const headers = deferred<Response>()
    const entered = deferred<void>()
    transport = async () => { entered.resolve(); return headers.promise }
    const pending = failure(opencodeClient.searchFilesWithSource("", options))
    await entered.promise
    jest.advanceTimersByTime(5_000)
    expect((await pending).kind).toBe("remote-unavailable")
    const original = streamed(encoder.encode(JSON.stringify(envelope())))
    headers.resolve(original.response)
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
    expect(original.state.bytes).toBe(0)
    expect(original.state.cancels).toBe(1)
  })

  test("network failure rejects as remote-unavailable, not empty results", async () => {
    const cause = new TypeError("Failed to fetch")
    transport = async () => { throw cause }
    const error = await failure(opencodeClient.searchFilesWithSource("", options))
    expect(error.status).toBe(503)
    expect(error.kind).toBe("remote-unavailable")
    expect(calls).toHaveLength(1)
  })
})

describe("local compatibility without a remote expectation", () => {
  test("legacy array search keeps its projection, absent token and unclamped limit", async () => {
    respond({ location: { directory: root }, data: [{ path: "src/a.ts", type: "file" }], padding: "x".repeat(1024 * 1024 + 1) })
    expect(await opencodeClient.searchFiles("a", { directory: root, limit: 250 })).toEqual([
      { name: "a.ts", path: `${root}/src/a.ts`, relativePath: "src/a.ts", extension: "ts" },
    ])
    expect(calls[0].url.searchParams.get("limit")).toBe("250")
    expect(calls).toHaveLength(1)
  })

  test("the new local outcome allows absent sourceIdentity and has no remote byte cap", async () => {
    respond({ location: { directory: root }, data: [], padding: "x".repeat(1024 * 1024 + 1) })
    expect(await opencodeClient.searchFilesWithSource("", { directory: root, limit: 250 })).toEqual({ files: [] })
    expect(calls[0].url.searchParams.get("limit")).toBe("250")
  })

  test("no URL-based remote inference imposes the five-second deadline", async () => {
    jest.useFakeTimers()
    const reading = deferred<void>()
    let output!: ReadableStreamDefaultController<Uint8Array>
    transport = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { output = controller }, pull() { reading.resolve() },
    }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } })
    let settled = false
    const pending = opencodeClient.searchFilesWithSource("", { directory: root }).then((value) => { settled = true; return value })
    await reading.promise
    jest.advanceTimersByTime(6_000)
    expect(settled).toBe(false)
    output.enqueue(encoder.encode(JSON.stringify({ location: { directory: root }, data: [] })))
    output.close()
    expect(await pending).toEqual({ files: [] })
  })
})
