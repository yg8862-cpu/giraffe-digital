import { useEffect } from "react"
import { StoreProvider, useStore } from "./state/store"
import { ConfirmPage } from "./ui/ConfirmPage"
import { ContractsPage } from "./ui/ContractsPage"
import { ExportPage } from "./ui/ExportPage"
import { HomePage } from "./ui/HomePage"
import { InvoicesPage, PaymentsPage, TermsPage } from "./ui/LedgerPages"
import { useRoute, type Route } from "./ui/router"
import { SettlementPage } from "./ui/SettlementPage"

const NAV: { name: Route["name"]; label: string }[] = [
  { name: "home", label: "首页" },
  { name: "settlement", label: "结算单" },
  { name: "contracts", label: "合同清单" },
  { name: "terms", label: "付款条件" },
  { name: "payments", label: "付款台账" },
  { name: "invoices", label: "开票登记" },
  { name: "export", label: "导出" },
]

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { ready, shared, demo, notice, persistError, state, setDemo, reload, logout } = useStore()
  const [route, go] = useRoute()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])
  if (!ready) {
    return <p className="boot">{shared ? "正在打开共用台账…" : "正在打开台账…"}</p>
  }
  return (
    <div className={demo ? "app demo-mode" : "app"}>
      <header className="topbar">
        <div>
          <p className="brand">黛玛诗办公楼</p>
          <p className="brand-sub">合同 · 发票 · 结算登记</p>
        </div>
        <div className="top-actions">
          {shared && !demo && (
            <button className="btn ghost" type="button" onClick={() => void reload()}>
              刷新
            </button>
          )}
          <button
            className={demo ? "btn" : "btn ghost"}
            type="button"
            onClick={() => {
              if (!demo && !window.confirm("进入示例模式。12,500 / 5,000 / 7,500 是虚构数字，不会写入办公楼台账。")) return
              setDemo(!demo)
            }}
          >
            {demo ? "返回正式台账" : "示例模式"}
          </button>
          {shared && (
            <button className="btn ghost" type="button" onClick={() => void logout()}>
              退出
            </button>
          )}
        </div>
      </header>
      {demo && <p className="demo-banner">示例模式 · 虚构数据，和办公楼正式台账分开。不要把 12,500 / 5,000 / 7,500 抄进正式结算。</p>}
      {persistError && <p className="callout danger banner">{persistError}</p>}
      {notice && <p className="callout banner">{notice}</p>}
      {!demo && state.drafts.length > 0 && route.name !== "confirm" && (
        <button className="draft-banner" type="button" onClick={() => go({ name: "confirm", id: state.drafts[0].id })}>
          {state.drafts.length} 份上传还没确认，没有写入台账
        </button>
      )}
      <div className="body">
        <nav className="sidebar">
          {NAV.map((item) => (
            <button key={item.name} type="button" className={route.name === item.name ? "nav-btn current" : "nav-btn"} onClick={() => go({ name: item.name } as Route)}>
              {item.label}
              {item.name === "home" && state.drafts.length > 0 ? ` (${state.drafts.length})` : ""}
            </button>
          ))}
          <p className="side-note">只登记办公楼。正德铝单板和店面不进入这本台账。外部签署和付款仍以老板确认为准。</p>
        </nav>
        <main>
          <Page route={route} go={go} />
        </main>
      </div>
      <nav className="bottom-nav">
        {(
          [
            { name: "home", label: "首页" },
            { name: "settlement", label: "结算" },
            { name: "contracts", label: "合同" },
            { name: "payments", label: "付款" },
          ] as const
        ).map((item) => (
          <button key={item.name} type="button" className={route.name === item.name ? "current" : ""} onClick={() => go({ name: item.name })}>
            {item.label}
          </button>
        ))}
        <details>
          <summary>更多</summary>
          <div>
            {NAV.filter((item) => !["home", "settlement", "contracts", "payments"].includes(item.name)).map((item) => (
              <button key={item.name} type="button" onClick={() => go({ name: item.name } as Route)}>
                {item.label}
              </button>
            ))}
            <button type="button" onClick={() => {
              if (!demo && !window.confirm("进入示例模式。12,500 / 5,000 / 7,500 是虚构数字，不会写入办公楼台账。")) return
              setDemo(!demo)
            }}>{demo ? "返回正式" : "示例模式"}</button>
          </div>
        </details>
      </nav>
    </div>
  )
}

function Page({ route, go }: { route: Route; go: (route: Route) => void }) {
  if (route.name === "confirm") return <ConfirmPage id={route.id} go={go} />
  if (route.name === "contracts") return <ContractsPage id={route.id} go={go} />
  if (route.name === "terms") return <TermsPage id={route.id} go={go} />
  if (route.name === "payments") return <PaymentsPage id={route.id} go={go} />
  if (route.name === "invoices") return <InvoicesPage id={route.id} go={go} />
  if (route.name === "settlement") return <SettlementPage id={route.id} go={go} />
  if (route.name === "export") return <ExportPage />
  return <HomePage go={go} />
}
