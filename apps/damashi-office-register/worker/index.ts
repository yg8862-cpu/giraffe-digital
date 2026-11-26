import { DurableObject } from "cloudflare:workers"
import { createLiveState } from "../src/domain/seed"
import type { AppState } from "../src/domain/types"
import { clearSessionCookie, issueSession, readCookie, sameSecret, sessionCookie, sessionValid } from "../src/server/auth"
import { applyLedgerPut, isAppState, type LedgerRecord } from "../src/server/ledger"
import { LOGIN_HTML } from "../src/server/login-page"
import { packedAssets } from "./packed"

const CHUNK = 512 * 1024
const MAX_BLOB = 20 * 1024 * 1024
const MAX_LEDGER = 6_000_000

type TrialEnv = {
  ASSETS: Fetcher
  LEDGER: DurableObjectNamespace<Ledger>
  TRIAL_PASSWORD?: string
}

type BlobMeta = { type: string; size: number; parts: number }

export class Ledger extends DurableObject<TrialEnv> {
  constructor(ctx: DurableObjectState, env: TrialEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(() => this.ensureSeed())
  }

  private async ensureSeed(): Promise<void> {
    const existing = await this.ctx.storage.get<LedgerRecord>("ledger")
    if (existing && isAppState(existing.state)) return
    await this.ctx.storage.put<LedgerRecord>("ledger", { revision: 0, state: createLiveState() })
  }

  async read(): Promise<LedgerRecord> {
    const current = await this.ctx.storage.get<LedgerRecord>("ledger")
    if (current && isAppState(current.state)) return current
    const seeded = { revision: 0, state: createLiveState() }
    await this.ctx.storage.put<LedgerRecord>("ledger", seeded)
    return seeded
  }

  async write(baseRevision: number, state: unknown): Promise<{ status: number; record?: LedgerRecord; error?: string }> {
    return await this.ctx.storage.transaction(async (txn) => {
      const current = (await txn.get<LedgerRecord>("ledger")) ?? { revision: 0, state: createLiveState() }
      const result = applyLedgerPut(current, baseRevision, state)
      if (!result.ok && result.error === "invalid") return { status: 400, error: "台账格式不对，没有保存。" }
      if (!result.ok) return { status: 409, record: result.record }
      await txn.put("ledger", result.record)
      return { status: 200, record: result.record }
    })
  }

  async saveBlob(id: string, type: string, bytes: ArrayBuffer): Promise<void> {
    const parts = Math.max(1, Math.ceil(bytes.byteLength / CHUNK))
    await this.ctx.storage.transaction(async (txn) => {
      const previous = await txn.get<BlobMeta>(`blobmeta:${id}`)
      if (previous) {
        for (let index = 0; index < previous.parts; index += 1) await txn.delete(`blob:${id}:${index}`)
      }
      for (let index = 0; index < parts; index += 1) {
        const start = index * CHUNK
        await txn.put(`blob:${id}:${index}`, bytes.slice(start, Math.min(bytes.byteLength, start + CHUNK)))
      }
      await txn.put<BlobMeta>(`blobmeta:${id}`, { type, size: bytes.byteLength, parts })
    })
  }

  async openBlob(id: string): Promise<{ type: string; bytes: Uint8Array } | null> {
    const meta = await this.ctx.storage.get<BlobMeta>(`blobmeta:${id}`)
    if (!meta) return null
    const out = new Uint8Array(meta.size)
    let offset = 0
    for (let index = 0; index < meta.parts; index += 1) {
      const part = await this.ctx.storage.get<ArrayBuffer>(`blob:${id}:${index}`)
      if (!part) return null
      const bytes = new Uint8Array(part)
      out.set(bytes, offset)
      offset += bytes.byteLength
    }
    return { type: meta.type || "application/octet-stream", bytes: out }
  }
}

function stub(env: TrialEnv): DurableObjectStub<Ledger> {
  return env.LEDGER.getByName("office")
}

function headers(extra?: HeadersInit): Headers {
  const out = new Headers(extra)
  out.set("X-Robots-Tag", "noindex, nofollow, noarchive")
  out.set("Referrer-Policy", "no-referrer")
  out.set("X-Content-Type-Options", "nosniff")
  out.set("Cache-Control", "private, no-store")
  return out
}

function json(body: unknown, status: number, extra?: HeadersInit): Response {
  return Response.json(body, { status, headers: headers(extra) })
}

async function authorized(request: Request, env: TrialEnv): Promise<boolean> {
  const secret = env.TRIAL_PASSWORD
  if (!secret) return false
  const token = readCookie(request.headers.get("cookie"), "office_session")
  if (!token) return false
  return sessionValid(token, secret)
}

function secure(request: Request): boolean {
  return new URL(request.url).protocol === "https:"
}

async function session(request: Request, env: TrialEnv): Promise<Response> {
  if (request.method === "GET") {
    return json({ ok: await authorized(request, env) }, (await authorized(request, env)) ? 200 : 401)
  }
  if (request.method === "DELETE") {
    return new Response(null, { status: 204, headers: headers({ "Set-Cookie": clearSessionCookie(secure(request)) }) })
  }
  if (request.method !== "POST") return json({ error: "不支持的方法" }, 405)
  const secret = env.TRIAL_PASSWORD
  if (!secret) return json({ error: "试用密码还没配置" }, 503)
  let password = ""
  try {
    const body = (await request.json()) as { password?: unknown }
    if (typeof body.password !== "string" || body.password.length > 200) return json({ error: "密码不对" }, 401)
    password = body.password
  } catch {
    return json({ error: "密码不对" }, 401)
  }
  const ok = await sameSecret(password, secret)
  if (!ok) return json({ error: "密码不对" }, 401)
  const token = await issueSession(secret)
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, secure(request)) })
}

function blobId(pathname: string): string | null {
  const id = decodeURIComponent(pathname.slice("/api/blobs/".length))
  if (!/^[\w:.-]{1,120}$/.test(id)) return null
  return id
}

async function ledger(request: Request, env: TrialEnv): Promise<Response> {
  const book = stub(env)
  if (request.method === "GET") return json(await book.read(), 200)
  if (request.method !== "PUT") return json({ error: "不支持的方法" }, 405)
  const raw = await request.text()
  if (raw.length > MAX_LEDGER) return json({ error: "台账太大，没有保存。" }, 413)
  let body: { baseRevision?: unknown; state?: unknown }
  try {
    body = JSON.parse(raw) as { baseRevision?: unknown; state?: unknown }
  } catch {
    return json({ error: "台账格式不对，没有保存。" }, 400)
  }
  if (typeof body.baseRevision !== "number") return json({ error: "台账格式不对，没有保存。" }, 400)
  const saved = await book.write(body.baseRevision, body.state)
  if (saved.status === 400) return json({ error: saved.error }, 400)
  return json(saved.record, saved.status)
}

async function blobs(request: Request, env: TrialEnv): Promise<Response> {
  const id = blobId(new URL(request.url).pathname)
  if (!id) return json({ error: "文件编号不对" }, 400)
  const book = stub(env)
  if (request.method === "GET") {
    const file = await book.openBlob(id)
    if (!file) return json({ error: "没有这个文件" }, 404)
    return new Response(file.bytes, { headers: headers({ "content-type": file.type }) })
  }
  if (request.method !== "PUT") return json({ error: "不支持的方法" }, 405)
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > MAX_BLOB) return json({ error: "文件超过 20MB，没有保存。" }, 413)
  const type = request.headers.get("content-type") || "application/octet-stream"
  await book.saveBlob(id, type.slice(0, 120), bytes)
  return json({ ok: true }, 200)
}

export default {
  async fetch(request: Request, env: TrialEnv): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", { headers: headers({ "content-type": "text/plain; charset=utf-8" }) })
    }
    if (url.pathname === "/api/session") return session(request, env)
    if (url.pathname === "/login") {
      if (await authorized(request, env)) return Response.redirect(new URL("/", url), 302)
      return new Response(LOGIN_HTML, { headers: headers({ "content-type": "text/html; charset=utf-8" }) })
    }
    const ok = await authorized(request, env)
    if (!ok) {
      if (url.pathname.startsWith("/api/")) return json({ error: "需要试用密码" }, 401)
      const accept = request.headers.get("accept") ?? ""
      const document = request.mode === "navigate" || accept.includes("text/html")
      if (!document) return new Response("需要试用密码", { status: 401, headers: headers({ "content-type": "text/plain; charset=utf-8" }) })
      return Response.redirect(new URL("/login", url), 302)
    }
    if (url.pathname === "/api/ledger") return ledger(request, env)
    if (url.pathname.startsWith("/api/blobs/")) return blobs(request, env)
    const assetPath = url.pathname === "/" ? "/index.html" : url.pathname
    const packed = packedAssets?.[assetPath]
    if (packed) {
      const body = packed.encoding === "base64" ? Uint8Array.from(atob(packed.body), (char) => char.charCodeAt(0)) : packed.body
      return new Response(body, { headers: headers({ "content-type": packed.type }) })
    }
    if (!env.ASSETS) return new Response("没有这个页面", { status: 404, headers: headers({ "content-type": "text/plain; charset=utf-8" }) })
    const assetUrl = new URL(assetPath, url)
    const asset = await env.ASSETS.fetch(new Request(assetUrl, request))
    if (asset.status >= 300 && asset.status < 400) {
      const location = asset.headers.get("location")
      if (location) return env.ASSETS.fetch(new Request(new URL(location, url), request))
    }
    return asset
  },
}
