import { adoptedAmount, adoptedValue, labelFor } from "./extract"
import { scrub, todayShanghai, uid } from "./money"
import type { AppState, Contract, Draft, Invoice, LineItem, Payment, Term, VerifyStatus } from "./types"
import { STAGES } from "./types"

export type ConfirmOptions = {
  markEffective: boolean
  markVerified: boolean
  targetContractId: string
  overrideExclusion: boolean
}

export type ConfirmResult = { ok: true; state: AppState; message: string } | { ok: false; error: string }

const STAGE_LIST = STAGES.filter((stage) => stage !== "其他/待核")

function concrete(value: string): boolean {
  const text = value.trim()
  return Boolean(text) && text !== "待核"
}

function nextContractId(contracts: Contract[]): string {
  let max = 0
  for (const contract of contracts) {
    const match = /^BG-HT-(\d+)$/.exec(contract.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `BG-HT-${String(max + 1).padStart(3, "0")}`
}

function nextSerial(ids: string[], prefix: string): string {
  let max = 0
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  for (const id of ids) {
    const match = pattern.exec(id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`
}

function leftover(draft: Draft): string {
  const bits: string[] = []
  for (const [key, field] of Object.entries(draft.fields)) {
    if (field.uncertain && field.suggestion) bits.push(`${labelFor(key)}：${field.suggestion}`)
  }
  if (!bits.length) return ""
  return `未采用的识别（未写入）：${bits.join("；")}`.slice(0, 500)
}

function appendNote(current: string, extra: string): string {
  if (!extra) return current
  const joined = [current, extra].filter(Boolean).join(" ")
  return joined.slice(0, 2000)
}

function starterLines(contractId: string, name: string, amount: number | null): LineItem[] {
  const label = concrete(name) ? name : "待核"
  return [
    line(contractId, 1, "分部标题", "一、", label, "", null, null, "", ""),
    line(
      contractId,
      2,
      "分项",
      "1、",
      label,
      "项",
      amount == null ? null : 1,
      amount,
      "",
      amount == null ? "总额待核，数量单价待填" : "登记时仅有总额，未拆分项，签署待核",
    ),
    line(contractId, 3, "小计", "", "小计", "", null, null, "", ""),
    line(contractId, 4, "扣减分部", "二、", "扣减项目", "", null, null, "", "未见扣减清单"),
    line(contractId, 5, "扣减小计", "", "小计", "", null, null, "无", "无"),
  ]
}

function line(
  contractId: string,
  seq: number,
  kind: LineItem["kind"],
  no: string,
  name: string,
  unit: string,
  qty: number | null,
  price: number | null,
  literalAmount: string,
  note: string,
): LineItem {
  return { id: uid("ln"), contractId, seq, kind, no, name, unit, qty, price, literalAmount, note }
}

function stageTerms(draft: Draft, contractId: string): Term[] {
  const terms: Term[] = []
  for (const stage of STAGE_LIST) {
    const ratio = adoptedValue(draft.fields[`stage_${stage}_ratio`])
    const amount = adoptedAmount(draft.fields[`stage_${stage}_amount`])
    const trigger = adoptedValue(draft.fields[`stage_${stage}_trigger`])
    if (!concrete(ratio) && amount == null && !concrete(trigger)) continue
    terms.push({
      id: uid("term"),
      contractId,
      stage,
      originalName: stage,
      ratio: concrete(ratio) ? ratio : "待核",
      amount,
      amountText: amount == null ? "待核" : "",
      basis: "试用登记时采用的识别或手工填写，仍不是已付款",
      trigger: concrete(trigger) ? trigger : "待核",
      note: "",
    })
  }
  if (terms.length === 0) {
    terms.push({
      id: uid("term"),
      contractId,
      stage: "其他/待核",
      originalName: "未见明确阶段",
      ratio: "待核",
      amount: null,
      amountText: "待核",
      basis: "上传登记时未识别到付款阶段，不编造比例，也不写成 0",
      trigger: "待核",
      note: "",
    })
  }
  return terms
}

function applyStageUpdates(state: AppState, draft: Draft, contractId: string): Term[] {
  const terms = state.terms.slice()
  for (const stage of STAGE_LIST) {
    const ratio = adoptedValue(draft.fields[`stage_${stage}_ratio`])
    const amount = adoptedAmount(draft.fields[`stage_${stage}_amount`])
    const trigger = adoptedValue(draft.fields[`stage_${stage}_trigger`])
    if (!concrete(ratio) && amount == null && !concrete(trigger)) continue
    const index = terms.findIndex((term) => term.contractId === contractId && term.stage === stage)
    if (index >= 0) {
      const current = terms[index]
      terms[index] = {
        ...current,
        ratio: concrete(ratio) ? ratio : current.ratio,
        amount: amount == null ? current.amount : amount,
        amountText: amount == null ? current.amountText : "",
        trigger: concrete(trigger) ? trigger : current.trigger,
      }
    } else {
      terms.push({
        id: uid("term"),
        contractId,
        stage,
        originalName: stage,
        ratio: concrete(ratio) ? ratio : "待核",
        amount,
        amountText: amount == null ? "待核" : "",
        basis: "试用登记时补入，不是已付款",
        trigger: concrete(trigger) ? trigger : "待核",
        note: "",
      })
    }
  }
  return terms
}

function withoutDraft(state: AppState, id: string): AppState {
  return { ...state, drafts: state.drafts.filter((draft) => draft.id !== id) }
}

function knownStage(value: string): string {
  return (STAGES as readonly string[]).includes(value) ? value : "其他/待核"
}

export function confirmDraft(state: AppState, draft: Draft, options: ConfirmOptions): ConfirmResult {
  if (draft.blockedReason && !options.overrideExclusion) {
    return { ok: false, error: `${draft.blockedReason}若确属办公楼，请勾选确认后再写入。` }
  }
  if (options.markVerified && draft.kind === "合同生效件") {
    return { ok: false, error: "合同生效件不会记成已核验已付。付款请另传付款凭证，并单独确认核验。" }
  }
  if (options.markVerified && draft.kind !== "合同生效件") {
    const amount = adoptedAmount(draft.fields.amount)
    if (amount == null || amount <= 0) return { ok: false, error: "金额还不是正数，不能标为已核验。请保持待核，不要写成 0。" }
  }
  const supplier = adoptedValue(draft.fields.supplier)
  if (supplier.includes("正德") || supplier.includes("店面")) {
    return { ok: false, error: "办公楼台账不登记正德铝单板或店面合同的对方。" }
  }

  const cleared = withoutDraft(state, draft.id)
  const fileNote = `试用登记 ${todayShanghai()} 文件：${draft.fileName || "手工填写"}。${leftover(draft)}`
  const exclusionNote = options.overrideExclusion ? "上传时曾提示可能不是办公楼，由登记人勾选后写入。" : ""

  if (draft.kind === "合同生效件") return confirmContract(cleared, draft, options, fileNote, exclusionNote)
  if (draft.kind === "发票") return confirmInvoice(cleared, draft, options, fileNote)
  return confirmPayment(cleared, draft, options, fileNote)
}

function confirmContract(state: AppState, draft: Draft, options: ConfirmOptions, fileNote: string, exclusionNote: string): ConfirmResult {
  const target = options.targetContractId
  if (target && target !== "new" && target !== "unmatched") {
    const existing = state.contracts.find((contract) => contract.id === target)
    if (!existing) return { ok: false, error: "选中的合同不在台账里。" }
    const next = patchExistingContract(existing, draft, options.markEffective, fileNote, exclusionNote)
    return {
      ok: true,
      message: options.markEffective ? `已更新 ${existing.id}，登记状态改为已生效。对外仍以老板确认为准。` : `已更新 ${existing.id}。未改成已生效，也没有记成已付款。`,
      state: { ...state, contracts: state.contracts.map((contract) => (contract.id === target ? next : contract)), terms: applyStageUpdates(state, draft, target) },
    }
  }
  const supplier = adoptedValue(draft.fields.supplier)
  const trade = adoptedValue(draft.fields.tradeName)
  const scope = adoptedValue(draft.fields.scope)
  if (!concrete(supplier) && !concrete(trade) && !concrete(scope)) {
    return { ok: false, error: "新建合同至少要填写或采用合同对方、工种或范围。未知项保持待核，不要建一份完全空白的合同。" }
  }
  const id = nextContractId(state.contracts)
  const amount = adoptedAmount(draft.fields.amount)
  const name = concrete(scope) ? scope : trade
  const contract: Contract = {
    id,
    scope: concrete(scope) ? scope : concrete(trade) ? trade : "待核",
    supplier: concrete(supplier) ? supplier : "待核",
    buyer: valueOrPending(adoptedValue(draft.fields.buyer)),
    originalNo: valueOrPending(adoptedValue(draft.fields.originalNo)),
    signDate: valueOrPending(adoptedValue(draft.fields.signDate)),
    status: options.markEffective ? "已生效" : "签署待核",
    amount,
    amountText: amount == null ? "待核" : "",
    amountNature: "试用登记，签署待核，不是已付也不是已审定结算",
    taxIncluded: valueOrPending(adoptedValue(draft.fields.taxIncluded)),
    taxRate: valueOrPending(adoptedValue(draft.fields.taxRate)),
    retentionRate: valueOrPending(adoptedValue(draft.fields.stage_质保金_ratio)),
    retentionAmount: adoptedAmount(draft.fields.stage_质保金_amount),
    retentionText: adoptedAmount(draft.fields.stage_质保金_amount) == null ? "待核" : "",
    retentionTerms: valueOrPending(adoptedValue(draft.fields.stage_质保金_trigger)),
    shortName: concrete(trade) ? trade : concrete(scope) ? scope.slice(0, 18) : "待核",
    tradeName: concrete(trade) ? trade : "待核",
    statScope: "试用新登记，不并入原 8 份暂定价小计",
    pendingNotes: appendNote("", `${fileNote} ${exclusionNote}`),
    finalPrice: null,
    finalPriceNote: "未审定，待核",
    templatePaid: null,
    templatePaidNote: "",
    settlementDate: "待填",
    projectNameAsWritten: valueOrPending(adoptedValue(draft.fields.projectName)) === "待核" ? "" : adoptedValue(draft.fields.projectName),
    sourceFileName: adoptedValue(draft.fields.sourceFileName),
    sourceFileDate: adoptedValue(draft.fields.sourceFileDate),
    provenance: { amount: amount == null ? "待核" : "手工填写", supplier: concrete(supplier) ? "手工填写" : "待核" },
  }
  return {
    ok: true,
    message: options.markEffective ? `已新建 ${id}，并标记已生效。这只是登记，对外仍以老板确认为准。` : `已新建 ${id}，状态为签署待核。没有记成已付款。`,
    state: {
      ...state,
      contracts: [...state.contracts, contract],
      terms: [...state.terms, ...stageTerms(draft, id)],
      lines: [...state.lines, ...starterLines(id, name, amount)],
    },
  }
}

function valueOrPending(value: string): string {
  return concrete(value) ? value : "待核"
}

function patchExistingContract(contract: Contract, draft: Draft, markEffective: boolean, fileNote: string, exclusionNote: string): Contract {
  const next = { ...contract, provenance: { ...contract.provenance } }
  const assign = (key: keyof Contract, fieldKey: string) => {
    const value = adoptedValue(draft.fields[fieldKey])
    if (!concrete(value)) return
    ;(next[key] as string) = value
    next.provenance[fieldKey] = "手工填写"
  }
  assign("buyer", "buyer")
  assign("supplier", "supplier")
  assign("tradeName", "tradeName")
  assign("scope", "scope")
  assign("originalNo", "originalNo")
  assign("signDate", "signDate")
  assign("taxIncluded", "taxIncluded")
  assign("taxRate", "taxRate")
  const project = adoptedValue(draft.fields.projectName)
  if (concrete(project)) next.projectNameAsWritten = project
  const amount = adoptedAmount(draft.fields.amount)
  if (amount != null) {
    next.amount = amount
    next.amountText = ""
    next.provenance.amount = "手工填写"
  }
  const retention = adoptedAmount(draft.fields.stage_质保金_amount)
  if (retention != null) {
    next.retentionAmount = retention
    next.retentionText = ""
  }
  const retentionRate = adoptedValue(draft.fields.stage_质保金_ratio)
  if (concrete(retentionRate)) next.retentionRate = retentionRate
  const retentionTerms = adoptedValue(draft.fields.stage_质保金_trigger)
  if (concrete(retentionTerms)) next.retentionTerms = retentionTerms
  if (concrete(adoptedValue(draft.fields.tradeName))) next.shortName = adoptedValue(draft.fields.tradeName)
  if (markEffective) next.status = "已生效"
  next.sourceFileName = adoptedValue(draft.fields.sourceFileName)
  next.sourceFileDate = adoptedValue(draft.fields.sourceFileDate)
  next.pendingNotes = appendNote(contract.pendingNotes, `${fileNote} ${exclusionNote}`)
  return next
}

function confirmInvoice(state: AppState, draft: Draft, options: ConfirmOptions, fileNote: string): ConfirmResult {
  if (options.targetContractId === "new") return { ok: false, error: "发票不能用来新建合同。请选择已有合同，或保持未匹配。" }
  const contractId = options.targetContractId && options.targetContractId !== "unmatched" ? options.targetContractId : ""
  if (contractId && !state.contracts.some((contract) => contract.id === contractId)) {
    return { ok: false, error: "选中的合同不在台账里。" }
  }
  const issuer = valueOrPending(adoptedValue(draft.fields.issuer))
  const receivingSupplier = valueOrPending(adoptedValue(draft.fields.receivingSupplier))
  const contract = state.contracts.find((item) => item.id === contractId)
  let mismatch = ""
  if (contract && concrete(issuer) && concrete(contract.supplier) && issuer !== contract.supplier) {
    mismatch = "开票方与合同对方不一致，待核"
  }
  if (concrete(issuer) && concrete(receivingSupplier) && issuer !== receivingSupplier) {
    mismatch = appendNote(mismatch, "开票方与收款供应商不一致，待核")
  }
  const invoice: Invoice = {
    id: nextSerial(state.invoices.map((item) => item.id), "FP"),
    contractId,
    date: valueOrPending(adoptedValue(draft.fields.date)),
    issuer,
    buyerTitle: valueOrPending(adoptedValue(draft.fields.buyerTitle)),
    amount: adoptedAmount(draft.fields.amount),
    amountExTax: adoptedAmount(draft.fields.amountExTax),
    taxAmount: adoptedAmount(draft.fields.taxAmount),
    taxRate: valueOrPending(adoptedValue(draft.fields.taxRate)),
    invoiceCode: valueOrPending(adoptedValue(draft.fields.invoiceCode)),
    invoiceNumber: valueOrPending(adoptedValue(draft.fields.invoiceNumber)),
    goodsName: valueOrPending(adoptedValue(draft.fields.goodsName)),
    invoiceType: valueOrPending(adoptedValue(draft.fields.invoiceType)),
    payer: valueOrPending(adoptedValue(draft.fields.payer)),
    receivingSupplier,
    mismatchNote: mismatch,
    voucher: draft.fileName || "手工填写",
    verifyStatus: options.markVerified ? "已核验" : "待核",
    note: fileNote,
    sourceFileName: adoptedValue(draft.fields.sourceFileName),
    sourceFileDate: adoptedValue(draft.fields.sourceFileDate),
  }
  return {
    ok: true,
    message: contractId
      ? `发票已写入开票登记，并关联 ${contractId}。没有记成付款。`
      : "发票已写入开票登记，合同未匹配。没有记成付款。",
    state: { ...state, invoices: [...state.invoices, invoice] },
  }
}

function confirmPayment(state: AppState, draft: Draft, options: ConfirmOptions, fileNote: string): ConfirmResult {
  if (options.targetContractId === "new") return { ok: false, error: "付款凭证不能用来新建合同。请选择已有合同，或保持未匹配。" }
  const contractId = options.targetContractId && options.targetContractId !== "unmatched" ? options.targetContractId : ""
  const contract = state.contracts.find((item) => item.id === contractId)
  if (contractId && !contract) return { ok: false, error: "选中的合同不在台账里。" }
  const typedStage = adoptedValue(draft.fields.stage)
  const stage = concrete(typedStage) ? knownStage(typedStage) : "其他/待核"
  const stageNote = concrete(typedStage) && stage === "其他/待核" && typedStage !== "其他/待核" ? `登记人填写的阶段「${scrub(typedStage)}」未列入标准阶段。` : ""
  const payment: Payment = {
    id: nextSerial(state.payments.map((item) => item.id), "FK"),
    contractId,
    scope: concrete(adoptedValue(draft.fields.scope)) ? adoptedValue(draft.fields.scope) : contract?.scope ?? "",
    stage,
    payDate: valueOrPending(adoptedValue(draft.fields.payDate)),
    payer: valueOrPending(adoptedValue(draft.fields.payer)),
    payee: valueOrPending(adoptedValue(draft.fields.payee)),
    amount: adoptedAmount(draft.fields.amount),
    method: valueOrPending(adoptedValue(draft.fields.method)),
    voucher: draft.fileName || "手工填写",
    registerDate: todayShanghai(),
    verifyStatus: (options.markVerified ? "已核验" : "待核") as VerifyStatus,
    note: appendNote(fileNote, stageNote),
    sourceFileName: adoptedValue(draft.fields.sourceFileName),
  }
  return {
    ok: true,
    message: options.markVerified
      ? stage === "质保金"
        ? "付款已写入台账并标为已核验。质保金不计入结算单已付款。"
        : "付款已写入台账并标为已核验，会计入该合同的已核验已付。"
      : "付款已写入台账，核验状态为待核，不计入已核验已付。",
    state: { ...state, payments: [...state.payments, payment] },
  }
}

export function discardDraft(state: AppState, id: string): AppState {
  return withoutDraft(state, id)
}
