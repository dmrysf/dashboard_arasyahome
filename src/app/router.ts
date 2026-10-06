import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "analytics"; section: "employees" | "departments" | "managers" | "sources" | "companies" | "orders" | "policy"; id?: string }
  | { name: "overview" }
  | { name: "orders" }
  | { name: "order"; id: string }
  | { name: "employees" }
  | { name: "employee-new" }
  | { name: "employee"; id: string }
  | { name: "roles" }
  | { name: "role-new" }
  | { name: "role"; id: number }
  | { name: "departments" }
  | { name: "applications" }
  | { name: "audit" }
  | { name: "system" }
  | { name: "approvals"; view: "pending" | "waiting" | "mine" }
  | { name: "approval"; id: string }
  | { name: "order-search" }
  | { name: "order-lookup"; id: string }
  | { name: "organization" }
  | { name: "production-settings" }
  | { name: "display-devices" }
  | { name: "transfer"; id: string }
  | { name: "not-found" };

export function parseRoute(pathname: string): Route {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "overview" };
  const analytics = /^\/analiza\/(angajati|departamente|aprobari|surse|firme|comenzi|politica)(?:\/([0-9a-f-]{36}))?$/.exec(path);
  if (analytics) {
    const sections = { angajati: "employees", departamente: "departments", aprobari: "managers", surse: "sources", firme: "companies", comenzi: "orders", politica: "policy" } as const;
    const section = sections[analytics[1] as keyof typeof sections];
    if (analytics[2] && !["employees", "companies", "orders"].includes(section)) return { name: "not-found" };
    return { name: "analytics", section, ...(analytics[2] ? { id: analytics[2] } : {}) };
  }
  if (path === "/comenzi") return { name: "orders" };
  const order = /^\/comenzi\/([^/]{1,600})$/.exec(path);
  if (order) {
    try { return { name: "order", id: decodeURIComponent(order[1]) }; } catch { return { name: "not-found" }; }
  }
  if (path === "/angajati") return { name: "employees" };
  if (path === "/angajati/nou") return { name: "employee-new" };
  const employee = /^\/angajati\/([0-9a-f-]{36})$/.exec(path);
  if (employee) return { name: "employee", id: employee[1] };
  if (path === "/roluri") return { name: "roles" };
  if (path === "/roluri/nou") return { name: "role-new" };
  const role = /^\/roluri\/(\d{1,10})$/.exec(path);
  if (role) return { name: "role", id: Number(role[1]) };
  if (path === "/departamente") return { name: "departments" };
  if (path === "/aplicatii") return { name: "applications" };
  if (path === "/audit") return { name: "audit" };
  if (path === "/sistem") return { name: "system" };
  if (path === "/aprobari") return { name: "approvals", view: "pending" };
  const transfer = /^\/aprobari\/transfer\/([0-9a-f-]{36})$/.exec(path);
  if (transfer) return { name: "transfer", id: transfer[1] };
  if (path === "/dispozitive-afisare") return { name: "display-devices" };
  if (path === "/aprobari/in-asteptare") return { name: "approvals", view: "waiting" };
  if (path === "/aprobari/istoric") return { name: "approvals", view: "mine" };
  const approval = /^\/aprobari\/cerere\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(path);
  if (approval) return { name: "approval", id: approval[1] };
  if (path === "/cauta-comanda") return { name: "order-search" };
  const lookup = /^\/cauta-comanda\/([^/]{1,600})$/.exec(path);
  if (lookup) {
    try { return { name: "order-lookup", id: decodeURIComponent(lookup[1]) }; } catch { return { name: "not-found" }; }
  }
  if (path === "/organizatie") return { name: "organization" };
  if (path === "/setari-productie") return { name: "production-settings" };
  return { name: "not-found" };
}

export function useRouter() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0 });
  }, []);
  return { route: parseRoute(pathname), pathname, navigate };
}

/** Dashboard path of one order; the source-aware global id is the identity, never the bare order number. */
export const orderPath = (globalOrderId: string) => `/comenzi/${encodeURIComponent(globalOrderId)}`;
