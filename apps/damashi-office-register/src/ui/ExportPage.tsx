import { useState } from "react"
import { downloadBackup, downloadWorkbook, readBackup, readWorkbook } from "../domain/workbook"
import { useStore } from "../state/store"

export function ExportPage() {
  const { demo, state, replace, resetCurrent } = useStore()
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
    const ok = window.confirm(`${result.summary}\n\n确定用它替换这台浏览器里的正式台账？示例模式不受影响。`)
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
      <p>试用数据只存在这台浏览器里。手机和电脑要各自打开；要把新登记带到另一台，请先导出，再在那边导入。预置的 12 份合同两边都会有，不用导入也能看。</p>
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
