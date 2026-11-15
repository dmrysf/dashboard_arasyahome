import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { createApi } from "../src/api/client";
import {
  COVERAGE_STATUSES, PAYMENT_CLASSES, isCurrentSummary, ledgerState, meterUnits, periodQuery, share, validCustomRange,
  type IntelligenceEmployees, type IntelligenceProducts, type IntelligenceSeries, type IntelligenceSummary,
} from "../src/api/intelligence";
import { DashboardContext } from "../src/app/context";
import { intelligencePath, parseRoute } from "../src/app/router";
import { NAVIGATION } from "../src/components/Shell";
import { I18nProvider } from "../src/i18n/context";
import { intelligenceRo, intelligenceTr } from "../src/i18n/intelligence";
import { EmployeesView, ProductionIntelligencePage, ProductsView, SeriesView, SummaryView } from "../src/pages/ProductionIntelligencePage";
import { API, fakeFetch, me, sessionPayload } from "./support";

const capabilities = { approveExceptions: false, approvalViaBackup: false, lookupOrders: false, manageOrganization: false, manageProductionSettings: false, cancelExceptions: false };
/** renderToStaticMarkup escapes quotes and apostrophes ("26 Ekim 2026'dan"). */
const has = (html: string, text: string) => html.includes(text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;"));
const meters = (fabric: string, rail = "0.000") => ({ fabricMeters: fabric, railMeters: rail });

function summary(overrides: Partial<IntelligenceSummary> = {}): IntelligenceSummary {
  const classes = Object.fromEntries(PAYMENT_CLASSES.map((key) => [key, { ...meters("0.000"), orders: 0 }])) as IntelligenceSummary["ordered"]["byPayment"];
  return {
    range: { fromUtc: "2026-10-03 21:00:00", toUtcExclusive: "2026-11-14 22:00:00", timezone: "Europe/Bucharest" }, source: null, contractVersion: 1,
    ordered: { ...meters("0.000"), entriesByReason: [], syncedThrough: null, byOrigin: { arasya: meters("0.000"), outside_arasya: { ...meters("282.610", "3.400"), verifiedSaleOrders: 29, meteredLines: 40, unknownLines: 0, notVerifiedOrders: 7, openOrders: 7, openFabricMeters: "31.000", openRailMeters: "0.000", openUnknownLines: 0, ordersByShopStatus: { completed: 29, expediat: 3 }, saleRule: "", openRule: "", productionEvidence: false } }, byPayment: classes },
    verifiedSale: { ...meters("0.000"), byOrigin: { arasya: meters("0.000"), outside_arasya: meters("282.610", "3.400") }, notVerified: meters("0.000"), rule: "" },
    cut: { orders: 12, fabricMeters: "84.500", ordersWithUnknownLines: 3, unknownLines: 5, evidence: "source_line", measuredCutMeters: null },
    recut: { orders: 1, fabricMeters: "6.000", ordersWithUnknownLines: 0, unknownLines: 0, evidence: "source_line" },
    processed: { stageCompletions: 40 },
    completed: { orders: 9, fabricMeters: "60.250", ordersWithUnknownLines: 0, unknownLines: 0 },
    shipped: { available: false, fabricMeters: null, reason: "no_meter_evidence", marketplaceOrders: 167 },
    delivered: { available: false, fabricMeters: null, reason: "no_meter_evidence", marketplaceOrders: 916 },
    coverage: { linesByStatus: { measured_source: 300, unknown_basis: 12, conflict: 1, unknown_marketplace: 900 } },
    ...overrides,
  };
}

function render(node: ReactNode, actor = me({ capabilities: { ...capabilities, viewProductionIntelligence: true } }), locale: "ro" | "tr" = "ro") {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: {} }));
  const api = createApi(API, fetchImpl);
  const html = renderToStaticMarkup(<I18nProvider locale={locale}><DashboardContext.Provider value={{ api, me: actor, session: sessionPayload(), can: () => true, navigate: () => undefined }}>{node}</DashboardContext.Provider></I18nProvider>);
  return { html, calls };
}

test("Production Intelligence routes", () => {
  assert.deepEqual(parseRoute("/metraj"), { name: "intelligence", section: "overview" }, "the CEO overview is the section's home since 0.20.0");
  assert.deepEqual(parseRoute("/metraj/sumar"), { name: "intelligence", section: "summary" });
  assert.deepEqual(parseRoute("/metraj/produse"), { name: "intelligence", section: "products" });
  assert.deepEqual(parseRoute("/metraj/angajati?period=month"), { name: "intelligence", section: "employees" });
  assert.deepEqual(parseRoute("/metraj/evolutie"), { name: "intelligence", section: "series" });
  assert.deepEqual(parseRoute("/metraj/altceva"), { name: "not-found" });
  for (const section of ["summary", "products", "employees", "series"] as const) assert.deepEqual(parseRoute(intelligencePath(section)), { name: "intelligence", section });
});

test("the section is offered only from the server capability (Root and the canonical CEO)", () => {
  const item = NAVIGATION.find((entry) => entry.path === "/metraj");
  assert.ok(item);
  assert.equal(item.visible(me({ capabilities: { ...capabilities, viewProductionIntelligence: true } }), () => false), true);
  assert.equal(item.visible(me({ isRoot: false, capabilities: { ...capabilities, viewAnalytics: true } }), () => true), false, "analytics.view and every permission are not enough");
  assert.equal(item.visible(me({ isRoot: true }), () => true), false, "an older API without the capability hides the section");
});

test("meters are read as integer millimetres; malformed values are never zero", () => {
  assert.equal(meterUnits("13428.240"), 13428240);
  assert.equal(meterUnits("-3.5"), -3500);
  assert.equal(meterUnits("0.000"), 0);
  assert.equal(meterUnits("abc"), null);
  assert.equal(meterUnits("1e3"), null);
  assert.equal(meterUnits(undefined), null);
  assert.equal(share(1, 3), 33);
  assert.equal(share(1, 0), null);
});

test("periods: total starts at the analysis start and respects the 366-day window", () => {
  assert.deepEqual(periodQuery("month", { from: "", to: "" }), { period: "month" });
  assert.deepEqual(periodQuery("total", { from: "", to: "" }, new Date("2026-11-14T21:00:00Z")), { from: "2026-10-04", to: "2026-11-14" });
  assert.deepEqual(periodQuery("total", { from: "", to: "" }, new Date("2027-12-01T10:00:00Z")), { from: "2026-12-01", to: "2027-12-01" });
  assert.deepEqual(periodQuery("custom", { from: "2026-10-04", to: "2026-10-31" }), { from: "2026-10-04", to: "2026-10-31" });
  assert.equal(validCustomRange("2026-10-04", "2026-10-31"), true);
  assert.equal(validCustomRange("2026-10-01", "2026-10-31"), false, "before the analysis start");
  assert.equal(validCustomRange("2026-11-02", "2026-11-01"), false);
  assert.equal(validCustomRange("2026-10-04", "2027-10-06"), false, "more than 366 days");
});

test("an empty ledger is never shown as zero ordered or sold meters", () => {
  assert.equal(ledgerState(summary()), "empty");
  assert.equal(ledgerState(summary({ ordered: { ...summary().ordered, entriesByReason: { sale: 3 } } })), "manual");
  assert.equal(ledgerState(summary({ ordered: { ...summary().ordered, entriesByReason: { sale: 3 }, syncedThrough: "2026-11-15T10:00:00Z" } })), "automatic");
  const { html } = render(<SummaryView data={summary()} />);
  assert.ok(html.includes(intelligenceRo.ledger.empty));
  assert.ok(html.includes(intelligenceRo.ledger.hidden));
  assert.equal(html.includes("0,0 m"), false, "no ordered or sold zero");
  assert.ok(html.includes("282,6 m"), "the outside-Arasya verified sales stay visible");
  assert.ok(html.includes(intelligenceRo.concepts.marketplace(916)), "Trendyol delivered orders, no meters");
});

test("the summary keeps the five concepts apart and shows every payment class", () => {
  const data = summary({
    ordered: { ...summary().ordered, ...meters("1000.000", "20.000"), entriesByReason: { sale: 10 }, byPayment: {
      paid: { ...meters("400.000", "10.000"), orders: 4 }, advance_verified: { ...meters("300.000"), orders: 3 }, partial: { ...meters("0.000"), orders: 0 }, no_charge: { ...meters("0.000"), orders: 0 },
      unverified: { ...meters("200.000"), orders: 2 }, reversed: { ...meters("0.000"), orders: 0 }, unknown: { ...meters("100.000", "10.000"), orders: 1 },
    } },
    verifiedSale: { ...meters("400.000", "10.000"), byOrigin: { arasya: meters("400.000", "10.000"), outside_arasya: meters("0.000") }, notVerified: meters("600.000", "10.000"), rule: "" },
  });
  for (const locale of ["ro", "tr"] as const) {
    const x = locale === "ro" ? intelligenceRo : intelligenceTr;
    const { html } = render(<SummaryView data={data} />, undefined, locale);
    for (const title of [x.concepts.ordered, x.concepts.verifiedSale, x.concepts.production, x.concepts.shipped, x.concepts.delivered]) assert.ok(has(html, title), `${locale} ${title}`);
    for (const key of PAYMENT_CLASSES) assert.ok(has(html, x.payment.classes[key]), `${locale} class ${key}`);
    assert.ok(has(html, x.ledger.manual), "manual ledger notice");
    assert.ok(has(html, x.coverage.warning(913)), "unknown and conflicting lines are named, never zero");
    assert.ok(has(html, x.payment.unknownHint));
    assert.ok(has(html, x.payment.asOf), "the payment class is the state at report time, never the payment date");
  }
  const { html } = render(<SummaryView data={data} />);
  assert.ok(html.includes("1.000,0 m") && html.includes("400,0 m"), "ordered and verified sale side by side");
  assert.ok(html.includes("40%"), "share of the paid class");
});

test("an older API without the 2.72.0 shape is reported, not misread", () => {
  assert.equal(isCurrentSummary({ sold: {}, coverage: {} }), false);
  assert.equal(isCurrentSummary(summary()), true);
});

test("a denied identity sees no report and sends no request", () => {
  for (const actor of [me({ isRoot: true }), me({ capabilities: { ...capabilities, viewAnalytics: true } })]) {
    const { html, calls } = render(<ProductionIntelligencePage section="summary" />, actor);
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes(intelligenceRo.denied));
    assert.equal(calls.length, 0);
  }
});

test("reports are GET requests with the central cookie and the filters", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => ({ body: call.url.pathname === "/auth/session" ? sessionPayload() : summary() }));
  const api = createApi(API, fetchImpl);
  await api.getSession();
  await api.intelligence("series", { from: "2026-10-04", to: "2026-11-14", source: "trendhome", bucket: "week" });
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[1].credentials, "include");
  assert.equal(calls[1].url.pathname, "/management/production-intelligence/series");
  assert.equal(calls[1].url.searchParams.get("bucket"), "week");
  assert.equal(calls[1].url.searchParams.get("source"), "trendhome");
});

test("products, employees and series render their rows, the table view and the chart", () => {
  const products: IntelligenceProducts = { range: summary().range, source: null, contractVersion: 1, total: 2, truncated: false, items: [
    { source: "trendhome", productCode: "PERDEA-01", variant: "Alb", orderedFabricMeters: "10.000", orderedRailMeters: "0.000", verifiedSaleFabricMeters: "4.000", verifiedSaleRailMeters: "0.000", orderedOutsideArasyaFabricMeters: "0.000", orderedOutsideArasyaRailMeters: "0.000", cutFabricMeters: "6.000", completedFabricMeters: "6.000", unknownLines: 0 },
    { source: "trendyol", productCode: null, variant: null, orderedFabricMeters: "0.000", orderedRailMeters: "0.000", verifiedSaleFabricMeters: "0.000", verifiedSaleRailMeters: "0.000", orderedOutsideArasyaFabricMeters: "0.000", orderedOutsideArasyaRailMeters: "0.000", cutFabricMeters: "0.000", completedFabricMeters: "0.000", unknownLines: 7 },
  ] };
  const p = render(<ProductsView data={products} />).html;
  assert.ok(p.includes("PERDEA-01") && p.includes(intelligenceRo.products.noCode) && p.includes("badge-warning"));
  const employees: IntelligenceEmployees = { range: summary().range, source: null, contractVersion: 1, items: [
    { employeeId: "e1", employeeName: "Croitor Unu", stageId: "material-preparation", completions: 3, cuts: 2, recuts: 1, fabricMeters: "12.000", completionsWithUnknownLines: 0, completionsWithoutMeters: 1, evidence: "source_line" },
  ] };
  const e = render(<EmployeesView data={employees} />).html;
  assert.ok(e.includes("Croitor Unu") && e.includes("Tăiere") && e.includes("12,0"));
  const point = (period: string, ordered: string) => ({ period, orderedFabricMeters: ordered, orderedRailMeters: "0.000", verifiedSaleFabricMeters: "1.000", verifiedSaleRailMeters: "0.000", orderedOutsideArasyaFabricMeters: "0.000", orderedOutsideArasyaRailMeters: "0.000", cutFabricMeters: "0.000", completedFabricMeters: "2.000", cutOrders: 0, completedOrders: 1 });
  const series: IntelligenceSeries = { range: summary().range, source: null, contractVersion: 1, bucket: "week", items: [point("2026-W44", "5.000"), point("2026-W45", "7.500")] };
  const s = render(<SeriesView data={series} />).html;
  assert.ok(s.includes("<svg") && s.includes("2026-W45") && s.includes(intelligenceRo.series.legend.verified));
  assert.ok(s.includes("nu ziua plății") && s.includes("nu metri măsurați"), "series dates and line meters are explained");
  assert.equal(render(<SeriesView data={{ ...series, items: [] }} />).html.includes("<svg"), false);
});

test("every payment class and line status has Romanian and Turkish words", () => {
  for (const key of PAYMENT_CLASSES) { assert.ok(intelligenceRo.payment.classes[key]); assert.ok(intelligenceTr.payment.classes[key]); }
  for (const key of COVERAGE_STATUSES) { assert.ok(intelligenceRo.coverage.statuses[key]); assert.ok(intelligenceTr.coverage.statuses[key]); }
  assert.deepEqual(Object.keys(intelligenceTr).sort(), Object.keys(intelligenceRo).sort());
});
