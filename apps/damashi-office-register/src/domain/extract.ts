import { parseAmount, scrub, todayShanghai, uid } from "./money"
import type { Contract, Draft, DraftField, UploadKind } from "./types"
import { STAGES } from "./types"

export const FIELD_LABELS: Record<string, string> = {
  sourceFileName: "文件名",
  sourceFileDate: "文件日期",
  projectName: "原文工程名称",
  buyer: "需方全称",
  supplier: "供应商全称",
  tradeName: "工种/范围名称",
  scope: "合同/材料范围",
  originalNo: "原合同编号",
  signDate: "签署日期",
  amount: "合同总价或总额",
  taxIncluded: "是否含税",
  taxRate: "税率",
  invoiceCode: "发票代码",
  invoiceNumber: "发票号码",
  date: "开票日期",
  amountExTax: "不含税金额",
  taxAmount: "税额",
  goodsName: "货物或服务名称",
  issuer: "开票方",
  buyerTitle: "购方抬头",
  payer: "实际付款人",
  receivingSupplier: "收款供应商",
  invoiceType: "发票类型",
  payDate: "实际付款日期",
  payee: "收款供应商",
  stage: "付款阶段",
  method: "支付方式",
}

const STAGE_KEYS = STAGES.filter((stage) => stage !== "其他/待核")

export function fieldKeys(kind: UploadKind): string[] {
  if (kind === "合同生效件") {
    const base = [
      "sourceFileName",
      "sourceFileDate",
      "projectName",
      "buyer",
      "supplier",
      "tradeName",
      "scope",
      "originalNo",
      "signDate",
      "amount",
      "taxIncluded",
      "taxRate",
    ]
    const stages = STAGE_KEYS.flatMap((stage) => [`stage_${stage}_ratio`, `stage_${stage}_amount`, `stage_${stage}_trigger`])
    return [...base, ...stages]
  }
  if (kind === "发票") {
    return [
      "sourceFileName",
      "sourceFileDate",
      "invoiceCode",
      "invoiceNumber",
      "date",
      "amount",
      "amountExTax",
      "taxAmount",
      "taxRate",
      "issuer",
      "goodsName",
      "buyerTitle",
      "payer",
      "receivingSupplier",
      "invoiceType",
    ]
  }
  return ["sourceFileName", "sourceFileDate", "amount", "payDate", "payer", "payee", "stage", "method", "scope"]
}

export function labelFor(key: string, kind?: UploadKind): string {
  if (key === "amount" && kind === "发票") return "价税合计"
  if (key === "amount" && kind === "付款凭证") return "本次支付额"
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const match = /^stage_(.+?)_(ratio|amount|trigger)$/.exec(key)
  if (!match) return key
  const what = match[2] === "ratio" ? "比例" : match[2] === "amount" ? "约定额" : "触发条件"
  return `${match[1]}${what}`
}

function blank(): DraftField {
  return { value: "待核", suggestion: "", provenance: "待核", uncertain: true }
}

function known(value: string): DraftField {
  return { value: scrub(value) || "待核", suggestion: "", provenance: "自动提取", uncertain: false }
}

function guess(suggestion: string): DraftField {
  const clean = scrub(suggestion).trim()
  if (!clean) return blank()
  return { value: "待核", suggestion: clean, provenance: "自动提取", uncertain: true }
}

export function exclusionReason(text: string): string {
  const value = scrub(text)
  if (value.includes("正德") && value.includes("铝单板")) {
    return "这份文件像是正德铝单板，不属于办公楼。未写入台账。"
  }
  if (value.includes("黛玛仕之家") || value.includes("黛玛诗之家")) {
    return "这份文件像是之家店面，不属于办公楼。未写入台账。"
  }
  if (value.includes("店面") && !value.includes("办公楼")) {
    return "这份文件像是店面合同，不属于办公楼。未写入台账。"
  }
  return ""
}

function party(text: string, label: RegExp): string {
  const match = label.exec(text)
  if (!match) return ""
  let name = match[1].replace(/\s+/g, "")
  name = name.split(/地址|电话|账号|开户|统一社会|纳税人/)[0] ?? ""
  name = name.replace(/[，,。；;].*$/, "")
  if (name.length < 4 || name.length > 40) return ""
  if (name.includes("待核") || name.includes("正德") || name.includes("店面")) return ""
  return scrub(name)
}

function knownSuppliers(text: string, contracts: Contract[]): Contract[] {
  return contracts.filter((contract) => {
    const name = contract.supplier
    return name.length >= 4 && !name.includes("待核") && text.includes(name)
  })
}

function uniqueAmounts(text: string, pattern: RegExp): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(pattern)) {
    const amount = parseAmount(match[1] ?? "")
    if (amount != null) found.add(amount.toFixed(2))
  }
  return [...found]
}

function projectSuggestion(text: string): { suggestion: string; note: string } {
  const labeled = text.match(/工程名称[:：]\s*([^\n]{2,30})/)
  if (labeled) return { suggestion: scrub(labeled[1].trim()), note: "" }
  const shi = text.indexOf("黛玛诗办公楼")
  const shi2 = text.indexOf("黛玛仕办公楼")
  if (shi < 0 && shi2 < 0) return { suggestion: "", note: "" }
  if (shi >= 0 && shi2 >= 0) {
    const first = shi < shi2 ? "黛玛诗办公楼" : "黛玛仕办公楼"
    return { suggestion: first, note: "原文里「黛玛诗办公楼」和「黛玛仕办公楼」都出现了，按先出现的写法留下，没有改字。" }
  }
  return { suggestion: shi >= 0 ? "黛玛诗办公楼" : "黛玛仕办公楼", note: "" }
}

const STAGE_PATTERNS: Record<string, RegExp> = {
  首付款: /首付款|预付款|第一笔|第一期/,
  二期款: /二期款|第二笔|第二期/,
  三期款: /三期款|第三笔|第三期/,
  尾款: /尾款/,
  质保金: /质保金|质量保证金/,
}

function applyContract(text: string, contracts: Contract[], fields: Record<string, DraftField>, notes: string[]) {
  const project = projectSuggestion(text)
  if (project.suggestion) fields.projectName = guess(project.suggestion)
  if (project.note) notes.push(project.note)

  const buyer = party(text, /(?:甲方|需方|发包人)(?:（[^）]{0,12}）)?[:：]\s*([^\n]{4,40})/)
  if (buyer) fields.buyer = guess(buyer)
  const capturedSupplier = party(text, /(?:乙方|供方|承包人)(?:（[^）]{0,12}）)?[:：]\s*([^\n]{4,40})/)
  const listed = knownSuppliers(text, contracts)
  if (capturedSupplier) fields.supplier = guess(capturedSupplier)
  else if (listed.length === 1) fields.supplier = guess(listed[0].supplier)

  const amounts = uniqueAmounts(text, /(?:合同暂定价|暂定总价|合同总价|签约价)[:：\s]{0,6}(?:人民币|￥|¥)?\s*([\d,]+(?:\.\d+)?)\s*元?/g)
  if (amounts.length === 1) fields.amount = guess(amounts[0])
  else if (amounts.length > 1) notes.push(`识别到多个合同金额：${amounts.join("、")}，没有代选。`)

  if (/不含税总价|总价不含税/.test(text)) fields.taxIncluded = guess("不含税")
  else if (/含税总价|总价含税/.test(text)) fields.taxIncluded = guess("含税")
  const rates = uniqueAmounts(text, /税率[:：]?\s*(\d+(?:\.\d+)?)\s*%/g)
  if (rates.length === 1) fields.taxRate = guess(`${Number(rates[0])}%`)

  const original = text.match(/合同编号[:：]\s*([A-Za-z0-9\-]{4,})/)
  if (original && !/^BG-HT-/i.test(original[1])) fields.originalNo = guess(original[1])

  for (const stage of STAGE_KEYS) {
    const pattern = STAGE_PATTERNS[stage]
    const match = pattern.exec(text)
    if (!match || match.index == null) continue
    const window = text.slice(match.index, match.index + 48)
    const overlapped = STAGE_KEYS.some((other) => other !== stage && STAGE_PATTERNS[other].test(window))
    if (overlapped) {
      notes.push(`原文提到「${stage}」，和相邻阶段写在一起，比例与金额未代填。`)
      continue
    }
    const ratio = window.match(/(\d+(?:\.\d+)?)\s*%/)
    const amount = window.match(/([\d,]+\.\d{2})\s*元/)
    if (ratio) fields[`stage_${stage}_ratio`] = guess(`${ratio[1]}%`)
    if (amount) fields[`stage_${stage}_amount`] = guess(amount[1])
    if (!ratio && !amount) notes.push(`原文提到「${stage}」，金额与比例请对照原件，此处不代填。`)
  }
}

function applyInvoice(text: string, fields: Record<string, DraftField>, notes: string[]) {
  const code = text.match(/发票代码[:：\s]*([0-9]{10,12})/)
  const number = text.match(/发票号码[:：\s]*([0-9]{8,20})/)
  const date = text.match(/开票日期[:：\s]*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}-\d{2}-\d{2})/)
  if (code) fields.invoiceCode = guess(code[1])
  if (number) fields.invoiceNumber = guess(number[1])
  if (date) fields.date = guess(date[1].replace(/\s+/g, ""))
  const totals = uniqueAmounts(text, /价税合计[^\d]{0,16}([\d,]+\.\d{2})/g)
  if (totals.length === 1) fields.amount = guess(totals[0])
  const ex = uniqueAmounts(text, /不含税(?:金额)?[:：\s]*([\d,]+\.\d{2})/g)
  if (ex.length === 1) fields.amountExTax = guess(ex[0])
  const tax = uniqueAmounts(text, /税额[:：\s]*([\d,]+\.\d{2})/g)
  if (tax.length === 1) fields.taxAmount = guess(tax[0])
  const rate = text.match(/税率[:：]?\s*(\d+(?:\.\d+)?)\s*%/)
  if (rate) fields.taxRate = guess(`${rate[1]}%`)
  const issuer = party(text, /(?:销售方|开票方)(?:名称)?[:：]\s*([^\n]{4,40})/)
  const buyer = party(text, /(?:购买方|购方)(?:名称)?[:：]\s*([^\n]{4,40})/)
  const goods = text.match(/(?:货物或应税劳务(?:、服务)?名称|项目名称)[:：]\s*([^\n]{2,40})/)
  if (issuer) fields.issuer = guess(issuer)
  if (buyer) fields.buyerTitle = guess(buyer)
  if (goods) fields.goodsName = guess(goods[1].trim())
  notes.push("实际付款人、收款供应商不会按开票方自动填写。")
}

function applyPayment(text: string, fields: Record<string, DraftField>) {
  const amounts = uniqueAmounts(text, /(?:付款金额|支付金额|金额)[:：\s]*(?:人民币|￥|¥)?\s*([\d,]+(?:\.\d+)?)/g)
  if (amounts.length === 1) fields.amount = guess(amounts[0])
  const date = text.match(/(?:付款日期|日期)[:：\s]*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}-\d{2}-\d{2})/)
  if (date) fields.payDate = guess(date[1].replace(/\s+/g, ""))
  const payer = party(text, /(?:实际付款人|付款人)[:：]\s*([^\n]{4,40})/)
  const payee = party(text, /(?:收款供应商|收款人|收款单位)[:：]\s*([^\n]{4,40})/)
  if (payer) fields.payer = guess(payer)
  if (payee) fields.payee = guess(payee)
  for (const stage of STAGE_KEYS) {
    if (STAGE_PATTERNS[stage].test(text)) {
      fields.stage = guess(stage)
      break
    }
  }
}

function decideMatch(text: string, contracts: Contract[], kind: UploadKind, fields: Record<string, DraftField>): { id: string; note: string } {
  const idMatch = text.match(/BG-HT-\d{3}/)
  const idContract = idMatch ? contracts.find((contract) => contract.id === idMatch[0]) : undefined
  const bySupplier = knownSuppliers(text, contracts)
  const named =
    kind === "发票"
      ? bySupplier
      : kind === "付款凭证"
        ? bySupplier.filter((contract) => {
            const payee = fields.payee?.suggestion || ""
            return payee && (payee === contract.supplier || payee.includes(contract.supplier))
          })
        : bySupplier

  if (idContract && named.length === 1 && named[0].id !== idContract.id) {
    return { id: "", note: "编号和名称对上了不同合同，未自动匹配。" }
  }
  if (idContract) return { id: idContract.id, note: `文件里写了 ${idContract.id}，已预选，请核对。` }
  if (named.length === 1) {
    const note =
      kind === "发票"
        ? `开票方名称与 ${named[0].id} 的合同对方相同，已预选。不确定请改成未匹配。收款供应商仍是待核。`
        : `名称与 ${named[0].id} 的合同对方相同，已预选，请核对。`
    return { id: named[0].id, note }
  }
  if (named.length > 1) return { id: "", note: "对上了多家合同对方，未自动匹配。" }
  return { id: "", note: kind === "合同生效件" ? "没有对上已有合同。可以新建，也可以改选一份已有合同。" : "未匹配到合同。不确定就保持未匹配。" }
}

export function createDraft(input: {
  kind: UploadKind
  fileName: string
  fileDate: string
  fileSize?: number
  text?: string
  extraction: Draft["extraction"]
  extractionNote?: string
  contracts: Contract[]
  files?: { id: string; name: string }[]
}): Draft {
  const text = scrub(input.text ?? "")
  const fields: Record<string, DraftField> = {}
  for (const key of fieldKeys(input.kind)) fields[key] = blank()
  fields.sourceFileName = known(input.fileName || "未命名")
  fields.sourceFileDate = known(input.fileDate || todayShanghai())
  const notes: string[] = []
  if (input.extractionNote) notes.push(input.extractionNote)
  if (text.trim()) {
    if (input.kind === "合同生效件") applyContract(text, input.contracts, fields, notes)
    if (input.kind === "发票") applyInvoice(text, fields, notes)
    if (input.kind === "付款凭证") applyPayment(text, fields)
  } else if (input.extraction !== "正在读取") {
    notes.push("没有读出可用文字。未知项请保持待核，不要填 0。")
  }
  const match = text.trim() ? decideMatch(text, input.contracts, input.kind, fields) : { id: "", note: "" }
  return {
    id: uid("draft"),
    kind: input.kind,
    createdAt: new Date().toISOString(),
    fileName: input.fileName,
    fileDate: input.fileDate,
    fileSize: input.fileSize ?? 0,
    extraction: input.extraction,
    extractionNote: notes.filter(Boolean).join(" "),
    excerpt: text.replace(/\s+/g, " ").trim().slice(0, 3000),
    blockedReason: exclusionReason(text),
    matchContractId: match.id,
    matchNote: match.note,
    files: input.files ?? [],
    fields,
  }
}

function untouched(field: DraftField | undefined): boolean {
  if (!field) return true
  if (field.provenance === "手工填写") return false
  if (!field.uncertain && field.value !== "待核") return false
  return true
}

export function mergeExtraction(current: Draft, fresh: Draft): Draft {
  const fields = { ...current.fields }
  for (const [key, field] of Object.entries(fresh.fields)) {
    if (key === "sourceFileName" || key === "sourceFileDate") continue
    if (untouched(fields[key])) fields[key] = field
  }
  return {
    ...current,
    fields,
    extraction: fresh.extraction,
    extractionNote: fresh.extractionNote,
    excerpt: fresh.excerpt || current.excerpt,
    blockedReason: fresh.blockedReason,
    matchContractId: current.matchContractId || fresh.matchContractId,
    matchNote: current.matchNote || fresh.matchNote,
  }
}

export function editField(draft: Draft, key: string, value: string): Draft {
  const cleaned = scrub(value).trim()
  const previous = draft.fields[key] ?? blank()
  const next: DraftField =
    !cleaned || cleaned === "待核"
      ? { value: "待核", suggestion: previous.suggestion, provenance: "待核", uncertain: true }
      : { value: cleaned, suggestion: "", provenance: "手工填写", uncertain: false }
  return { ...draft, fields: { ...draft.fields, [key]: next } }
}

export function adoptField(draft: Draft, key: string): Draft {
  const field = draft.fields[key]
  if (!field?.suggestion) return draft
  return {
    ...draft,
    fields: {
      ...draft.fields,
      [key]: { value: field.suggestion, suggestion: "", provenance: "手工填写", uncertain: false },
    },
  }
}

export function adoptAll(draft: Draft): Draft {
  let next = draft
  for (const [key, field] of Object.entries(draft.fields)) {
    if (field.uncertain && field.suggestion) next = adoptField(next, key)
  }
  return next
}

export function adoptedValue(field: DraftField | undefined): string {
  if (!field || field.uncertain) return "待核"
  const value = field.value.trim()
  return value || "待核"
}

export function adoptedAmount(field: DraftField | undefined): number | null {
  return parseAmount(adoptedValue(field))
}
