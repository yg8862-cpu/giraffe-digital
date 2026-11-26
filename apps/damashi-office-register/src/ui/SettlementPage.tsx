import { useState } from "react"
import { buildSettlement, contractLabel } from "../domain/calc"
import { insertLine, removeLine, replaceLine } from "../domain/edit"
import { formatMoney, parseAmount, uid } from "../domain/money"
import type { Contract, LineItem } from "../domain/types"
import { useStore } from "../state/store"
import { SheetAmount, StatusBadge } from "./bits"
import type { Route } from "./router"

export function SettlementPage({ id, go }: { id?: string; go: (route: Route) => void }) {
  const { demo, state, update, setNotice } = useStore()
  const contract = state.contracts.find((item) => item.id === id) ?? state.contracts[0]
  if (!contract) return <section className="panel"><h1>还没有合同</h1></section>
  const view = buildSettlement(contract, state.lines, state.payments)
  const project = contract.projectNameAsWritten && contract.projectNameAsWritten !== "待核" ? contract.projectNameAsWritten : demo ? "示例项目（虚构）" : "黛玛诗办公楼"
  return (
    <div className="settle">
      <aside className="panel settle-nav only-desktop">
        <h2>合同</h2>
        {state.contracts.map((item) => (
          <button key={item.id} type="button" className={item.id === contract.id ? "nav-btn current" : "nav-btn"} onClick={() => go({ name: "settlement", id: item.id })}>
            <span>{item.id}</span>
            <small>{item.tradeName === "待核" ? "工种待核" : item.shortName}</small>
          </button>
        ))}
      </aside>
      <div>
        {demo && <p className="callout danger">示例 · 虚构数据。12,500 / 5,000 / 7,500 不是办公楼的已签约、已付款或已审定。</p>}
        {contract.id === "BG-HT-012" && (
          <p className="callout" data-testid="trade-012">
            工种待核。结算合计 53,050.63、最终价 53,000、已付款 25,000、尚欠款 28,000 都是模板载明，凭证和审定待核。25,000 不计入已核验已付，也不并入 8 份暂定价小计 873,942.93。
          </p>
        )}
        <label className="picker">
          选择合同
          <select className="yellow" value={contract.id} onChange={(event) => go({ name: "settlement", id: event.target.value })}>
            {state.contracts.map((item) => (
              <option key={item.id} value={item.id}>{contractLabel(item)}</option>
            ))}
          </select>
        </label>
        <p className="note">状态：<StatusBadge status={contract.status} /> {contract.id === "BG-HT-012" ? "来源：2026-11-26 结算单模板；已付款与最终价均为模板载明、待核。" : contract.status}</p>
        <article className="paper">
          <h1>黛玛诗办公楼结算单</h1>
          <div className="paper-meta">
            <span>工程名称：{project}</span>
            <span>供应商：{contract.supplier || "待核"}</span>
            <span>编制日期：{contract.settlementDate || "待填"}</span>
          </div>
          {contract.projectNameAsWritten && contract.projectNameAsWritten !== project && (
            <p className="note">原文工程名称：{contract.projectNameAsWritten}</p>
          )}
          <p className="note">工种：{contract.tradeName === "待核" ? "待核" : contract.tradeName}</p>
          <p className="scroll-hint">手机上可以左右滑动表格。</p>
          <div className="scroll">
            <table className="sheet">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>分部分项工程名称</th>
                  <th>单位</th>
                  <th>数量</th>
                  <th>单价（元）</th>
                  <th>合价（元）</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {view.lines.map((line) => (
                  <tr key={line.id} className={rowClass(line.kind)}>
                    <td>{line.no}</td>
                    <td>{line.name}</td>
                    <td>{line.unit}</td>
                    <td className="num">{line.qtyDisplay}</td>
                    <td className="num">{line.priceDisplay}</td>
                    <td className="num"><SheetAmount value={line.amount} /></td>
                    <td>{line.note}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td colSpan={5}>结算合计（人民币）</td>
                  <td data-testid="settle-subtotal"><SheetAmount value={view.subtotal} /></td>
                  <td>{view.subtotalNote}</td>
                </tr>
                <tr className="row-final">
                  <td colSpan={5}>最终结算价（人民币）</td>
                  <td data-testid="settle-final">{view.finalPrice == null ? <span className="pending">待核</span> : <span className="num">{formatMoney(view.finalPrice)}</span>}</td>
                  <td>{view.finalNote} {view.finalNote.includes("待核") && <span className="badge pending">待核</span>}</td>
                </tr>
                <tr><td colSpan={7}>{view.finalUpper}</td></tr>
                <tr className="row-paid">
                  <td colSpan={5}>已付款</td>
                  <td data-testid="settle-paid">{view.paid.amount == null ? <span className="pending">待核</span> : <span className="num">{formatMoney(view.paid.amount)}</span>}</td>
                  <td>{view.paid.note} {view.paid.kind !== "verified" && <span className="badge pending">待核</span>}</td>
                </tr>
                <tr className="row-due">
                  <td colSpan={5}>尚欠款</td>
                  <td data-testid="settle-due">{view.due == null ? <span className="pending">待核</span> : <span className="num">{formatMoney(view.due)}</span>}</td>
                  <td>{view.dueNote} {view.dueNote.includes("待核") && <span className="badge pending">待核</span>}</td>
                </tr>
                <tr><td colSpan={7}>{view.dueUpper}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="sign">本结算单一式两份，甲乙双方各执一份，经双方签字确认后生效。</p>
          <p className="sign">有无返工部分工程，质量验收是否合格。（现场相关负责人）确认签字：____________________</p>
          <p className="sign">有没有借公司的工具等。（材料部负责人）确认签字：____________________</p>
          <p className="sign">供应商负责人（确认签字）：{contract.supplier || ""}</p>
          <p className="sign split"><span>签字：____________________</span><span>日期：______年______月______日</span></p>
          <p className="sign split"><span>公司工程部负责人：____________________</span><span>日期：______年______月______日</span></p>
          <p className="sign split"><span>核批人：____________________</span><span>日期：______年______月______日</span></p>
        </article>
        <LineEditor contract={contract} onChange={(recipe) => { update(recipe); setNotice("分项已保存。结算合计不会自动变成最终结算价。") }} />
      </div>
    </div>
  )
}

function rowClass(kind: string): string {
  if (kind === "分部标题" || kind === "扣减分部") return "row-section"
  if (kind === "小计" || kind === "面积小计" || kind === "扣减小计") return "row-sub"
  return ""
}

function LineEditor({ contract, onChange }: { contract: Contract; onChange: (recipe: (state: import("../domain/types").AppState) => import("../domain/types").AppState) => void }) {
  const { state } = useStore()
  const lines = state.lines.filter((line) => line.contractId === contract.id).sort((a, b) => a.seq - b.seq)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <section className="panel no-print">
      <h2>修改分项</h2>
      <p>空着的数量或单价会显示待填，不会写成 0。结算单上不设质保金行。</p>
      {lines.filter((line) => line.kind === "分项" || line.kind === "扣减分项").map((line) => (
        <div key={line.id}>
          {editing === line.id ? (
            <LineForm line={line} onCancel={() => setEditing(null)} onSave={(next) => { onChange((current) => replaceLine(current, next)); setEditing(null) }} onDelete={() => { onChange((current) => removeLine(current, line.id)); setEditing(null) }} />
          ) : (
            <button className="text-btn" type="button" onClick={() => setEditing(line.id)}>改 {line.no} {line.name}</button>
          )}
        </div>
      ))}
      <div className="row">
        <button className="btn ghost" type="button" onClick={() => onChange((current) => insertLine(current, blankLine(contract.id, "分项")))}>添加分项</button>
        <button className="btn ghost" type="button" onClick={() => onChange((current) => insertLine(current, blankLine(contract.id, "扣减分项")))}>添加扣减</button>
      </div>
    </section>
  )
}

function blankLine(contractId: string, kind: "分项" | "扣减分项"): LineItem {
  return { id: uid("ln"), contractId, seq: 0, kind, no: "", name: "待核", unit: "", qty: null, price: null, literalAmount: "", note: "" }
}

function LineForm({ line, onSave, onCancel, onDelete }: { line: LineItem; onSave: (line: LineItem) => void; onCancel: () => void; onDelete: () => void }) {
  const [name, setName] = useState(line.name)
  const [unit, setUnit] = useState(line.unit)
  const [qty, setQty] = useState(line.qty == null ? "" : String(line.qty))
  const [price, setPrice] = useState(line.price == null ? "" : String(line.price))
  const [note, setNote] = useState(line.note)
  return (
    <form className="editor" onSubmit={(event) => { event.preventDefault(); onSave({ ...line, name: name || "待核", unit, qty: parseAmount(qty), price: parseAmount(price), note }) }}>
      <label className="stack">名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="stack">单位<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
      <label className="stack">数量<input inputMode="decimal" placeholder="待填" value={qty} onChange={(event) => setQty(event.target.value)} /></label>
      <label className="stack">单价<input inputMode="decimal" placeholder="待填" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label className="stack">备注<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="row">
        <button className="btn" type="submit">保存这一行</button>
        <button className="btn ghost" type="button" onClick={onCancel}>取消</button>
        <button className="btn danger" type="button" onClick={onDelete}>删除</button>
      </div>
    </form>
  )
}
