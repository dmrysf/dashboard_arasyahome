import type { EmployeeDetail, ManagementMe, Permission, Role, SessionEmployee } from "../src/api/types";

export const API = "https://api.arasyahome.ro";

export function sessionEmployee(overrides: Partial<SessionEmployee> = {}): SessionEmployee {
  return {
    employeeUuid: "11111111-1111-4111-8111-111111111111",
    displayName: "Maria Ionescu",
    username: "maria.ionescu",
    department: "Administrație",
    positionTitle: "Director operațional",
    permissions: ["dashboard.access", "employees.view"],
    applications: ["dashboard"],
    allowedStageIds: [],
    isRoot: false,
    mustChangePassword: false,
    authorizationVersion: 3,
    ...overrides,
  };
}

/** The exact /auth/session payload shape of Operations API 2.3.0 (EmployeeSerializer::safe). */
export function sessionPayload(employee: Partial<SessionEmployee> = {}, csrfToken = "csrf-token-1") {
  const value = sessionEmployee(employee);
  return {
    employee: { ...value, employeeCode: null, departmentKey: "administratie", role: "employee", status: "active", roles: [], locale: "ro" },
    expiresAt: "2026-10-04T20:00:00+00:00",
    csrfToken,
  };
}

export function me(overrides: Partial<ManagementMe> = {}): ManagementMe {
  return {
    employee: { id: "11111111-1111-4111-8111-111111111111", username: "maria.ionescu", displayName: "Maria Ionescu", positionTitle: "Director operațional", department: "Administrație" },
    isRoot: false,
    authorityRank: 700,
    permissions: ["dashboard.access", "employees.view", "employees.update", "employees.manage_applications", "employees.manage_roles", "roles.assign", "employees.manage_stages", "employees.deactivate", "employees.activate", "employees.reset_password", "employees.manage_hierarchy", "roles.view"],
    grantablePermissions: ["employees.view"],
    applications: ["staff", "dashboard"],
    authorizationVersion: 3,
    ...overrides,
  };
}

export function employee(overrides: Partial<EmployeeDetail> = {}): EmployeeDetail {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    username: "ion.popescu",
    displayName: "Ion Popescu",
    positionTitle: "Croitor",
    status: "active",
    isRoot: false,
    department: { id: 2, name: "Producție" },
    manager: null,
    applications: ["staff"],
    roles: [{ id: 5, key: "employee", name: "Angajat", authorityRank: 100, status: "active" }],
    stageIds: ["material-preparation"],
    mustChangePassword: false,
    authorizationVersion: 4,
    lastLoginAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    manageable: true,
    rolePermissions: ["orders.view_mine"],
    ...overrides,
  };
}

export function root(): EmployeeDetail {
  return employee({
    id: "33333333-3333-4333-8333-333333333333",
    username: "arasya.root.owner",
    displayName: "Administrator principal",
    positionTitle: "Administrator principal",
    isRoot: true,
    applications: ["staff", "dashboard"],
    roles: [],
    stageIds: [],
    manageable: false,
    rolePermissions: ["*"],
  });
}

export function role(overrides: Partial<Role> = {}): Role {
  return { id: 5, key: "employee", name: "Angajat", description: null, authorityRank: 100, isTemplate: true, status: "active", userCount: 3, permissionCount: 1, permissions: ["orders.view_mine"], manageable: true, ...overrides };
}

export function permission(overrides: Partial<Permission> = {}): Permission {
  return { key: "employees.view", category: "employees", label: "Vizualizare angajați", description: "", roleGrantable: true, grantableByMe: true, ...overrides };
}

export type Call = { url: URL; method: string; headers: Record<string, string>; body: unknown; credentials?: RequestCredentials };

/** A scripted fetch: each handler answers one request and every request is recorded for assertions. */
export function fakeFetch(handler: (call: Call) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: new URL(String(input)),
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      credentials: init.credentials,
    };
    calls.push(call);
    const answer = await handler(call);
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function apiError(code: string, status: number) {
  return { status, body: { error: { code, message: "server-side English text that must never be shown", requestId: "req-1" } } };
}
