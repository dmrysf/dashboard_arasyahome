import type {
  Application, AuditPage, Department, EligibleOwners, EmployeeDetail, EmployeePage, ExceptionDetail, ExceptionSummary, LookupDetail, LookupMatch, ManagementMe, OrderDetail, OrderPage, Organization, OwnerChange, Overview, Permission, ProductionOverview, ProductionSettings, Role, Session, SessionEmployee, SystemStatus, WorkingDay, Workflow,
} from "./types";
import type { CuttingTransfer, DisplayDevice, DisplayPairing, DisplaySettings } from "./cutting";
import type { AnalyticsPolicy } from "./analytics";

/**
 * A fresh Idempotency-Key for one user-confirmed mutation. Reusing it for a retry of the same submission lets
 * the server replay the committed result instead of applying the change twice.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return `dash-${crypto.randomUUID()}`;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `dash-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

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

  async function request<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | undefined>; signal?: AbortSignal; idempotencyKey?: string } = {}): Promise<T> {
    const method = init.method ?? "GET";
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(init.query ?? {})) if (value) url.searchParams.set(key, value);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), { method, headers, credentials: "include", cache: "no-store", signal: init.signal, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    } catch (caught) {
      if (init.signal?.aborted) throw caught;
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
    cuttingTransfers: (view: "pending" | "waiting" | "mine", signal?: AbortSignal) => request<{ items: CuttingTransfer[] }>("/management/cutting/transfers", { query: { view }, signal }),
    cuttingTransfer: (id: string, signal?: AbortSignal) => request<CuttingTransfer>(`/management/cutting/transfers/${encodeURIComponent(id)}`, { signal }),
    decideTransfer: (id: string, body: { expectedVersion: number; decision: "approve" | "reject"; comment?: string }, key: string) => request<CuttingTransfer>(`/management/cutting/transfers/${encodeURIComponent(id)}/decision`, { method: "POST", body, idempotencyKey: key }),
    cancelTransfer: (id: string, expectedVersion: number, comment: string, key: string) => request<CuttingTransfer>(`/management/cutting/transfers/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { expectedVersion, comment }, idempotencyKey: key }),
    displayDevices: (signal?: AbortSignal) => request<{ items: DisplayDevice[]; settings: DisplaySettings }>("/management/cutting/devices", { signal }),
    createDisplay: (name: string, key: string) => request<DisplayPairing>("/management/cutting/devices", { method: "POST", body: { name }, idempotencyKey: key }),
    repairDisplay: (id: string, key: string) => request<DisplayPairing>(`/management/cutting/devices/${encodeURIComponent(id)}/re-pair`, { method: "POST", body: { confirmed: true }, idempotencyKey: key }),
    revokeDisplay: (id: string, key: string) => request<{ revoked: boolean }>(`/management/cutting/devices/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { confirmed: true }, idempotencyKey: key }),
    displayThresholds: (expectedVersion: number, thresholds: number[], key: string) => request<DisplaySettings>("/management/cutting/thresholds", { method: "PUT", body: { expectedVersion, thresholds }, idempotencyKey: key }),
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
    analytics: <T>(section: string, query: Record<string, string | undefined>, signal?: AbortSignal) => request<T>(`/management/analytics/${section}`, { query, signal }),
    analyticsPolicy: (signal?: AbortSignal) => request<AnalyticsPolicy>("/management/analytics/policy", { signal }),
    updateAnalyticsPolicy: (body: { approvalGraceMinutes: number; expectedVersion: number }, key: string) => request<AnalyticsPolicy>("/management/analytics/policy", { method: "PUT", body, idempotencyKey: key }),
    overview: () => request<Overview>("/management/dashboard"),
    orders: (query: Record<string, string | undefined>, signal?: AbortSignal) => request<OrderPage>("/management/orders", { query, signal }),
    order: (globalOrderId: string, signal?: AbortSignal) => request<OrderDetail>(`/management/orders/${encodeURIComponent(globalOrderId)}`, { signal }),
    eligibleOwners: (globalOrderId: string, signal?: AbortSignal) => request<EligibleOwners>(`/management/orders/${encodeURIComponent(globalOrderId)}/eligible-owners`, { signal }),
    /** Owner interventions change internal production ownership only. The key makes a browser retry safe. */
    releaseOwner: (globalOrderId: string, expectedVersion: number, idempotencyKey: string) => request<OwnerChange>(`/management/orders/${encodeURIComponent(globalOrderId)}/release-owner`, { method: "POST", body: { expectedVersion }, idempotencyKey }),
    reassignOwner: (globalOrderId: string, employeeId: string, expectedVersion: number, idempotencyKey: string) => request<OwnerChange>(`/management/orders/${encodeURIComponent(globalOrderId)}/owner`, { method: "PUT", body: { employeeId, expectedVersion }, idempotencyKey }),
    productionOverview: (source: string | undefined, signal?: AbortSignal) => request<ProductionOverview>("/management/production-overview", { query: { source }, signal }),
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
    // Production exceptions (approvals). Every decision carries the version the manager saw and an idempotency key.
    exceptions: (view: "pending" | "waiting" | "mine", signal?: AbortSignal) => request<{ items: ExceptionSummary[] }>("/management/production-exceptions", { query: { view }, signal }),
    exception: (id: string, signal?: AbortSignal) => request<ExceptionDetail>(`/management/production-exceptions/${encodeURIComponent(id)}`, { signal }),
    decideException: (id: string, body: { expectedVersion: number; decision: "approve" | "reject"; comment?: string }, idempotencyKey: string) => request<ExceptionDetail>(`/management/production-exceptions/${encodeURIComponent(id)}/decision`, { method: "POST", body, idempotencyKey }),
    cancelException: (id: string, body: { expectedVersion: number; reason: string }, idempotencyKey: string) => request<ExceptionDetail>(`/management/production-exceptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body, idempotencyKey }),
    lookupOrders: (number: string) => request<{ items: LookupMatch[] }>("/management/order-lookup", { query: { number } }),
    lookupOrder: (globalOrderId: string, signal?: AbortSignal) => request<LookupDetail>(`/management/order-lookup/${encodeURIComponent(globalOrderId)}`, { signal }),
    organization: () => request<Organization>("/management/organization"),
    designateCeo: (employeeId: string, idempotencyKey: string) => request<Organization>("/management/organization/ceo", { method: "PUT", body: { employeeId }, idempotencyKey }),
    setWorkingHours: (days: WorkingDay[], idempotencyKey: string) => request<Organization>("/management/organization/working-hours", { method: "PUT", body: { days }, idempotencyKey }),
    assignResponsibility: (body: { responsibility: string; employeeId: string; startsAt?: string | null; endsAt?: string | null; note?: string | null }, idempotencyKey: string) => request<Organization>("/management/organization/responsibilities", { method: "POST", body, idempotencyKey }),
    revokeResponsibility: (id: string, reason: string | null, idempotencyKey: string) => request<Organization>(`/management/organization/responsibilities/${encodeURIComponent(id)}/revoke`, { method: "POST", body: reason ? { reason } : {}, idempotencyKey }),
    productionSettings: () => request<ProductionSettings>("/management/production-settings"),
    createReason: (body: { key: string; label: string; requiresComment: boolean; sortOrder: number }, idempotencyKey: string) => request<ProductionSettings>("/management/production-settings/reasons", { method: "POST", body, idempotencyKey }),
    updateReason: (key: string, body: { label?: string; requiresComment?: boolean; status?: "active" | "inactive"; sortOrder?: number }, idempotencyKey: string) => request<ProductionSettings>(`/management/production-settings/reasons/${encodeURIComponent(key)}`, { method: "PATCH", body, idempotencyKey }),
    renameStage: (stageId: string, label: string, idempotencyKey: string) => request<ProductionSettings>(`/management/production-settings/stages/${encodeURIComponent(stageId)}`, { method: "PATCH", body: { label }, idempotencyKey }),
    /** One batch of the authenticated live event stream (text/event-stream), answered by the API at once. */
    async liveEvents(after: number | null, signal: AbortSignal): Promise<{ status: number; text: string }> {
      const url = new URL("/live/events", baseUrl);
      if (after !== null) url.searchParams.set("after", String(after));
      const response = await fetchImpl(url.toString(), { method: "GET", headers: { Accept: "text/event-stream" }, credentials: "include", cache: "no-store", signal });
      if (response.status === 401) listeners.forEach((listener) => listener(new ApiError("SESSION_EXPIRED", 401)));
      return { status: response.status, text: response.ok ? await response.text() : "" };
    },
  };
}
