import type { AppState, Contract, Invoice, LineItem, Payment, Term } from "./types"

const id = "SL-HT-000"

const contract: Contract = {
  id,
  scope: "示例板材（虚构范围）",
  supplier: "示例建材有限公司（虚构）",
  buyer: "示例需方（虚构）",
  originalNo: "SL-HT-000",
  signDate: "示例日期",
  status: "示例·虚构，不是办公楼已签约",
  amount: 12500,
  amountText: "",
  amountNature: "虚构演示，不是办公楼合同价",
  taxIncluded: "待核",
  taxRate: "待核",
  retentionRate: "待核",
  retentionAmount: null,
  retentionText: "待核",
  retentionTerms: "示例不设质保金",
  shortName: "示例板材（虚构）",
  tradeName: "示例板材（虚构）",
  statScope: "只存在于示例模式",
  pendingNotes: "虚构数据。不是 BG-HT-001 至 012，也不是模板上的 53,050.63 / 53,000 / 25,000 / 28,000。",
  finalPrice: 12500,
  finalPriceNote: "【示例】假定已审定。虚构数据。",
  templatePaid: null,
  templatePaidNote: "",
  settlementDate: "示例日期",
  projectNameAsWritten: "示例项目（虚构）",
  sourceFileName: "",
  sourceFileDate: "",
  provenance: { amount: "手工填写", finalPrice: "手工填写" },
}

const lines: LineItem[] = [
  item(1, "分部标题", "一、", "示例板材（虚构范围）", "", null, null, "【示例】虚构"),
  item(2, "分项", "1、", "示例板材A（虚构规格）", "㎡", 50, 100, "【示例】虚构行"),
  item(3, "分项", "2、", "示例板材B（虚构规格）", "项", 1, 8000, "【示例】虚构行"),
  item(4, "小计", "", "小计", "", null, null, "示例小计应为 13,000"),
  item(5, "扣减分部", "二、", "扣减项目（示例已列入）", "", null, null, ""),
  item(6, "扣减分项", "1、", "示例扣减（虚构）", "项", 1, -500, "【示例】虚构扣减"),
  item(7, "扣减小计", "", "小计", "", null, null, "示例扣减小计 -500"),
]

function item(
  seq: number,
  kind: LineItem["kind"],
  no: string,
  name: string,
  unit: string,
  qty: number | null,
  price: number | null,
  note: string,
): LineItem {
  return { id: `demo-line-${seq}`, contractId: id, seq, kind, no, name, unit, qty, price, literalAmount: "", note }
}

const terms: Term[] = [
  {
    id: "demo-term-1",
    contractId: id,
    stage: "首付款",
    originalName: "示例预付款",
    ratio: "待核",
    amount: 5000,
    amountText: "",
    basis: "虚构，用来演示已核验已付",
    trigger: "示例",
    note: "虚构",
  },
  {
    id: "demo-term-2",
    contractId: id,
    stage: "质保金",
    originalName: "示例不设",
    ratio: "待核",
    amount: null,
    amountText: "待核",
    basis: "示例把质保金留空，不写成 0",
    trigger: "待核",
    note: "虚构",
  },
]

const payment: Payment = {
  id: "SL-PAY-1",
  contractId: id,
  scope: "示例板材（虚构范围）",
  stage: "首付款",
  payDate: "示例日期",
  payer: "示例付款人（虚构）",
  payee: "示例建材有限公司（虚构）",
  amount: 5000,
  method: "转账",
  voucher: "示例凭证（虚构）",
  registerDate: "示例日期",
  verifyStatus: "已核验",
  note: "【示例】虚构已核验已付。不是办公楼的付款。",
  sourceFileName: "",
}

const invoice: Invoice = {
  id: "SL-FP-1",
  contractId: id,
  date: "示例日期",
  issuer: "示例开票方（虚构，与收款方不同）",
  buyerTitle: "示例需方（虚构）",
  amount: 5000,
  amountExTax: null,
  taxAmount: null,
  taxRate: "待核",
  invoiceCode: "待核",
  invoiceNumber: "待核",
  goodsName: "示例板材（虚构）",
  invoiceType: "待核",
  payer: "示例付款人（虚构）",
  receivingSupplier: "示例建材有限公司（虚构）",
  mismatchNote: "示例：开票方与收款供应商不是同一家",
  voucher: "示例发票（虚构）",
  verifyStatus: "待核",
  note: "虚构。核验发票也不等于已付款。",
  sourceFileName: "",
  sourceFileDate: "",
}

export function createDemoState(): AppState {
  return {
    version: 1,
    contracts: [contract],
    terms,
    payments: [payment],
    invoices: [invoice],
    lines,
    drafts: [],
  }
}
