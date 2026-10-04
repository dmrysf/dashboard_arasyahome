import { useCallback, useEffect, useMemo, useState } from "react";
import { createApi, type DashboardApi } from "../api/client";
import { errorMessage } from "../api/labels";
import type { ManagementMe, Session } from "../api/types";
import { Shell } from "../components/Shell";
import { ChangePasswordPage, LoginPage, NoAccessPage } from "../pages/AuthPages";
import { ApplicationsPage } from "../pages/ApplicationsPage";
import { AuditPage } from "../pages/AuditPage";
import { DepartmentsPage } from "../pages/DepartmentsPage";
import { EmployeeCreatePage } from "../pages/EmployeeCreatePage";
import { EmployeeDetailPage } from "../pages/EmployeeDetailPage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { OverviewPage } from "../pages/OverviewPage";
import { RoleEditorPage } from "../pages/RoleEditorPage";
import { RolesPage } from "../pages/RolesPage";
import { SystemPage } from "../pages/SystemPage";
import { DashboardContext, type DashboardContextValue } from "./context";
import { useRouter, type Route } from "./router";

type State =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string }
  | { kind: "anonymous"; notice?: string }
  | { kind: "password"; session: Session }
  | { kind: "no-access"; session: Session }
  | { kind: "ready"; session: Session; me: ManagementMe };

export function App({ apiBaseUrl }: { apiBaseUrl: string }) {
  const api: DashboardApi = useMemo(() => createApi(apiBaseUrl), [apiBaseUrl]);
  const { route, pathname, navigate } = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  /** The API session is authoritative; the Dashboard only reflects it. */
  const resolve = useCallback(async (session: Session | null, notice?: string) => {
    if (!session) { setState({ kind: "anonymous", notice }); return; }
    if (session.employee.mustChangePassword) { setState({ kind: "password", session }); return; }
    if (!session.employee.applications.includes("dashboard")) { setState({ kind: "no-access", session }); return; }
    const me = await api.me();
    setState({ kind: "ready", session, me });
  }, [api]);

  const bootstrap = useCallback(async (notice?: string) => {
    try { await resolve(await api.getSession(), notice); }
    catch (caught) { setState({ kind: "unavailable", message: errorMessage(caught) }); }
  }, [api, resolve]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => api.onSessionProblem((error) => {
    if (error.code === "SESSION_EXPIRED" || error.code === "NO_SESSION" || error.code === "ACCOUNT_INACTIVE") setState({ kind: "anonymous", notice: errorMessage(error) });
    else void bootstrap();
  }), [api, bootstrap]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* the session is gone either way */ }
    setState({ kind: "anonymous" });
    navigate("/");
  }, [api, navigate]);

  const context = useMemo<DashboardContextValue | null>(() => {
    if (state.kind !== "ready") return null;
    const permissions = new Set(state.me.permissions);
    return {
      api,
      session: state.session,
      me: state.me,
      navigate,
      can: (permission) => state.me.isRoot || permissions.has(permission),
      refreshMe: async () => { await resolve(await api.getSession()); },
    };
  }, [api, navigate, resolve, state]);

  if (state.kind === "loading") return <div className="boot"><span className="brand-mark">A</span><p>Se verifică sesiunea…</p></div>;
  if (state.kind === "unavailable") return <div className="boot" role="alert"><span className="brand-mark">A</span><p>{state.message}</p><button type="button" className="button button-secondary" onClick={() => { setState({ kind: "loading" }); void bootstrap(); }}>Reîncearcă</button></div>;
  if (state.kind === "anonymous") return <LoginPage notice={state.notice} onLogin={async (username, password) => { await resolve(await api.login(username, password)); }} />;
  if (state.kind === "password") return <ChangePasswordPage displayName={state.session.employee.displayName} onLogout={() => { void logout(); }} onChange={async (current, next) => { await resolve(await api.changePassword(current, next)); }} />;
  if (state.kind === "no-access") return <NoAccessPage displayName={state.session.employee.displayName} onLogout={() => { void logout(); }} />;

  return (
    <DashboardContext.Provider value={context}>
      <Shell pathname={pathname} onLogout={() => { void logout(); }}>{renderRoute(route)}</Shell>
    </DashboardContext.Provider>
  );
}

function renderRoute(route: Route) {
  switch (route.name) {
    case "overview": return <OverviewPage />;
    case "employees": return <EmployeesPage />;
    case "employee-new": return <EmployeeCreatePage />;
    case "employee": return <EmployeeDetailPage key={route.id} id={route.id} />;
    case "roles": return <RolesPage />;
    case "role-new": return <RoleEditorPage key="new" />;
    case "role": return <RoleEditorPage key={route.id} id={route.id} />;
    case "departments": return <DepartmentsPage />;
    case "applications": return <ApplicationsPage />;
    case "audit": return <AuditPage />;
    case "system": return <SystemPage />;
    default: return <div className="page"><h1>Pagina nu există</h1><p>Folosește meniul pentru a continua.</p></div>;
  }
}
