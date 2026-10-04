import type {
  Application, AuditPage, Department, EmployeeDetail, EmployeePage, ManagementMe, Overview, Permission, Role, Session, SessionEmployee, SystemStatus, Workflow,
} from "./types";

/** A typed API failure. `code` is the server error code; transport problems use NETWORK_UNAVAILABLE. */
export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message?: string) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

/** Codes after which the app must re-read the central session instead of continuing. */
export const SESSION_CODES = new Set(["SESSION_EXPIRED", "NO_SESSION", "AUTHENTICATION_REQUIRED", "ACCOUNT_INACTIVE"]);
export const ACCESS_CHANGED_CODES = new Set(["APPLICATION_ACCESS_DENIED", "PASSWORD_CHANGE_REQUIRED"]);

type Fetch = typeof fetch;
type Listener = (error: ApiError) => void;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("INVALID_RESPONSE", 502);
  return value as Record<string, unknown>;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new ApiError("INVALID_RESPONSE", 502);
  return value as string[];
}

/** Strict mapping of the central session; anything malformed fails closed. */
export function mapSessionEmployee(value: unknown): SessionEmployee {
  const raw = asObject(value);
  const text = (field: string) => { const v = raw[field]; if (typeof v !== "string" || !v) throw new ApiError("INVALID_RESPONSE", 502); return v; };
  if (typeof raw.isRoot !== "boolean" || typeof raw.mustChangePassword !== "boolean" || typeof raw.authorizationVersion !== "number") throw new ApiError("INVALID_RESPONSE", 502);
  return {
    employeeUuid: text("employeeUuid"),
    displayName: text("displayName"),
    username: text("username"),
    department: text("department"),
    positionTitle: typeof raw.positionTitle === "string" ? raw.positionTitle : null,
    permissions: asStringList(raw.permissions),
    applications: asStringList(raw.applications),
    allowedStageIds: asStringList(raw.allowedStageIds),
    isRoot: raw.isRoot,
    mustChangePassword: raw.mustChangePassword,
    authorizationVersion: raw.authorizationVersion,
  };
}

function mapSession(value: unknown): Session & { csrfToken: string } {
  const raw = asObject(value);
  if (typeof raw.expiresAt !== "string" || typeof raw.csrfToken !== "string" || !raw.csrfToken) throw new ApiError("INVALID_RESPONSE", 502);
  return { employee: mapSessionEmployee(raw.employee), expiresAt: raw.expiresAt, csrfToken: raw.csrfToken };
}

export type DashboardApi = ReturnType<typeof createApi>;

export function createApi(baseUrl: string, fetchImpl: Fetch = (...args) => fetch(...args)) {
  // The CSRF token lives only in memory; the session itself is an HttpOnly cookie owned by the API.
  let csrfToken = "";
  const listeners = new Set<Listener>();

  async function request<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}): Promise<T> {
    const method = init.method ?? "GET";
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(init.query ?? {})) if (value) url.searchParams.set(key, value);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), { method, headers, credentials: "include", cache: "no-store", body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    } catch {
      throw new ApiError("NETWORK_UNAVAILABLE", 0);
    }
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
      const error = payload && typeof payload === "object" ? (payload as { error?: { code?: unknown } }).error : undefined;
      const code = typeof error?.code === "string" ? error.code : response.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED";
      const failure = new ApiError(code, response.status);
      // A rotated session invalidates the in-memory CSRF token; fetch the current one so a deliberate retry works.
      if (code === "CSRF_INVALID" && path !== "/auth/session") void refreshCsrf();
      if (path !== "/auth/login" && path !== "/auth/session" && (SESSION_CODES.has(code) || (ACCESS_CHANGED_CODES.has(code) && path !== "/auth/password"))) {
        if (SESSION_CODES.has(code)) csrfToken = "";
        listeners.forEach((listener) => listener(failure));
      }
      throw failure;
    }
    if (payload === null) throw new ApiError("INVALID_RESPONSE", response.status);
    return payload as T;
  }

  async function refreshCsrf() {
    try { await withSession(request("/auth/session")); } catch { /* the next request reports the real state */ }
  }

  const withSession = async (promise: Promise<unknown>): Promise<Session> => {
    const session = mapSession(await promise);
    csrfToken = session.csrfToken;
    return { employee: session.employee, expiresAt: session.expiresAt };
  };

  return {
    onSessionProblem(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async getSession(): Promise<Session | null> {
      try { return await withSession(request("/auth/session")); }
      catch (error) {
        if (error instanceof ApiError && (error.code === "NO_SESSION" || error.code === "SESSION_EXPIRED")) { csrfToken = ""; return null; }
        throw error;
      }
    },
    login: (username: string, password: string) => withSession(request("/auth/login", { method: "POST", body: { username, password } })),
    changePassword: (currentPassword: string, newPassword: string) => withSession(request("/auth/password", { method: "POST", body: { currentPassword, newPassword } })),
    async logout() {
      try { await request("/auth/logout", { method: "POST" }); }
      finally { csrfToken = ""; }
    },
    health: () => request<{ status: string; version: string }>("/health"),
    me: () => request<ManagementMe>("/management/me"),
    overview: () => request<Overview>("/management/dashboard"),
    system: () => request<SystemStatus>("/management/system"),
    workflow: () => request<Workflow>("/production/workflow"),
    employees: (query: Record<string, string | undefined>) => request<EmployeePage>("/management/employees", { query }),
    employee: (id: string) => request<EmployeeDetail>(`/management/employees/${encodeURIComponent(id)}`),
    createEmployee: (body: {
      displayName: string; username: string; departmentId: number; positionTitle: string | null; managerId: string | null;
      applications: string[]; roleIds: number[]; stageIds: string[]; status: "active" | "inactive";
    }) => request<{ employee: EmployeeDetail; temporaryPassword: string }>("/management/employees", { method: "POST", body }),
    updateEmployee: (id: string, body: { displayName?: string; positionTitle?: string | null; departmentId?: number }) => request<EmployeeDetail>(`/management/employees/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    setEmployeeStatus: (id: string, active: boolean) => request<EmployeeDetail>(`/management/employees/${encodeURIComponent(id)}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    resetPassword: (id: string) => request<{ temporaryPassword: string }>(`/management/employees/${encodeURIComponent(id)}/password-reset`, { method: "POST" }),
    setApplications: (id: string, applications: string[]) => request<EmployeeDetail>(`/management/employees/${encodeURIComponent(id)}/applications`, { method: "PUT", body: { applications } }),
    setRoles: (id: string, roleIds: number[]) => request<EmployeeDetail>(`/management/employees/${encodeURIComponent(id)}/roles`, { method: "PUT", body: { roleIds } }),
    setStages: (id: string, stageIds: string[]) => request<EmployeeDetail>(`/management/employees/${encodeURIComponent(id)}/stages`, { method: "PUT", body: { stageIds } }),
    setManager: (id: string, managerId: string | null) => request<EmployeeDetail>(`/management/employees/${encodeURIComponent(id)}/manager`, { method: "PUT", body: { managerId } }),
    applications: () => request<{ items: Application[] }>("/management/applications"),
    permissions: () => request<{ items: Permission[] }>("/management/permissions"),
    roles: () => request<{ items: Role[] }>("/management/roles"),
    role: (id: number) => request<Role>(`/management/roles/${id}`),
    createRole: (body: { name: string; description: string | null; authorityRank: number; permissions: string[] }) => request<{ role: Role }>("/management/roles", { method: "POST", body }),
    updateRole: (id: number, body: { name?: string; description?: string | null; authorityRank?: number; permissions?: string[]; status?: "active" | "inactive" }) => request<{ role: Role }>(`/management/roles/${id}`, { method: "PATCH", body }),
    deleteRole: (id: number) => request<{ ok: true }>(`/management/roles/${id}`, { method: "DELETE" }),
    departments: () => request<{ items: Department[] }>("/management/departments"),
    createDepartment: (body: { name: string; description: string | null; parentId: number | null }) => request<{ department: Department }>("/management/departments", { method: "POST", body }),
    updateDepartment: (id: number, body: { name?: string; description?: string | null; parentId?: number | null; status?: "active" | "inactive" }) => request<{ department: Department }>(`/management/departments/${id}`, { method: "PATCH", body }),
    deleteDepartment: (id: number) => request<{ ok: true }>(`/management/departments/${id}`, { method: "DELETE" }),
    audit: (query: Record<string, string | undefined>) => request<AuditPage>("/management/audit", { query }),
  };
}
