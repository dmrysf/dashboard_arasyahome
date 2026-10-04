import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { describeAuditEvent, personName } from "../src/api/audit";
import { ApiError, createApi } from "../src/api/client";
import { errorMessage } from "../src/api/labels";
import type { AuditEvent } from "../src/api/types";
import { classifySession, resolveSession, restoreSession } from "../src/app/session";
import { resolveApiBaseUrl } from "../src/config";
import { API, apiError, fakeFetch, me, sessionEmployee, sessionPayload } from "./support";

const session = (overrides = {}) => ({ employee: sessionEmployee(overrides), expiresAt: "2026-10-04T20:00:00+00:00" });

test("the session gate follows the API: password change first, then Dashboard application access", () => {
  assert.equal(classifySession(null).kind, "anonymous");
  assert.equal(classifySession(session({ mustChangePassword: true, applications: ["dashboard"] })).kind, "password");
  assert.equal(classifySession(session({ applications: ["staff"], permissions: ["dashboard.access"] })).kind, "no-access", "a permission string alone never opens the Dashboard");
  assert.equal(classifySession(session({ applications: ["staff", "dashboard"] })).kind, "needs-profile");
});

test("access removed between session and profile reads shows the no-access screen instead of looping", async () => {
  const { fetchImpl } = fakeFetch(() => apiError("APPLICATION_ACCESS_DENIED", 403));
  const state = await resolveSession(createApi(API, fetchImpl), session());
  assert.equal(state.kind, "no-access");
});

test("a valid Dashboard session restores into the ready state with the management profile", async () => {
  const { fetchImpl } = fakeFetch((call) => call.url.pathname === "/auth/session" ? { body: sessionPayload() } : { body: me() });
  const state = await restoreSession(createApi(API, fetchImpl));
  assert.equal(state.kind, "ready");
  assert.equal(state.kind === "ready" && state.me.authorityRank, 700);
});

test("an inactive account returns to login and an unreachable API offers a retry", async () => {
  const inactive = await restoreSession(createApi(API, fakeFetch(() => apiError("ACCOUNT_INACTIVE", 401)).fetchImpl));
  assert.deepEqual(inactive, { kind: "anonymous", notice: "Contul nu este activ." });
  const offline = await restoreSession(createApi(API, (() => Promise.reject(new TypeError("x"))) as typeof fetch));
  assert.equal(offline.kind, "unavailable");
});

test("every documented management error has a Romanian message and server text is never shown", () => {
  const codes = ["AUTHENTICATION_REQUIRED", "NO_SESSION", "APPLICATION_ACCESS_DENIED", "PASSWORD_CHANGE_REQUIRED", "CSRF_INVALID", "AUTHORITY_EXCEEDED", "PERMISSION_NOT_GRANTABLE",
    "UNKNOWN_PERMISSION", "ROOT_PROTECTED", "SELF_MODIFICATION_DENIED", "DEPARTMENT_IN_USE", "ROLE_IN_USE", "INVALID_REQUEST", "USERNAME_TAKEN", "MANAGER_CYCLE", "DEPARTMENT_CYCLE", "UNKNOWN_STAGE"];
  const fallback = errorMessage(new ApiError("SOMETHING_NEW", 400));
  for (const code of codes) {
    const message = errorMessage(new ApiError(code, 400, "Stack trace at /home/x/src/File.php:12"));
    assert.notEqual(message, fallback, code);
    assert.doesNotMatch(message, /php|stack|trace|exception/i, code);
  }
  assert.equal(errorMessage(new ApiError("APPLICATION_ACCESS_DENIED", 403)), "Nu ai acces la Panoul de control.");
  assert.match(errorMessage(new ApiError("DEPARTMENT_IN_USE", 409)), /angajați activi sau subdepartamente/);
  assert.equal(errorMessage(new ApiError("BRAND_NEW_FORBIDDEN", 403)), errorMessage(new ApiError("UNAUTHORIZED_ACTION", 403)));
});

const event = (overrides: Partial<AuditEvent>): AuditEvent => ({
  id: "e1", actorId: "a", actorLabel: "Maria Ionescu (maria.ionescu)", actorType: "employee", action: "employee.created",
  targetType: "employee", targetId: "t", targetLabel: "Ion Popescu (ion.popescu)", metadata: null, createdAt: "2026-10-04T10:00:00.000Z", ...overrides,
});

test("IAM audit events read as Romanian sentences", () => {
  assert.equal(personName("Ion Popescu (ion.popescu)"), "Ion Popescu");
  assert.deepEqual(describeAuditEvent(event({ action: "employee.applications_changed", metadata: { before: ["staff"], after: ["dashboard", "staff"] } })).sentences, ["Ion Popescu a primit acces la Dashboard."]);
  assert.deepEqual(describeAuditEvent(event({ action: "employee.applications_changed", metadata: { before: ["dashboard", "staff"], after: ["staff"] } })).sentences, ["Ion Popescu nu mai are acces la Dashboard."]);
  assert.deepEqual(describeAuditEvent(event({ action: "employee.roles_changed", metadata: { before: [], after: ["supervisor"] } })).sentences, ["Maria Ionescu a modificat rolurile utilizatorului Ion Popescu."]);
  assert.deepEqual(describeAuditEvent(event({ action: "employee.deactivated", actorType: "root", actorLabel: "Administrator principal (arasya.root.owner)" })).sentences, ["Administrator principal a dezactivat utilizatorul Ion Popescu."]);
  const stages = describeAuditEvent(event({ action: "employee.stages_changed", metadata: { before: [], after: ["sewing"] } }), (id) => id === "sewing" ? "Confecționare" : id);
  assert.deepEqual(stages.details, ["— → Confecționare"]);
});

test("audit rendering ignores undocumented metadata so secrets can never appear", () => {
  const rendered = describeAuditEvent(event({ action: "employee.updated", metadata: { displayName: { before: "Ion", after: "Ion Popescu" }, sessionToken: { before: "s3cret", after: "x" }, revokedSessions: 2 } }));
  const text = [...rendered.sentences, ...rendered.details].join(" ");
  assert.match(text, /nume: Ion → Ion Popescu/);
  assert.doesNotMatch(text, /s3cret|sessionToken|revokedSessions/);
});

test("the API base URL must be an exact HTTPS origin; loopback HTTP only in the E2E build", () => {
  assert.equal(resolveApiBaseUrl("https://api.arasyahome.ro", ""), "https://api.arasyahome.ro");
  for (const bad of ["", "http://api.arasyahome.ro", "https://api.arasyahome.ro/v1", "https://u:p@api.arasyahome.ro", "https://api.arasyahome.ro?x=1", "http://127.0.0.1:8788"]) {
    assert.throws(() => resolveApiBaseUrl(bad, ""), bad);
  }
  assert.equal(resolveApiBaseUrl("http://127.0.0.1:8788", "127.0.0.1"), "http://127.0.0.1:8788");
});

test("the Dashboard source never uses browser storage for sessions, tokens or passwords", () => {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const target = path.join(directory, name);
      if (statSync(target).isDirectory()) walk(target);
      else if (/\.(ts|tsx)$/.test(name)) files.push(target);
    }
  };
  walk(path.resolve(import.meta.dirname, "../src"));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/, file);
    assert.doesNotMatch(source, /isAdmin/, file);
  }
});
