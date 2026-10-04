import type { Page, Route } from "@playwright/test";

export const API = "https://api.arasyahome.ro";

type Employee = Record<string, unknown> & { id: string; username: string; displayName: string; isRoot: boolean; applications: string[]; stageIds: string[]; status: string };

const ROOT_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ION_ID = "22222222-2222-4222-8222-222222222222";

const stages = [
  { id: "material-preparation", ordinal: 1, label: "Pregătire material" },
  { id: "sewing", ordinal: 2, label: "Confecționare" },
];

function summary(overrides: Partial<Employee>): Employee {
  return {
    id: ION_ID, username: "ion.popescu", displayName: "Ion Popescu", positionTitle: "Croitor", status: "active", isRoot: false,
    department: { id: 2, name: "Producție" }, manager: null, applications: ["staff"], roles: [], stageIds: [], mustChangePassword: false,
    authorizationVersion: 1, lastLoginAt: null, createdAt: "2026-10-01T08:00:00.000Z", manageable: true, rolePermissions: [], ...overrides,
  };
}

export type MockOptions = { mustChangePassword?: boolean; applications?: string[]; rejectApplicationsWith?: string };

/**
 * A stateful in-memory Operations API. It mirrors the 2.3.0 response shapes and records every mutation,
 * so tests can prove that nothing is written before an explicit confirmation.
 */
export async function mockApi(page: Page, options: MockOptions = {}) {
  const state = {
    loggedIn: false,
    mustChangePassword: options.mustChangePassword ?? false,
    applications: options.applications ?? ["staff", "dashboard"],
    requests: [] as string[],
    mutations: [] as Array<{ method: string; path: string; body: unknown; csrf: string | undefined }>,
    employees: [
      summary({ id: ROOT_ID, username: "arasya.root.owner", displayName: "Administrator principal", positionTitle: "Administrator principal", isRoot: true, applications: ["staff", "dashboard"], manageable: false, rolePermissions: ["*"], department: { id: 1, name: "Administrație" } }),
      summary({ id: ADMIN_ID, username: "maria.ionescu", displayName: "Maria Ionescu", applications: ["staff", "dashboard"], manageable: false, department: { id: 1, name: "Administrație" } }),
      summary({}),
    ] as Employee[],
  };

  const session = () => ({
    employee: {
      employeeUuid: ADMIN_ID, employeeCode: null, displayName: "Maria Ionescu", username: "maria.ionescu", department: "Administrație", departmentKey: "administratie",
      role: "employee", status: "active", permissions: ["dashboard.access"], allowedStageIds: [], applications: state.applications, roles: ["director"], positionTitle: "Director",
      isRoot: false, mustChangePassword: state.mustChangePassword, authorizationVersion: 7, locale: "ro",
    },
    expiresAt: "2026-10-04T20:00:00+00:00",
    csrfToken: "csrf-smoke",
  });
  const me = {
    employee: { id: ADMIN_ID, username: "maria.ionescu", displayName: "Maria Ionescu", positionTitle: "Director", department: "Administrație" },
    isRoot: false, authorityRank: 700,
    permissions: ["dashboard.access", "dashboard.overview.view", "employees.view", "employees.create", "employees.update", "employees.manage_applications", "employees.manage_roles", "roles.assign",
      "employees.manage_stages", "employees.activate", "employees.deactivate", "employees.reset_password", "roles.view", "departments.view", "applications.view", "iam.audit.view"],
    grantablePermissions: ["employees.view"], applications: ["staff", "dashboard"], authorizationVersion: 7,
  };
  const role = { id: 5, key: "employee", name: "Angajat", description: null, authorityRank: 100, isTemplate: true, status: "active", userCount: 1, permissionCount: 0, permissions: [], manageable: true };

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const fail = (route: Route, code: string, status: number) => json(route, { error: { code, message: "English server text", requestId: "r" } }, status);

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postData() ? JSON.parse(request.postData() as string) : undefined;
    state.requests.push(`${method} ${path}`);
    if (method !== "GET") state.mutations.push({ method, path, body, csrf: request.headers()["x-csrf-token"] });

    if (path === "/auth/session") return state.loggedIn ? json(route, session()) : fail(route, "NO_SESSION", 401);
    if (path === "/auth/login") {
      if (body.password !== "parola-corecta") return fail(route, "INVALID_CREDENTIALS", 401);
      state.loggedIn = true;
      return json(route, session());
    }
    if (path === "/auth/password") {
      if (body.currentPassword !== "parola-corecta") return fail(route, "CURRENT_PASSWORD_INVALID", 400);
      state.mustChangePassword = false;
      return json(route, session());
    }
    if (path === "/auth/logout") { state.loggedIn = false; return json(route, { ok: true }); }
    if (!state.loggedIn) return fail(route, "NO_SESSION", 401);
    if (state.mustChangePassword) return fail(route, "PASSWORD_CHANGE_REQUIRED", 403);
    if (path.startsWith("/management") && !state.applications.includes("dashboard")) return fail(route, "APPLICATION_ACCESS_DENIED", 403);

    if (path === "/management/me") return json(route, me);
    if (path === "/management/dashboard") return json(route, { counts: { activeEmployees: 3, dashboardUsers: 2, staffUsers: 3, departments: 2, roles: 1 }, applications: [{ key: "staff", name: "Staff", status: "active" }, { key: "dashboard", name: "Dashboard", status: "active" }], recentAudit: [] });
    if (path === "/production/workflow") return json(route, { workflow: { id: "curtain-production", name: "Producție perdele", version: 1 }, stages });
    if (path === "/management/departments") return json(route, { items: [{ id: 1, key: "administratie", name: "Administrație", description: null, status: "active", parentId: null, employeeCount: 2, activeEmployeeCount: 2 }, { id: 2, key: "productie", name: "Producție", description: null, status: "active", parentId: null, employeeCount: 1, activeEmployeeCount: 1 }] });
    if (path === "/management/roles") return json(route, { items: [role] });
    if (path === "/management/permissions") return json(route, { items: [] });
    if (path === "/management/applications") return json(route, { items: [{ key: "staff", name: "Staff", description: null, status: "active", accessPermission: "staff.access", userCount: 3 }, { key: "dashboard", name: "Dashboard", description: null, status: "active", accessPermission: "dashboard.access", userCount: 2 }] });
    if (path === "/management/audit") return json(route, { items: [], nextCursor: null });
    if (path === "/management/employees" && method === "GET") {
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const application = url.searchParams.get("application");
      const items = state.employees.filter((employee) => (!search || employee.displayName.toLowerCase().includes(search) || employee.username.includes(search)) && (!application || employee.isRoot || employee.applications.includes(application)));
      return json(route, { items, nextCursor: null, total: items.length });
    }
    if (path === "/management/employees" && method === "POST") {
      const created = summary({ id: "44444444-4444-4444-8444-444444444444", username: body.username, displayName: body.displayName, applications: body.applications, stageIds: body.stageIds, mustChangePassword: true });
      state.employees.push(created);
      return json(route, { employee: created, temporaryPassword: "Tmp-Smoke-0123456789" }, 201);
    }
    const match = /^\/management\/employees\/([0-9a-f-]{36})(?:\/(\w+))?$/.exec(path);
    if (match) {
      const employee = state.employees.find((item) => item.id === match[1]);
      if (!employee) return fail(route, "EMPLOYEE_NOT_FOUND", 404);
      if (method === "GET") return json(route, employee);
      if (employee.isRoot) return fail(route, "ROOT_PROTECTED", 403);
      if (match[2] === "applications") {
        if (options.rejectApplicationsWith) return fail(route, options.rejectApplicationsWith, 403);
        employee.applications = body.applications;
      }
      if (match[2] === "stages") employee.stageIds = body.stageIds;
      employee.authorizationVersion = Number(employee.authorizationVersion) + 1;
      return json(route, employee);
    }
    return fail(route, "NOT_FOUND", 404);
  });
  return state;
}

export const ids = { ROOT_ID, ADMIN_ID, ION_ID };
