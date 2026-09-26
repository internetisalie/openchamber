import { afterEach, expect, spyOn, test } from "bun:test"
import type { Message, Session } from "@/lib/opencode/model"
import { opencodeClient } from "@/lib/opencode/client"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { ChildStoreManager } from "./child-store"
import { SessionMessageLoader, setImperativeSessionMessageLoader } from "./session-message-loader"
import { createEventRoutingIndex, handleEvent, setActiveSession } from "./sync-context"

const directory = "/mirror-sync-test"
const sessionID = "ses_mirror_sync"
const oldSession: Session = {
  id: sessionID,
  directory,
  projectID: "project",
  title: "Before",
  metadata: { pinned: true },
  time: { created: 1, updated: 1 },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}
const updatedSession: Session = { ...oldSession, title: "After", metadata: undefined, time: { created: 1, updated: 2 } }
const mirroredMessage: Message = { id: "msg_mirror", sessionID, role: "user", time: { created: 2 } }

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  setActiveSession("", "")
  useGlobalSessionsStore.getState().resetForRuntimeSwitch()
})

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 10))

test("mirror notice refreshes open transcript and both session lists", async () => {
  const childStores = new ChildStoreManager()
  const store = childStores.ensureChild(directory, { bootstrap: false })
  store.setState({ session: [oldSession] })
  const messageReads: Array<{ id: string; limit?: number; directory?: string | null }> = []
  const loader = new SessionMessageLoader(childStores, {
    sdk: {
      getSessionMessages: async (id, options, requestDirectory) => {
        messageReads.push({ id, limit: options?.limit, directory: requestDirectory })
        return { items: [{ info: mirroredMessage, parts: [] }], cursor: {} }
      },
    },
    runtimeKey: getRuntimeKey(),
  })
  setImperativeSessionMessageLoader(loader)
  const getSession = spyOn(opencodeClient, "getSessionUnscoped").mockResolvedValue(updatedSession)
  cleanups.push(() => { getSession.mockRestore(); setImperativeSessionMessageLoader(null); loader.dispose(); childStores.disposeAll() })
  useGlobalSessionsStore.getState().applySnapshot([oldSession], [], "ready")
  setActiveSession(directory, sessionID)

  handleEvent(directory, { type: "session.mirror.updated", properties: { sessionID } },
    childStores, createEventRoutingIndex(), getRuntimeKey())
  await settle()

  expect(getSession.mock.calls.length).toBe(1)
  expect(useGlobalSessionsStore.getState().entityById.get(sessionID)?.title).toBe("After")
  expect(store.getState().session[0]?.title).toBe("After")
  expect(store.getState().session[0]?.metadata).toBeUndefined()
  expect(messageReads).toEqual([{ id: sessionID, limit: 100, directory }])
  expect(store.getState().message[sessionID]).toEqual([mirroredMessage])
})

test("mirror notice before local session load updates the global list without loading messages", async () => {
  const childStores = new ChildStoreManager()
  const getSession = spyOn(opencodeClient, "getSessionUnscoped").mockResolvedValue(updatedSession)
  cleanups.push(() => { getSession.mockRestore(); childStores.disposeAll() })
  useGlobalSessionsStore.getState().applySnapshot([], [], "ready")

  handleEvent("global", { type: "session.mirror.updated", properties: { sessionID } },
    childStores, createEventRoutingIndex(), getRuntimeKey())
  await settle()

  expect(useGlobalSessionsStore.getState().entityById.get(sessionID)?.title).toBe("After")
  expect(childStores.getChild(directory)).toBeUndefined()
})
