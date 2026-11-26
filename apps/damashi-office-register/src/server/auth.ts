const encoder = new TextEncoder()

export async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ])
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let text = ""
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte)
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return bytesToBase64Url(signature)
}

const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60

export async function issueSession(secret: string, now = Date.now()): Promise<string> {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS
  const payload = `v1.${expires}`
  return `${payload}.${await sign(secret, payload)}`
}

export async function sessionValid(token: string, secret: string, now = Date.now()): Promise<boolean> {
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== "v1") return false
  const expires = Number(parts[1])
  if (!Number.isSafeInteger(expires) || expires * 1000 <= now) return false
  const expected = await sign(secret, `${parts[0]}.${parts[1]}`)
  return sameSecret(parts[2] ?? "", expected)
}

export function sessionCookie(token: string, secure: boolean): string {
  const flags = ["HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${SESSION_TTL_SECONDS}`]
  if (secure) flags.push("Secure")
  return `office_session=${token}; ${flags.join("; ")}`
}

export function clearSessionCookie(secure: boolean): string {
  const flags = ["HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"]
  if (secure) flags.push("Secure")
  return `office_session=; ${flags.join("; ")}`
}

export function readCookie(header: string | null, name: string): string {
  if (!header) return ""
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return rest.join("=")
  }
  return ""
}
