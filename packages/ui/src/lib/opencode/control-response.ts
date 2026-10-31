const MAX_BODY_BYTES = 64 * 1024
const BODY_TIMEOUT_MS = 5_000

export class ControlResponseError extends Error {
  readonly status = 503
  readonly tag: "ServiceUnavailableError" | undefined

  constructor(message: string, options: { tag?: "ServiceUnavailableError"; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = "ControlResponseError"
    this.tag = options.tag
  }
}

type ControlRequest = {
  url: URL
  method: string
  clientRoot: string
  signal?: AbortSignal | null
}

const isControlRequest = ({ url, method, clientRoot }: ControlRequest): boolean => {
  if (method !== "POST") return false
  const root = new URL(clientRoot)
  const prefix = `${root.pathname.replace(/\/$/, "")}/api/session/`
  return url.origin === root.origin
    && url.pathname.startsWith(prefix)
    && /^[^/]+\/(?:prompt|interrupt)$/.test(url.pathname.slice(prefix.length))
}

const readBody = async (response: Response, signal?: AbortSignal | null): Promise<string> => {
  if (!response.body) throw new TypeError("OpenCode control error response has no body")
  const reader = response.body.getReader()
  let complete = false
  let rejectStopped!: (reason: unknown) => void
  const stopped = new Promise<never>((_, reject) => { rejectStopped = reject })
  const abort = () => rejectStopped(signal?.reason ?? new DOMException("Aborted", "AbortError"))
  const timer = setTimeout(() => {
    rejectStopped(new DOMException(`OpenCode control error body timed out after ${BODY_TIMEOUT_MS}ms`, "TimeoutError"))
  }, BODY_TIMEOUT_MS)
  signal?.addEventListener("abort", abort, { once: true })
  try {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let bytes = 0
    let text = ""
    for (;;) {
      const chunk = await Promise.race([reader.read(), stopped])
      if (chunk.done) {
        complete = true
        return text + decoder.decode()
      }
      bytes += chunk.value.byteLength
      if (bytes > MAX_BODY_BYTES) throw new RangeError(`OpenCode control error body exceeds ${MAX_BODY_BYTES} UTF-8 bytes`)
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
    if (!complete) void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export const preserveControlResponse = async (response: Response, request: ControlRequest): Promise<void> => {
  if (response.status !== 503 || !isControlRequest(request)) return
  let message: string
  try {
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase()
    if (contentType !== "application/json" && !/^application\/[^/]+\+json$/.test(contentType)) {
      void response.body?.cancel().catch(() => undefined)
      throw new TypeError("OpenCode control error response is not JSON")
    }
    const body: unknown = JSON.parse(await readBody(response, request.signal))
    if (!body || typeof body !== "object" || !("_tag" in body) || body._tag !== "ServiceUnavailableError"
      || !("message" in body) || typeof body.message !== "string") {
      throw new TypeError("OpenCode control error body is not a ServiceUnavailableError with a string message")
    }
    message = body.message
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new ControlResponseError(detail, { cause })
  }
  throw new ControlResponseError(message, { tag: "ServiceUnavailableError" })
}
