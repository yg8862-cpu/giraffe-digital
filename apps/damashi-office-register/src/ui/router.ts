import { useEffect, useState } from "react"

export type Route =
  | { name: "home" }
  | { name: "confirm"; id: string }
  | { name: "contracts"; id?: string }
  | { name: "terms"; id?: string }
  | { name: "payments"; id?: string }
  | { name: "invoices"; id?: string }
  | { name: "settlement"; id?: string }
  | { name: "export" }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean).map(decodeURIComponent)
  const [name, id] = parts
  if (name === "confirm" && id) return { name: "confirm", id }
  if (name === "contracts") return { name: "contracts", id }
  if (name === "terms") return { name: "terms", id }
  if (name === "payments") return { name: "payments", id }
  if (name === "invoices") return { name: "invoices", id }
  if (name === "settlement") return { name: "settlement", id }
  if (name === "export") return { name: "export" }
  return { name: "home" }
}

export function toHash(route: Route): string {
  if (route.name === "home") return "#/"
  if (route.name === "export") return "#/export"
  if (route.name === "terms") return route.id ? `#/terms/${encodeURIComponent(route.id)}` : "#/terms"
  if ("id" in route && route.id) return `#/${route.name}/${encodeURIComponent(route.id)}`
  return `#/${route.name}`
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  const go = (next: Route) => {
    const hash = toHash(next)
    if (window.location.hash === hash) setRoute(next)
    else window.location.hash = hash
  }
  return [route, go]
}
