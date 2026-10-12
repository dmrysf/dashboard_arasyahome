import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createApi } from "../src/api/client";
import { MESSAGES } from "../src/i18n";
import { faultScope } from "../src/pages/ApprovalsPage";
import { API, fakeFetch } from "./support";

const root = path.resolve(import.meta.dirname, "..");

test("the manager decision of a tailoring defect carries the attribution; nothing else changes", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: { id: "e" } }));
  const api = createApi(API, fetchImpl);
  await api.decideException("11111111-1111-4111-8111-111111111111", { expectedVersion: 6, decision: "approve", attribution: "none" }, "key-1");
  await api.decideException("11111111-1111-4111-8111-111111111111", { expectedVersion: 6, decision: "reject", comment: "Fișa era corectă" }, "key-2");
  assert.deepEqual(calls.map((call) => [call.method, call.url.pathname, call.body]), [
    ["POST", "/management/production-exceptions/11111111-1111-4111-8111-111111111111/decision", { expectedVersion: 6, decision: "approve", attribution: "none" }],
    ["POST", "/management/production-exceptions/11111111-1111-4111-8111-111111111111/decision", { expectedVersion: 6, decision: "reject", comment: "Fișa era corectă" }],
  ]);
});

test("revoking a responsibility without a reason sends a JSON object the API accepts (an empty {} is refused)", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: { responsibilities: [] } }));
  await createApi(API, fetchImpl).revokeResponsibility("11111111-1111-4111-8111-111111111111", null, "key-3");
  assert.deepEqual(calls[0].body, { reason: null });
});

test("Romanian and Turkish describe every supervised status, actor and the supervisor appointment", () => {
  for (const locale of ["ro", "tr"] as const) {
    const x = MESSAGES[locale].exceptions;
    for (const status of ["awaiting_supervisor_review", "dismissed", "in_supervisor_custody", "return_rejected", "restored", "awaiting_restore_receipt"]) assert.ok(x.status[status], `${locale} ${status}`);
    for (const action of ["supervisor_accepted", "supervisor_dismissed", "return_requested", "restored", "restore_requested", "restore_received", "recovery_requested", "note_added"]) assert.ok(x.timelineActions[action], `${locale} ${action}`);
    for (const position of ["accepted", "disputed", "not_stated"]) assert.ok(x.tailoring.positions[position], `${locale} ${position}`);
    assert.ok(x.tailoring.attributionCutter && x.tailoring.attributionNone && x.tailoring.attributionMaterial);
    assert.ok(MESSAGES[locale].organization.kinds.tailoring_quality_supervisor, `${locale} appointment`);
    assert.ok(MESSAGES[locale].errors.ATTRIBUTION_REQUIRED && MESSAGES[locale].errors.ATTRIBUTION_NOT_ALLOWED && MESSAGES[locale].errors.RETURN_ASSIGNEE_UNAVAILABLE);
    for (const code of ["RECIPIENT_REQUIRED", "RESTORE_RECIPIENT_UNAVAILABLE", "RECIPIENT_NOT_ALLOWED", "RECIPIENT_INVALID"]) assert.ok(MESSAGES[locale].errors[code as keyof typeof MESSAGES.ro.errors], `${locale} ${code}`);
  }
  assert.equal(MESSAGES.ro.exceptions.status.in_supervisor_custody, "În grija șefului de croitorie");
  assert.match(MESSAGES.ro.exceptions.timelineActions.supervisor_accepted, /fără aprobare/);
});

test("the approval dialog requires an explicit attribution and never offers the cutter for a material defect", () => {
  const page = readFileSync(path.join(root, "src/pages/ApprovalsPage.tsx"), "utf8");
  assert.match(page, /disabled=\{!data\.actions\.canAttributeToCutter\}/);
  assert.match(page, /needsAttribution && !attribution/);
  assert.match(page, /data-testid="attribution-choice"/);
});

test("root cancel after custody is a recovery: it names who receives the product and never unblocks directly", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => ({ body: call.method === "GET" ? { items: [{ id: "22222222-2222-4222-8222-222222222222", displayName: "Elena Croitorie", original: true }] } : { id: "e" } }));
  const api = createApi(API, fetchImpl);
  const answer = await api.restoreRecipients("11111111-1111-4111-8111-111111111111");
  assert.equal(answer.items[0].displayName, "Elena Croitorie");
  await api.cancelException("11111111-1111-4111-8111-111111111111", { expectedVersion: 4, reason: "Produsul revine la tiv", recipientEmployeeId: "22222222-2222-4222-8222-222222222222" }, "key-4");
  assert.deepEqual(calls.map((call) => [call.method, call.url.pathname, call.body ?? null]), [
    ["GET", "/management/production-exceptions/11111111-1111-4111-8111-111111111111/restore-recipients", null],
    ["POST", "/management/production-exceptions/11111111-1111-4111-8111-111111111111/cancel", { expectedVersion: 4, reason: "Produsul revine la tiv", recipientEmployeeId: "22222222-2222-4222-8222-222222222222" }],
  ]);
  const page = readFileSync(path.join(root, "src/pages/ApprovalsPage.tsx"), "utf8");
  assert.match(page, /data\.actions\.cancelNeedsRecipient && !recipientId/);
  assert.match(page, /data-testid="recovery-recipient"/);
  assert.match(MESSAGES.ro.exceptions.recoveryBody, /rămâne blocată/);
});

test("unknown meters are shown apart and never as a measured zero", () => {
  const x = MESSAGES.ro.exceptions;
  assert.equal(faultScope(x, { faultMeters: "4.500", unmeasuredLineCount: 1 }), "4,5 m + 1 produs fără metraj");
  assert.equal(faultScope(x, { faultMeters: null, unmeasuredLineCount: 2 }), "2 produse fără metraj");
  assert.equal(faultScope(x, { faultMeters: "17.000", unmeasuredLineCount: 0 }), "17 m");
  assert.equal(faultScope(x, { faultMeters: "17.000" }), "17 m", "an older API without the count is fully measured");
  assert.doesNotMatch(faultScope(x, { faultMeters: "0.000", unmeasuredLineCount: 1 }), /0 m/);
  assert.equal(faultScope(MESSAGES.tr.exceptions, { faultMeters: null, unmeasuredLineCount: 1 }), "1 ürün metrajsız");
});
