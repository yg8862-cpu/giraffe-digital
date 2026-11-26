import { useState } from "react"
import { contractLabel } from "../domain/calc"
import { confirmDraft, discardDraft } from "../domain/confirm"
import { adoptAll, adoptField, editField, fieldKeys, labelFor } from "../domain/extract"
import type { Draft, UploadKind } from "../domain/types"
import { useStore } from "../state/store"
import { FieldBadge } from "./bits"
import type { Route } from "./router"

export function ConfirmPage({ id, go }: { id: string; go: (route: Route) => void }) {
  const { state, update, replace, openBlob, setNotice } = useStore()
  const draft = state.drafts.find((item) => item.id === id)
  const [target, setTarget] = useState("")
  const [markEffective, setMarkEffective] = useState(false)
  const [markVerified, setMarkVerified] = useState(false)
  const [overrideExclusion, setOverrideExclusion] = useState(false)
  const [error, setError] = useState("")
  if (!draft) {
    return (
      <section className="panel">
        <h1>这份待确认已经不在了</h1>
        <p>它可能已经写入，或已经放弃。未确认的内容不会留在正式台账里。</p>
        <button className="btn" type="button" onClick={() => go({ name: "home" })}>回首页</button>
      </section>
    )
  }
  const chosen = target || defaultTarget(draft)
  const amountReady = !draft.fields.amount?.uncertain && Number(String(draft.fields.amount?.value).replace(/,/g, "")) > 0

  function change(key: string, value: string) {
    update((current) => ({
      ...current,
      drafts: current.drafts.map((item) => (item.id === draft?.id ? editField(item, key, value) : item)),
    }))
  }
  function adopt(key?: string) {
    update((current) => ({
      ...current,
      drafts: current.drafts.map((item) => {
        if (item.id !== draft?.id) return item
        return key ? adoptField(item, key) : adoptAll(item)
      }),
    }))
  }

  function commit() {
    const current = state.drafts.find((item) => item.id === id)
    if (!current) return
    const result = confirmDraft(state, current, {
      markEffective: current.kind === "合同生效件" && markEffective,
      markVerified: current.kind !== "合同生效件" && markVerified,
      targetContractId: chosen,
      overrideExclusion,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    replace(result.state)
    setNotice(result.message)
    if (current.kind === "发票") go({ name: "invoices" })
    else if (current.kind === "付款凭证") go({ name: "payments" })
    else go({ name: "contracts", id: chosen !== "new" && chosen !== "unmatched" ? chosen : undefined })
  }

  const keys = fieldKeys(draft.kind).filter((key) => !key.startsWith("source") && !key.startsWith("stage_"))
  return (
    <section className="panel confirm">
      <p className="kicker">确认后才写入</p>
      <h1>核对{draft.kind}</h1>
      <p className={draft.extraction === "未能自动识别" || draft.extraction === "手工填写" ? "callout" : "note"}>
        {draft.extraction === "正在读取" ? "正在读取文件，你可以先改下面的空格。" : draft.extractionNote || extractionLabel(draft.extraction)}
        。识别结果标着「待核」时，点「采用」或自己改过才会写入。不采用就保持待核。
      </p>
      {draft.blockedReason && <p className="callout danger">{draft.blockedReason}</p>}
      <p className="file-meta">文件：{draft.fileName || "手工填写"} · 文件日期：{draft.fileDate}</p>
      {draft.files.length > 0 && (
        <div className="row">
          {draft.files.map((file) => (
            <button key={file.id} className="btn ghost" type="button" onClick={() => void openBlob(file.id).then((url) => url && window.open(url, "_blank"))}>
              查看 {file.name}
            </button>
          ))}
        </div>
      )}
      {draft.matchNote && <p className="note">{draft.matchNote}</p>}
      <label className="stack">
        写入到
        <select value={chosen} onChange={(event) => setTarget(event.target.value)}>
          {draft.kind === "合同生效件" && <option value="new">新建一份合同</option>}
          {draft.kind !== "合同生效件" && <option value="unmatched">未匹配</option>}
          {state.contracts.map((contract) => (
            <option key={contract.id} value={contract.id}>{contractLabel(contract)}</option>
          ))}
        </select>
      </label>
      <div className="fields">
        {keys.map((key) => {
          const field = draft.fields[key]
          if (!field) return null
          return (
            <label key={key} className={field.uncertain ? "stack uncertain" : "stack"}>
              <span className="label-row">{labelFor(key, draft.kind)} <FieldBadge field={field} /></span>
              <input value={field.value} onChange={(event) => change(key, event.target.value)} />
              {field.uncertain && field.suggestion && (
                <span className="hint">
                  识别到：{field.suggestion}
                  <button type="button" onClick={() => adopt(key)}>采用</button>
                </span>
              )}
            </label>
          )
        })}
      </div>
      {draft.kind === "合同生效件" && (
        <fieldset>
          <legend>付款阶段（含质保金，未知保持待核）</legend>
          {["首付款", "二期款", "三期款", "尾款", "质保金"].map((stage) => (
            <div key={stage} className="stage-row">
              <strong>{stage}</strong>
              {(["ratio", "amount", "trigger"] as const).map((part) => {
                const key = `stage_${stage}_${part}`
                const field = draft.fields[key]
                if (!field) return null
                return (
                  <label key={key} className={field.uncertain ? "stack uncertain" : "stack"}>
                    <span className="label-row">{labelFor(key, draft.kind)} <FieldBadge field={field} /></span>
                    <input value={field.value} placeholder="待核" onChange={(event) => change(key, event.target.value)} />
                    {field.uncertain && field.suggestion && (
                      <span className="hint">识别到：{field.suggestion}<button type="button" onClick={() => adopt(key)}>采用</button></span>
                    )}
                  </label>
                )
              })}
            </div>
          ))}
        </fieldset>
      )}
      <div className="row">
        <button className="btn ghost" type="button" onClick={() => adopt()}>采用全部识别结果</button>
      </div>
      {draft.excerpt && (
        <details>
          <summary>识别原文摘录</summary>
          <pre>{draft.excerpt}</pre>
        </details>
      )}
      {draft.blockedReason && (
        <label className="check">
          <input type="checkbox" checked={overrideExclusion} onChange={(event) => setOverrideExclusion(event.target.checked)} />
          我确认这是办公楼文件，不是店面或正德铝单板
        </label>
      )}
      {draft.kind === "合同生效件" ? (
        <label className="check">
          <input type="checkbox" checked={markEffective} onChange={(event) => setMarkEffective(event.target.checked)} />
          确认后把登记状态标成已生效。不勾选则保持签署待核。对外签署仍以老板确认为准。
        </label>
      ) : (
        <label className="check">
          <input type="checkbox" checked={markVerified} disabled={!amountReady} onChange={(event) => setMarkVerified(event.target.checked)} />
          {draft.kind === "发票"
            ? "只核验这张发票。不勾选则发票也是待核，并且不会记成付款。"
            : "标为已核验。金额须为正数。不勾选则保持待核，不计入已核验已付。质保金即使核验也不计入结算单已付款。"}
        </label>
      )}
      <p className="summary">{summary(draft.kind, chosen, markEffective, markVerified)}</p>
      {error && <p className="callout danger">{error}</p>}
      <div className="confirm-bar">
        <button className="btn danger" type="button" onClick={() => { update((current) => discardDraft(current, draft.id)); go({ name: "home" }) }}>
          放弃，不写入
        </button>
        <button className="btn" type="button" onClick={commit}>
          {markEffective ? "确认写入，并标记已生效" : markVerified ? "确认写入，并标为已核验" : "确认写入台账"}
        </button>
      </div>
    </section>
  )
}

function defaultTarget(draft: Draft): string {
  if (draft.matchContractId) return draft.matchContractId
  return draft.kind === "合同生效件" ? "new" : "unmatched"
}

function extractionLabel(mode: Draft["extraction"]): string {
  if (mode === "PDF文本") return "已从 PDF 读出文字"
  if (mode === "图片识别" || mode === "PDF转图识别") return "已做图片识别"
  if (mode === "手工填写") return "手工填写"
  if (mode === "正在读取") return "正在读取"
  return "未能自动识别"
}

function summary(kind: UploadKind, target: string, effective: boolean, verified: boolean): string {
  const where = target === "new" ? "新建合同" : target === "unmatched" ? "不关联合同" : target
  if (kind === "合同生效件") return `将写入${where}。${effective ? "登记状态改为已生效。" : "状态保持签署待核。"}不会因为这份合同就把付款记成已核验。`
  if (kind === "发票") return `将写入开票登记（${where}）。${verified ? "发票标为已核验。" : "发票保持待核。"}不会生成付款，也不会变成已核验已付。`
  return `将写入付款台账（${where}）。${verified ? "这笔标为已核验。" : "核验状态保持待核，不计入已付。"}`
}
