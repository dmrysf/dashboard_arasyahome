import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, createApi, SESSION_CODES, type DashboardApi } from "../api/client";
import type { Session } from "../api/types";
import { Shell } from "../components/Shell";
import { useI18n } from "../i18n/context";
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
import { resolveSession, restoreSession, type AppState } from "./session";

export function App({ apiBaseUrl }: { apiBaseUrl: string }) {
  const api: DashboardApi = useMemo(() => createApi(apiBaseUrl), [apiBaseUrl]);
  const { route, pathname, navigate } = useRouter();
  const { t, problem } = useI18n();
  const [state, setState] = useState<AppState>({ kind: "loading" });

  const restore = useCallback((notice?: ApiError) => { void restoreSession(api, notice).then(setState); }, [api]);
  const accept = useCallback(async (session: Promise<Session>) => { setState(await resolveSession(api, await session)); }, [api]);

  useEffect(() => { restore(); }, [restore]);
  useEffect(() => api.onSessionProblem((error) => {
    if (SESSION_CODES.has(error.code)) setState({ kind: "anonymous", notice: error });
    else restore();
  }), [api, restore]);

  // Authorization can change at any time from another administrator. Re-read the central session when the
  // tab becomes visible and once a minute; a new authorization version re-reads the management profile.
  const readyVersion = state.kind === "ready" ? state.session.employee.authorizationVersion : null;
  useEffect(() => {
    if (readyVersion === null) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      api.getSession().then((session) => {
        if (!session || session.employee.authorizationVersion !== readyVersion || session.employee.mustChangePassword || !session.employee.applications.includes("dashboard")) {
          void resolveSession(api, session, session ? undefined : new ApiError("SESSION_EXPIRED", 401)).then(setState, () => restore());
        }
      }, () => { /* transport problems surface on the next real request */ });
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [api, readyVersion, restore]);

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
    };
  }, [api, navigate, state]);

  if (state.kind === "loading") return <div className="boot"><span className="brand-mark">A</span><p>{t.app.checkingSession}</p></div>;
  if (state.kind === "unavailable") return <div className="boot" role="alert"><span className="brand-mark">A</span><p>{problem(state.problem)}</p><button type="button" className="button button-secondary" onClick={() => { setState({ kind: "loading" }); restore(); }}>{t.common.retry}</button></div>;
  if (state.kind === "anonymous") return <LoginPage notice={state.notice} onLogin={(username, password) => accept(api.login(username, password))} />;
  if (state.kind === "password") return <ChangePasswordPage displayName={state.session.employee.displayName} onLogout={() => { void logout(); }} onChange={(current, next) => accept(api.changePassword(current, next))} />;
  if (state.kind === "no-access") return <NoAccessPage displayName={state.session.employee.displayName} onLogout={() => { void logout(); }} />;

  return (
    <DashboardContext.Provider value={context}>
      <Shell pathname={pathname} onLogout={() => { void logout(); }}>{renderRoute(route)}</Shell>
    </DashboardContext.Provider>
  );
}

function NotFound() {
  const { t } = useI18n();
  return <div className="page"><h1>{t.app.notFoundTitle}</h1><p>{t.app.notFoundHint}</p></div>;
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
    default: return <NotFound />;
  }
}
