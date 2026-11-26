import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildSettlement, historicalSubtotal, verifiedPaid } from "./calc"
import { confirmDraft, discardDraft } from "./confirm"
import { createDemoState } from "./demo"
import { adoptField, createDraft } from "./extract"
import { formatAmount, rmbUppercase, scrub } from "./money"
import { createLiveState } from "./seed"
import { statusBadge } from "./money"
import { HISTORICAL_SUBTOTAL, TEMPLATE_DUE, TEMPLATE_FINAL, TEMPLATE_PAID, TEMPLATE_SUBTOTAL } from "./types"
import { buildSheets, readWorkbook, workbookBytes } from "./workbook"

const forbidden = String.fromCodePoint(0x9ee4)

describe("seeded office register", () => {
  const state = createLiveState()

  it("preloads 001–012 as 签署待核 and keeps 012 unverified", () => {
    expect(state.contracts.map((contract) => contract.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `BG-HT-${String(index + 1).padStart(3, "0")}`),
    )
    expect(state.contracts.every((contract) => statusBadge(contract.status) === "签署待核")).toBe(true)
    expect(state.contracts.some((contract) => contract.status === "已生效")).toBe(false)
    expect(state.payments.every((payment) => payment.verifyStatus === "待核")).toBe(true)
    expect(state.invoices).toHaveLength(0)
    const contract = state.contracts.find((item) => item.id === "BG-HT-012")
    expect(contract?.tradeName).toBe("待核")
    expect(contract?.amount).toBeNull()
    expect(contract?.finalPrice).toBe(TEMPLATE_FINAL)
    expect(contract?.templatePaid).toBe(TEMPLATE_PAID)
    expect(state.contracts.some((item) => item.supplier.includes("正德") || item.scope.includes("店面"))).toBe(false)
  })

  it("keeps the eight-contract subtotal apart from 012", () => {
    const history = historicalSubtotal(state.contracts)
    expect(history.sum).toBe(HISTORICAL_SUBTOTAL)
    expect(history.diverged).toBe(false)
    expect(history.pendingIds).toEqual(["BG-HT-007", "BG-HT-010", "BG-HT-011"])
    expect(verifiedPaid(state.payments, "BG-HT-012")).toBeNull()
    expect(formatAmount(verifiedPaid(state.payments, "BG-HT-001"))).toBe("待核")
  })

  it("builds the 012 settlement from the template without counting it as paid", () => {
    const contract = state.contracts.find((item) => item.id === "BG-HT-012")!
    const view = buildSettlement(contract, state.lines, state.payments)
    expect(view.subtotal).toBe(TEMPLATE_SUBTOTAL)
    expect(view.finalPrice).toBe(TEMPLATE_FINAL)
    expect(view.paid).toMatchObject({ amount: TEMPLATE_PAID, kind: "template" })
    expect(view.due).toBe(TEMPLATE_DUE)
    expect(view.dueNote).toContain("待核")
    expect(view.finalUpper).toBe("大写：伍万叁仟元整")
    expect(view.dueUpper).toBe("尚欠款大写：贰万捌仟元整")
    expect(view.lines.some((line) => line.name.includes("质保"))).toBe(false)
    const area = view.lines.find((line) => line.kind === "面积小计")
    expect(area?.amount).toBe(51550.63)
    expect(area?.qty).toBe(3032.39)
  })

  it("does not turn an unpriced contract into zero", () => {
    const contract = state.contracts.find((item) => item.id === "BG-HT-001")!
    const view = buildSettlement(contract, state.lines, state.payments)
    expect(view.subtotal).toBe(86600)
    expect(view.finalPrice).toBeNull()
    expect(view.paid.amount).toBeNull()
    expect(view.due).toBeNull()
    const paint = buildSettlement(state.contracts.find((item) => item.id === "BG-HT-010")!, state.lines, state.payments)
    expect(paint.subtotal).toBe("待填")
    const stone = buildSettlement(state.contracts.find((item) => item.id === "BG-HT-002")!, state.lines, state.payments)
    expect(stone.subtotal).toBe(231950)
  })
})

describe("confirmation gate", () => {
  const state = createLiveState()

  it("keeps guesses out of the register until they are adopted", () => {
    const draft = createDraft({
      kind: "合同生效件",
      fileName: "zhang.pdf",
      fileDate: "2026-11-26",
      extraction: "PDF文本",
      contracts: state.contracts,
      text: "工程名称：黛玛仕办公楼\n乙方：杭州张氏装饰工程有限公司\n合同总价：人民币86,600.00元\n质保金5%",
    })
    expect(draft.fields.projectName.suggestion).toBe("黛玛仕办公楼")
    expect(draft.fields.projectName.value).toBe("待核")
    expect(draft.matchContractId).toBe("BG-HT-001")
    expect(draft.fields.amount.value).toBe("待核")
    const blocked = confirmDraft(state, draft, {
      markEffective: false,
      markVerified: false,
      targetContractId: "new",
      overrideExclusion: false,
    })
    expect(blocked.ok).toBe(false)
    const adopted = adoptField(adoptField(draft, "supplier"), "amount")
    const saved = confirmDraft(state, adopted, {
      markEffective: false,
      markVerified: false,
      targetContractId: "new",
      overrideExclusion: false,
    })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const created = saved.state.contracts.find((contract) => contract.id === "BG-HT-013")
    expect(created?.supplier).toBe("杭州张氏装饰工程有限公司")
    expect(created?.amount).toBe(86600)
    expect(created?.status).toBe("签署待核")
    expect(created?.projectNameAsWritten).toBe("")
    expect(saved.state.payments).toHaveLength(state.payments.length)
  })

  it("does not count an unverified payment, a retention, or an invoice as 已核验已付", () => {
    const payment = adoptField(
      createDraft({
        kind: "付款凭证",
        fileName: "pay.jpg",
        fileDate: "2026-11-26",
        extraction: "图片识别",
        contracts: state.contracts,
        text: "付款金额：100.00元\n收款人：杭州张氏装饰工程有限公司",
      }),
      "amount",
    )
    const pending = confirmDraft(state, payment, {
      markEffective: false,
      markVerified: false,
      targetContractId: "BG-HT-001",
      overrideExclusion: false,
    })
    expect(pending.ok).toBe(true)
    if (!pending.ok) return
    expect(verifiedPaid(pending.state.payments, "BG-HT-001")).toBeNull()
    const verified = confirmDraft(state, payment, {
      markEffective: false,
      markVerified: true,
      targetContractId: "BG-HT-001",
      overrideExclusion: false,
    })
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verifiedPaid(verified.state.payments, "BG-HT-001")).toBe(100)
    const view = buildSettlement(verified.state.contracts[0], verified.state.lines, verified.state.payments)
    expect(view.paid.kind).toBe("verified")
    expect(view.due).toBeNull()

    const retention = adoptField(payment, "stage")
    retention.fields.stage = { value: "质保金", suggestion: "", provenance: "手工填写", uncertain: false }
    const retained = confirmDraft(state, retention, {
      markEffective: false,
      markVerified: true,
      targetContractId: "BG-HT-001",
      overrideExclusion: false,
    })
    expect(retained.ok).toBe(true)
    if (!retained.ok) return
    expect(verifiedPaid(retained.state.payments, "BG-HT-001")).toBeNull()

    const invoice = createDraft({
      kind: "发票",
      fileName: "inv.pdf",
      fileDate: "2026-11-26",
      extraction: "PDF文本",
      contracts: state.contracts,
      text: "发票号码：12345678\n销售方：示例开票公司甲乙\n价税合计 100.00\n购买方：某需方公司名称",
    })
    expect(invoice.fields.payer.suggestion).toBe("")
    expect(invoice.fields.receivingSupplier.value).toBe("待核")
    const filed = confirmDraft(state, adoptField(invoice, "amount"), {
      markEffective: false,
      markVerified: true,
      targetContractId: "BG-HT-001",
      overrideExclusion: false,
    })
    expect(filed.ok).toBe(true)
    if (!filed.ok) return
    expect(filed.state.payments).toHaveLength(state.payments.length)
    expect(filed.state.invoices[0]?.verifyStatus).toBe("已核验")
    expect(verifiedPaid(filed.state.payments, "BG-HT-001")).toBeNull()
  })

  it("refuses excluded projects and discarded drafts", () => {
    const draft = createDraft({
      kind: "合同生效件",
      fileName: "other.pdf",
      fileDate: "2026-11-26",
      extraction: "PDF文本",
      contracts: state.contracts,
      text: "正德铝单板供货合同",
    })
    expect(draft.blockedReason).toContain("正德")
    const refused = confirmDraft(state, draft, {
      markEffective: true,
      markVerified: false,
      targetContractId: "new",
      overrideExclusion: false,
    })
    expect(refused.ok).toBe(false)
    expect(discardDraft({ ...state, drafts: [draft] }, draft.id).drafts).toHaveLength(0)
    expect(discardDraft({ ...state, drafts: [draft] }, draft.id).contracts).toHaveLength(12)
  })
})

describe("money and isolation", () => {
  it("spells the template amounts", () => {
    expect(rmbUppercase(53000)).toBe("伍万叁仟元整")
    expect(rmbUppercase(28000)).toBe("贰万捌仟元整")
    expect(rmbUppercase(25000)).toBe("贰万伍仟元整")
    expect(rmbUppercase(12500)).toBe("壹万贰仟伍佰元整")
    expect(rmbUppercase(7500)).toBe("柒仟伍佰元整")
    expect(rmbUppercase(53050.63)).toBe("伍万叁仟零伍拾元陆角叁分")
    expect(rmbUppercase(10001)).toBe("壹万零壹元整")
  })

  it("keeps the fictional sample out of the live register", () => {
    const live = JSON.stringify(createLiveState())
    const demo = createDemoState()
    expect(live.includes("SL-HT-000")).toBe(false)
    expect(demo.contracts[0]?.amount).toBe(12500)
    expect(demo.payments[0]?.verifyStatus).toBe("已核验")
    const view = buildSettlement(demo.contracts[0], demo.lines, demo.payments)
    expect(view.subtotal).toBe(12500)
    expect(view.paid.amount).toBe(5000)
    expect(view.due).toBe(7500)
    const liveSheets = buildSheets(createLiveState(), "live")
    const sample = liveSheets.find((sheet) => sheet.name.startsWith("填写示例"))
    expect(JSON.stringify(sample?.rows)).not.toContain("12500")
    expect(JSON.stringify(liveSheets.find((sheet) => sheet.name === "合同清单")?.rows)).not.toContain("SL-HT-000")
  })

  it("round-trips the live workbook without promoting 012 to verified", () => {
    const state = createLiveState()
    const bytes = workbookBytes(state, "live")
    const imported = readWorkbook(bytes)
    expect("error" in imported).toBe(false)
    if ("error" in imported) return
    expect(imported.state.contracts).toHaveLength(12)
    expect(historicalSubtotal(imported.state.contracts).sum).toBe(HISTORICAL_SUBTOTAL)
    const contract = imported.state.contracts.find((item) => item.id === "BG-HT-012")
    expect(contract?.templatePaid).toBe(25000)
    expect(contract?.tradeName).toBe("待核")
    expect(imported.state.payments.every((payment) => payment.verifyStatus === "待核")).toBe(true)
    const view = buildSettlement(contract!, imported.state.lines, imported.state.payments)
    expect(view.subtotal).toBe(TEMPLATE_SUBTOTAL)
    expect(view.due).toBe(TEMPLATE_DUE)
    expect(scrub(`黛${forbidden}诗`)).not.toContain(forbidden)
  })
})

describe("source text", () => {
  it("does not contain the forbidden typo glyph", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url))
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "dist") continue
        const path = join(dir, entry)
        const info = statSync(path)
        if (info.isDirectory()) {
          walk(path)
          continue
        }
        if (!/\.(ts|tsx|css|html|json|md|py)$/.test(entry)) continue
        if (readFileSync(path, "utf8").includes(forbidden)) hits.push(path)
      }
    }
    walk(root)
    expect(hits).toEqual([])
  })
})
