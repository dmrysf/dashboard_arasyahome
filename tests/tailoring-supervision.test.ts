import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createApi } from "../src/api/client";
import { MESSAGES } from "../src/i18n";
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
    for (const status of ["awaiting_supervisor_review", "dismissed", "in_supervisor_custody", "return_rejected", "restored"]) assert.ok(x.status[status], `${locale} ${status}`);
    for (const action of ["supervisor_accepted", "supervisor_dismissed", "return_requested", "restored", "note_added"]) assert.ok(x.timelineActions[action], `${locale} ${action}`);
    for (const position of ["accepted", "disputed", "not_stated"]) assert.ok(x.tailoring.positions[position], `${locale} ${position}`);
    assert.ok(x.tailoring.attributionCutter && x.tailoring.attributionNone && x.tailoring.attributionMaterial);
    assert.ok(MESSAGES[locale].organization.kinds.tailoring_quality_supervisor, `${locale} appointment`);
    assert.ok(MESSAGES[locale].errors.ATTRIBUTION_REQUIRED && MESSAGES[locale].errors.ATTRIBUTION_NOT_ALLOWED && MESSAGES[locale].errors.RETURN_ASSIGNEE_UNAVAILABLE);
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
