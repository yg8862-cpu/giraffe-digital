import raw from "./seed.json"
import type { AppState, Contract, Invoice, LineItem, LineKind, Payment, Term, VerifyStatus } from "./types"

const LINE_KINDS = new Set<LineKind>(["分部标题", "分项", "小计", "面积小计", "扣减分部", "扣减分项", "扣减小计"])

function text(value: unknown, fallback = ""): string {
  if (value == null || value === "") return fallback
  return String(value)
}

function moneyPair(value: unknown): { amount: number | null; text: string } {
  if (typeof value === "number" && Number.isFinite(value)) return { amount: Math.round(value * 100) / 100, text: "" }
  if (value == null || value === "") return { amount: null, text: "待核" }
  return { amount: null, text: String(value) }
}

function qtyPair(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return null
}

function asKind(value: unknown): LineKind {
  return typeof value === "string" && LINE_KINDS.has(value as LineKind) ? (value as LineKind) : "分项"
}

function asVerify(value: unknown): VerifyStatus {
  return value === "已核验" ? "已核验" : "待核"
}

function mapContract(row: (typeof raw.contracts)[number]): Contract {
  const amount = moneyPair(row.amountRaw)
  const retention = moneyPair(row.retentionRaw)
  const finalPrice = moneyPair(row.finalRaw)
  const templatePaid = moneyPair(row.templatePaidRaw)
  const template = row.id === "BG-HT-012"
  return {
    id: row.id,
    scope: text(row.scope),
    supplier: text(row.supplier, "待核"),
    buyer: text(row.buyer, "待核"),
    originalNo: text(row.originalNo, "待核"),
    signDate: text(row.signDate, "待核"),
    status: text(row.status, "签署待核"),
    amount: amount.amount,
    amountText: amount.text,
    amountNature: text(row.amountNature, "待核"),
    taxIncluded: text(row.taxIncluded, "待核"),
    taxRate: text(row.taxRate, "待核"),
    retentionRate: text(row.retentionRate, "待核"),
    retentionAmount: retention.amount,
    retentionText: retention.text,
    retentionTerms: text(row.retentionTerms, "待核"),
    shortName: text(row.shortName),
    tradeName: template ? "待核" : text(row.shortName, "待核"),
    statScope: text(row.statScope),
    pendingNotes: text(row.pendingNotes),
    finalPrice: finalPrice.amount,
    finalPriceNote: text(row.finalPriceNote, "未审定，待核"),
    templatePaid: template ? templatePaid.amount : templatePaid.amount,
    templatePaidNote: text(row.templatePaidNote),
    settlementDate: text(row.settlementDate, "待填"),
    projectNameAsWritten: "",
    sourceFileName: "",
    sourceFileDate: "",
    provenance: {
      amount: amount.amount == null ? "待核" : "台账原载",
      tradeName: template ? "待核" : "台账原载",
      finalPrice: template ? "模板载明" : "待核",
      templatePaid: template ? "模板载明" : "待核",
      supplier: "台账原载",
      buyer: "待核",
    },
  }
}

function mapTerm(row: (typeof raw.terms)[number], index: number): Term {
  const amount = moneyPair(row.amountRaw)
  return {
    id: `seed-term-${row._row ?? index}`,
    contractId: text(row.contractId),
    stage: text(row.stage, "其他/待核"),
    originalName: text(row.originalName),
    ratio: text(row.ratio, "待核"),
    amount: amount.amount,
    amountText: amount.text,
    basis: text(row.basis),
    trigger: text(row.trigger, "待核"),
    note: text(row.note),
  }
}

function mapPayment(row: (typeof raw.payments)[number]): Payment {
  const amount = moneyPair(row.amountRaw)
  return {
    id: text(row.id),
    contractId: text(row.contractId),
    scope: text(row.scope),
    stage: text(row.stage, "其他/待核"),
    payDate: text(row.payDate, "待核"),
    payer: text(row.payer, "待核"),
    payee: text(row.payee, "待核"),
    amount: amount.amount,
    method: text(row.method, "待核"),
    voucher: text(row.voucher),
    registerDate: text(row.registerDate),
    verifyStatus: asVerify(row.verifyStatus),
    note: text(row.note),
    sourceFileName: "",
  }
}

function mapLine(row: (typeof raw.lines)[number]): LineItem {
  return {
    id: `seed-line-${row.contractId}-${row.seq}`,
    contractId: text(row.contractId),
    seq: typeof row.seq === "number" ? row.seq : 0,
    kind: asKind(row.kind),
    no: text(row.no),
    name: text(row.name),
    unit: text(row.unit),
    qty: qtyPair(row.qtyRaw),
    price: qtyPair(row.priceRaw),
    literalAmount: text(row.literalAmount),
    note: text(row.note),
  }
}

export function createLiveState(): AppState {
  return {
    version: 1,
    contracts: raw.contracts.map(mapContract),
    terms: raw.terms.map(mapTerm),
    payments: raw.payments.map(mapPayment),
    invoices: [] as Invoice[],
    lines: raw.lines.map(mapLine),
    drafts: [],
  }
}

export const SEED_SOURCE = raw.source
