import { useCallback, useEffect, useState } from "react";

export type Route =
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
  | { name: "not-found" };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "overview" };
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
