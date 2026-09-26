/** Coalesces mirror notices while preserving one refresh after an in-flight update. */
type PendingRefresh = {
  started: boolean
  again: boolean
  run: () => Promise<void>
  isCurrent: () => boolean
}

const pending = new Map<string, PendingRefresh>()

export function scheduleSessionMirrorRefresh(
  runtimeKey: string,
  sessionID: string,
  run: () => Promise<void>,
  isCurrent: () => boolean,
  retryDelaysMs: readonly number[] = [250, 500],
): void {
  const key = `${runtimeKey}\n${sessionID}`
  const existing = pending.get(key)
  if (existing) {
    // Events already queued before the first read share it. An event arriving
    // during a read needs one more pass because that read may predate the write.
    if (existing.started) existing.again = true
    return
  }

  const entry: PendingRefresh = { started: false, again: false, run, isCurrent }
  pending.set(key, entry)
  queueMicrotask(async () => {
    try {
      do {
        if (!entry.isCurrent()) return
        entry.started = true
        entry.again = false
        for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
          if (!entry.isCurrent()) return
          try {
            await entry.run()
            break
          } catch {
            // A final notice can be the only one: idempotent proxy polls will
            // not emit another event. Retry a few times, then preserve state.
            const delay = retryDelaysMs[attempt]
            if (delay === undefined) break
            await new Promise<void>((resolve) => setTimeout(resolve, delay))
          }
        }
      } while (entry.again && entry.isCurrent())
    } finally {
      if (pending.get(key) === entry) pending.delete(key)
    }
  })
}
