import { formatMoney, statusBadge } from "../domain/money"
import type { DraftField } from "../domain/types"

export function Pending({ children = "待核" }: { children?: string }) {
  return <span className="pending">{children}</span>
}

export function Money({ value, testId }: { value: number | null; testId?: string }) {
  if (value == null) return <span data-testid={testId}><Pending /></span>
  return (
    <span className="num" data-testid={testId}>
      {formatMoney(value)}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const label = statusBadge(status)
  return (
    <span className={label === "已生效" ? "badge ok" : "badge pending"} data-testid="status-badge">
      {label}
    </span>
  )
}

export function FieldBadge({ field }: { field?: DraftField }) {
  if (!field || field.uncertain || field.value === "待核") {
    return <span className="badge pending">{field?.provenance === "自动提取" ? "待核 · 识别未采用" : "待核"}</span>
  }
  return <span className="badge">{field.provenance}</span>
}

export function SheetAmount({ value }: { value: number | "待填" | "无" | null }) {
  if (value == null) return null
  if (typeof value !== "number") return <span className="pending">{value}</span>
  return <span className="num">{formatMoney(value)}</span>
}
