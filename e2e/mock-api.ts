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
 * A stateful in-memory Operations API. It mirrors the 2.4.0 response shapes and records every mutation,
 * so tests can prove that nothing is written before an explicit confirmation.
 */
export async function mockApi(page: Page, options: MockOptions = {}) {
  const state = {
    loggedIn: false,
    mustChangePassword: options.mustChangePassword ?? false,
    applications: options.applications ?? ["staff", "dashboard"],
    requests: [] as string[],
    overviewRequests: [] as string[],
    overviewFails: false,
    ordersFail: false,
    orderRequests: [] as string[],
    /** Mutable production state of the controlled order, so tests can simulate Staff progress. */
    control: { stage: { id: "waiting", label: "În așteptare", ordinal: 1 }, owner: null as null | { id: string; displayName: string } },
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
      "employees.manage_stages", "employees.activate", "employees.deactivate", "employees.reset_password", "roles.view", "departments.view", "applications.view", "iam.audit.view", "system.view",
      "production.view", "orders.view_all", "activity.view_all", "sources.view"],
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
    if (path === "/management/orders") {
      state.orderRequests.push(url.search);
      if (state.ordersFail) return fail(route, "SERVER_ERROR", 503);
      return json(route, orderPage(url.searchParams, state.control));
    }
    if (path.startsWith("/management/orders/")) {
      state.orderRequests.push(path);
      if (state.ordersFail) return fail(route, "SERVER_ERROR", 503);
      const id = decodeURIComponent(path.slice("/management/orders/".length));
      return id === "trendhome:91001" ? json(route, orderDetail(state.control)) : fail(route, "ORDER_NOT_FOUND", 404);
    }
    if (path === "/management/production-overview") {
      state.overviewRequests.push(url.search);
      if (state.overviewFails) return fail(route, "SERVER_ERROR", 503);
      return json(route, productionOverview(url.searchParams.get("source")));
    }
    if (path === "/management/dashboard") return json(route, { counts: { activeEmployees: 3, dashboardUsers: 2, staffUsers: 3, departments: 2, roles: 1 }, applications: [{ key: "staff", name: "Staff", status: "active" }, { key: "dashboard", name: "Dashboard", status: "active" }], recentAudit: [] });
    if (path === "/production/workflow") return json(route, { workflow: { id: "curtain-production", name: "Producție perdele", version: 1 }, stages });
    if (path === "/management/departments") return json(route, { items: [{ id: 1, key: "administratie", name: "Administrație", description: null, status: "active", parentId: null, employeeCount: 2, activeEmployeeCount: 2 }, { id: 2, key: "productie", name: "Producție", description: null, status: "active", parentId: null, employeeCount: 1, activeEmployeeCount: 1 }] });
    if (path === "/management/roles") return json(route, { items: [role] });
    if (path === `/management/roles/${role.id}`) return json(route, { ...role, permissions: ["employees.manage_stages"], permissionCount: 1 });
    if (path === "/management/permissions") return json(route, { items: [{ key: "employees.manage_stages", category: "employees", label: "Gestionare etape Staff", description: "Assign Staff production stages", roleGrantable: true, grantableByMe: true }] });
    if (path === "/management/system") return json(route, { apiVersion: "2.3.0", database: "ok", migrations: { applied: 5, latest: "005_central_iam.sql" }, applications: 2, rootConfigured: true });
    if (path === "/health") return json(route, { status: "ok", version: "2.3.0" });
    if (path === "/management/applications") return json(route, { items: [{ key: "staff", name: "Staff", description: null, status: "active", accessPermission: "staff.access", userCount: 3 }, { key: "dashboard", name: "Dashboard", description: null, status: "active", accessPermission: "dashboard.access", userCount: 2 }] });
    if (path === "/management/audit") {
      return json(route, { items: [{ id: "a1", actorId: null, actorLabel: "Administrator principal (arasya.root.owner)", actorType: "root", action: "employee.deactivated", targetType: "employee", targetId: ION_ID,
        targetLabel: "Ion Popescu (ion.popescu)", metadata: null, createdAt: "2026-10-04T10:00:00.000Z" }], nextCursor: null });
    }
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

export const PRODUCTION_STAGES = ["waiting", "material-preparation", "workshop-receiving", "labeling", "material-straightening", "bottom-hem", "side-hem", "ironing", "height", "header-tape", "sewing-finishing", "quality-control", "packing", "delivery"];

/** A 2.4.0-shaped production overview with deliberately distinctive numbers; `source` filters it like the API. */
function productionOverview(source: string | null) {
  const all = source === null || source === "trendhome";
  const counts: Record<string, number> = all ? { waiting: 13, labeling: 5, "quality-control": 2 } : {};
  return {
    generatedAt: "2026-10-04T12:00:00.000Z",
    timezone: "Europe/Bucharest",
    filters: { source },
    summary: all ? { active: 20, waiting: 13, inWork: 7, unassigned: 17, completedToday: 3 } : { active: 0, waiting: 0, inWork: 0, unassigned: 0, completedToday: 0 },
    stages: PRODUCTION_STAGES.map((id, index) => ({ id, label: id, ordinal: index + 1, active: counts[id] ?? 0, unassigned: counts[id] ?? 0, oldestEnteredAt: counts[id] ? "2026-10-04T07:00:00.000Z" : null })),
    oldestOrders: all ? [
      { globalOrderId: "trendhome:50011", orderNumber: "50011", source: { key: "trendhome", name: "Trendhome" }, stage: { id: "labeling", label: "Etichetare" }, stageEnteredAt: "2026-10-01T10:00:00.000Z", owner: null, claimedAt: null, commerceStatus: { code: "processing", label: "În procesare" } },
      { globalOrderId: "trendhome:50012", orderNumber: "50012", source: { key: "trendhome", name: "Trendhome" }, stage: { id: "waiting", label: "În așteptare" }, stageEnteredAt: "2026-10-03T10:00:00.000Z", owner: { id: ION_ID, displayName: "Ion Popescu" }, claimedAt: "2026-10-04T08:00:00.000Z", commerceStatus: null },
    ] : [],
    activity: all ? [{ id: "pa-1", action: "claimed", occurredAt: "2026-10-04T11:00:00.000Z", employee: { id: ION_ID, displayName: "Ion Popescu" }, order: { globalOrderId: "trendhome:50012", orderNumber: "50012", source: "trendhome" }, fromStage: { id: "waiting", label: "În așteptare" }, toStage: null }] : [],
    sources: [
      { key: "outletperdele", name: "OutletPerdele", type: "woocommerce", health: "stale", lastContactAt: "2026-10-04T11:30:00.000Z", lastEventAt: null, activeOrders: 0 },
      { key: "trendhome", name: "Trendhome", type: "woocommerce", health: "healthy", lastContactAt: "2026-10-04T11:59:00.000Z", lastEventAt: "2026-10-04T11:59:00.000Z", activeOrders: 20 },
      { key: "trendyol", name: "Trendyol", type: "marketplace", health: "not_configured", lastContactAt: null, lastEventAt: null, activeOrders: 0 },
    ],
  };
}

type Control = { stage: { id: string; label: string; ordinal: number }; owner: null | { id: string; displayName: string } };

function orderSummary(index: number, control: Control) {
  const controlled = index === 0;
  return {
    globalOrderId: controlled ? "trendhome:91001" : `outletperdele:${92000 + index}`,
    orderNumber: controlled ? "91001" : String(92000 + index),
    source: controlled ? { key: "trendhome", name: "Trendhome" } : { key: "outletperdele", name: "OutletPerdele" },
    commerce: { status: controlled ? { code: "processing", label: "Se procesează" } : { code: "on-hold", label: "În așteptare plată" }, availability: "active" },
    production: {
      state: "active", stage: controlled ? control.stage : { id: "labeling", label: "Etichetare", ordinal: 4 }, owner: controlled ? control.owner : null,
      claimedAt: controlled && control.owner ? "2026-10-04T11:00:00.000Z" : null, stageEnteredAt: "2026-10-04T09:00:00.000Z", completedAt: null,
    },
    importedAt: `2026-10-04T0${Math.min(9, 8 - Math.floor(index / 10))}:00:00.000Z`,
    acceptedAt: "2026-10-04T07:00:00.000Z",
  };
}

/** 30 active orders; 25 per page by cursor. Filters are echoed by narrowing, like the API. */
function orderPage(query: URLSearchParams, control: Control) {
  let items = Array.from({ length: 30 }, (_, index) => orderSummary(index, control));
  if (query.get("source")) items = items.filter((item) => item.source.key === query.get("source"));
  if (query.get("search")) items = items.filter((item) => item.orderNumber.startsWith(String(query.get("search")).replace("#", "")));
  const limit = Number(query.get("limit") ?? 50);
  const start = query.get("cursor") === "page-2" ? limit : 0;
  return {
    items: items.slice(start, start + limit),
    nextCursor: start + limit < items.length ? "page-2" : null,
    facets: {
      sources: [{ key: "outletperdele", name: "OutletPerdele" }, { key: "trendhome", name: "Trendhome" }, { key: "trendyol", name: "Trendyol" }],
      stages: PRODUCTION_STAGES.map((id, index) => ({ id, label: id, ordinal: index + 1 })),
      commerceStatuses: [{ code: "on-hold", label: "În așteptare plată" }, { code: "processing", label: "Se procesează" }],
      owners: control.owner ? [control.owner] : [],
    },
  };
}

function orderDetail(control: Control) {
  const base = orderSummary(0, control);
  return {
    ...base,
    commerce: { ...base.commerce, sourceChangedAt: "2026-10-04T07:01:00.000Z", lastSourceSeenAt: "2026-10-04T11:50:00.000Z" },
    production: { ...base.production, changedAt: control.stage.id === "waiting" ? null : "2026-10-04T11:30:00.000Z", version: control.owner ? 2 : 1, notes: "Tiv dublu." },
    items: [{ line: 1, name: "Draperie Velvet", sku: "DV-302", variant: "Inele", color: "Bej", width: 300, height: 260, unit: "cm", meters: 8.4, quantity: 2 }],
    activity: control.owner ? [{ id: "pa-c1", action: "claimed", occurredAt: "2026-10-04T11:00:00.000Z", employee: control.owner, fromStage: { id: "waiting", label: "În așteptare" }, toStage: null, productionVersion: 2 }] : [],
    activityTruncated: false,
  };
}
