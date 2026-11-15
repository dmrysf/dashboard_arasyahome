import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { createApi } from "../src/api/client";
import { isCeoOverview, knownShare, reconciles, record, refreshSeconds, skuValue, sumMeters, topSkus, type Bag, type CeoCompletions, type CeoOverview, type CeoSkus, type SkuRow } from "../src/api/ceo";
import { homePath } from "../src/app/App";
import { DashboardContext } from "../src/app/context";
import { intelligencePath, parseRoute } from "../src/app/router";
import { I18nProvider } from "../src/i18n/context";
import { ceoRo, ceoTr } from "../src/i18n/ceo";
import { CeoCompletionsView, CeoOverviewView, CeoSkusView } from "../src/pages/CeoViews";
import { bucharestRange, initialFilters, sectionQuery } from "../src/pages/ProductionIntelligencePage";
import { API, fakeFetch, me, sessionPayload } from "./support";

const capabilities = { approveExceptions: false, approvalViaBackup: false, lookupOrders: false, manageOrganization: false, manageProductionSettings: false, cancelExceptions: false };
const has = (html: string, text: string) => html.includes(text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;"));
const range = { range: { fromUtc: "2026-11-14 22:00:00", toUtcExclusive: "2026-11-15 22:00:00", timezone: "Europe/Bucharest" }, source: null, contractVersion: 1 };

function bag(over: Partial<Bag> = {}): Bag {
  return { orders: 0, lines: 0, units: 0, fabricMeters: "0.000", railMeters: "0.000", measuredLines: 0, notMeteredLines: 0, unknownLines: 0, unknownUnits: 0,
    panelWidthMeters: "0.000", panelLines: 0, panelUnknownLines: 0, panelUnknownUnits: 0, ...over };
}
const th = bag({ orders: 1, lines: 3, units: 13, fabricMeters: "5.000", railMeters: "3.000", measuredLines: 2, notMeteredLines: 1 });
const op = bag({ orders: 2, lines: 3, units: 4, fabricMeters: "7.000", measuredLines: 2, unknownLines: 1, unknownUnits: 1 });
const ty = bag({ orders: 1, lines: 4, units: 7, panelWidthMeters: "2.800", panelLines: 1, panelUnknownLines: 3, panelUnknownUnits: 5 });
const sum = (bags: Bag[]): Bag => bags.reduce((a, b) => ({
  orders: a.orders + b.orders, lines: a.lines + b.lines, units: a.units + b.units,
  fabricMeters: ((Number(a.fabricMeters) * 1000 + Number(b.fabricMeters) * 1000) / 1000).toFixed(3), railMeters: ((Number(a.railMeters) * 1000 + Number(b.railMeters) * 1000) / 1000).toFixed(3),
  measuredLines: a.measuredLines + b.measuredLines, notMeteredLines: a.notMeteredLines + b.notMeteredLines, unknownLines: a.unknownLines + b.unknownLines, unknownUnits: a.unknownUnits + b.unknownUnits,
  panelWidthMeters: ((Number(a.panelWidthMeters) * 1000 + Number(b.panelWidthMeters) * 1000) / 1000).toFixed(3), panelLines: a.panelLines + b.panelLines,
  panelUnknownLines: a.panelUnknownLines + b.panelUnknownLines, panelUnknownUnits: a.panelUnknownUnits + b.panelUnknownUnits,
}), bag());
const total = sum([th, op, ty]);
const quality = { meterLinesByStatus: { measured_source: 4, not_metered: 1, unknown_basis: 1 }, panelLinesByStatus: { verified: 1, conflict: 1, no_measure: 1, quantity_mismatch: 1 }, categoryKnownLines: 9, categoryUnknownLines: 1, linesByEvidence: { shop_fact_event: 4, trendyol_panel_verified: 1, none: 5 } };

function overview(over: Partial<CeoOverview> = {}): CeoOverview {
  return {
    ...range, generatedAt: "2026-11-15T10:00:00.000Z", lastActivityAt: "2026-11-15T09:55:00.000Z", refresh: { suggestedSeconds: 300 },
    received: { orders: 6, units: 20, cancelled: 1, bySource: { trendhome: { orders: 2, units: 14, cancelled: 0 }, outletperdele: { orders: 3, units: 4, cancelled: 1 }, trendyol: { orders: 1, units: 2, cancelled: 0 }, b2b: { orders: 0, units: 0, cancelled: 0 } } },
    worked: { orders: 5, bySource: { trendhome: 2, outletperdele: 2, trendyol: 1, b2b: 0 }, byArea: { production: 4, confirmare: 3 } },
    completed: { ...total, recompletions: { orders: 1, events: 1 }, cancelledAfterCompletion: 1, afterCompletion: { cancelled: bag({ orders: 1 }), returned: bag() }, bySource: { trendhome: th, outletperdele: op, trendyol: ty } },
    current: { inProduction: 12, waiting: 7, delayed: 3, delayedWaiting: 1, delayedInProduction: 2, stopped: 1, legacyActive: 40, bySource: {}, byStage: { waiting: 7, labeling: 5, "side-hem": 7 }, delayedByStage: { "side-hem": 2, waiting: 1 }, asOf: "2026-11-15T10:00:00.000Z", delayHours: 48 },
    quality, ledger: { state: "empty", available: false, syncedThrough: null, ordered: null, verifiedSale: null },
    definitions: { delayHours: 48, categoryCatalog: false, panelRule: "" },
    ...over,
  };
}

function completions(over: Partial<CeoCompletions> = {}): CeoCompletions {
  return {
    ...range, bucket: "day",
    totals: { ...total, recompletions: { orders: 1, events: 1 }, cancelledAfterCompletion: 1 },
    afterCompletion: { cancelled: bag({ orders: 1, units: 2, fabricMeters: "3.000" }), returned: bag(), net: sum([th, bag({ orders: 1, units: 2, fabricMeters: "4.000", lines: 2 }), ty]), rule: "x" },
    bySource: { trendhome: th, outletperdele: op, trendyol: ty },
    byCategory: [{ ...th, category: "Draperii", source: "trendhome", categorySources: ["shop_catalog"] }, { ...op, category: "unknown", source: "outletperdele", categorySources: ["none"] }, { ...ty, category: "Perdele", source: "trendyol", categorySources: ["trendyol_prepared_kind"] }],
    bySku: { items: [
      { ...th, source: "trendhome", productCode: "DV-1", name: "Draperie Velvet", category: "Draperii", categorySource: "shop_catalog", evidence: { shop_fact_event: 2 } },
      { ...op, source: "outletperdele", productCode: "PV-2", name: "Perdea Voal", category: "unknown", categorySource: "none", evidence: [] },
      { ...ty, source: "trendyol", productCode: "TY-9", name: "Velvet Curtain", category: "Perdele", categorySource: "trendyol_prepared_kind", evidence: { trendyol_panel_verified: 1 } },
    ], total: 3, truncated: false },
    completionCredits: [{ ...sum([th, op]), employeeId: "e1", employeeName: "Ana Pop" }, { ...ty, employeeId: "e2", employeeName: "Ion Rus" }],
    stageWork: [{ employeeId: "e3", employeeName: "Maria Croitor", stageId: "labeling", completions: 4, orders: 3 }],
    series: [{ ...sum([th, op]), period: "2026-11-14", bySource: { trendhome: th, outletperdele: op } }, { ...ty, period: "2026-11-15", bySource: { trendyol: ty } }],
    quality, definitions: { categoryCatalog: true, panelRule: "" },
    ...over,
  };
}

const sku = (over: Partial<SkuRow>): SkuRow => ({ source: "trendhome", productCode: "DV-1", name: "Draperie", category: "Draperii", categorySource: "shop_catalog", variants: 1, orders: 1, units: 2, lines: 1,
  processedOrders: 1, processedFabricMeters: "5.000", processedRailMeters: "0.000", processedPanelWidthMeters: "0.000", completedOrders: 1, completedUnits: 2, completedFabricMeters: "5.000",
  completedRailMeters: "0.000", completedPanelWidthMeters: "0.000", unknownLines: 0, unknownUnits: 0, unknownByPopulation: { received: 0, processed: 0, completed: 0 }, evidence: { shop_fact_event: 1 }, ...over });

function render(node: ReactNode, locale: "ro" | "tr" = "ro") {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: {} }));
  const api = createApi(API, fetchImpl);
  const actor = me({ capabilities: { ...capabilities, viewProductionIntelligence: true } });
  return { html: renderToStaticMarkup(<I18nProvider locale={locale}><DashboardContext.Provider value={{ api, me: actor, session: sessionPayload(), can: () => true, navigate: () => undefined }}>{node}</DashboardContext.Provider></I18nProvider>), calls };
}

test("CEO routes: the overview is the section's home; every section round-trips", () => {
  assert.deepEqual(parseRoute("/metraj"), { name: "intelligence", section: "overview" });
  assert.deepEqual(parseRoute("/metraj/finalizate"), { name: "intelligence", section: "completions" });
  assert.deepEqual(parseRoute("/metraj/produse-analiza"), { name: "intelligence", section: "skus" });
  assert.deepEqual(parseRoute("/metraj/sumar"), { name: "intelligence", section: "summary" });
  for (const section of ["overview", "completions", "skus", "summary", "products", "employees", "series"] as const) assert.deepEqual(parseRoute(intelligencePath(section)), { name: "intelligence", section });
});

test("the CEO starts on the production overview; Root and narrow roles keep their start page", () => {
  const ceo = me({ isRoot: false, capabilities: { ...capabilities, viewProductionIntelligence: true } });
  assert.equal(homePath(ceo, () => true), "/metraj");
  assert.equal(homePath(me({ isRoot: true, capabilities: { ...capabilities, viewProductionIntelligence: true } }), (p) => p === "dashboard.overview.view"), null);
  assert.notEqual(homePath(me({ isRoot: false, capabilities: { ...capabilities } }), (p) => p === "employees.view"), "/metraj", "without the server capability nobody is sent to the CEO screens");
});

test("filters: the overview opens on today, others on this month; SKU filters only reach the SKU analysis", () => {
  assert.equal(initialFilters("overview", "").period, "today");
  assert.equal(initialFilters("completions", "").period, "month");
  const f = initialFilters("skus", "?period=week&category=Draperii&code=dv&variant=140&status=shipped&bucket=week");
  assert.equal(f.status, "all", "an unknown status falls back to all");
  assert.deepEqual(sectionQuery("skus", f), { period: "week", source: undefined, category: "Draperii", code: "dv", variant: "140", status: undefined });
  assert.deepEqual(sectionQuery("completions", f), { period: "week", source: undefined, bucket: "week" });
  assert.deepEqual(sectionQuery("overview", f), { period: "week", source: undefined });
  assert.deepEqual(sectionQuery("summary", { ...f, status: "completed" }), { period: "week", source: undefined });
});

test("the range label shows Bucharest days (summer and winter time), not UTC dates", () => {
  assert.deepEqual(bucharestRange("2026-10-31 22:00:00", "2026-11-15 22:00:00"), ["2026-11-01", "2026-11-15"]);
  assert.deepEqual(bucharestRange("2026-10-03 21:00:00", "2026-10-04 21:00:00"), ["2026-10-04", "2026-10-04"]);
});

test("helpers: sums in millimetres, reconciliation, unit-safe SKU ranking, refresh pace", () => {
  assert.equal(sumMeters([{ v: "1.100" }, { v: "2.205" }], (r) => r.v), 3305);
  assert.equal(sumMeters([{ v: "1.100" }, { v: "x" }], (r) => r.v), null, "a malformed value makes the sum unknown, never 0");
  const c = completions();
  assert.equal(reconciles(c.totals, c.series, ["orders", "units", "fabricMeters", "railMeters", "panelWidthMeters"]), true);
  assert.equal(reconciles(c.totals, c.byCategory), true);
  assert.equal(reconciles(c.totals, [th, op]), false, "a missing channel breaks the reconciliation");
  const rows = [sku({}), sku({ source: "trendyol", productCode: "TY", processedFabricMeters: "0.000", processedPanelWidthMeters: "90.000" }), sku({ productCode: "DV-2", processedFabricMeters: "9.000" })];
  assert.deepEqual(topSkus(rows, "processed", 20, "fabric").map((r) => r.productCode), ["DV-2", "DV-1"], "fabric ranking keeps Trendyol panel width out");
  assert.deepEqual(topSkus(rows, "processed", 20, "panel").map((r) => r.productCode), ["TY"]);
  assert.deepEqual(topSkus(rows, "processed", 1, "fabric").map((r) => r.productCode), ["DV-2"]);
  assert.equal(skuValue(rows[1], "completed"), 0);
  assert.equal(refreshSeconds(300), 300); assert.equal(refreshSeconds(10), 120); assert.equal(refreshSeconds(99999), 900); assert.equal(refreshSeconds(undefined), 300);
  assert.equal(knownShare(9, 1), 90); assert.equal(knownShare(0, 0), null);
  assert.deepEqual(record([]), {});
  assert.equal(isCeoOverview(overview()), true); assert.equal(isCeoOverview({ ordered: {} }), false);
});

test("overview: KPIs per channel, Trendyol panel width apart, empty ledger unavailable (never 0), current state", () => {
  const { html } = render(<CeoOverviewView data={overview()} />);
  for (const text of [ceoRo.kpi.received, ceoRo.kpi.worked, ceoRo.kpi.completed, ceoRo.kpi.units, ceoRo.kpi.thMeters, ceoRo.kpi.opMeters, ceoRo.kpi.tyPanel, ceoRo.kpi.inProduction, ceoRo.kpi.waiting, ceoRo.kpi.delayed(48)]) assert.ok(has(html, text), text);
  assert.ok(html.includes("5,0 m") && html.includes("7,0 m") && html.includes("2,8 m"), "TH 5.0, OP 7.0 and Trendyol 2.8 m each shown on their own");
  assert.ok(!html.includes("14,8 m") && !html.includes("9,8 m"), "Trendyol panel width is never added to the L meters");
  assert.ok(has(html, ceoRo.noSum));
  assert.equal(html.split(ceoRo.concepts.unavailable).length - 1, 2, "ordered and verified sale are unavailable while the ledger is empty");
  assert.ok(has(html, ceoRo.kpi.delayedHint(48)) && ceoTr.kpi.delayed(48) === "Aynı aşamada 48 saatten uzun süredir bekleyen siparişler" && has(html, ceoRo.kpi.legacy(40)) && has(html, ceoRo.kpi.stopped(1)));
  assert.ok(has(html, ceoRo.catalogMissing), "a missing category catalog is said, not hidden");
  assert.ok(has(html, ceoRo.charts.reconciled), "the channel table proves the chart");
  const withLedger = render(<CeoOverviewView data={overview({ ledger: { state: "manual", available: true, syncedThrough: null, ordered: { fabricMeters: "120.500", railMeters: "0.000" }, verifiedSale: { fabricMeters: "0.000", railMeters: "0.000" } } })} />).html;
  assert.ok(withLedger.includes("120,5 m") && !has(withLedger, ceoRo.concepts.unavailable));
});

test("overview in Turkish", () => {
  const { html } = render(<CeoOverviewView data={overview()} />, "tr");
  for (const text of [ceoTr.kpi.received, ceoTr.kpi.worked, ceoTr.kpi.tyPanel, ceoTr.kpi.delayed(48), ceoTr.concepts.unavailable, ceoTr.noSum]) assert.ok(has(html, text), text);
});

test("completions: charts with tables, totals reconciled, after-completion split, stage work apart", () => {
  const { html } = render(<CeoCompletionsView data={completions()} />);
  for (const text of [ceoRo.charts.dailyOrders, ceoRo.charts.dailyMeters, ceoRo.charts.dailyPanel, ceoRo.charts.categories, ceoRo.charts.topSkus(20), ceoRo.charts.credits, ceoRo.charts.stageWork, ceoRo.charts.quality]) assert.ok(has(html, text), text);
  assert.ok(!has(html, ceoRo.charts.notReconciled), "every chart reconciles with its table");
  assert.ok(has(html, ceoRo.after.net) && has(html, ceoRo.after.cancelled) && has(html, ceoRo.after.recompletions(1)));
  assert.ok(html.includes("DV-1") && html.includes("Maria Croitor") && has(html, ceoRo.categories.unknown));
  assert.ok(html.includes("2,8 m ⊡ · 7"), "a Trendyol category shows its panel width, never 0 m of fabric");
  assert.ok(!html.includes("0,0 m · 7"), "no Trendyol category row reads as zero fabric meters");
  assert.ok(html.includes('role="img"') && html.includes("tabindex=\"0\""), "bars are focusable for the per-day tooltip");
  const broken = render(<CeoCompletionsView data={completions({ series: completions().series.slice(0, 1) })} />).html;
  assert.ok(has(broken, ceoRo.charts.notReconciled), "a series that does not add up is flagged");
  assert.ok(has(render(<CeoCompletionsView data={completions({ totals: { ...bag(), recompletions: { orders: 0, events: 0 }, cancelledAfterCompletion: 0 }, series: [] })} />).html, ceoRo.charts.empty));
});

test("SKU analysis: filters, categories, panel apart from fabric, evidence", () => {
  const data: CeoSkus = { ...range, filters: { category: null, code: null, variant: null, status: "all", sku: null }, total: 2, truncated: false, categories: ["Draperii", "unknown"],
    items: [sku({}), sku({ source: "trendyol", productCode: "TY-9", category: "unknown", processedFabricMeters: "0.000", processedPanelWidthMeters: "2.800", completedFabricMeters: "0.000", completedPanelWidthMeters: "2.800", unknownLines: 3, evidence: { trendyol_panel_verified: 1 } })],
    definitions: { categoryCatalog: true } };
  const { html } = render(<CeoSkusView data={data} filters={{ category: "", code: "", variant: "", status: "all" }} onFilters={() => undefined} query={{ period: "month" }} />);
  for (const text of [ceoRo.sku.filters.category, ceoRo.sku.filters.code, ceoRo.sku.filters.variant, ceoRo.sku.filters.status, ceoRo.sku.fabricTop, ceoRo.sku.panelTop, ceoRo.sku.definitions]) assert.ok(has(html, text), text);
  assert.ok(html.includes("2,8 m ⊡") && html.includes("5,0 m"), "Trendyol rows show panel width with its own mark");
  assert.ok(has(html, ceoRo.evidence.trendyol_panel_verified) && has(html, ceoRo.categories.unknown));
  assert.ok(has(render(<CeoSkusView data={{ ...data, items: [], total: 0 }} filters={{ category: "", code: "", variant: "", status: "all" }} onFilters={() => undefined} query={{}} />).html, ceoRo.sku.empty));
});

test("the client reads the CEO reports read-only from the management routes", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: overview() }));
  const api = createApi(API, fetchImpl);
  await api.intelligence("overview", { period: "today", source: undefined });
  await api.intelligence("skus", { period: "month", category: "Draperii", code: undefined });
  assert.equal(String(calls[0].url), `${API}/management/production-intelligence/overview?period=today`);
  assert.equal(String(calls[1].url), `${API}/management/production-intelligence/skus?period=month&category=Draperii`);
  assert.ok(calls.every((call) => call.method === "GET"));
});

test("Romanian and Turkish CEO texts have the same shape", () => {
  const shape = (value: unknown): unknown => typeof value === "function" ? `fn${(value as (...a: unknown[]) => unknown).length}` : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, shape((value as Record<string, unknown>)[k])])) : typeof value;
  assert.deepEqual(shape(ceoTr), shape(ceoRo));
});
