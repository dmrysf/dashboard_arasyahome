import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi } from "../src/api/client";
import { INTERVENTION_ACTIONS, INTERVENTION_BLOCKERS, RECONCILE_ACTION, exceedsOutstanding, isAvailable, normalizeAmount } from "../src/api/interventions";
import { interventionPath, parseRoute } from "../src/app/router";
import { NAVIGATION } from "../src/components/Shell";
import { interventionsRo, interventionsTr } from "../src/i18n/interventions";
import { API, fakeFetch, me, sessionPayload } from "./support";

test("the intervention desk routes keep the source-aware global order id", () => {
  assert.deepEqual(parseRoute("/interventii"), { name: "interventions" });
  assert.deepEqual(parseRoute(interventionPath("trendhome:64871")), { name: "intervention", id: "trendhome:64871" });
  assert.equal(interventionPath("trendhome:64871"), "/interventii/trendhome%3A64871");
  assert.deepEqual(parseRoute("/interventii/%E0%A4%A"), { name: "not-found" });
});

test("only the principal administrator sees the desk in the navigation", () => {
  const item = NAVIGATION.find((entry) => entry.path === "/interventii");
  assert.ok(item);
  const can = () => true;
  assert.equal(item.visible(me({ isRoot: true }), can), true);
  assert.equal(item.visible(me({ isRoot: false }), can), false, "every permission without root is not enough");
});

test("every reason the server sends has words in Romanian and Turkish", () => {
  for (const blocker of INTERVENTION_BLOCKERS) {
    assert.ok(interventionsRo.blockers[blocker], `ro ${blocker}`);
    assert.ok(interventionsTr.blockers[blocker], `tr ${blocker}`);
  }
  assert.deepEqual(Object.keys(interventionsTr.errors).sort(), Object.keys(interventionsRo.errors).sort(), "the same error codes are worded in both languages");
});

test("amounts are read like the statement writes them and an over-payment is detected", () => {
  assert.equal(normalizeAmount("150"), "150.00");
  assert.equal(normalizeAmount("149,71"), "149.71");
  assert.equal(normalizeAmount(" 0.5 "), "0.50");
  assert.equal(normalizeAmount("1.234,50"), null, "thousand separators are refused, never guessed");
  assert.equal(normalizeAmount("-5"), null);
  assert.equal(normalizeAmount("abc"), null);
  assert.equal(exceedsOutstanding("150.00", "149.71"), true, "the 64871 case: 0.29 lei above what is owed");
  assert.equal(exceedsOutstanding("149.71", "149.71"), false);
  assert.equal(exceedsOutstanding("150.00", null), false);
  assert.equal(isAvailable({ available: false, reason: "source_unavailable" }), false);
  assert.equal(isAvailable({ available: true }), true);
});

test("an intervention is a POST with its reason, the CSRF token and one Idempotency-Key", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url.pathname === "/auth/session") return { body: sessionPayload({ isRoot: true }, "csrf-root") };
    return { body: { status: "pending" } };
  });
  const api = createApi(API, fetchImpl);
  await api.getSession();
  await api.intervene("trendhome:64871", "reopen", { reason: "Musteri rejansa istedi", expectedVersion: 3 }, "dash-key-0001");
  const post = calls[1];
  assert.equal(post.method, "POST");
  assert.equal(post.url.pathname, "/management/interventions/orders/trendhome%3A64871/reopen");
  assert.deepEqual(post.body, { reason: "Musteri rejansa istedi", expectedVersion: 3 });
  assert.equal(post.headers["X-CSRF-Token"], "csrf-root");
  assert.equal(post.headers["Idempotency-Key"], "dash-key-0001");
  await api.interventions("stuck", "64871");
  assert.equal(calls[2].url.search, "?view=stuck&number=64871");
});

test("every unanswered kind has its reconciliation action, and it is a desk action", () => {
  for (const [kind, action] of Object.entries(RECONCILE_ACTION)) {
    assert.ok((INTERVENTION_ACTIONS as readonly string[]).includes(action), `${kind} -> ${action}`);
    assert.ok(interventionsRo.unanswered.kinds[kind] && interventionsTr.unanswered.kinds[kind], `${kind} is worded`);
  }
  for (const flow of ["trendyol", "b2b", "shop_legacy"] as const) assert.ok(interventionsRo.otherFlows[flow] && interventionsTr.otherFlows[flow], flow);
});
