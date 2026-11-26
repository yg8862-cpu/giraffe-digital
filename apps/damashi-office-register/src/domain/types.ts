export type Provenance = "自动提取" | "手工填写" | "待核" | "台账原载" | "模板载明"

export type UploadKind = "合同生效件" | "发票" | "付款凭证"

export type VerifyStatus = "待核" | "已核验"

export type LineKind =
  | "分部标题"
  | "分项"
  | "小计"
  | "面积小计"
  | "扣减分部"
  | "扣减分项"
  | "扣减小计"

export type Contract = {
  id: string
  scope: string
  supplier: string
  buyer: string
  originalNo: string
  signDate: string
  status: string
  amount: number | null
  amountText: string
  amountNature: string
  taxIncluded: string
  taxRate: string
  retentionRate: string
  retentionAmount: number | null
  retentionText: string
  retentionTerms: string
  shortName: string
  tradeName: string
  statScope: string
  pendingNotes: string
  finalPrice: number | null
  finalPriceNote: string
  templatePaid: number | null
  templatePaidNote: string
  settlementDate: string
  projectNameAsWritten: string
  sourceFileName: string
  sourceFileDate: string
  provenance: Record<string, Provenance>
}

export type Term = {
  id: string
  contractId: string
  stage: string
  originalName: string
  ratio: string
  amount: number | null
  amountText: string
  basis: string
  trigger: string
  note: string
}

export type Payment = {
  id: string
  contractId: string
  scope: string
  stage: string
  payDate: string
  payer: string
  payee: string
  amount: number | null
  method: string
  voucher: string
  registerDate: string
  verifyStatus: VerifyStatus
  note: string
  sourceFileName: string
}

export type Invoice = {
  id: string
  contractId: string
  date: string
  issuer: string
  buyerTitle: string
  amount: number | null
  amountExTax: number | null
  taxAmount: number | null
  taxRate: string
  invoiceCode: string
  invoiceNumber: string
  goodsName: string
  invoiceType: string
  payer: string
  receivingSupplier: string
  mismatchNote: string
  voucher: string
  verifyStatus: VerifyStatus
  note: string
  sourceFileName: string
  sourceFileDate: string
}

export type LineItem = {
  id: string
  contractId: string
  seq: number
  kind: LineKind
  no: string
  name: string
  unit: string
  qty: number | null
  price: number | null
  literalAmount: string
  note: string
}

export type DraftField = {
  value: string
  suggestion: string
  provenance: Provenance
  uncertain: boolean
}

export type ExtractionMode = "PDF文本" | "图片识别" | "PDF转图识别" | "未能自动识别" | "手工填写" | "正在读取"

export type Draft = {
  id: string
  kind: UploadKind
  createdAt: string
  fileName: string
  fileDate: string
  fileSize: number
  extraction: ExtractionMode
  extractionNote: string
  excerpt: string
  blockedReason: string
  matchContractId: string
  matchNote: string
  files: { id: string; name: string }[]
  fields: Record<string, DraftField>
}

export type AppState = {
  version: 1
  contracts: Contract[]
  terms: Term[]
  payments: Payment[]
  invoices: Invoice[]
  lines: LineItem[]
  drafts: Draft[]
}

export const STAGES = ["首付款", "二期款", "三期款", "尾款", "质保金", "其他/待核"] as const

export const PAY_METHODS = ["转账", "现金", "支票", "其他", "待核"] as const

export const TAX_FLAGS = ["含税", "不含税", "待核"] as const

export const INVOICE_TYPES = ["增值税专用发票", "增值税普通发票", "待核", "其他"] as const

export const HISTORICAL_PRICED_IDS = [
  "BG-HT-001",
  "BG-HT-002",
  "BG-HT-003",
  "BG-HT-004",
  "BG-HT-005",
  "BG-HT-006",
  "BG-HT-008",
  "BG-HT-009",
] as const

export const HISTORICAL_SUBTOTAL = 873942.93

export const TEMPLATE_SUBTOTAL = 53050.63

export const TEMPLATE_FINAL = 53000

export const TEMPLATE_PAID = 25000

export const TEMPLATE_DUE = 28000
