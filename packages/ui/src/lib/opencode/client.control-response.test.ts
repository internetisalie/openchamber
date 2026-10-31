import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test"
import { ClientError } from "@opencode/client"
import { isAmbiguousTransportFailure, isDefiniteTransportFailure } from "@/lib/relay/transport-error"
import { ControlResponseError, preserveControlResponse } from "./control-response"
import * as runtimeTransport from "@/lib/runtime-fetch"
import * as runtimeUrls from "@/lib/runtime-url"
import * as runtimeIdentity from "@/lib/runtime-switch"
import * as runtimeRegistry from "@/contexts/runtimeAPIRegistry"
import * as startupTrace from "@/lib/startupTrace"

type RuntimeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
const calls: Array<{ url: URL; method: string; headers: Headers; signal: AbortSignal | null | undefined }> = []
let transport: RuntimeFetch

mock.module("@/lib/runtime-fetch", () => ({
  ...runtimeTransport,
  runtimeFetch: mock<RuntimeFetch>((input, init) => {
    calls.push({
      url: new URL(input instanceof Request ? input.url : String(input)),
      method: String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
      headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
      signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
    })
    return transport(input, init)
  }),
}))
mock.module("@/contexts/runtimeAPIRegistry", () => ({ ...runtimeRegistry, getRegisteredRuntimeAPIs: () => null }))
mock.module("@/lib/runtime-url", () => ({ ...runtimeUrls, getRuntimeUrlResolver: () => ({ api: () => "https://controls.test/api" }) }))
mock.module("@/lib/runtime-switch", () => ({
  ...runtimeIdentity,
  getRuntimeApiBaseUrl: () => "", getRuntimeKey: () => "control-test", captureRuntimeInstance: () => () => true,
}))
mock.module("@/lib/startupTrace", () => ({ ...startupTrace, markStartupTrace: () => undefined }))

const { createRuntimeOpencodeClient, normalizeOpencodeError, OpencodeApiError }: typeof import("./client") = await import(`./client?control-response-test=${Date.now()}`)
const encoder = new TextEncoder()
const refusal = (message = "Reader control refused before admission") => JSON.stringify({ _tag: "ServiceUnavailableError", message })
const client = (baseUrl = "https://controls.test/api") => createRuntimeOpencodeClient({ baseUrl, directory: "/repo/space here" })

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const streamed = (chunks: Uint8Array[], contentType = "application/json", status = 503) => {
  let index = 0
  const state = { reads: 0, bytes: 0, cancels: 0, ended: false }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.reads += 1
      const chunk = chunks[index++]
      if (chunk) {
        state.bytes += chunk.byteLength
        controller.enqueue(chunk)
      } else {
        state.ended = true
        controller.close()
      }
    },
    cancel() { state.cancels += 1 },
  }, { highWaterMark: 0 })
  return { response: new Response(body, { status, headers: { "content-type": contentType } }), state }
}

const sdkRejection = async <T>(pending: Promise<T>) => {
  try {
    await pending
  } catch (error) {
    if (!(error instanceof ClientError)) throw new Error("Expected the real SDK ClientError wrapper", { cause: error })
    return error
  }
  throw new Error("Expected SDK rejection")
}

const controlRejection = async <T>(pending: Promise<T>) => {
  const sdk = await sdkRejection(pending)
  expect(sdk.reason).toBe("Transport")
  if (!(sdk.cause instanceof ControlResponseError)) throw new Error("Expected the dedicated response error", { cause: sdk })
  const api = normalizeOpencodeError("control", sdk)
  expect(api).toBeInstanceOf(OpencodeApiError)
  expect(api.status).toBe(503)
  expect(api.cause).toBe(sdk)
  expect(isDefiniteTransportFailure(api)).toBe(false)
  expect(calls).toHaveLength(1)
  return { sdk, api, responseError: sdk.cause }
}

beforeEach(() => {
  calls.length = 0
  transport = async () => { throw new Error("Unexpected request") }
})
afterEach(() => jest.useRealTimers())

describe("original control response through the real SDK", () => {
  for (const operation of ["prompt", "interrupt"] as const) {
    for (const baseUrl of ["https://controls.test/api", "https://controls.test/runtime/remote-a/api/"]) {
      test(`${operation} preserves the consumed 503 under ${baseUrl}`, async () => {
        const message = "Reader denied: café / 読み取り"
        const bytes = encoder.encode(refusal(message))
        const original = streamed([bytes.slice(0, bytes.length - 2), bytes.slice(bytes.length - 2)])
        transport = async () => original.response
        const sid = "ses /?#é"
        const apiClient = client(baseUrl)
        const result = operation === "prompt"
          ? await controlRejection(apiClient.session.prompt({ sessionID: sid, text: "one attempt" }))
          : await controlRejection(apiClient.session.interrupt({ sessionID: sid }))
        expect(result.api.tag).toBe("ServiceUnavailableError")
        expect(result.api.detail).toBe(message)
        expect(isAmbiguousTransportFailure(result.api)).toBe(false)
        expect(original.response.bodyUsed).toBe(true)
        expect(original.state.bytes).toBe(bytes.byteLength)
        expect(original.state.ended).toBe(true)
        expect(original.state.cancels).toBe(0)
        expect(calls[0].method).toBe("POST")
        const prefix = baseUrl.includes("/runtime/") ? "/runtime/remote-a" : ""
        expect(calls[0].url.pathname).toBe(`${prefix}/api/session/${encodeURIComponent(sid)}/${operation}`)
        expect(calls[0].headers.get("x-opencode-directory")).toBe(encodeURIComponent("/repo/space here"))
        expect(calls[0].url.search).toBe("")
        expect(calls[0].url.hash).toBe("")
      })
    }
  }

  for (const sample of [
    { name: "malformed JSON", bytes: encoder.encode('{"_tag":'), type: "application/json", cause: SyntaxError },
    { name: "non-JSON response", bytes: encoder.encode(refusal()), type: "text/plain", cause: TypeError },
    { name: "wrong tag", bytes: encoder.encode('{"_tag":"UnknownError","message":"not the fence"}'), type: "application/json", cause: TypeError },
    { name: "missing string message", bytes: encoder.encode('{"_tag":"ServiceUnavailableError","message":7}'), type: "application/json", cause: TypeError },
    { name: "invalid UTF-8", bytes: new Uint8Array([0xff]), type: "application/json", cause: TypeError },
  ]) test(`${sample.name} retains actual 503 and its decoding failure without a fabricated tag`, async () => {
    const original = streamed([sample.bytes], sample.type)
    transport = async () => original.response
    const { api, responseError } = await controlRejection(client().session.prompt({ sessionID: "ses_1", text: "one attempt" }))
    expect(api.tag).toBeUndefined()
    expect(api.detail).toBe(responseError.message)
    expect(responseError.cause).toBeInstanceOf(sample.cause)
    expect(isAmbiguousTransportFailure(api)).toBe(true)
  })

  const sizedRefusal = (size: number) => {
    const budget = size - encoder.encode(refusal("")).byteLength
    const message = "é".repeat(Math.floor(budget / 2)) + "x".repeat(budget % 2)
    const bytes = encoder.encode(refusal(message))
    expect(bytes.byteLength).toBe(size)
    return { bytes, message }
  }

  test("matches an actual interrupt pathname independently of its query", async () => {
    const original = streamed([encoder.encode(refusal())])
    transport = async () => original.response
    const { api } = await controlRejection(client().session.interrupt({ sessionID: "ses_1", resume: false }))
    expect(api.tag).toBe("ServiceUnavailableError")
    expect(calls[0].url.pathname).toBe("/api/session/ses_1/interrupt")
    expect(calls[0].url.searchParams.get("resume")).toBe("false")
  })

  test("accepts exactly 64 KiB of decoded UTF-8 bytes", async () => {
    const body = sizedRefusal(64 * 1024)
    const original = streamed([body.bytes.slice(0, 100), body.bytes.slice(100)])
    transport = async () => original.response
    const { api } = await controlRejection(client().session.interrupt({ sessionID: "ses_1" }))
    expect(api.tag).toBe("ServiceUnavailableError")
    expect(api.detail).toBe(body.message)
    expect(original.state.ended).toBe(true)
  })

  test("refuses byte 65537 even when the JSON character count fits, and cancels without reading ahead", async () => {
    const body = sizedRefusal(64 * 1024 + 1)
    expect(new TextDecoder().decode(body.bytes).length < 64 * 1024).toBe(true)
    const original = streamed([body.bytes.slice(0, 64 * 1024), body.bytes.slice(64 * 1024), encoder.encode("unread")])
    transport = async () => original.response
    const { api, responseError } = await controlRejection(client().session.prompt({ sessionID: "ses_1", text: "one attempt" }))
    expect(api.tag).toBeUndefined()
    expect(responseError.cause).toBeInstanceOf(RangeError)
    expect(original.state.reads).toBe(2)
    expect(original.state.bytes).toBe(64 * 1024 + 1)
    expect(original.state.cancels).toBe(1)
    expect(isAmbiguousTransportFailure(api)).toBe(true)
  })

  test("retains the real body-read failure", async () => {
    const failure = new Error("control body connection interrupted")
    let reads = 0
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (reads++ === 0) controller.enqueue(encoder.encode('{"_tag":'))
        else controller.error(failure)
      },
    }, { highWaterMark: 0 }), { status: 503, headers: { "content-type": "application/json" } })
    transport = async () => response
    const { api, responseError } = await controlRejection(client().session.interrupt({ sessionID: "ses_1" }))
    expect(responseError.cause).toBe(failure)
    expect(api.detail).toBe(failure.message)
    expect(api.tag).toBeUndefined()
    expect(isAmbiguousTransportFailure(api)).toBe(true)
  })

  test("request cancellation remains active during original body consumption", async () => {
    const reading = deferred<void>()
    const controller = new AbortController()
    const failure = new DOMException("caller cancelled control body", "AbortError")
    let cancels = 0
    const response = new Response(new ReadableStream<Uint8Array>({
      pull() { reading.resolve() }, cancel() { cancels += 1 },
    }, { highWaterMark: 0 }), { status: 503, headers: { "content-type": "application/json" } })
    transport = async () => response
    const outcome = controlRejection(client().session.prompt({ sessionID: "ses_1", text: "one attempt" }, { signal: controller.signal }))
    await reading.promise
    controller.abort(failure)
    const { api, responseError } = await outcome
    expect(responseError.cause).toBe(failure)
    expect(api.tag).toBeUndefined()
    expect(cancels).toBe(1)
    expect(response.body?.locked).toBe(false)
  })

  test("the finite body deadline starts only after headers and does not await a stuck cancellation", async () => {
    jest.useFakeTimers()
    const entered = deferred<void>()
    const headers = deferred<Response>()
    const reading = deferred<void>()
    let cancels = 0
    const response = new Response(new ReadableStream<Uint8Array>({
      pull() { reading.resolve() },
      cancel() { cancels += 1; return new Promise<void>(() => {}) },
    }, { highWaterMark: 0 }), { status: 503, headers: { "content-type": "application/json" } })
    transport = async () => { entered.resolve(); return headers.promise }
    let settled = false
    const outcome = controlRejection(client().session.interrupt({ sessionID: "ses_1" })).then((result) => { settled = true; return result })
    await entered.promise
    jest.advanceTimersByTime(6_000)
    expect(settled).toBe(false)
    headers.resolve(response)
    await reading.promise
    jest.advanceTimersByTime(4_999)
    expect(settled).toBe(false)
    jest.advanceTimersByTime(1)
    const { api, responseError } = await outcome
    expect(responseError.cause).toBeInstanceOf(DOMException)
    if (!(responseError.cause instanceof DOMException)) throw new Error("Expected timeout cause", { cause: responseError.cause })
    expect(responseError.cause.name).toBe("TimeoutError")
    expect(api.tag).toBeUndefined()
    expect(api.detail).toContain("5000ms")
    expect(cancels).toBe(1)
  })

  test("complete refusal cleanup cannot later race caller cancellation or the deadline", async () => {
    jest.useFakeTimers()
    const controller = new AbortController()
    const original = streamed([encoder.encode(refusal())])
    transport = async () => original.response
    const { api } = await controlRejection(client().session.interrupt({ sessionID: "ses_1" }, { signal: controller.signal }))
    controller.abort()
    jest.advanceTimersByTime(6_000)
    expect(api.tag).toBe("ServiceUnavailableError")
    expect(isAmbiguousTransportFailure(api)).toBe(false)
    expect(original.state.cancels).toBe(0)
  })
})

describe("unchanged non-refusal transport", () => {
  test("declared non-503 control errors keep the generated SDK decoding path", async () => {
    const original = streamed([encoder.encode('{"_tag":"ConflictError","message":"ownership changed"}')], "application/json", 409)
    transport = async () => original.response
    let api: InstanceType<typeof OpencodeApiError> | undefined
    try {
      await client().session.prompt({ sessionID: "ses_1", text: "one attempt" })
    } catch (error) {
      expect(error instanceof ClientError).toBe(false)
      api = normalizeOpencodeError("prompt", error)
    }
    if (!api) throw new Error("Expected conflict")
    expect(api.status).toBe(409)
    expect(api.tag).toBe("ConflictError")
    expect(api.detail).toBe("ownership changed")
    expect(original.state.ended).toBe(true)
    expect(calls).toHaveLength(1)
  })

  for (const route of ["get", "command"] as const) test(`unrelated ${route} 503 retains the SDK's normal undeclared-status behavior`, async () => {
    const original = streamed([encoder.encode(refusal())])
    transport = async () => original.response
    const apiClient = client()
    const sdk = route === "get"
      ? await sdkRejection(apiClient.session.get({ sessionID: "ses?next=/api/session/other/prompt#interrupt" }))
      : await sdkRejection(apiClient.session.command({ sessionID: "ses_1", name: "explain", text: "one attempt" }))
    expect(sdk.reason).toBe("UnexpectedStatus")
    const api = normalizeOpencodeError("other route", sdk)
    expect(api.status).toBe(503)
    expect(api.tag).toBeUndefined()
    expect(api.detail).toBe("unexpected status")
    expect(original.state.bytes).toBe(0)
    expect(original.state.cancels).toBe(1)
    expect(calls).toHaveLength(1)
  })

  test("real transport failures remain ambiguous and do not acquire an HTTP status", async () => {
    const failure = new TypeError("Failed to fetch")
    transport = async () => { throw failure }
    const sdk = await sdkRejection(client().session.prompt({ sessionID: "ses_1", text: "one attempt" }))
    const api = normalizeOpencodeError("prompt", sdk)
    expect(api.status).toBeUndefined()
    expect(api.tag).toBeUndefined()
    expect(isAmbiguousTransportFailure(api)).toBe(true)
    expect(isDefiniteTransportFailure(api)).toBe(false)
    expect(calls).toHaveLength(1)
  })

  test("packaged routing refusals keep their distinct never-routed classification", async () => {
    transport = async () => new Response("routing unavailable", { status: 503, headers: { "x-openchamber-error": "runtime-unavailable" } })
    const api = normalizeOpencodeError("prompt", await sdkRejection(client().session.prompt({ sessionID: "ses_1", text: "one attempt" })))
    expect(api.status).toBe(503)
    expect(api.tag).toBeUndefined()
    expect(isDefiniteTransportFailure(api)).toBe(true)
    expect(isAmbiguousTransportFailure(api)).toBe(false)
    expect(calls).toHaveLength(1)
  })

  for (const eventStream of [false, true]) test(`successful ${eventStream ? "event stream" : "prompt"} body is not given the refusal deadline`, async () => {
    jest.useFakeTimers()
    const reading = deferred<void>()
    let output!: ReadableStreamDefaultController<Uint8Array>
    let cancels = 0
    transport = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { output = controller }, pull() { reading.resolve() }, cancel() { cancels += 1 },
    }, { highWaterMark: 0 }), { headers: { "content-type": eventStream ? "text/event-stream" : "application/json" } })
    let settled = false
    const apiClient = client()
    const iterator = eventStream ? apiClient.event.subscribe()[Symbol.asyncIterator]() : null
    const pending = (async () => {
      const value = await (iterator ? iterator.next() : apiClient.session.prompt({ sessionID: "ses_1", text: "admitted" }))
      settled = true
      return value
    })()
    await reading.promise
    jest.advanceTimersByTime(6_000)
    expect(settled).toBe(false)
    expect(cancels).toBe(0)
    const data = { id: "accepted" }
    output.enqueue(encoder.encode(eventStream ? `data: ${JSON.stringify(data)}\n\n` : JSON.stringify({ data })))
    output.close()
    expect(await pending).toEqual(eventStream ? { value: data, done: false } : data)
    await iterator?.return?.()
    expect(calls).toHaveLength(1)
  })
})

describe("exact control path guard", () => {
  for (const [method, address] of [
    ["GET", "https://controls.test/runtime/api/session/ses_1/prompt"],
    ["POST", "https://controls.test/api/session/ses_1/prompt"],
    ["POST", "https://elsewhere.test/runtime/api/session/ses_1/prompt"],
    ["POST", "https://controls.test/runtime/api/session/ses_1/prompt/extra"],
    ["POST", "https://controls.test/runtime/api/session//interrupt"],
    ["POST", "https://controls.test/runtime/api/session/ses_1/model?next=/api/session/x/prompt#interrupt"],
  ]) test(`${method} ${address} is not intercepted`, async () => {
    const original = streamed([encoder.encode(refusal())])
    await preserveControlResponse(original.response, { url: new URL(address), method, clientRoot: "https://controls.test/runtime" })
    expect(original.response.bodyUsed).toBe(false)
    expect(original.state.bytes).toBe(0)
    expect(original.state.cancels).toBe(0)
    await original.response.body?.cancel()
  })
})
