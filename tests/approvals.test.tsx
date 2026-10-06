import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManagementMe } from "../src/api/types";
import { parseSse, startLive, type LiveEvent } from "../src/app/live";
import { parseRoute } from "../src/app/router";
import { canSeeOverview, NAVIGATION } from "../src/components/Shell";
import { MESSAGES } from "../src/i18n";
import { meters } from "../src/pages/ApprovalsPage";

const opsManager: ManagementMe = {
  employee: { id: "d", username: "denisa", displayName: "Denisa", positionTitle: "Manager operațional", department: "Operațiuni" },
  isRoot: false, authorityRank: 400, grantablePermissions: [], applications: ["dashboard"], authorizationVersion: 1,
  permissions: ["dashboard.access", "dashboard.overview.view", "orders.lookup_exact", "production.exceptions.approve", "profile.view_self"],
  capabilities: { approveExceptions: true, approvalViaBackup: false, lookupOrders: true, manageOrganization: false, manageProductionSettings: false, cancelExceptions: false },
};
const canFor = (me: ManagementMe) => (permission: string) => me.isRoot || me.permissions.includes(permission);

test("an operations manager sees exactly approvals, waiting, own history and exact search", () => {
  const visible = NAVIGATION.filter((item) => item.visible(opsManager, canFor(opsManager))).map((item) => item.path);
  assert.deepEqual(visible, ["/aprobari", "/aprobari/in-asteptare", "/aprobari/istoric", "/cauta-comanda"]);
  assert.equal(canSeeOverview(opsManager, canFor(opsManager)), false);
  const root: ManagementMe = { ...opsManager, isRoot: true, capabilities: { ...opsManager.capabilities!, manageOrganization: true, manageProductionSettings: true, cancelExceptions: true } };
  const rootPaths = NAVIGATION.filter((item) => item.visible(root, canFor(root))).map((item) => item.path);
  for (const path of ["/", "/organizatie", "/setari-productie", "/angajati", "/comenzi"]) assert.ok(rootPaths.includes(path), path);
  const legacy: ManagementMe = { ...opsManager, capabilities: undefined, permissions: ["dashboard.access", "dashboard.overview.view", "employees.view"] };
  assert.deepEqual(NAVIGATION.filter((item) => item.visible(legacy, canFor(legacy))).map((item) => item.path), ["/", "/angajati"]);
});

test("approval and lookup routes are strict", () => {
  assert.deepEqual(parseRoute("/aprobari"), { name: "approvals", view: "pending" });
  assert.deepEqual(parseRoute("/aprobari/in-asteptare"), { name: "approvals", view: "waiting" });
  assert.deepEqual(parseRoute("/aprobari/istoric"), { name: "approvals", view: "mine" });
  assert.deepEqual(parseRoute("/aprobari/cerere/11111111-1111-4111-8111-111111111111"), { name: "approval", id: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(parseRoute("/aprobari/cerere/x"), { name: "not-found" });
  assert.deepEqual(parseRoute("/cauta-comanda/trendhome%3A12"), { name: "order-lookup", id: "trendhome:12" });
  assert.deepEqual(parseRoute("/organizatie"), { name: "organization" });
  assert.deepEqual(parseRoute("/setari-productie"), { name: "production-settings" });
});

test("exact decimal meters are displayed without floating point", () => {
  assert.equal(meters("17.000"), "17 m");
  assert.equal(meters("8.400"), "8,4 m");
  assert.equal(meters("0.125"), "0,125 m");
});

test("Romanian and Turkish provide every new label", () => {
  for (const locale of ["ro", "tr"] as const) {
    const m = MESSAGES[locale];
    assert.ok(m.nav.approvals && m.nav.orderSearch && m.exceptions.approve && m.lookup.hint && m.organization.workingHours && m.productionSettings.policy);
    assert.equal(m.organization.weekdays.length, 7);
  }
  assert.equal(MESSAGES.ro.exceptions.status.awaiting_approval, "Așteaptă aprobarea managerului");
  assert.equal(MESSAGES.ro.nav.approvals, "Aprobări");
});

test("the live loop starts at the current cursor, never repeats an event and stops when the session ends", async () => {
  assert.deepEqual(parseSse("id: 4\nevent: exception.resolved\ndata: {\"exceptionId\":\"e\"}\n\nevent: cursor\ndata: {\"cursor\":4}\n\n").map((frame) => frame.event), ["exception.resolved", "cursor"]);
  const batches = [
    { status: 200, text: "event: ready\ndata: {\"cursor\":3}\n\n" },
    { status: 200, text: "id: 4\nevent: exception.approval_pending\ndata: {\"exceptionId\":\"e\",\"orderNumber\":\"91002\"}\n\nevent: cursor\ndata: {\"cursor\":4}\n\n" },
    { status: 502, text: "" },
    { status: 200, text: "id: 4\nevent: exception.approval_pending\ndata: {}\n\nid: 5\nevent: exception.resolved\ndata: {\"decidedBy\":\"Denisa\"}\n\nevent: cursor\ndata: {\"cursor\":5}\n\n" },
    { status: 401, text: "" },
  ];
  const cursors: (number | null)[] = [];
  const events: LiveEvent[] = [];
  await new Promise<void>((resolve) => {
    startLive({
      fetchBatch: async (after) => { cursors.push(after); const next = batches.shift(); if (!next) throw new Error("done"); if (next.status === 401) setTimeout(resolve, 0); return next; },
      onEvent: (event) => events.push(event),
      isVisible: () => true,
      sleep: async () => undefined,
    });
  });
  assert.deepEqual(cursors, [null, 3, 4, 4, 5]);
  assert.deepEqual(events.map((event) => [event.seq, event.type, event.orderNumber ?? event.decidedBy]), [[4, "exception.approval_pending", "91002"], [5, "exception.resolved", "Denisa"]]);
});
