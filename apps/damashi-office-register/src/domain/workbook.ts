import * as XLSX from "xlsx"
import { buildSettlement, contractLines, historicalSubtotal, presentLines } from "./calc"
import { parseAmount, scrub } from "./money"
import { createLiveState } from "./seed"
import type { AppState, Contract, Invoice, LineItem, Payment, Term, VerifyStatus } from "./types"
import { HISTORICAL_SUBTOTAL, INVOICE_TYPES, PAY_METHODS, STAGES } from "./types"

type Cell = string | number

function cellAmount(value: string | number | null): Cell {
  return value == null ? "" : value
}
type Sheet = { name: string; rows: Cell[][]; widths?: number[] }

const CONTRACT_HEADERS = [
  "合同唯一编号",
  "合同/材料范围",
  "合同对方（非实际收款推定）",
  "需方/签约主体全称",
  "原合同编号",
  "签署日期",
  "签署/生效状态",
  "合同总价/暂定价（非已确认结算、非已付）",
  "金额性质",
  "是否含税",
  "税率（未核勿填0）",
  "质保金比例",
  "质保金约定额（非已付）",
  "质保金返还条件",
  "简称",
  "统计口径",
  "待核事项",
  "最终结算价（审定）",
  "最终价说明",
  "模板载明已付款",
  "模板载明已付款说明",
  "结算单编制日期",
] as const

function amountCell(amount: number | null, text: string): Cell {
  if (amount != null) return amount
  return text || "待核"
}

function contractRow(contract: Contract): Cell[] {
  return [
    contract.id,
    contract.scope,
    contract.supplier,
    contract.buyer,
    contract.originalNo,
    contract.signDate,
    contract.status,
    amountCell(contract.amount, contract.amountText),
    contract.amountNature,
    contract.taxIncluded,
    contract.taxRate,
    contract.retentionRate,
    amountCell(contract.retentionAmount, contract.retentionText),
    contract.retentionTerms,
    contract.shortName,
    contract.statScope,
    contract.pendingNotes,
    contract.finalPrice == null ? "待核" : contract.finalPrice,
    contract.finalPriceNote,
    contract.templatePaid == null ? "" : contract.templatePaid,
    contract.templatePaidNote,
    contract.settlementDate,
  ]
}

function settlementBlock(contract: Contract, state: AppState): Cell[][] {
  const view = buildSettlement(contract, state.lines, state.payments)
  const project = contract.projectNameAsWritten
  const rows: Cell[][] = [
    ["黛玛诗办公楼结算单"],
    [
      `工程名称：${project && project !== "待核" ? project : "黛玛诗办公楼"}`,
      "",
      `供应商：${contract.supplier || "待核"}`,
      "",
      "",
      `编制日期：${contract.settlementDate || "待填"}`,
    ],
    ["序号", "分部分项工程名称", "单位", "数量", "单价（元）", "合价（元）", "备注"],
  ]
  for (const line of view.lines) {
    rows.push([line.no, line.name, line.unit, line.qtyDisplay, line.priceDisplay, line.amount == null ? "" : line.amount, line.note])
  }
  rows.push(["结算合计（人民币）", "", "", "", "", cellAmount(view.subtotal), view.subtotalNote])
  rows.push(["最终结算价（人民币）", "", "", "", "", view.finalPrice == null ? "待核" : view.finalPrice, view.finalNote])
  rows.push([view.finalUpper])
  rows.push(["已付款", "", "", "", "", view.paid.amount == null ? "待核" : view.paid.amount, view.paid.note])
  rows.push(["尚欠款", "", "", "", "", view.due == null ? "待核" : view.due, view.dueNote])
  rows.push([view.dueUpper])
  rows.push(["本结算单一式两份，甲乙双方各执一份，经双方签字确认后生效。"])
  rows.push([])
  return rows
}

function sampleSheet(includeNumbers: boolean): Cell[][] {
  if (!includeNumbers) {
    return [
      ["【示例·虚构数据】本正式导出不含虚构金额。"],
      ["12,500、5,000、7,500 只在应用的示例模式里，不在本合同清单、付款台账或结算合计中。"],
      ["不要把示例数字并进办公楼。"],
    ]
  }
  return [
    ["【示例·虚构数据】结算单填写演示 —— 不是黛玛诗办公楼已签合同，也不是木之易弘天模板上的数字"],
    ["虚构合同 SL-HT-000。分部分项合计 13,000，扣减 500，结算合计 12,500；假定已审定最终价 12,500、已核验已付 5,000、尚欠款 7,500。"],
    ["黛玛诗办公楼结算单"],
    ["工程名称：示例项目（虚构）", "", "供应商：示例建材有限公司（虚构）", "", "", "编制日期：示例日期"],
    ["序号", "分部分项工程名称", "单位", "数量", "单价（元）", "合价（元）", "备注"],
    ["一、", "示例板材（虚构范围）"],
    ["1、", "示例板材A（虚构规格）", "㎡", 50, 100, 5000, "【示例】虚构行"],
    ["2、", "示例板材B（虚构规格）", "项", 1, 8000, 8000, "【示例】虚构行"],
    ["小计", "", "", "", "", 13000, "示例小计应为 13,000"],
    ["二、", "扣减项目（示例已列入）"],
    ["1、", "示例扣减（虚构）", "项", 1, -500, -500, "【示例】虚构扣减"],
    ["小计", "", "", "", "", -500],
    ["结算合计（人民币）", "", "", "", "", 12500, "示例应为 12,500，不是已审定最终价。"],
    ["最终结算价（人民币）", "", "", "", "", 12500, "【示例】假定已审定。"],
    ["已付款", "", "", "", "", 5000, "【示例】虚构已核验已付。"],
    ["尚欠款", "", "", "", "", 7500, "示例：12,500－5,000＝7,500。"],
    ["再次声明：以上全部是虚构演示，不是 BG-HT-001 至 012 的已签约或已付款。"],
  ]
}

export function buildSheets(state: AppState, mode: "live" | "demo"): Sheet[] {
  const history = historicalSubtotal(state.contracts)
  const guide: Sheet = {
    name: "使用说明与版本来源",
    widths: [28, 80],
    rows: [
      ["黛玛诗办公楼  合同—付款台账—结算  试用导出"],
      ["这是试用应用导出的数值快照，不是原待审工作簿里的公式联动版。工作表和列与 V2 待审表对齐，便于对照。"],
      ["只含办公楼。正德铝单板、黛玛仕之家店面不在内。填写示例里的虚构数字不进入正式台账。"],
      ["已付款只统计核验状态为已核验、金额为正、且阶段不是质保金的记录。没有这种记录时写待核，不写 0。"],
      ["BG-HT-012 的 25,000 在未核验前不得写成已核验已付，也不并入 8 份暂定价小计 873,942.93。"],
      ["开票方、实际付款人、收款供应商分列。"],
      [mode === "demo" ? "本文件来自示例模式，全部是虚构数据。" : "本文件来自正式台账。"],
      ["原 8 份暂定价小计", history.sum == null ? "待核" : history.sum, history.diverged ? `已与原小计 ${HISTORICAL_SUBTOTAL} 不同` : "与原小计一致"],
    ],
  }
  const settlement: Sheet = {
    name: "结算单",
    widths: [22, 42, 10, 12, 14, 16, 36],
    rows: [["选择合同后的数值快照。每份合同一块。结算单上不设质保金行。"], []],
  }
  for (const contract of state.contracts) settlement.rows.push(...settlementBlock(contract, state))
  const special = state.contracts.find((contract) => contract.id === "BG-HT-012")
  const specialSheet: Sheet = {
    name: "木之易弘天结算单（按模板录入）",
    widths: [22, 42, 10, 12, 14, 16, 36],
    rows: special
      ? [["来源：2026-11-26 结算单模板。工种待核。已付款与最终价为模板载明、待核。"], [], ...settlementBlock(special, state)]
      : [["当前台账没有 BG-HT-012。"]],
  }
  const contracts: Sheet = {
    name: "合同清单",
    rows: [
      ["黛玛诗办公楼｜合同清单。金额是合同约定或模板载明，不是已核验已付。"],
      ["需方全称缺省为待核。最终结算价未审定不要把结算合计直接写入。模板载明已付款不是已核验已付。"],
      [...CONTRACT_HEADERS],
      ...state.contracts.map(contractRow),
      [],
      ["办公楼合同份数", state.contracts.length],
      ["原 8 份有明确总价的小计（不含 012；非应付、非已付、非已审定）", history.sum == null ? "待核" : history.sum],
    ],
  }
  const terms: Sheet = {
    name: "付款条件",
    rows: [
      ["黛玛诗办公楼｜付款条件（合同怎么约定要付，不是已经付了。无此阶段不要改成 0 元。）"],
      ["合同唯一编号", "台账付款阶段", "原合同节点名称", "原比例/累计口径", "约定额（非已付）", "金额口径/拆分说明", "原付款触发条件（摘录）", "备注/待核"],
      ...state.terms.map((term) => [
        term.contractId,
        term.stage,
        term.originalName,
        term.ratio,
        amountCell(term.amount, term.amountText),
        term.basis,
        term.trigger,
        term.note,
      ]),
    ],
  }
  const payments: Sheet = {
    name: "付款台账",
    rows: [
      ["黛玛诗办公楼｜付款台账。已付只汇总核验状态为「已核验」且金额为正数、阶段不是质保金的记录。"],
      ["无凭证不把约定额写成已付。质保金退还不计入结算单已核验已付。"],
      ["付款编号", "合同唯一编号", "合同/材料范围（可手填）", "付款阶段", "实际付款日期", "实际付款人", "实际收款方", "本次支付额", "支付方式", "来源凭证", "登记日期", "核验状态", "备注"],
      ...state.payments.map((payment) => [
        payment.id,
        payment.contractId,
        payment.scope,
        payment.stage,
        payment.payDate,
        payment.payer,
        payment.payee,
        payment.amount == null ? "待核" : payment.amount,
        payment.method,
        payment.voucher,
        payment.registerDate,
        payment.verifyStatus,
        payment.note,
      ]),
    ],
  }
  const invoices: Sheet = {
    name: "开票登记",
    rows: [
      ["黛玛诗办公楼｜开票登记。开票方、实际付款人、收款供应商分列。已开票不等于已付款。"],
      ["登记号", "合同唯一编号", "开票日期", "开票方", "购方抬头", "发票金额", "发票类型", "与合同对方或收款方不一致待核", "来源凭证", "核验状态", "备注", "发票代码", "发票号码", "不含税金额", "税额", "税率", "货物或服务名称", "实际付款人", "收款供应商"],
      ...state.invoices.map((invoice) => [
        invoice.id,
        invoice.contractId,
        invoice.date,
        invoice.issuer,
        invoice.buyerTitle,
        invoice.amount == null ? "待核" : invoice.amount,
        invoice.invoiceType,
        invoice.mismatchNote,
        invoice.voucher,
        invoice.verifyStatus,
        invoice.note,
        invoice.invoiceCode,
        invoice.invoiceNumber,
        invoice.amountExTax == null ? "待核" : invoice.amountExTax,
        invoice.taxAmount == null ? "待核" : invoice.taxAmount,
        invoice.taxRate,
        invoice.goodsName,
        invoice.payer,
        invoice.receivingSupplier,
      ]),
    ],
  }
  const lines: Sheet = {
    name: "分部分项底稿",
    rows: [
      ["黛玛诗办公楼｜分部分项底稿。合价按数量×单价算出；数量或单价空着时为待填，不用 0。无扣减时扣减小计为「无」。"],
      ["合同唯一编号", "行次", "行类", "序号", "分部分项工程名称", "单位", "数量", "单价（元）", "合价（公式）", "备注", "匹配键"],
    ],
  }
  for (const contract of state.contracts) {
    const own = contractLines(state.lines, contract.id)
    const view = presentLines(own)
    own.forEach((line, index) => {
      const shown = view[index]
      lines.rows.push([
        line.contractId,
        line.seq,
        line.kind,
        line.no,
        line.name,
        line.unit,
        shown?.qtyDisplay ?? "",
        shown?.priceDisplay ?? "",
        shown?.amount == null ? "" : shown.amount,
        line.note,
        `${line.contractId}|${line.seq}`,
      ])
    })
  }
  const dict: Sheet = {
    name: "下拉字典",
    rows: [
      ["合同编号", "核验状态", "付款阶段", "支付方式", "是否含税", "发票类型"],
      ...state.contracts.map((contract, index) => [
        contract.id,
        index === 0 ? "待核" : index === 1 ? "已核验" : "",
        STAGES[index] ?? "",
        PAY_METHODS[index] ?? "",
        index === 0 ? "含税" : index === 1 ? "不含税" : index === 2 ? "待核" : "",
        INVOICE_TYPES[index] ?? "",
      ]),
    ],
  }
  return [guide, settlement, specialSheet, contracts, terms, payments, invoices, lines, { name: "填写示例（虚构数据）", rows: sampleSheet(mode === "demo") }, dict]
}

export function workbookBytes(state: AppState, mode: "live" | "demo"): ArrayBuffer {
  const book = XLSX.utils.book_new()
  for (const sheet of buildSheets(state, mode)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
    if (sheet.widths) ws["!cols"] = sheet.widths.map((width) => ({ wch: width }))
    XLSX.utils.book_append_sheet(book, ws, sheet.name.slice(0, 31))
  }
  const hidden = book.SheetNames.indexOf("下拉字典")
  book.Workbook = { Sheets: book.SheetNames.map((_, index) => ({ Hidden: index === hidden ? 1 : 0 })) }
  return XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer
}

export function downloadWorkbook(state: AppState, mode: "live" | "demo") {
  const bytes = workbookBytes(state, mode)
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const link = document.createElement("a")
  const stamp = new Date().toISOString().slice(0, 10)
  link.href = URL.createObjectURL(blob)
  link.download = mode === "demo" ? `示例-虚构数据-不要并入办公楼台账-${stamp}.xlsx` : `黛玛诗办公楼_合同付款结算_导出-${stamp}.xlsx`
  link.click()
  URL.revokeObjectURL(link.href)
}

function sheetRows(book: XLSX.WorkBook, name: string): Cell[][] {
  const sheet = book.Sheets[name]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as Cell[][]
}

function asText(value: Cell | undefined): string {
  if (value == null) return ""
  return String(value).trim()
}

function asMoney(value: Cell | undefined): { amount: number | null; text: string } {
  if (typeof value === "number" && Number.isFinite(value)) return { amount: Math.round(value * 100) / 100, text: "" }
  const text = asText(value)
  if (!text || text.startsWith("=")) return { amount: null, text: "待核" }
  const amount = parseAmount(text)
  if (amount == null) return { amount: null, text }
  return { amount, text: "" }
}

function headerIndex(row: Cell[]): Map<string, number> {
  const map = new Map<string, number>()
  row.forEach((cell, index) => {
    const key = asText(cell)
    if (key) map.set(key, index)
  })
  return map
}

function findHeader(rows: Cell[][], header: string): { index: number; columns: Map<string, number> } | null {
  for (let index = 0; index < Math.min(rows.length, 8); index++) {
    const columns = headerIndex(rows[index] ?? [])
    if (columns.has(header)) return { index, columns }
  }
  return null
}

function col(columns: Map<string, number>, header: string): number {
  return columns.get(header) ?? -1
}

function cell(row: Cell[], index: number): Cell {
  if (index < 0) return ""
  return row[index] ?? ""
}

function excluded(id: string, supplier: string): boolean {
  if (!id || id.startsWith("SL-") || id.includes("示例") || supplier.includes("虚构") || supplier.includes("示例")) return true
  if (supplier.includes("正德") || (supplier.includes("店面") && !supplier.includes("办公楼"))) return true
  if (supplier.includes("黛玛仕之家") || supplier.includes("黛玛诗之家")) return true
  return false
}

function verify(value: string, amount: number | null): VerifyStatus {
  if (value === "已核验" && amount != null && amount > 0) return "已核验"
  return "待核"
}

export function readWorkbook(data: ArrayBuffer): { state: AppState; summary: string } | { error: string } {
  const book = XLSX.read(data, { type: "array" })
  const contractRows = sheetRows(book, "合同清单")
  const header = findHeader(contractRows, "合同唯一编号")
  if (!header) return { error: "没有找到「合同清单」里的合同唯一编号表头。" }
  const contracts: Contract[] = []
  let skipped = 0
  for (const row of contractRows.slice(header.index + 1)) {
    const id = asText(cell(row, col(header.columns, "合同唯一编号")))
    if (!/^BG-HT-\d+$/.test(id)) continue
    const supplier = asText(cell(row, col(header.columns, "合同对方（非实际收款推定）"))) || "待核"
    if (excluded(id, supplier)) {
      skipped += 1
      continue
    }
    const amount = asMoney(cell(row, col(header.columns, "合同总价/暂定价（非已确认结算、非已付）")))
    const retention = asMoney(cell(row, col(header.columns, "质保金约定额（非已付）")))
    const finalPrice = asMoney(cell(row, col(header.columns, "最终结算价（审定）")))
    const templatePaid = asMoney(cell(row, col(header.columns, "模板载明已付款")))
    const blankTemplate = asText(cell(row, col(header.columns, "模板载明已付款"))) === ""
    contracts.push({
      id,
      scope: asText(cell(row, col(header.columns, "合同/材料范围"))),
      supplier,
      buyer: asText(cell(row, col(header.columns, "需方/签约主体全称"))) || "待核",
      originalNo: asText(cell(row, col(header.columns, "原合同编号"))) || "待核",
      signDate: asText(cell(row, col(header.columns, "签署日期"))) || "待核",
      status: asText(cell(row, col(header.columns, "签署/生效状态"))) || "签署待核",
      amount: amount.amount,
      amountText: amount.text,
      amountNature: asText(cell(row, col(header.columns, "金额性质"))),
      taxIncluded: asText(cell(row, col(header.columns, "是否含税"))) || "待核",
      taxRate: asText(cell(row, col(header.columns, "税率（未核勿填0）"))) || "待核",
      retentionRate: asText(cell(row, col(header.columns, "质保金比例"))) || "待核",
      retentionAmount: retention.amount,
      retentionText: retention.text,
      retentionTerms: asText(cell(row, col(header.columns, "质保金返还条件"))),
      shortName: asText(cell(row, col(header.columns, "简称"))),
      tradeName: id === "BG-HT-012" ? "待核" : asText(cell(row, col(header.columns, "简称"))) || "待核",
      statScope: asText(cell(row, col(header.columns, "统计口径"))),
      pendingNotes: asText(cell(row, col(header.columns, "待核事项"))),
      finalPrice: finalPrice.amount,
      finalPriceNote: asText(cell(row, col(header.columns, "最终价说明"))) || "未审定，待核",
      templatePaid: blankTemplate ? null : templatePaid.amount,
      templatePaidNote: asText(cell(row, col(header.columns, "模板载明已付款说明"))),
      settlementDate: asText(cell(row, col(header.columns, "结算单编制日期"))) || "待填",
      projectNameAsWritten: "",
      sourceFileName: "",
      sourceFileDate: "",
      provenance: { supplier: "台账原载", tradeName: id === "BG-HT-012" ? "待核" : "台账原载" },
    })
  }
  if (contracts.length === 0) return { error: "合同清单里没有可导入的办公楼合同。" }

  const terms = readTerms(book)
  const payments = readPayments(book)
  const invoices = readInvoices(book)
  const lines = readLines(book, contracts.map((contract) => contract.id))
  const base = createLiveState()
  const summary = `读到合同 ${contracts.length} 份、付款条件 ${terms.length} 条、付款 ${payments.length} 笔、发票 ${invoices.length} 张、分项 ${lines.length} 行。跳过示例或非办公楼 ${skipped} 行。导入后请再核对，未核验的付款不会变成已核验。`
  return {
    summary,
    state: { ...base, contracts, terms, payments, invoices, lines, drafts: [] },
  }
}

function readTerms(book: XLSX.WorkBook): Term[] {
  const rows = sheetRows(book, "付款条件")
  const header = findHeader(rows, "合同唯一编号")
  if (!header) return []
  const terms: Term[] = []
  rows.slice(header.index + 1).forEach((row, index) => {
    const contractId = asText(cell(row, col(header.columns, "合同唯一编号")))
    if (!/^BG-HT-\d+$/.test(contractId)) return
    const amount = asMoney(cell(row, col(header.columns, "约定额（非已付）")))
    terms.push({
      id: `import-term-${index + 1}`,
      contractId,
      stage: asText(cell(row, col(header.columns, "台账付款阶段"))) || "其他/待核",
      originalName: asText(cell(row, col(header.columns, "原合同节点名称"))),
      ratio: asText(cell(row, col(header.columns, "原比例/累计口径"))) || "待核",
      amount: amount.amount,
      amountText: amount.text,
      basis: asText(cell(row, col(header.columns, "金额口径/拆分说明"))),
      trigger: asText(cell(row, col(header.columns, "原付款触发条件（摘录）"))) || "待核",
      note: asText(cell(row, col(header.columns, "备注/待核"))),
    })
  })
  return terms
}

function readPayments(book: XLSX.WorkBook): Payment[] {
  const rows = sheetRows(book, "付款台账")
  const header = findHeader(rows, "付款编号")
  if (!header) return []
  const payments: Payment[] = []
  for (const row of rows.slice(header.index + 1)) {
    const id = asText(cell(row, col(header.columns, "付款编号")))
    const contractId = asText(cell(row, col(header.columns, "合同唯一编号")))
    if (!id || id.startsWith("SL-")) continue
    if (contractId && !/^BG-HT-\d+$/.test(contractId)) continue
    const amount = asMoney(cell(row, col(header.columns, "本次支付额")))
    payments.push({
      id,
      contractId,
      scope: asText(cell(row, col(header.columns, "合同/材料范围（可手填）"))),
      stage: asText(cell(row, col(header.columns, "付款阶段"))) || "其他/待核",
      payDate: asText(cell(row, col(header.columns, "实际付款日期"))) || "待核",
      payer: asText(cell(row, col(header.columns, "实际付款人"))) || "待核",
      payee: asText(cell(row, col(header.columns, "实际收款方"))) || "待核",
      amount: amount.amount,
      method: asText(cell(row, col(header.columns, "支付方式"))) || "待核",
      voucher: asText(cell(row, col(header.columns, "来源凭证"))),
      registerDate: asText(cell(row, col(header.columns, "登记日期"))),
      verifyStatus: verify(asText(cell(row, col(header.columns, "核验状态"))), amount.amount),
      note: asText(cell(row, col(header.columns, "备注"))),
      sourceFileName: "",
    })
  }
  return payments
}

function readInvoices(book: XLSX.WorkBook): Invoice[] {
  const rows = sheetRows(book, "开票登记")
  const header = findHeader(rows, "登记号")
  if (!header) return []
  const invoices: Invoice[] = []
  for (const row of rows.slice(header.index + 1)) {
    const id = asText(cell(row, col(header.columns, "登记号")))
    if (!id || id.startsWith("SL-")) continue
    const contractId = asText(cell(row, col(header.columns, "合同唯一编号")))
    const amount = asMoney(cell(row, col(header.columns, "发票金额")))
    const ex = asMoney(cell(row, col(header.columns, "不含税金额")))
    const tax = asMoney(cell(row, col(header.columns, "税额")))
    invoices.push({
      id,
      contractId: /^BG-HT-\d+$/.test(contractId) ? contractId : "",
      date: asText(cell(row, col(header.columns, "开票日期"))) || "待核",
      issuer: asText(cell(row, col(header.columns, "开票方"))) || "待核",
      buyerTitle: asText(cell(row, col(header.columns, "购方抬头"))) || "待核",
      amount: amount.amount,
      amountExTax: ex.amount,
      taxAmount: tax.amount,
      taxRate: asText(cell(row, col(header.columns, "税率"))) || "待核",
      invoiceCode: asText(cell(row, col(header.columns, "发票代码"))) || "待核",
      invoiceNumber: asText(cell(row, col(header.columns, "发票号码"))) || "待核",
      goodsName: asText(cell(row, col(header.columns, "货物或服务名称"))) || "待核",
      invoiceType: asText(cell(row, col(header.columns, "发票类型"))) || "待核",
      payer: asText(cell(row, col(header.columns, "实际付款人"))) || "待核",
      receivingSupplier: asText(cell(row, col(header.columns, "收款供应商"))) || "待核",
      mismatchNote: asText(cell(row, col(header.columns, "与合同对方或收款方不一致待核"))),
      voucher: asText(cell(row, col(header.columns, "来源凭证"))),
      verifyStatus: verify(asText(cell(row, col(header.columns, "核验状态"))), amount.amount),
      note: asText(cell(row, col(header.columns, "备注"))),
      sourceFileName: "",
      sourceFileDate: "",
    })
  }
  return invoices
}

function readLines(book: XLSX.WorkBook, ids: string[]): LineItem[] {
  const rows = sheetRows(book, "分部分项底稿")
  const header = findHeader(rows, "合同唯一编号")
  if (!header) return []
  const allowed = new Set(ids)
  const lines: LineItem[] = []
  for (const row of rows.slice(header.index + 1)) {
    const contractId = asText(cell(row, col(header.columns, "合同唯一编号")))
    if (!allowed.has(contractId)) continue
    const kind = asText(cell(row, col(header.columns, "行类")))
    const literal = asText(cell(row, col(header.columns, "合价（公式）")))
    lines.push({
      id: `import-line-${contractId}-${lines.length + 1}`,
      contractId,
      seq: Number(asText(cell(row, col(header.columns, "行次")))) || lines.length + 1,
      kind: (["分部标题", "分项", "小计", "面积小计", "扣减分部", "扣减分项", "扣减小计"].includes(kind) ? kind : "分项") as LineItem["kind"],
      no: asText(cell(row, col(header.columns, "序号"))),
      name: asText(cell(row, col(header.columns, "分部分项工程名称"))),
      unit: asText(cell(row, col(header.columns, "单位"))),
      qty: qtyCell(cell(row, col(header.columns, "数量"))),
      price: priceCell(cell(row, col(header.columns, "单价（元）"))),
      literalAmount: literal === "无" ? "无" : "",
      note: asText(cell(row, col(header.columns, "备注"))),
    })
  }
  return lines
}

function qtyCell(value: Cell): number | null {
  const text = asText(value)
  if (!text || text === "待填" || text === "无" || text === "待核") return null
  return parseAmount(text)
}

function priceCell(value: Cell): number | null {
  return qtyCell(value)
}

export function backupText(state: AppState): string {
  return JSON.stringify(state)
}

export function readBackup(text: string): { state: AppState; summary: string } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: "这不是一份登记备份。" }
  }
  if (!parsed || typeof parsed !== "object") return { error: "备份是空的。" }
  const record = scrubValue(parsed) as Partial<AppState>
  if (record.version !== 1 || !Array.isArray(record.contracts) || !Array.isArray(record.payments)) {
    return { error: "认不出这份备份的版本。" }
  }
  const contracts = record.contracts.filter((contract) => contract && typeof contract.id === "string" && !excluded(contract.id, contract.supplier ?? ""))
  if (contracts.length === 0) return { error: "备份里没有可导入的办公楼合同。" }
  const dropped = record.contracts.length - contracts.length
  const payments = (record.payments ?? []).filter((payment) => payment && !String(payment.id).startsWith("SL-")).map((payment) => ({
    ...payment,
    verifyStatus: verify(payment.verifyStatus, payment.amount) ,
  }))
  const state: AppState = {
    version: 1,
    contracts,
    terms: record.terms ?? [],
    payments,
    invoices: (record.invoices ?? []).filter((invoice) => invoice && !String(invoice.id).startsWith("SL-")),
    lines: (record.lines ?? []).filter((line) => line && contracts.some((contract) => contract.id === line.contractId)),
    drafts: record.drafts ?? [],
  }
  return { state, summary: `备份含合同 ${contracts.length} 份。${dropped ? `未导入示例或非办公楼 ${dropped} 份。` : ""}未核验付款不会因为导入变成已核验。` }
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrub(value)
  if (Array.isArray(value)) return value.map(scrubValue)
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) output[key] = scrubValue(item)
    return output
  }
  return value
}

export function downloadBackup(state: AppState, mode: "live" | "demo") {
  const blob = new Blob([backupText(state)], { type: "application/json" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = mode === "demo" ? "示例-虚构备份.json" : "黛玛诗办公楼-登记备份.json"
  link.click()
  URL.revokeObjectURL(link.href)
}
