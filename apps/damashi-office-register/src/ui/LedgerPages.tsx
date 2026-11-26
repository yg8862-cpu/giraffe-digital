import { useState } from "react"
import { verifiedPaid } from "../domain/calc"
import { removeById, replaceInvoice, replacePayment, replaceTerm } from "../domain/edit"
import { parseAmount, uid } from "../domain/money"
import type { Invoice, Payment, Term } from "../domain/types"
import { INVOICE_TYPES, PAY_METHODS, STAGES } from "../domain/types"
import { useStore } from "../state/store"
import { Money } from "./bits"
import type { Route } from "./router"

export function TermsPage({ id, go }: { id?: string; go: (route: Route) => void }) {
  const { state, update, setNotice } = useStore()
  const [contractId, setContractId] = useState("全部")
  const terms = state.terms.filter((term) => contractId === "全部" || term.contractId === contractId)
  const selected = state.terms.find((term) => term.id === id)
  return (
    <div className={`split ${selected ? "has-detail" : ""}`}>
      <section className="split-main">
        <div className="section-head">
          <h1>付款条件</h1>
          <select value={contractId} onChange={(event) => setContractId(event.target.value)}>
            <option value="全部">全部合同</option>
            {state.contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.id}</option>)}
          </select>
        </div>
        <p>这里是合同约定要怎么付，不是已经付了。没有的阶段保持待核或「无此阶段」，不要写成 0。质保金单独一行，不放进结算单。</p>
        <RecordList
          rows={terms.map((term) => ({
            id: term.id,
            title: `${term.contractId} · ${term.stage}`,
            detail: `${term.ratio} · ${term.amount == null ? term.amountText || "待核" : term.amount}`,
            onOpen: () => go({ name: "terms", id: term.id }),
          }))}
        />
        <button className="btn" type="button" onClick={() => {
          const term: Term = { id: uid("term"), contractId: state.contracts[0]?.id ?? "", stage: "其他/待核", originalName: "", ratio: "待核", amount: null, amountText: "待核", basis: "", trigger: "待核", note: "" }
          update((current) => replaceTerm(current, term).state)
          go({ name: "terms", id: term.id })
        }}>添加一条付款条件</button>
      </section>
      <aside className="split-side panel">
        {selected ? <TermEditor key={selected.id} term={selected} onBack={() => go({ name: "terms" })} onSaved={(message) => setNotice(message)} /> : <p>点一条付款条件查看约定。它还不是付款台账。</p>}
      </aside>
    </div>
  )
}

export function PaymentsPage({ id, go }: { id?: string; go: (route: Route) => void }) {
  const { state } = useStore()
  const selected = state.payments.find((payment) => payment.id === id)
  const anyVerified = state.contracts.some((contract) => verifiedPaid(state.payments, contract.id) != null)
  return (
    <div className={`split ${selected ? "has-detail" : ""}`}>
      <section className="split-main">
        <h1>付款台账</h1>
        <p data-testid="verified-paid">已核验已付：{anyVerified ? "见各合同结算单" : <strong>待核</strong>}。只有核验状态为已核验、金额为正、且不是质保金的记录才计入。未核验不显示成 0。</p>
        <p>BG-HT-012 的 25,000 若仍是待核，会在结算单上标明「模板载明，凭证待核」，但不算已核验已付。</p>
        {state.payments.length === 0 && <p className="callout">还没有付款记录。上传付款凭证并确认后才会出现在这里。</p>}
        <div className="scroll only-desktop">
          <table className="grid">
            <thead>
              <tr><th>编号</th><th>合同</th><th>阶段</th><th>付款人</th><th>收款方</th><th>金额</th><th>核验</th></tr>
            </thead>
            <tbody>
              {state.payments.map((payment) => (
                <tr key={payment.id} onClick={() => go({ name: "payments", id: payment.id })}>
                  <td>{payment.id}</td><td>{payment.contractId || "未匹配"}</td><td>{payment.stage}</td>
                  <td>{payment.payer}</td><td>{payment.payee}</td>
                  <td><Money value={payment.amount} /></td>
                  <td>{payment.verifyStatus === "已核验" ? "已核验" : <span className="pending">待核</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="only-mobile cards">
          {state.payments.map((payment) => (
            <button key={payment.id} className="card-btn" type="button" onClick={() => go({ name: "payments", id: payment.id })}>
              <strong>{payment.id}</strong>
              <span>{payment.contractId || "未匹配"} · {payment.stage}</span>
              <span>付款人 {payment.payer} / 收款 {payment.payee}</span>
              <span><Money value={payment.amount} /> · {payment.verifyStatus}</span>
            </button>
          ))}
        </div>
      </section>
      <aside className="split-side panel">
        {selected ? <PaymentEditor key={selected.id} payment={selected} onBack={() => go({ name: "payments" })} /> : <p>点一笔付款核对。实际付款人和收款供应商要分开填。</p>}
      </aside>
    </div>
  )
}

export function InvoicesPage({ id, go }: { id?: string; go: (route: Route) => void }) {
  const { state } = useStore()
  const selected = state.invoices.find((invoice) => invoice.id === id)
  return (
    <div className={`split ${selected ? "has-detail" : ""}`}>
      <section className="split-main">
        <h1>开票登记</h1>
        <p>开票方、实际付款人、收款供应商是三个字段。已开票不等于已付款，核验发票也不会写入付款台账。</p>
        {state.invoices.length === 0 && <p className="callout">目前没有开票记录。上传发票并确认后才会登记。</p>}
        <RecordList
          rows={state.invoices.map((invoice) => ({
            id: invoice.id,
            title: `${invoice.id} · ${invoice.issuer || "开票方待核"}`,
            detail: `${invoice.contractId || "未匹配"} · ${invoice.verifyStatus} · 付款人 ${invoice.payer} · 收款 ${invoice.receivingSupplier}`,
            onOpen: () => go({ name: "invoices", id: invoice.id }),
          }))}
        />
      </section>
      <aside className="split-side panel">
        {selected ? <InvoiceEditor key={selected.id} invoice={selected} onBack={() => go({ name: "invoices" })} /> : <p>发票确认写入后，可以在这里改正。</p>}
      </aside>
    </div>
  )
}

function RecordList({ rows }: { rows: { id: string; title: string; detail: string; onOpen: () => void }[] }) {
  return (
    <div className="cards">
      {rows.map((row) => (
        <button key={row.id} className="card-btn" type="button" onClick={row.onOpen}>
          <strong>{row.title}</strong>
          <span>{row.detail}</span>
        </button>
      ))}
    </div>
  )
}

function TermEditor({ term, onBack, onSaved }: { term: Term; onBack: () => void; onSaved: (message: string) => void }) {
  const { state, update } = useStore()
  const [draft, setDraft] = useState(term)
  const [amount, setAmount] = useState(term.amount == null ? "" : String(term.amount))
  return (
    <form className="editor" onSubmit={(event) => {
      event.preventDefault()
      const parsed = amount.trim() ? parseAmount(amount) : null
      const next = { ...draft, amount: parsed, amountText: parsed == null ? (amount.trim() || "待核") : "" }
      update((current) => replaceTerm(current, next).state)
      onSaved("付款条件已保存。这仍不是已付款。")
    }}>
      <button className="text-btn only-mobile" type="button" onClick={onBack}>返回列表</button>
      <h2>{term.contractId || "未选合同"}</h2>
      <label className="stack">合同
        <select value={draft.contractId} onChange={(event) => setDraft({ ...draft, contractId: event.target.value })}>
          {state.contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.id}</option>)}
        </select>
      </label>
      <label className="stack">阶段
        <select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>
          {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
        </select>
      </label>
      <label className="stack">比例<input value={draft.ratio} placeholder="待核" onChange={(event) => setDraft({ ...draft, ratio: event.target.value })} /></label>
      <label className="stack">约定额<input inputMode="decimal" placeholder="待核" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="stack">触发条件<textarea value={draft.trigger} onChange={(event) => setDraft({ ...draft, trigger: event.target.value })} /></label>
      <label className="stack">备注<textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      <div className="row">
        <button className="btn" type="submit">保存</button>
        <button className="btn danger" type="button" onClick={() => { update((current) => ({ ...current, terms: removeById(current.terms, term.id) })); onBack() }}>删除</button>
      </div>
    </form>
  )
}

function PaymentEditor({ payment, onBack }: { payment: Payment; onBack: () => void }) {
  const { state, update, setNotice } = useStore()
  const [draft, setDraft] = useState(payment)
  const [amount, setAmount] = useState(payment.amount == null ? "" : String(payment.amount))
  const [verified, setVerified] = useState(payment.verifyStatus === "已核验")
  const [error, setError] = useState("")
  const parsed = amount.trim() ? parseAmount(amount) : null
  return (
    <form className="editor" onSubmit={(event) => {
      event.preventDefault()
      const next: Payment = { ...draft, amount: parsed, verifyStatus: verified ? "已核验" : "待核" }
      const result = replacePayment(state, next)
      if (result.error) { setError(result.error); return }
      update(() => result.state)
      setNotice(next.verifyStatus === "已核验" ? "已标为已核验。质保金仍不计入结算单已付款。" : "已保存，核验状态为待核。")
      setError("")
    }}>
      <button className="text-btn only-mobile" type="button" onClick={onBack}>返回列表</button>
      <h2>{payment.id}</h2>
      <label className="stack">合同
        <select value={draft.contractId} onChange={(event) => setDraft({ ...draft, contractId: event.target.value })}>
          <option value="">未匹配</option>
          {state.contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.id}</option>)}
        </select>
      </label>
      <label className="stack">阶段
        <select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>
          {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
        </select>
      </label>
      <label className="stack">实际付款人<input value={draft.payer} onChange={(event) => setDraft({ ...draft, payer: event.target.value })} /></label>
      <label className="stack">收款供应商<input value={draft.payee} onChange={(event) => setDraft({ ...draft, payee: event.target.value })} /></label>
      <label className="stack">本次支付额<input inputMode="decimal" placeholder="待核" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="stack">付款日期<input value={draft.payDate} onChange={(event) => setDraft({ ...draft, payDate: event.target.value })} /></label>
      <label className="stack">支付方式
        <select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>
          {PAY_METHODS.map((method) => <option key={method}>{method}</option>)}
        </select>
      </label>
      <label className="stack">备注<textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      <label className="check">
        <input type="checkbox" checked={verified} disabled={!(parsed != null && parsed > 0)} onChange={(event) => setVerified(event.target.checked)} />
        标为已核验。不勾选则保持待核，不计入已付。
      </label>
      {draft.stage === "质保金" && <p className="note">质保金即使已核验，也不计入结算单的已付款。</p>}
      {error && <p className="callout danger">{error}</p>}
      <div className="row">
        <button className="btn" type="submit">保存付款</button>
        <button className="btn danger" type="button" onClick={() => {
          if (!window.confirm("删掉这笔台账后，结算单仍会按合同上的模板载明已付款显示，直到你改合同。它仍然不是已核验。")) return
          update((current) => ({ ...current, payments: removeById(current.payments, payment.id) }))
          onBack()
        }}>删除</button>
      </div>
    </form>
  )
}

function InvoiceEditor({ invoice, onBack }: { invoice: Invoice; onBack: () => void }) {
  const { state, update, setNotice } = useStore()
  const [draft, setDraft] = useState(invoice)
  const [amount, setAmount] = useState(invoice.amount == null ? "" : String(invoice.amount))
  const [verified, setVerified] = useState(invoice.verifyStatus === "已核验")
  const [error, setError] = useState("")
  const parsed = amount.trim() ? parseAmount(amount) : null
  return (
    <form className="editor" onSubmit={(event) => {
      event.preventDefault()
      const next: Invoice = { ...draft, amount: parsed, verifyStatus: verified ? "已核验" : "待核" }
      const result = replaceInvoice(state, next)
      if (result.error) { setError(result.error); return }
      update(() => result.state)
      setNotice("发票已保存。没有写入付款台账。")
      setError("")
    }}>
      <button className="text-btn only-mobile" type="button" onClick={onBack}>返回列表</button>
      <h2>{invoice.id}</h2>
      <label className="stack">合同
        <select value={draft.contractId} onChange={(event) => setDraft({ ...draft, contractId: event.target.value })}>
          <option value="">未匹配</option>
          {state.contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.id}</option>)}
        </select>
      </label>
      <label className="stack">开票方<input value={draft.issuer} onChange={(event) => setDraft({ ...draft, issuer: event.target.value })} /></label>
      <label className="stack">购方抬头<input value={draft.buyerTitle} onChange={(event) => setDraft({ ...draft, buyerTitle: event.target.value })} /></label>
      <label className="stack">实际付款人<input placeholder="待核" value={draft.payer} onChange={(event) => setDraft({ ...draft, payer: event.target.value })} /></label>
      <label className="stack">收款供应商<input placeholder="待核" value={draft.receivingSupplier} onChange={(event) => setDraft({ ...draft, receivingSupplier: event.target.value })} /></label>
      <label className="stack">价税合计<input inputMode="decimal" placeholder="待核" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="stack">货物或服务<input value={draft.goodsName} onChange={(event) => setDraft({ ...draft, goodsName: event.target.value })} /></label>
      <label className="stack">发票类型
        <select value={draft.invoiceType} onChange={(event) => setDraft({ ...draft, invoiceType: event.target.value })}>
          {INVOICE_TYPES.map((type) => <option key={type}>{type}</option>)}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={verified} disabled={!(parsed != null && parsed > 0)} onChange={(event) => setVerified(event.target.checked)} />
        只核验这张发票，不记为付款
      </label>
      {draft.mismatchNote && <p className="note">{draft.mismatchNote}</p>}
      {error && <p className="callout danger">{error}</p>}
      <div className="row">
        <button className="btn" type="submit">保存发票</button>
        <button className="btn danger" type="button" onClick={() => { update((current) => ({ ...current, invoices: removeById(current.invoices, invoice.id) })); onBack() }}>删除</button>
      </div>
    </form>
  )
}
