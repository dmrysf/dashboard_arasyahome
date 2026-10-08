import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EmployeeSummary, WorkflowStage } from "../src/api/types";
import { I18nProvider } from "../src/i18n/context";
import { ReadinessBadge } from "../src/pages/EmployeesPage";
import { loadAllEmployees, readiness } from "../src/pages/readiness";
import { stageCoverage } from "../src/pages/StageCoveragePage";
import { employee } from "./support";

// Operational readiness is contextual to the applications an identity was granted; it is never inferred
// from a title or a department, and a non-Staff identity is never "missing" a production stage.

const ceoRole = { id: 1, key: "ceo", name: "CEO / Proprietar", authorityRank: 900, status: "active" as const };
const financeRole = { id: 9, key: "contabilitate", name: "Contabilitate", authorityRank: 300, status: "active" as const };

test("a Dashboard-only CEO and a B2B finance user are ready without Staff stages", () => {
  const ceo = readiness(employee({ applications: ["dashboard"], roles: [ceoRole], stageIds: [], positionTitle: "Croitor" }));
  assert.equal(ceo.verdict, "ready");
  assert.deepEqual(ceo.ready, ["dashboard"]);
  assert.ok(!ceo.checks.some((check) => check.key === "staff-stages"), "no Staff check without Staff access");
  const finance = readiness(employee({ applications: ["b2b"], roles: [financeRole], stageIds: [], mustChangePassword: true }));
  assert.equal(finance.verdict, "password_pending");
  assert.deepEqual(finance.ready, ["b2b"]);
});

test("each blocking state is reported from server fields only", () => {
  assert.equal(readiness(employee({ status: "inactive" })).verdict, "inactive");
  assert.equal(readiness(employee({ applications: [], stageIds: [] })).verdict, "no_application");
  assert.equal(readiness(employee({ applications: ["staff"], stageIds: [] })).verdict, "incomplete", "Staff without a stage cannot claim anything");
  assert.equal(readiness(employee({ applications: ["dashboard"], roles: [], stageIds: [] })).verdict, "incomplete", "Dashboard without a role shows nothing");
  const orphan = readiness(employee({ applications: ["dashboard"], roles: [ceoRole], stageIds: ["packing"] }));
  assert.equal(orphan.verdict, "incomplete", "stages without Staff access are not usable");
  assert.ok(orphan.checks.some((check) => check.key === "stages-without-staff"));
  // A department or title never changes the verdict.
  const base = employee({ applications: ["staff"], stageIds: [] });
  assert.equal(readiness({ ...base, department: { id: 9, name: "Croitorie" }, positionTitle: "Șef croitorie" }).verdict, readiness(base).verdict);
});

test("a document permission without a source is reported but never blocks readiness", () => {
  const approver = readiness(employee({ applications: ["dashboard"], roles: [ceoRole], stageIds: [], rolePermissions: ["production.documents.approve_revision"], documentScopes: { operate: [], approve: [] } }));
  assert.equal(approver.verdict, "ready");
  const scope = approver.checks.find((check) => check.key === "document-scopes");
  assert.ok(scope && scope.key === "document-scopes" && scope.capabilities.join() === "approve");
  const scoped = readiness(employee({ applications: ["dashboard"], roles: [ceoRole], stageIds: [], rolePermissions: ["production.documents.approve_revision"], documentScopes: { operate: [], approve: ["trendhome"] } }));
  assert.ok(!scoped.checks.some((check) => check.key === "document-scopes"));
});

test("the list badge renders the verdict without credential material", () => {
  const html = renderToStaticMarkup(<I18nProvider locale="ro"><ReadinessBadge employee={employee({ mustChangePassword: true })} /></I18nProvider>);
  assert.match(html, /data-readiness="password_pending"/);
  assert.match(html, /Așteaptă schimbarea parolei/);
  assert.doesNotMatch(html, /hash|token/i);
});

const stages: WorkflowStage[] = [
  { id: "material-preparation", label: "Pregătire material", ordinal: 2 },
  { id: "packing", label: "Ambalare", ordinal: 13 },
] as WorkflowStage[];

test("stage coverage counts only active Staff holders and lists Staff accounts without a stage", () => {
  const people: EmployeeSummary[] = [
    employee({ id: "a", displayName: "Ready", stageIds: ["material-preparation"] }),
    employee({ id: "b", displayName: "Pending", stageIds: ["material-preparation"], mustChangePassword: true }),
    employee({ id: "c", displayName: "Inactive", stageIds: ["packing"], status: "inactive" }),
    employee({ id: "d", displayName: "No Staff", stageIds: ["packing"], applications: ["dashboard"] }),
    employee({ id: "e", displayName: "Empty", stageIds: [] }),
    employee({ id: "r", displayName: "Root", stageIds: ["packing"], isRoot: true }),
  ];
  const { rows, withoutStages } = stageCoverage(stages, people);
  assert.deepEqual(rows[0].ready.map((item) => item.id), ["a"]);
  assert.deepEqual(rows[0].pending.map((item) => item.id), ["b"]);
  assert.deepEqual(rows[1].ready, [], "packing is not covered by an inactive or non-Staff holder");
  assert.deepEqual(rows[1].blocked.map((item) => `${item.employee.id}:${item.reason}`), ["c:inactive", "d:noStaff"]);
  assert.deepEqual(withoutStages.map((item) => item.id), ["e"]);
});

test("the directory loader follows the server cursor and reports truncation", async () => {
  const calls: Array<Record<string, string | undefined>> = [];
  const api = { employees: async (query: Record<string, string | undefined>) => {
    calls.push(query);
    const page = Number(query.cursor ?? 0) / 100;
    return { items: [employee({ id: `p${page}` })], nextCursor: page < 2 ? String((page + 1) * 100) : null, total: 3 };
  } };
  const all = await loadAllEmployees(api, { status: "active" });
  assert.deepEqual(all.items.map((item) => item.id), ["p0", "p1", "p2"]);
  assert.equal(all.truncated, false);
  assert.ok(calls.every((query) => query.limit === "100" && query.status === "active"));
  assert.equal((await loadAllEmployees(api, {}, 2)).truncated, true);
});
