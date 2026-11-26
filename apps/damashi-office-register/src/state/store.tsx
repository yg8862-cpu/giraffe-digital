import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { createDemoState } from "../domain/demo"
import { createLiveState } from "../domain/seed"
import type { AppState } from "../domain/types"
import { kvGet, kvSet } from "./persist"

const MODE_KEY = "damashi-office-mode"

type StoreValue = {
  ready: boolean
  demo: boolean
  notice: string
  persistError: string
  state: AppState
  setNotice: (notice: string) => void
  setDemo: (demo: boolean) => void
  resetCurrent: () => void
  update: (recipe: (state: AppState) => AppState) => void
  replace: (state: AppState) => void
  saveBlob: (id: string, blob: Blob) => Promise<void>
  openBlob: (id: string) => Promise<string | null>
}

const StoreContext = createContext<StoreValue | null>(null)

function usable(value: AppState | undefined): value is AppState {
  return Boolean(
    value &&
      value.version === 1 &&
      Array.isArray(value.contracts) &&
      Array.isArray(value.terms) &&
      Array.isArray(value.payments) &&
      Array.isArray(value.invoices) &&
      Array.isArray(value.lines) &&
      Array.isArray(value.drafts),
  )
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const buckets = useRef<{ live: AppState; demo: AppState }>({ live: createLiveState(), demo: createDemoState() })
  const demoRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [demo, setDemoFlag] = useState(false)
  const [state, setState] = useState<AppState>(createLiveState)
  const [notice, setNotice] = useState("")
  const [persistError, setPersistError] = useState("")

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const live = await kvGet<AppState>("state:live")
        const savedDemo = await kvGet<AppState>("state:demo")
        if (cancel) return
        buckets.current.live = usable(live) ? live : createLiveState()
        buckets.current.demo = usable(savedDemo) ? savedDemo : createDemoState()
      } catch {
        if (!cancel) setPersistError("读不到这台浏览器里的存档，先显示预置台账。")
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
    void kvSet(`state:${key}`, next).catch(() => {
      setPersistError("这台浏览器没能保存。刷新后会回到上次成功保存的台账，请先导出备份。")
    })
  }

  const value: StoreValue = {
    ready,
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
      setNotice(demo ? "示例已恢复。" : "正式台账已恢复为预置的 12 份合同。")
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
    saveBlob: (id, blob) => kvSet(`blob:${id}`, blob),
    openBlob: async (id) => {
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
