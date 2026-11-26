import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createLiveState } from "../domain/seed"
import { issueSession, sameSecret, sessionValid } from "./auth"
import { applyLedgerPut } from "./ledger"
import { LOGIN_HTML } from "./login-page"

describe("shared trial gate", () => {
  it("accepts only the same secret", async () => {
    expect(await sameSecret("correct-horse", "correct-horse")).toBe(true)
    expect(await sameSecret("wrong", "correct-horse")).toBe(false)
    expect(await sameSecret("", "correct-horse")).toBe(false)
  })

  it("issues a session that expires", async () => {
    const now = Date.parse("2026-11-26T00:00:00Z")
    const token = await issueSession("desk-secret", now)
    expect(await sessionValid(token, "desk-secret", now + 1000)).toBe(true)
    expect(await sessionValid(token, "other-secret", now + 1000)).toBe(false)
    expect(await sessionValid(token, "desk-secret", now + 15 * 24 * 60 * 60 * 1000)).toBe(false)
    expect(await sessionValid("v1.1.bad", "desk-secret", now)).toBe(false)
  })

  it("keeps the second write when the first revision is stale", () => {
    const seed = createLiveState()
    const first = applyLedgerPut({ revision: 3, state: seed }, 3, { ...seed, drafts: [] })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const conflict = applyLedgerPut(first.record, 3, seed)
    expect(conflict.ok).toBe(false)
    if (conflict.ok || conflict.error !== "conflict") return
    expect(conflict.record.revision).toBe(4)
    expect(applyLedgerPut(first.record, 4, { ...seed, drafts: [] }).ok).toBe(true)
  })

  it("rejects a ledger that is not the register shape", () => {
    const seed = createLiveState()
    expect(applyLedgerPut({ revision: 0, state: seed }, 0, { version: 1 }).ok).toBe(false)
  })

  it("login page does not carry contract amounts or the password", () => {
    expect(LOGIN_HTML).toContain("黛玛诗办公楼")
    expect(LOGIN_HTML).not.toContain("张氏")
    expect(LOGIN_HTML).not.toContain("木之易")
    expect(LOGIN_HTML).not.toContain("53050")
    expect(LOGIN_HTML).not.toContain("873942")
    expect(LOGIN_HTML).not.toContain("TRIAL_PASSWORD")
    const worker = readFileSync(new URL("../../worker/index.ts", import.meta.url), "utf8")
    expect(worker).not.toMatch(/TRIAL_PASSWORD\s*=\s*["']/)
  })
})
