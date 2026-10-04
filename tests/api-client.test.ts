import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createApi } from "../src/api/client";
import { API, apiError, employee, fakeFetch, sessionPayload } from "./support";

test("restores the central session from the API cookie and keeps the CSRF token in memory only", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url.pathname === "/auth/session") return { body: sessionPayload({}, "csrf-abc") };
    return { body: employee() };
  });
  const api = createApi(API, fetchImpl);
  const session = await api.getSession();
  assert.equal(session?.employee.username, "maria.ionescu");
  assert.equal(session?.employee.authorizationVersion, 3);
  assert.equal("csrfToken" in (session ?? {}), false, "the CSRF token is not exposed to the UI state");
  assert.equal(calls[0].credentials, "include");

  await api.setApplications(employee().id, ["staff", "dashboard"]);
  const put = calls[1];
  assert.equal(put.method, "PUT");
  assert.equal(put.url.pathname, `/management/employees/${employee().id}/applications`);
  assert.deepEqual(put.body, { applications: ["staff", "dashboard"] });
  assert.equal(put.headers["X-CSRF-Token"], "csrf-abc");
  assert.equal(put.credentials, "include");
});

test("an absent or expired session is anonymous, not an error", async () => {
  for (const code of ["NO_SESSION", "SESSION_EXPIRED"]) {
    const { fetchImpl } = fakeFetch(() => apiError(code, 401));
    assert.equal(await createApi(API, fetchImpl).getSession(), null);
  }
});

test("a malformed session payload fails closed", async () => {
  const { fetchImpl } = fakeFetch(() => ({ body: { employee: { ...sessionPayload().employee, isRoot: "yes" }, expiresAt: "x", csrfToken: "t" } }));
  await assert.rejects(createApi(API, fetchImpl).getSession(), (error: unknown) => error instanceof ApiError && error.code === "INVALID_RESPONSE");
});

test("session expiry on a protected request notifies the app and forgets the CSRF token", async () => {
  let expired = false;
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url.pathname === "/auth/session") return { body: sessionPayload() };
    return expired ? apiError("SESSION_EXPIRED", 401) : { body: employee() };
  });
  const api = createApi(API, fetchImpl);
  const problems: string[] = [];
  api.onSessionProblem((error) => problems.push(error.code));
  await api.getSession();
  expired = true;
  await assert.rejects(api.employee(employee().id), (error: unknown) => error instanceof ApiError && error.code === "SESSION_EXPIRED");
  assert.deepEqual(problems, ["SESSION_EXPIRED"]);
  await assert.rejects(api.setRoles(employee().id, [5]));
  assert.equal(calls.at(-1)?.headers["X-CSRF-Token"], undefined, "an expired session never reuses the old CSRF token");
});

test("removed Dashboard access or a forced password change makes the app re-read the session", async () => {
  for (const code of ["APPLICATION_ACCESS_DENIED", "PASSWORD_CHANGE_REQUIRED"]) {
    const { fetchImpl } = fakeFetch(() => apiError(code, 403));
    const api = createApi(API, fetchImpl);
    const problems: string[] = [];
    api.onSessionProblem((error) => problems.push(error.code));
    await assert.rejects(api.overview());
    assert.deepEqual(problems, [code]);
  }
});

test("authorization errors are returned to the screen without ending the session", async () => {
  for (const code of ["AUTHORITY_EXCEEDED", "PERMISSION_NOT_GRANTABLE", "ROOT_PROTECTED", "SELF_MODIFICATION_DENIED", "DEPARTMENT_IN_USE", "ROLE_IN_USE"]) {
    const { fetchImpl } = fakeFetch(() => apiError(code, code.endsWith("IN_USE") ? 409 : 403));
    const api = createApi(API, fetchImpl);
    const problems: string[] = [];
    api.onSessionProblem((error) => problems.push(error.code));
    await assert.rejects(api.deleteDepartment(4), (error: unknown) => error instanceof ApiError && error.code === code);
    assert.deepEqual(problems, []);
  }
});

test("a rejected CSRF token is refreshed from the session so a deliberate retry works", async () => {
  let token = "old";
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url.pathname === "/auth/session") return { body: sessionPayload({}, token) };
    if (call.headers["X-CSRF-Token"] === "old") return apiError("CSRF_INVALID", 403);
    return { body: { ok: true } };
  });
  const api = createApi(API, fetchImpl);
  await api.getSession();
  token = "new";
  await assert.rejects(api.deleteRole(9), (error: unknown) => error instanceof ApiError && error.code === "CSRF_INVALID");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await api.deleteRole(9);
  assert.equal(calls.at(-1)?.headers["X-CSRF-Token"], "new");
});

test("logout always forgets the CSRF token, even when the API is unreachable", async () => {
  let online = true;
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (!online) throw new TypeError("offline");
    return call.url.pathname === "/auth/session" ? { body: sessionPayload() } : { body: { ok: true } };
  });
  const api = createApi(API, fetchImpl);
  await api.getSession();
  online = false;
  await assert.rejects(api.logout(), (error: unknown) => error instanceof ApiError && error.code === "NETWORK_UNAVAILABLE");
  online = true;
  await api.deleteRole(1);
  assert.equal(calls.at(-1)?.headers["X-CSRF-Token"], undefined);
});

test("employee filters are sent as query parameters and empty filters are dropped", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: { items: [], nextCursor: null, total: 0 } }));
  await createApi(API, fetchImpl).employees({ search: "ion pop", status: "active", departmentId: undefined, application: "staff", roleId: "", cursor: "50" });
  const url = calls[0].url;
  assert.equal(url.pathname, "/management/employees");
  assert.deepEqual(Object.fromEntries(url.searchParams), { search: "ion pop", status: "active", application: "staff", cursor: "50" });
});

test("employee creation sends exactly the fields of the strict server schema", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ status: 201, body: { employee: employee(), temporaryPassword: "Tmp-0123456789abcdef" } }));
  const result = await createApi(API, fetchImpl).createEmployee({
    displayName: "Ion Popescu", username: "ion.popescu", departmentId: 2, positionTitle: null, managerId: null,
    applications: ["staff"], roleIds: [5], stageIds: ["material-preparation"], status: "active",
  });
  assert.equal(result.temporaryPassword, "Tmp-0123456789abcdef");
  assert.deepEqual(Object.keys(calls[0].body as object).sort(), ["applications", "departmentId", "displayName", "managerId", "positionTitle", "roleIds", "stageIds", "status", "username"]);
});

test("transport failures and non-JSON server failures get stable codes", async () => {
  const offline = createApi(API, (() => Promise.reject(new TypeError("down"))) as typeof fetch);
  await assert.rejects(offline.roles(), (error: unknown) => error instanceof ApiError && error.code === "NETWORK_UNAVAILABLE");
  const broken = createApi(API, (async () => new Response("<html>Fatal error</html>", { status: 500 })) as typeof fetch);
  await assert.rejects(broken.roles(), (error: unknown) => error instanceof ApiError && error.code === "SERVER_ERROR" && !error.message.includes("Fatal"));
});
