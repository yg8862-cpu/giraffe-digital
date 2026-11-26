const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"]
const UNITS = ["", "拾", "佰", "仟"]
const GROUPS = ["", "万", "亿"]

export function toCents(n: number): number {
  return Math.round(Number((n * 100).toFixed(6)))
}

export function round2(n: number): number {
  return toCents(n) / 100
}

export function mulMoney(qty: number, price: number): number {
  const q = Math.round(qty * 10000)
  const p = Math.round(price * 100)
  return Math.round(q * p / 10000) / 100
}

export function sumMoney(values: number[]): number {
  return values.reduce((sum, n) => sum + toCents(n), 0) / 100
}

export function formatMoney(n: number): string {
  const neg = n < 0
  const [whole, frac] = Math.abs(n).toFixed(2).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${neg ? "-" : ""}${grouped}.${frac}`
}

export function formatQty(n: number): string {
  const rounded = Math.round(n * 10000) / 10000
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

export function formatAmount(value: number | null): string {
  if (value == null) return "待核"
  return formatMoney(value)
}

export function parseAmount(input: string): number | null {
  const text = input.trim().replace(/,/g, "").replace(/，/g, "").replace(/元/g, "").replace(/人民币/g, "").replace(/￥/g, "").replace(/¥/g, "")
  if (!text || text === "待核" || text === "无此阶段" || text === "待填" || text === "无") return null
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return round2(n)
}

export function scrub(input: string): string {
  return input.replace(new RegExp(String.fromCodePoint(0x9ee4), "g"), "〔待核〕")
}

export function statusBadge(status: string): "已生效" | "签署待核" {
  if (status === "已生效") return "已生效"
  return "签署待核"
}

export function todayShanghai(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

function section(n: number): string {
  let text = ""
  let zero = false
  for (let i = 3; i >= 0; i--) {
    const digit = Math.floor(n / 10 ** i) % 10
    if (digit === 0) {
      if (text) zero = true
    } else {
      if (zero) text += "零"
      zero = false
      text += DIGITS[digit] + UNITS[i]
    }
  }
  return text
}

function integerToCn(yuan: number): string {
  if (yuan === 0) return "零"
  const parts: string[] = []
  let n = yuan
  let needZero = false
  for (let group = 0; group < GROUPS.length && n > 0; group++) {
    const sec = n % 10000
    if (sec === 0) {
      needZero = parts.length > 0
    } else {
      if (needZero && parts.length) parts[0] = `零${parts[0]}`
      parts.unshift(section(sec) + GROUPS[group])
      needZero = sec < 1000
    }
    n = Math.floor(n / 10000)
  }
  return parts.join("").replace(/零+/g, "零")
}

export function rmbUppercase(amount: number): string {
  if (!Number.isFinite(amount)) return "待核"
  const negative = amount < 0
  const cents = Math.abs(toCents(amount))
  const yuan = Math.floor(cents / 100)
  const jiao = Math.floor((cents % 100) / 10)
  const fen = cents % 10
  let decimal = ""
  if (jiao === 0 && fen === 0) decimal = "整"
  else {
    if (jiao > 0) decimal += `${DIGITS[jiao]}角`
    if (jiao === 0 && fen > 0 && yuan > 0) decimal += "零"
    if (fen > 0) decimal += `${DIGITS[fen]}分`
  }
  return `${negative ? "负" : ""}${integerToCn(yuan)}元${decimal}`
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
