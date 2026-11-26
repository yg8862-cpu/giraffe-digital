import type { AppState } from "../domain/types"
import { isAppState, type LedgerRecord } from "../server/ledger"

export type SaveResult = { ok: true; revision: number } | { ok: false; message: string; conflict?: LedgerRecord }

async function gate(response: Response): Promise<void> {
  if (response.status === 401) window.location.replace("/login")
}

export async function sessionState(): Promise<"in" | "out" | "local"> {
  let response: Response
  try {
    response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" })
  } catch {
    return "local"
  }
  if (response.status === 404) return "local"
  if (response.status === 401) return "out"
  if (!response.ok) return "local"
  return "in"
}

export async function fetchLedger(): Promise<LedgerRecord> {
  const response = await fetch("/api/ledger", { cache: "no-store", credentials: "same-origin" })
  await gate(response)
  if (!response.ok) throw new Error("ledger")
  const body = (await response.json()) as LedgerRecord
  if (!isAppState(body.state) || typeof body.revision !== "number") throw new Error("ledger")
  return body
}

export async function putLedger(baseRevision: number, state: AppState): Promise<SaveResult> {
  const response = await fetch("/api/ledger", {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseRevision, state }),
  })
  await gate(response)
  if (response.status === 409) {
    const body = (await response.json()) as LedgerRecord
    if (!isAppState(body.state)) return { ok: false, message: "共用台账刚被别人改过，但刷新结果读不出来。请再点一次刷新。" }
    return { ok: false, message: "别人刚写入了台账，已换成最新一份。请再核对刚才没保存上的修改。", conflict: body }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    return { ok: false, message: body?.error || "共用台账没有保存成功。请刷新后再试。" }
  }
  const body = (await response.json()) as LedgerRecord
  return { ok: true, revision: body.revision }
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const response = await fetch(`/api/blobs/${encodeURIComponent(id)}`, {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  })
  await gate(response)
  if (!response.ok) throw new Error("blob")
}

export async function getBlob(id: string): Promise<Blob | null> {
  const response = await fetch(`/api/blobs/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "same-origin" })
  if (response.status === 404) return null
  await gate(response)
  if (!response.ok) return null
  return response.blob()
}

export async function endSession(): Promise<void> {
  await fetch("/api/session", { method: "DELETE", credentials: "same-origin" })
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }
  if ("caches" in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
  window.location.replace("/login")
}
