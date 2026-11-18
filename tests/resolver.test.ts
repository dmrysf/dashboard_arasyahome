import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi } from "../src/api/client";
import { RESOLVER_FIXES, RESOLVER_PROBLEMS, RESOLVER_STEPS, RESOLVER_SYSTEMS, needsStatement, orderTone, resolverPath, validReference, validValueDate, type ResolverOrder } from "../src/api/resolver";
import { parseRoute } from "../src/app/router";
import { NAVIGATION } from "../src/components/Shell";
import { resolverRo, resolverTr } from "../src/i18n/resolver";
import { API, fakeFetch, me, sessionPayload } from "./support";

const order = (overrides: Partial<ResolverOrder> = {}): ResolverOrder => ({
  globalOrderId: "trendhome:65329", orderNumber: "65329", source: "trendhome", flow: "confirmare", submittedAt: null, paymentMethod: "cod",
  stage: { id: "waiting", name: "Așteptare", ordinal: 1 }, steps: [], problem: null, fix: null, alternative: null, facts: {}, fingerprint: "f".repeat(64), ...overrides,
});

test("the resolver routes keep the typed number, a source prefix included", () => {
  assert.deepEqual(parseRoute("/rezolvare"), { name: "resolver" });
  assert.deepEqual(parseRoute("/rezolvare/65329"), { name: "resolver", number: "65329" });
  assert.deepEqual(parseRoute(resolverPath("outletperdele:60447")), { name: "resolver", number: "outletperdele:60447" });
  assert.equal(resolverPath(), "/rezolvare");
  assert.deepEqual(parseRoute("/rezolvare/%E0%A4%A"), { name: "not-found" });
});

test("root and the order resolvers see it in the navigation, nobody else", () => {
  const item = NAVIGATION.find((entry) => entry.path === "/rezolvare");
  assert.ok(item);
  const can = () => true;
  assert.equal(item.visible(me({ isRoot: true }), can), true);
  assert.equal(item.visible(me({ isRoot: false, capabilities: { approveExceptions: false, approvalViaBackup: false, lookupOrders: false, manageOrganization: false, manageProductionSettings: false, cancelExceptions: false, resolveOrders: true } }), can), true, "the Rezolvare comenzi blocate role");
  assert.equal(item.visible(me({ isRoot: false }), can), false, "every permission without the flag is not enough");
  assert.equal(NAVIGATION.find((entry) => entry.path === "/interventii")?.visible(me({ isRoot: false, capabilities: { approveExceptions: false, approvalViaBackup: false, lookupOrders: false, manageOrganization: false, manageProductionSettings: false, cancelExceptions: false, resolveOrders: true } }), can), false, "the advanced desk stays root only");
});

test("every problem, system, step and fix the server sends has words in Romanian and Turkish", () => {
  for (const code of RESOLVER_PROBLEMS) assert.ok(resolverRo.problems[code] && resolverTr.problems[code], `problem ${code}`);
  for (const system of RESOLVER_SYSTEMS) assert.ok(resolverRo.systems[system] && resolverTr.systems[system], `system ${system}`);
  for (const step of RESOLVER_STEPS) assert.ok(resolverRo.steps[step] && resolverTr.steps[step], `step ${step}`);
  for (const fix of RESOLVER_FIXES) {
    assert.ok(resolverRo.fix.actions[fix] && resolverTr.fix.actions[fix], `fix ${fix}`);
    assert.ok(resolverRo.fix.explain[fix] && resolverTr.fix.explain[fix], `fix explained ${fix}`);
  }
  assert.deepEqual(Object.keys(resolverTr.errors).sort(), Object.keys(resolverRo.errors).sort(), "the same error codes in both languages");
});

test("the statement line is checked before the advance step can be pressed", () => {
  assert.equal(validReference("FT2632104S5"), true);
  assert.equal(validReference("ab"), false);
  assert.equal(validReference("<script>"), false);
  assert.equal(validValueDate("2026-11-18", "2026-11-18"), true);
  assert.equal(validValueDate("2026-11-19", "2026-11-18"), false, "never in the future");
  assert.equal(validValueDate("2026-02-30", "2026-11-18"), false, "a real calendar day");
  assert.equal(needsStatement({ action: "verify-advance", needs: ["amount", "reference", "valueDate"] }), true);
  assert.equal(needsStatement({ action: "send-finance" }), false);
});

test("the card tone: blocked with a step, waiting without one, or fine", () => {
  assert.equal(orderTone(order()), "success");
  assert.equal(orderTone(order({ problem: { code: "finance_waiting", system: "finance", owner: "NITA CRISTINA", since: null }, fix: { action: "verify-advance" } })), "danger");
  assert.equal(orderTone(order({ problem: { code: "document_waiting", system: "shop", owner: "X", since: null } })), "warning");
});

test("the resolver reads by number and presses one step with the CSRF token and one Idempotency-Key", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url.pathname === "/auth/session") return { body: sessionPayload({ isRoot: false }, "csrf-sinem") };
    if (call.method === "POST") return { body: { action: "send-finance", outcome: "assigned", order: order() } };
    return { body: { number: "65329", orders: [order()] } };
  });
  const api = createApi(API, fetchImpl);
  await api.getSession();
  const found = await api.resolverFind("65329");
  assert.equal(found.orders[0].globalOrderId, "trendhome:65329");
  assert.equal(calls[1].url.pathname, "/management/interventions/resolver");
  assert.equal(calls[1].url.search, "?number=65329");
  await api.resolve("trendhome:65329", { action: "send-finance", fingerprint: "f".repeat(64) }, "dash-key-0002");
  const post = calls[2];
  assert.equal(post.method, "POST");
  assert.equal(post.url.pathname, "/management/interventions/resolver/orders/trendhome%3A65329");
  assert.deepEqual(post.body, { action: "send-finance", fingerprint: "f".repeat(64) });
  assert.equal(post.headers["X-CSRF-Token"], "csrf-sinem");
  assert.equal(post.headers["Idempotency-Key"], "dash-key-0002");
  await api.resolverStuck();
  assert.equal(calls[3].url.search, "");
});
