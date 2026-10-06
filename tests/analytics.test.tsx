import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createApi } from "../src/api/client";
import { NAVIGATION } from "../src/components/Shell";
import { parseRoute } from "../src/app/router";
import { AnalyticsPage } from "../src/pages/AnalyticsPage";
import { DashboardContext } from "../src/app/context";
import { I18nProvider } from "../src/i18n/context";
import { createTranslator } from "../src/i18n";
import { API, fakeFetch, me, sessionPayload } from "./support";

test("analytics routes keep date filters across strict identity drilldowns", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parseRoute(`/analiza/angajati/${id}?from=2026-03-29&to=2026-03-29`), { name: "analytics", section: "employees", id });
  assert.deepEqual(parseRoute(`/analiza/comenzi/${id}`), { name: "analytics", section: "orders", id });
  assert.deepEqual(parseRoute(`/analiza/firme/${id}`), { name: "analytics", section: "companies", id });
  assert.deepEqual(parseRoute(`/analiza/departamente/${id}`), { name: "not-found" });
  assert.deepEqual(parseRoute("/analiza/angajati/not-an-id"), { name: "not-found" });
});
test("analytics navigation trusts server capabilities, not a broad role or production grant", () => {
  const narrow = me({ permissions: ["production.exceptions.approve", "analytics.view"], capabilities: { approveExceptions: true, approvalViaBackup: false, lookupOrders: true, manageOrganization: false, manageProductionSettings: false, cancelExceptions: false, viewAnalytics: false } });
  assert.equal(NAVIGATION.some(n => n.label === "analytics" && n.visible(narrow, () => true)), false);
  const reader = me({ permissions: ["analytics.view"], capabilities: { ...narrow.capabilities!, viewAnalytics: true } });
  assert.equal(NAVIGATION.some(n => n.label === "analytics" && n.visible(reader, () => false)), true);
});
test("analytics reads and policy writes use central cookies, CSRF and retry keys", async () => {
  const { fetchImpl, calls } = fakeFetch(call => ({ body: call.url.pathname === "/auth/session" ? sessionPayload() : { items: [] } }));
  const api = createApi(API, fetchImpl); await api.getSession();
  await api.analytics("employees", { from: "2026-03-29", to: "2026-03-29", cursor: "id" });
  await api.updateAnalyticsPolicy({ approvalGraceMinutes: 60, expectedVersion: 2 }, "analytics-stable-retry-key");
  assert.equal(calls[1].method, "GET"); assert.equal(calls[1].credentials, "include"); assert.equal(calls[1].url.searchParams.get("from"), "2026-03-29");
  assert.equal(calls[2].headers["X-CSRF-Token"], "csrf-token-1"); assert.equal(calls[2].headers["Idempotency-Key"], "analytics-stable-retry-key");
});
test("analytics is localized and a denied direct page does not request report data", () => {
  for (const locale of ["ro", "tr"] as const) {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: {} })); const api = createApi(API, fetchImpl); const actor = me();
    const html = renderToStaticMarkup(<I18nProvider locale={locale}><DashboardContext.Provider value={{ api, me: actor, session: sessionPayload(), can: () => false, navigate: () => undefined }}><AnalyticsPage section="employees" /></DashboardContext.Provider></I18nProvider>);
    assert.ok(html.includes(createTranslator(locale).t.analytics.title)); assert.ok(html.includes('role="alert"')); assert.equal(calls.length, 0);
    assert.ok(createTranslator(locale).permission("analytics.view").length > 5);
  }
});
