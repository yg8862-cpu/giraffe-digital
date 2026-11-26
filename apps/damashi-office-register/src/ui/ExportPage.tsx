import { useState } from "react"
import { downloadBackup, downloadWorkbook, readBackup, readWorkbook } from "../domain/workbook"
import { useStore } from "../state/store"

export function ExportPage() {
  const { demo, shared, state, replace, resetCurrent } = useStore()
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function onImport(file: File | undefined) {
    if (!file) return
    if (demo) {
      setError("请先退出示例模式，再导入正式台账。")
      return
    }
    const text = file.name.endsWith(".json") ? await file.text() : ""
    const result = file.name.endsWith(".json") ? readBackup(text) : readWorkbook(await file.arrayBuffer())
    if ("error" in result) {
      setError(result.error)
      return
    }
    const ok = window.confirm(`${result.summary}\n\n确定用它替换${shared ? "共用" : "这台浏览器里的"}正式台账？示例模式不受影响。`)
    if (!ok) return
    replace({ ...result.state, drafts: state.drafts })
    setError("")
    setMessage("已导入。请再打开结算单核对 012 和已核验付款。")
  }

  return (
    <section className="panel">
      <h1>导出与备份</h1>
      <p>
        {demo
          ? "当前是示例模式。导出的文件会标明虚构，不要并进办公楼台账。"
          : "正式导出会按待审工作簿的工作表和列给出数值快照。填写示例那一页只留说明，不放 12,500 这些虚构数字。"}
      </p>
      <p>
        {shared
          ? "正式台账存在共用服务里。一人确认写入后，其他人点「刷新」或重新打开页面就能看到。导出的 Excel 和 JSON 只作备份。"
          : "当前没有连上共用台账，修改只在这台浏览器里。连上试用地址后，确认写入会进入同一本台账。"}
      </p>
      <div className="row">
        <button className="btn" type="button" onClick={() => downloadWorkbook(state, demo ? "demo" : "live")}>导出 Excel</button>
        <button className="btn ghost" type="button" onClick={() => downloadBackup(state, demo ? "demo" : "live")}>导出 JSON 备份</button>
      </div>
      <label className="stack">
        导入 Excel 或 JSON 备份
        <input type="file" accept=".xlsx,.json,application/json" onChange={(event) => { void onImport(event.target.files?.[0]); event.currentTarget.value = "" }} />
      </label>
      {message && <p className="callout">{message}</p>}
      {error && <p className="callout danger">{error}</p>}
      <h2>恢复预置</h2>
      <p>{demo ? "恢复示例里的虚构数字。" : "恢复预置的 BG-HT-001 至 012。这台浏览器里的修改和未确认上传会清掉，已经导出的文件不受影响。"}</p>
      <button className="btn danger" type="button" onClick={() => {
        if (window.confirm(demo ? "恢复示例数据？" : "恢复预置台账？未导出的修改会丢失。")) resetCurrent()
      }}>恢复{demo ? "示例" : "预置台账"}</button>
    </section>
  )
}
