import { useRef, useState } from "react"
import { historicalSubtotal, verifiedPaid } from "../domain/calc"
import { createDraft } from "../domain/extract"
import { readUpload } from "../domain/files"
import { formatMoney, sumMoney, todayShanghai } from "../domain/money"
import type { UploadKind } from "../domain/types"
import { useStore } from "../state/store"
import { Money, StatusBadge } from "./bits"
import type { Route } from "./router"

const KINDS: { kind: UploadKind; title: string; detail: string }[] = [
  { kind: "合同生效件", title: "合同生效件", detail: "PDF 或照片。确认前不会写成已生效。" },
  { kind: "发票", title: "发票", detail: "只登记开票。不会自动当成付款。" },
  { kind: "付款凭证", title: "付款凭证", detail: "默认待核。勾选之后才会计入已核验已付。" },
]

export function HomePage({ go }: { go: (route: Route) => void }) {
  const { demo, shared, state, update, saveBlob, setNotice } = useStore()
  const [reading, setReading] = useState("")
  const history = historicalSubtotal(state.contracts)
  const verifiedAmounts = state.contracts
    .map((contract) => verifiedPaid(state.payments, contract.id))
    .filter((amount): amount is number => amount != null)
  const seeded = state.contracts.filter((contract) => /^BG-HT-0(0[1-9]|1[0-2])$/.test(contract.id))
  const pending = seeded.filter((contract) => contract.status !== "已生效").length

  function startManual(kind: UploadKind) {
    const draft = createDraft({
      kind,
      fileName: "手工填写",
      fileDate: todayShanghai(),
      extraction: "手工填写",
      extractionNote: "这是手工登记，没有自动识别。未知项请保持待核，不要填 0。",
      contracts: state.contracts,
    })
    update((current) => ({ ...current, drafts: [draft, ...current.drafts] }))
    go({ name: "confirm", id: draft.id })
  }

  async function startFiles(kind: UploadKind, list: FileList | null) {
    if (!list || list.length === 0) return
    const files = [...list]
    const draft = createDraft({
      kind,
      fileName: files.map((file) => file.name).join("、"),
      fileDate: new Date(files[0].lastModified).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }),
      fileSize: files.reduce((sum, file) => sum + file.size, 0),
      extraction: "正在读取",
      extractionNote: "正在读取文件…",
      contracts: state.contracts,
      files: files.map((file) => ({ id: "", name: file.name })),
    })
    const stored = {
      ...draft,
      files: files.map((file, index) => ({ id: `${draft.id}:${index}`, name: file.name })),
    }
    update((current) => ({ ...current, drafts: [stored, ...current.drafts] }))
    go({ name: "confirm", id: stored.id })
    setReading(stored.id)
    try {
      await Promise.all(files.map((file, index) => saveBlob(stored.files[index].id, file)))
      const result = await readUpload(files, (message) => {
        update((current) => ({
          ...current,
          drafts: current.drafts.map((item) => (item.id === stored.id ? { ...item, extractionNote: message } : item)),
        }))
      })
      update((current) => ({
        ...current,
        drafts: current.drafts.map((item) => {
          if (item.id !== stored.id) return item
          const fresh = createDraft({
            kind,
            fileName: item.fileName,
            fileDate: item.fileDate,
            fileSize: item.fileSize,
            text: result.text,
            extraction: result.extraction,
            extractionNote: result.note,
            contracts: current.contracts,
            files: item.files,
          })
          return { ...fresh, id: item.id, createdAt: item.createdAt, fields: mergeFields(item, fresh) }
        }),
      }))
      setNotice(result.text ? "已读出部分文字，请在确认页采用或改写。未采用的不会写入。" : "没有读出文字，请在确认页手工填写。")
    } catch {
      update((current) => ({
        ...current,
        drafts: current.drafts.map((item) =>
          item.id === stored.id
            ? { ...item, extraction: "未能自动识别", extractionNote: "读取失败，请按原件手工填写。未知项保持待核。" }
            : item,
        ),
      }))
    } finally {
      setReading("")
    }
  }

  return (
    <div className="home">
      <section className="panel">
        <p className="kicker">{demo ? "示例模式" : "办公楼试用"}</p>
        <h1>{demo ? "虚构示例" : "登记合同或发票"}</h1>
        <p className="lead">
          {demo
            ? "这里的 12,500、5,000、7,500 全部是虚构的，用来看结算单怎么算。它和办公楼正式台账分开存放。"
            : shared
              ? "这是共用台账。先上传或手工填写，再在确认页核对。只有点「确认写入台账」才会入账；其他人刷新后能看到同一份。不确认，就不会变成已生效或已核验已付。"
              : "先上传或手工填写，再在确认页核对。只有点「确认写入台账」才会入账。不确认，就不会变成已生效或已核验已付。当前没有连上共用台账，写入只留在这台浏览器。"}
        </p>
        <div className="upload-list">
          {KINDS.map((item) => (
            <UploadCard key={item.kind} {...item} busy={reading !== ""} onFiles={(files) => void startFiles(item.kind, files)} onManual={() => startManual(item.kind)} />
          ))}
        </div>
        {state.drafts.length > 0 && (
          <button className="btn block" type="button" onClick={() => go({ name: "confirm", id: state.drafts[0].id })}>
            有 {state.drafts.length} 份还在待确认，尚未入账
          </button>
        )}
      </section>
      <section className="panel">
        {demo ? (
          <>
            <h2>示例数字</h2>
            <ul className="stats">
              <li>结算合计 <b className="num">12,500.00</b></li>
              <li>已核验已付 <b className="num">5,000.00</b></li>
              <li>尚欠款 <b className="num">7,500.00</b></li>
            </ul>
            <p>这些不是 BG-HT-001 至 012，也不是模板上的 53,050.63。</p>
          </>
        ) : (
          <>
            <h2>正式台账</h2>
            <ul className="stats">
              <li data-testid="home-pending">预置合同签署待核 <b>{pending}/{seeded.length || 12}</b></li>
              <li data-testid="home-paid">已核验已付 {verifiedAmounts.length === 0 ? <b>待核</b> : <Money value={sumMoney(verifiedAmounts)} />}</li>
              <li data-testid="home-subtotal">
                8 份暂定价小计 {history.sum == null ? <b>待核</b> : <b className="num">{formatMoney(history.sum)}</b>}
                <small>{history.diverged ? "已改过，不再是原来的 873,942.93" : "不含 012，也不是已付"}</small>
              </li>
            </ul>
            <p>铝方通、油漆、瓷砖铺贴人工总额待核。BG-HT-012 工种待核，模板 25,000 不计入已核验已付，也不并入上面的小计。</p>
            <ul className="mini-list">
              {state.contracts.slice(0, 12).map((contract) => (
                <li key={contract.id}>
                  <button type="button" onClick={() => go({ name: "settlement", id: contract.id })}>
                    <span>{contract.id}</span>
                    <span>{contract.tradeName === "待核" ? "工种待核" : contract.shortName}</span>
                    <StatusBadge status={contract.status} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="btn ghost block" type="button" onClick={() => go({ name: "settlement" })}>
          打开结算单
        </button>
      </section>
    </div>
  )
}

function mergeFields(current: ReturnType<typeof createDraft>, fresh: ReturnType<typeof createDraft>) {
  const fields = { ...current.fields }
  for (const [key, field] of Object.entries(fresh.fields)) {
    if (key === "sourceFileName" || key === "sourceFileDate") continue
    const existing = fields[key]
    if (!existing || existing.provenance === "待核" || (existing.uncertain && existing.provenance !== "手工填写")) fields[key] = field
  }
  return fields
}

function UploadCard({
  title,
  detail,
  busy,
  onFiles,
  onManual,
}: {
  kind: UploadKind
  title: string
  detail: string
  busy: boolean
  onFiles: (files: FileList | null) => void
  onManual: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  return (
    <article className="upload-card">
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          上传 PDF 或照片
        </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => cameraRef.current?.click()}>
          拍照
        </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={onManual}>
          先手工填写
        </button>
      </div>
      <input ref={fileRef} className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { onFiles(event.target.files); event.currentTarget.value = "" }} />
      <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => { onFiles(event.target.files); event.currentTarget.value = "" }} />
    </article>
  )
}
