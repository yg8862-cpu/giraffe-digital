import { formatMoney, formatQty, mulMoney, rmbUppercase, sumMoney } from "./money"
import type { Contract, LineItem, Payment } from "./types"
import { HISTORICAL_PRICED_IDS, HISTORICAL_SUBTOTAL, TEMPLATE_SUBTOTAL } from "./types"

export type CellValue = number | "待填" | "无" | null

export type ViewLine = {
  id: string
  kind: LineItem["kind"]
  no: string
  name: string
  unit: string
  qty: number | null
  price: number | null
  note: string
  qtyDisplay: string
  priceDisplay: string
  amount: CellValue
}

export type PaidView = {
  amount: number | null
  kind: "verified" | "template" | "pending"
  note: string
}

export type SettlementView = {
  lines: ViewLine[]
  subtotal: CellValue
  subtotalNote: string
  finalPrice: number | null
  finalNote: string
  finalUpper: string
  paid: PaidView
  due: number | null
  dueNote: string
  dueUpper: string
}

function sumOrPending(lines: LineItem[]): number | "待填" {
  if (lines.length === 0) return "待填"
  const amounts: number[] = []
  for (const line of lines) {
    if (line.qty == null || line.price == null) return "待填"
    amounts.push(mulMoney(line.qty, line.price))
  }
  return sumMoney(amounts)
}

function sumQty(lines: LineItem[]): number | "待填" {
  if (lines.some((line) => line.qty == null)) return "待填"
  const cents = lines.reduce((sum, line) => sum + Math.round((line.qty ?? 0) * 100), 0)
  return cents / 100
}

export function contractLines(lines: LineItem[], contractId: string): LineItem[] {
  return lines.filter((line) => line.contractId === contractId).slice().sort((a, b) => a.seq - b.seq)
}

export function presentLines(lines: LineItem[]): ViewLine[] {
  const items = lines.filter((line) => line.kind === "分项")
  const deductions = lines.filter((line) => line.kind === "扣减分项")
  const areaItems = items.filter((line) => line.unit === "㎡")
  const itemSum = sumOrPending(items)
  const deductionSum: number | "待填" | "无" = deductions.length === 0 ? "无" : sumOrPending(deductions)
  const areaQty = areaItems.length ? sumQty(areaItems) : "待填"
  const areaAmount = areaItems.length ? sumOrPending(areaItems) : "待填"

  return lines.map((line) => {
    let amount: CellValue = null
    if (line.kind === "分项" || line.kind === "扣减分项") {
      amount = line.qty == null || line.price == null ? "待填" : mulMoney(line.qty, line.price)
    } else if (line.kind === "面积小计") amount = areaAmount
    else if (line.kind === "小计") amount = itemSum
    else if (line.kind === "扣减小计") amount = deductionSum

    const qtyDisplay =
      line.kind === "面积小计"
        ? areaQty === "待填"
          ? "待填"
          : formatQty(areaQty)
        : line.qty == null
          ? line.kind === "分项" || line.kind === "扣减分项"
            ? "待填"
            : ""
          : formatQty(line.qty)
    const priceDisplay =
      line.price == null
        ? line.kind === "分项" || line.kind === "扣减分项"
          ? "待填"
          : ""
        : formatMoney(line.price)

    return {
      id: line.id,
      kind: line.kind,
      no: line.no,
      name: line.name,
      unit: line.unit,
      qty: line.kind === "面积小计" && typeof areaQty === "number" ? areaQty : line.qty,
      price: line.price,
      note: line.note,
      qtyDisplay,
      priceDisplay,
      amount,
    }
  })
}

export function settlementSubtotal(lines: LineItem[]): number | "待填" {
  const priced = lines.filter((line) => line.kind === "分项" || line.kind === "扣减分项")
  return sumOrPending(priced)
}

export function verifiedPaid(payments: Payment[], contractId: string): number | null {
  const amounts = payments
    .filter(
      (payment) =>
        payment.contractId === contractId &&
        payment.verifyStatus === "已核验" &&
        payment.stage !== "质保金" &&
        payment.amount != null &&
        payment.amount > 0,
    )
    .map((payment) => payment.amount as number)
  if (amounts.length === 0) return null
  return sumMoney(amounts)
}

export function paidView(contract: Contract, payments: Payment[]): PaidView {
  const verified = verifiedPaid(payments, contract.id)
  if (verified != null) {
    const template = contract.templatePaid
    const differs = template != null && Math.abs(template - verified) > 0.001
    return {
      amount: verified,
      kind: "verified",
      note: differs ? `已核验已付（另有模板载明 ${formatMoney(template)}，以已核验为准）` : "已核验已付",
    }
  }
  if (contract.templatePaid != null) {
    return {
      amount: contract.templatePaid,
      kind: "template",
      note: "模板载明，凭证待核（未计入已核验已付合计；已核验已付：待核）",
    }
  }
  return { amount: null, kind: "pending", note: "待核（无已核验付款）" }
}

export function outstanding(finalPrice: number | null, paid: PaidView, finalNote: string): { amount: number | null; note: string } {
  if (finalPrice == null || paid.amount == null) {
    return { amount: null, note: "最终价与已付款均核齐为数字后才计算" }
  }
  const amount = roundDiff(finalPrice, paid.amount)
  if (paid.kind === "template" && finalNote.includes("模板")) {
    return { amount, note: "按模板载明最终价与已付款计算，审定及凭证待核" }
  }
  if (finalNote.includes("待核") || paid.kind !== "verified") {
    return { amount, note: "最终价或付款仍有待核，此差额不是已审定尚欠款" }
  }
  return { amount, note: "＝最终结算价－已付款" }
}

function roundDiff(finalPrice: number, paid: number): number {
  return (toCentsSafe(finalPrice) - toCentsSafe(paid)) / 100
}

function toCentsSafe(n: number): number {
  return Math.round(Number((n * 100).toFixed(6)))
}

export function buildSettlement(contract: Contract, lines: LineItem[], payments: Payment[]): SettlementView {
  const own = contractLines(lines, contract.id)
  const view = presentLines(own)
  const subtotal = settlementSubtotal(own)
  let subtotalNote = "签署待核，不等于已审定最终价。"
  if (contract.id === "BG-HT-012") {
    subtotalNote =
      typeof subtotal === "number" && Math.abs(subtotal - TEMPLATE_SUBTOTAL) < 0.001
        ? "模板原文合计 53,050.63；不等于已审定最终价。"
        : "分项已改过，此合计不等于模板原文 53,050.63，也不是已审定最终价。"
  } else if (subtotal === "待填") {
    subtotalNote = "有分项数量或单价待填，合计不用 0 代替。签署待核，不等于已审定最终价。"
  }
  const paid = paidView(contract, payments)
  const due = outstanding(contract.finalPrice, paid, contract.finalPriceNote)
  return {
    lines: view,
    subtotal,
    subtotalNote,
    finalPrice: contract.finalPrice,
    finalNote: contract.finalPriceNote || "未审定，待核",
    finalUpper: contract.finalPrice == null ? "大写：待核" : `大写：${rmbUppercase(contract.finalPrice)}`,
    paid,
    due: due.amount,
    dueNote: due.note,
    dueUpper: due.amount == null ? "尚欠款大写：待核" : `尚欠款大写：${rmbUppercase(due.amount)}`,
  }
}

export function historicalSubtotal(contracts: Contract[]): { sum: number | null; diverged: boolean; pendingIds: string[] } {
  const pendingIds = ["BG-HT-007", "BG-HT-010", "BG-HT-011"].filter((id) => {
    const contract = contracts.find((item) => item.id === id)
    return !contract || contract.amount == null
  })
  let cents = 0
  for (const id of HISTORICAL_PRICED_IDS) {
    const contract = contracts.find((item) => item.id === id)
    if (!contract || contract.amount == null) return { sum: null, diverged: true, pendingIds }
    cents += Math.round(Number((contract.amount * 100).toFixed(6)))
  }
  const sum = cents / 100
  return { sum, diverged: Math.abs(sum - HISTORICAL_SUBTOTAL) > 0.001, pendingIds }
}

export function contractLabel(contract: Contract): string {
  const trade = contract.tradeName === "待核" ? "工种待核" : contract.shortName || contract.scope
  const supplier = contract.supplier || "供应商待核"
  return `${contract.id} ${trade} · ${supplier}`
}

export function displayRetention(contract: Contract): string {
  if (contract.retentionAmount != null) return formatMoney(contract.retentionAmount)
  return contract.retentionText || "待核"
}

export function displayContractAmount(contract: Contract): string {
  if (contract.amount != null) return formatMoney(contract.amount)
  return contract.amountText || "待核"
}
