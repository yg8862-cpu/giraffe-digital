import { uid } from "./money"
import type { AppState, Contract, Invoice, LineItem, Payment, Term } from "./types"

function blockedSupplier(name: string): boolean {
  return (name.includes("正德") && name.includes("铝单板")) || name.includes("黛玛仕之家") || name.includes("黛玛诗之家") || (name.includes("店面") && !name.includes("办公楼"))
}

export function replaceContract(state: AppState, contract: Contract): { state: AppState; error?: string } {
  if (blockedSupplier(contract.supplier) || blockedSupplier(contract.scope)) {
    return { state, error: "办公楼台账不登记正德铝单板或店面。" }
  }
  if (!state.contracts.some((item) => item.id === contract.id)) return { state, error: "找不到这份合同。" }
  return { state: { ...state, contracts: state.contracts.map((item) => (item.id === contract.id ? contract : item)) } }
}

export function replacePayment(state: AppState, payment: Payment): { state: AppState; error?: string } {
  if (payment.verifyStatus === "已核验" && !(payment.amount != null && payment.amount > 0)) {
    return { state, error: "金额不是正数，不能标为已核验。未知请保持待核。" }
  }
  const payments = state.payments.some((item) => item.id === payment.id)
    ? state.payments.map((item) => (item.id === payment.id ? payment : item))
    : [...state.payments, payment]
  return { state: { ...state, payments } }
}

export function replaceInvoice(state: AppState, invoice: Invoice): { state: AppState; error?: string } {
  if (invoice.verifyStatus === "已核验" && !(invoice.amount != null && invoice.amount > 0)) {
    return { state, error: "发票金额不是正数，不能标为已核验。" }
  }
  const invoices = state.invoices.some((item) => item.id === invoice.id)
    ? state.invoices.map((item) => (item.id === invoice.id ? invoice : item))
    : [...state.invoices, invoice]
  return { state: { ...state, invoices } }
}

export function replaceTerm(state: AppState, term: Term): { state: AppState } {
  const terms = state.terms.some((item) => item.id === term.id)
    ? state.terms.map((item) => (item.id === term.id ? term : item))
    : [...state.terms, term]
  return { state: { ...state, terms } }
}

export function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

function reseq(lines: LineItem[], contractId: string): LineItem[] {
  let seq = 1
  return lines.map((line) => (line.contractId === contractId ? { ...line, seq: seq++ } : line))
}

export function insertLine(state: AppState, line: LineItem): AppState {
  const lines = state.lines.slice()
  const anchor =
    line.kind === "扣减分项"
      ? lines.findIndex((item) => item.contractId === line.contractId && item.kind === "扣减小计")
      : lines.findIndex((item) => item.contractId === line.contractId && (item.kind === "小计" || item.kind === "扣减分部"))
  const next = { ...line, id: line.id || uid("ln") }
  if (anchor >= 0) lines.splice(anchor, 0, next)
  else lines.push(next)
  return { ...state, lines: reseq(lines, line.contractId) }
}

export function replaceLine(state: AppState, line: LineItem): AppState {
  return { ...state, lines: state.lines.map((item) => (item.id === line.id ? line : item)) }
}

export function removeLine(state: AppState, id: string): AppState {
  const current = state.lines.find((line) => line.id === id)
  const lines = state.lines.filter((line) => line.id !== id)
  return { ...state, lines: current ? reseq(lines, current.contractId) : lines }
}
