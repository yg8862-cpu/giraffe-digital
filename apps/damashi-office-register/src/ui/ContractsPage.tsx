import { useMemo, useState } from "react"
import { displayContractAmount, displayRetention } from "../domain/calc"
import { replaceContract } from "../domain/edit"
import { parseAmount, statusBadge } from "../domain/money"
import type { Contract } from "../domain/types"
import { useStore } from "../state/store"
import { StatusBadge } from "./bits"
import type { Route } from "./router"

export function ContractsPage({ id, go }: { id?: string; go: (route: Route) => void }) {
  const { state } = useStore()
  const [query, setQuery] = useState("")
  const contracts = useMemo(
    () => state.contracts.filter((contract) => `${contract.id} ${contract.supplier} ${contract.scope} ${contract.tradeName} ${contract.shortName}`.includes(query.trim())),
    [state.contracts, query],
  )
  const selected = state.contracts.find((contract) => contract.id === id)
  return (
    <div className={`split ${selected ? "has-detail" : ""}`}>
      <section className="split-main">
        <div className="section-head">
          <h1>合同清单</h1>
          <input value={query} placeholder="搜索编号、供应商、范围" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <p>需方全称默认待核。预置 12 份都是签署待核，不是已生效。</p>
        <div className="scroll only-desktop">
          <table className="grid">
            <thead>
              <tr>
                <th>编号</th><th>状态</th><th>工种/范围</th><th>供应商</th><th>需方</th><th>合同额</th><th>最终结算价</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id} className={contract.id === id ? "current" : ""} onClick={() => go({ name: "contracts", id: contract.id })}>
                  <td>{contract.id}</td>
                  <td><StatusBadge status={contract.status} /></td>
                  <td>{contract.tradeName === "待核" ? "工种待核" : contract.shortName}</td>
                  <td>{contract.supplier}</td>
                  <td>{contract.buyer === "待核" ? <span className="pending">待核</span> : contract.buyer}</td>
                  <td>{displayContractAmount(contract)}</td>
                  <td>{contract.finalPrice == null ? <span className="pending">待核</span> : contract.finalPrice.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="only-mobile cards">
          {contracts.map((contract) => (
            <button key={contract.id} type="button" className="card-btn" onClick={() => go({ name: "contracts", id: contract.id })}>
              <strong>{contract.id}</strong>
              <StatusBadge status={contract.status} />
              <span>{contract.tradeName === "待核" ? "工种待核" : contract.shortName}</span>
              <span>{contract.supplier}</span>
              <span>合同额 {displayContractAmount(contract)}</span>
            </button>
          ))}
        </div>
      </section>
      <aside className="split-side panel">
        {selected ? (
          <ContractEditor key={selected.id} contract={selected} onBack={() => go({ name: "contracts" })} />
        ) : (
          <p>点一份合同，在右侧核对。手机上会进入这一份的编辑页。</p>
        )}
      </aside>
    </div>
  )
}

function ContractEditor({ contract, onBack }: { contract: Contract; onBack: () => void }) {
  const { state, update, setNotice } = useStore()
  const [supplier, setSupplier] = useState(contract.supplier)
  const [buyer, setBuyer] = useState(show(contract.buyer))
  const [tradeName, setTradeName] = useState(show(contract.tradeName))
  const [scope, setScope] = useState(contract.scope)
  const [originalNo, setOriginalNo] = useState(show(contract.originalNo))
  const [signDate, setSignDate] = useState(show(contract.signDate))
  const [amount, setAmount] = useState(contract.amount == null ? show(contract.amountText) : String(contract.amount))
  const [taxIncluded, setTaxIncluded] = useState(show(contract.taxIncluded))
  const [taxRate, setTaxRate] = useState(show(contract.taxRate))
  const [retentionRate, setRetentionRate] = useState(show(contract.retentionRate))
  const [retentionAmount, setRetentionAmount] = useState(contract.retentionAmount == null ? show(contract.retentionText) : String(contract.retentionAmount))
  const [retentionTerms, setRetentionTerms] = useState(contract.retentionTerms)
  const [finalPrice, setFinalPrice] = useState(contract.finalPrice == null ? "" : String(contract.finalPrice))
  const [ackFinal, setAckFinal] = useState(false)
  const [templatePaid, setTemplatePaid] = useState(contract.templatePaid == null ? "" : String(contract.templatePaid))
  const [settlementDate, setSettlementDate] = useState(show(contract.settlementDate))
  const [choice, setChoice] = useState<"签署待核" | "已生效">(statusBadge(contract.status))
  const [ackEffective, setAckEffective] = useState(false)
  const [error, setError] = useState("")

  function save() {
    const amountPair = readLoose(amount)
    const retentionPair = readLoose(retentionAmount)
    const finalPair = readLoose(finalPrice)
    const templatePair = readLoose(templatePaid)
    if (choice === "已生效" && !ackEffective) {
      setError("标记已生效需要勾选确认。不勾选就保持签署待核。")
      return
    }
    let finalNote = contract.finalPriceNote
    if (finalPair.amount == null) finalNote = "未审定，待核"
    else if (ackFinal) finalNote = "已审定"
    else if (contract.finalPrice !== finalPair.amount) finalNote = "手工填写，未审定，待核"
    let templateNote = contract.templatePaidNote
    if (templatePair.amount == null) templateNote = ""
    else if (contract.templatePaid !== templatePair.amount) templateNote = "手工改过的模板载明数，凭证待核"
    const status = choice === "已生效" ? "已生效" : contract.status === "已生效" ? "签署待核" : contract.status
    const next: Contract = {
      ...contract,
      supplier: supplier.trim() || "待核",
      buyer: buyer.trim() || "待核",
      tradeName: tradeName.trim() || "待核",
      shortName: tradeName.trim() || contract.shortName,
      scope,
      originalNo: originalNo.trim() || "待核",
      signDate: signDate.trim() || "待核",
      amount: amountPair.amount,
      amountText: amountPair.amount == null ? amountPair.text : "",
      taxIncluded: taxIncluded.trim() || "待核",
      taxRate: taxRate.trim() || "待核",
      retentionRate: retentionRate.trim() || "待核",
      retentionAmount: retentionPair.amount,
      retentionText: retentionPair.amount == null ? retentionPair.text : "",
      retentionTerms,
      finalPrice: finalPair.amount,
      finalPriceNote: finalNote,
      templatePaid: templatePair.amount,
      templatePaidNote: templateNote,
      settlementDate: settlementDate.trim() || "待填",
      status,
      provenance: { ...contract.provenance, supplier: "手工填写", amount: "手工填写" },
    }
    const result = replaceContract(state, next)
    if (result.error) {
      setError(result.error)
      return
    }
    update(() => result.state)
    setNotice("合同已保存。最终结算价不会从结算合计自动带入。")
    setError("")
  }

  return (
    <form className="editor" onSubmit={(event) => { event.preventDefault(); save() }}>
      <button className="text-btn only-mobile" type="button" onClick={onBack}>返回列表</button>
      <h2>{contract.id}</h2>
      <StatusBadge status={contract.status} />
      <label className="stack">供应商全称<input value={supplier} onChange={(event) => setSupplier(event.target.value)} /></label>
      <label className="stack">需方全称<input placeholder="待核" value={buyer} onChange={(event) => setBuyer(event.target.value)} /></label>
      <label className="stack">工种名称<input placeholder="待核" value={tradeName} onChange={(event) => setTradeName(event.target.value)} /></label>
      <label className="stack">合同/材料范围<textarea value={scope} onChange={(event) => setScope(event.target.value)} /></label>
      <label className="stack">原合同编号<input placeholder="待核" value={originalNo} onChange={(event) => setOriginalNo(event.target.value)} /></label>
      <label className="stack">签署日期<input placeholder="待核" value={signDate} onChange={(event) => setSignDate(event.target.value)} /></label>
      <label className="stack">合同额（未知留空，不要填 0）<input inputMode="decimal" placeholder="待核" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="stack">是否含税<input placeholder="待核" value={taxIncluded} onChange={(event) => setTaxIncluded(event.target.value)} /></label>
      <label className="stack">税率<input placeholder="待核" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></label>
      <label className="stack">质保金比例<input placeholder="待核" value={retentionRate} onChange={(event) => setRetentionRate(event.target.value)} /></label>
      <label className="stack">质保金约定额<input placeholder="待核" value={retentionAmount} onChange={(event) => setRetentionAmount(event.target.value)} /></label>
      <label className="stack">质保金返还条件<textarea value={retentionTerms} onChange={(event) => setRetentionTerms(event.target.value)} /></label>
      <p className="note">当前质保金显示：{displayRetention(contract)}。结算单上不单列质保金。</p>
      <label className="stack">最终结算价<input inputMode="decimal" placeholder="待核" value={finalPrice} onChange={(event) => setFinalPrice(event.target.value)} /></label>
      <label className="check">
        <input type="checkbox" checked={ackFinal} onChange={(event) => setAckFinal(event.target.checked)} />
        我确认这是已审定最终价，不是把结算合计自动填进来
      </label>
      <label className="stack">模板载明已付款（不是已核验）<input inputMode="decimal" placeholder="无" value={templatePaid} onChange={(event) => setTemplatePaid(event.target.value)} /></label>
      <label className="stack">编制日期<input placeholder="待填" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} /></label>
      <label className="stack">
        登记状态
        <select value={choice} onChange={(event) => setChoice(event.target.value as "签署待核" | "已生效")}>
          <option value="签署待核">签署待核</option>
          <option value="已生效">已生效</option>
        </select>
      </label>
      {choice === "已生效" && (
        <label className="check">
          <input type="checkbox" checked={ackEffective} onChange={(event) => setAckEffective(event.target.checked)} />
          我确认把登记状态改为已生效。对外仍以老板确认为准。
        </label>
      )}
      {contract.pendingNotes && <details><summary>待核事项</summary><p>{contract.pendingNotes}</p></details>}
      {error && <p className="callout danger">{error}</p>}
      <button className="btn" type="submit">保存合同</button>
    </form>
  )
}

function show(value: string): string {
  return !value || value === "待核" || value === "待填" ? "" : value
}

function readLoose(input: string): { amount: number | null; text: string } {
  const trimmed = input.trim()
  if (!trimmed || trimmed === "待核" || trimmed === "待填" || trimmed === "无") return { amount: null, text: trimmed || "待核" }
  const amount = parseAmount(trimmed)
  if (amount == null) return { amount: null, text: trimmed }
  return { amount, text: "" }
}
