import type { AppState } from "../domain/types"

export type LedgerRecord = {
  revision: number
  state: AppState
}

export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false
  const state = value as AppState
  return (
    state.version === 1 &&
    Array.isArray(state.contracts) &&
    Array.isArray(state.terms) &&
    Array.isArray(state.payments) &&
    Array.isArray(state.invoices) &&
    Array.isArray(state.lines) &&
    Array.isArray(state.drafts)
  )
}

export function applyLedgerPut(
  current: LedgerRecord,
  baseRevision: number,
  next: unknown,
): { ok: true; record: LedgerRecord } | { ok: false; error: "conflict"; record: LedgerRecord } | { ok: false; error: "invalid" } {
  if (!isAppState(next)) return { ok: false, error: "invalid" }
  if (!Number.isSafeInteger(baseRevision) || current.revision !== baseRevision) {
    return { ok: false, error: "conflict", record: current }
  }
  return { ok: true, record: { revision: current.revision + 1, state: next } }
}
