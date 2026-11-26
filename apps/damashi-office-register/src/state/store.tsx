import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { createDemoState } from "../domain/demo"
import { createLiveState } from "../domain/seed"
import type { AppState } from "../domain/types"
import { isAppState } from "../server/ledger"
import { endSession, fetchLedger, getBlob, putBlob, putLedger, sessionState } from "./remote"
import { kvGet, kvSet } from "./persist"

const MODE_KEY = "damashi-office-mode"

type SaveResult = { ok: true } | { ok: false; message: string }

type StoreValue = {
  ready: boolean
  shared: boolean
  demo: boolean
  notice: string
  persistError: string
  state: AppState
  setNotice: (notice: string) => void
  setDemo: (demo: boolean) => void
  resetCurrent: () => void
  update: (recipe: (state: AppState) => AppState) => void
  replace: (state: AppState) => void
  reload: () => Promise<void>
  whenSaved: () => Promise<SaveResult>
  logout: () => Promise<void>
  saveBlob: (id: string, blob: Blob) => Promise<void>
  openBlob: (id: string) => Promise<string | null>
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const buckets = useRef<{ live: AppState; demo: AppState }>({ live: createLiveState(), demo: createDemoState() })
  const demoRef = useRef(false)
  const sharedRef = useRef(false)
  const revisionRef = useRef(0)
  const pendingLive = useRef<AppState | null>(null)
  const liveLoop = useRef<Promise<SaveResult> | null>(null)
  const saveTail = useRef<Promise<SaveResult>>(Promise.resolve({ ok: true }))
  const writing = useRef(false)
  const [ready, setReady] = useState(false)
  const [shared, setShared] = useState(false)
  const [demo, setDemoFlag] = useState(false)
  const [state, setState] = useState<AppState>(createLiveState)
  const [notice, setNotice] = useState("")
  const [persistError, setPersistError] = useState("")

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function pullLive(): Promise<void> {
    if (!sharedRef.current || writing.current) return
    const record = await fetchLedger()
    revisionRef.current = record.revision
    buckets.current.live = record.state
    if (!demoRef.current) setState(record.state)
    setNotice("已刷新共用台账。")
  }

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || demoRef.current) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return
      void pullLive().catch(() => setPersistError("刷新共用台账失败。请再点一次刷新。"))
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [])

  useEffect(() => {
    let cancel = false
    void (async () => {
      const mode = await sessionState()
      if (cancel) return
      if (mode === "out") {
        window.location.replace("/login")
        return
      }
      const sharedNow = mode === "in"
      sharedRef.current = sharedNow
      setShared(sharedNow)
      try {
        if (sharedNow) {
          const record = await fetchLedger()
          if (cancel) return
          revisionRef.current = record.revision
          buckets.current.live = record.state
        } else {
          const live = await kvGet<AppState>("state:live")
          buckets.current.live = isAppState(live) ? live : createLiveState()
        }
        const savedDemo = await kvGet<AppState>("state:demo")
        buckets.current.demo = isAppState(savedDemo) ? savedDemo : createDemoState()
      } catch {
        if (!cancel) setPersistError(sharedNow ? "读不到共用台账。请刷新后再试。" : "读不到这台浏览器里的存档，先显示预置台账。")
      }
      if (cancel) return
      const nextDemo = window.localStorage.getItem(MODE_KEY) === "demo"
      demoRef.current = nextDemo
      setDemoFlag(nextDemo)
      setState(buckets.current[nextDemo ? "demo" : "live"])
      setReady(true)
    })()
    return () => {
      cancel = true
    }
  }, [])

  function persist(next: AppState, mode = demoRef.current) {
    const key = mode ? "demo" : "live"
    buckets.current[key] = next
    if (mode || !sharedRef.current) {
      const job = kvSet(`state:${key}`, next)
        .then(() => ({ ok: true }) as SaveResult)
        .catch(() => ({ ok: false, message: "这台浏览器没能保存。请先导出备份。" }) as SaveResult)
      saveTail.current = job
      void job.then((result) => {
        if (!result.ok) setPersistError(result.message)
      })
      return
    }
    pendingLive.current = next
    if (writing.current) return
    writing.current = true
    const loop = (async () => {
      let result: SaveResult = { ok: true }
      try {
        while (pendingLive.current) {
          const snapshot = pendingLive.current
          pendingLive.current = null
          let saved: Awaited<ReturnType<typeof putLedger>>
          try {
            saved = await putLedger(revisionRef.current, snapshot)
          } catch {
            result = { ok: false, message: "连不上共用台账，这次没有保存。" }
            setPersistError(result.message)
            break
          }
          if (!saved.ok && saved.conflict) {
            pendingLive.current = null
            revisionRef.current = saved.conflict.revision
            buckets.current.live = saved.conflict.state
            if (!demoRef.current) setState(saved.conflict.state)
            result = { ok: false, message: saved.message }
            setPersistError(saved.message)
            break
          }
          if (!saved.ok) {
            result = { ok: false, message: saved.message }
            setPersistError(saved.message)
            break
          }
          revisionRef.current = saved.revision
          setPersistError("")
          result = { ok: true }
        }
      } finally {
        liveLoop.current = null
        writing.current = false
        if (pendingLive.current) persist(pendingLive.current, false)
      }
      return result
    })()
    liveLoop.current = loop
    saveTail.current = loop
  }

  const value: StoreValue = {
    ready,
    shared,
    demo,
    notice,
    persistError,
    state,
    setNotice,
    setDemo: (next) => {
      buckets.current[demo ? "demo" : "live"] = state
      demoRef.current = next
      setDemoFlag(next)
      setState(buckets.current[next ? "demo" : "live"])
      window.localStorage.setItem(MODE_KEY, next ? "demo" : "live")
    },
    resetCurrent: () => {
      const next = demo ? createDemoState() : createLiveState()
      setState(next)
      persist(next)
      setNotice(demo ? "示例已恢复。" : shared ? "共用台账已恢复为预置的 12 份合同。其他人刷新后也会看到。" : "正式台账已恢复为预置的 12 份合同。")
    },
    update: (recipe) => {
      setState((current) => {
        const next = recipe(current)
        persist(next)
        return next
      })
    },
    replace: (next) => {
      setState(next)
      persist(next)
    },
    reload: async () => {
      if (!sharedRef.current) return
      await pullLive()
    },
    whenSaved: () => saveTail.current,
    logout: endSession,
    saveBlob: async (id, blob) => {
      if (sharedRef.current && !demoRef.current) {
        await putBlob(id, blob)
        return
      }
      await kvSet(`blob:${id}`, blob)
    },
    openBlob: async (id) => {
      if (sharedRef.current && !demoRef.current) {
        const blob = await getBlob(id)
        return blob ? URL.createObjectURL(blob) : null
      }
      const blob = await kvGet<Blob>(`blob:${id}`)
      if (!blob) return null
      return URL.createObjectURL(blob)
    },
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error("台账尚未就绪")
  return value
}
