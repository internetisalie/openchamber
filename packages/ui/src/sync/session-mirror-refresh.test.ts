import { describe, expect, test } from "bun:test"
import { scheduleSessionMirrorRefresh } from "./session-mirror-refresh"

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("scheduleSessionMirrorRefresh", () => {
  test("coalesces notices queued before a read", async () => {
    let reads = 0
    const run = async () => { reads += 1 }
    scheduleSessionMirrorRefresh("runtime-a", "ses_pre", run, () => true)
    scheduleSessionMirrorRefresh("runtime-a", "ses_pre", run, () => true)
    await flush()
    expect(reads).toBe(1)
  })

  test("runs once more when a mirror changes during a read", async () => {
    let reads = 0
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => { releaseFirst = resolve })
    const run = async () => {
      reads += 1
      if (reads === 1) await first
    }
    scheduleSessionMirrorRefresh("runtime-a", "ses_during", run, () => true)
    await flush()
    scheduleSessionMirrorRefresh("runtime-a", "ses_during", run, () => true)
    scheduleSessionMirrorRefresh("runtime-a", "ses_during", run, () => true)
    releaseFirst()
    await flush()
    expect(reads).toBe(2)
  })

  test("rejects a queued read after the runtime changes", async () => {
    let current = true
    let reads = 0
    scheduleSessionMirrorRefresh("runtime-old", "ses_stale", async () => { reads += 1 }, () => current)
    current = false
    await flush()
    expect(reads).toBe(0)
  })

  test("retries a transient failure without another mirror event", async () => {
    let reads = 0
    const run = async () => {
      reads += 1
      if (reads === 1) throw new Error("temporary failure")
    }
    scheduleSessionMirrorRefresh("runtime-a", "ses_retry", run, () => true, [0, 0])
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
    expect(reads).toBe(2)
  })

  test("stops after three failed attempts and remains retryable", async () => {
    let reads = 0
    const run = async () => {
      reads += 1
      throw new Error("unavailable")
    }
    scheduleSessionMirrorRefresh("runtime-a", "ses_failed", run, () => true, [0, 0])
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
    expect(reads).toBe(3)
    scheduleSessionMirrorRefresh("runtime-a", "ses_failed", run, () => true, [0, 0])
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
    expect(reads).toBe(6)
  })
})
