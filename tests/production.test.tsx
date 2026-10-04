import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError, createApi } from "../src/api/client";
import type { ManagementMe, ProductionOverview } from "../src/api/types";
import { createPoller, type PollerEnvironment } from "../src/app/poller";
import { DashboardContext } from "../src/app/context";
import { createTranslator, MESSAGES, type Locale } from "../src/i18n";
import { I18nProvider } from "../src/i18n/context";
import { OverviewPage } from "../src/pages/OverviewPage";
import { ProductionOverview as ProductionOverviewContainer, ProductionPanel, type ProductionPanelProps } from "../src/pages/ProductionOverview";
import { API, me } from "./support";

const STAGE_IDS = ["waiting", "material-preparation", "workshop-receiving", "labeling", "material-straightening", "bottom-hem", "side-hem", "ironing", "height", "header-tape", "sewing-finishing", "quality-control", "packing", "delivery"];

/** A response shaped exactly like GET /management/production-overview; counts are deliberately unusual. */
function overview(overrides: Partial<ProductionOverview> = {}): ProductionOverview {
  const counts: Record<string, number> = { waiting: 7, labeling: 3, "sewing-finishing": 1 };
  return {
    generatedAt: "2026-10-04T12:00:00.000Z",
    timezone: "Europe/Bucharest",
    filters: { source: null },
    summary: { active: 11, waiting: 7, inWork: 4, unassigned: 9, completedToday: 2 },
    stages: STAGE_IDS.map((id, index) => ({
      id, label: `API ${id}`, ordinal: index + 1, active: counts[id] ?? 0, unassigned: id === "labeling" ? 1 : counts[id] ?? 0,
      oldestEnteredAt: counts[id] ? "2026-10-04T08:30:00.000Z" : null,
    })),
    oldestOrders: [
      { globalOrderId: "trendhome:91004", orderNumber: "91004", source: { key: "trendhome", name: "Trendhome" }, stage: { id: "labeling", label: "Etichetare" }, stageEnteredAt: "2026-10-02T09:00:00.000Z", owner: null, claimedAt: null, commerceStatus: { code: "processing", label: "Processing" } },
      { globalOrderId: "outletperdele:91001", orderNumber: "91001", source: { key: "outletperdele", name: "OutletPerdele" }, stage: { id: "waiting", label: "În așteptare" }, stageEnteredAt: "2026-10-04T08:30:00.000Z", owner: { id: "e-1", displayName: "Ana Popescu" }, claimedAt: "2026-10-04T09:00:00.000Z", commerceStatus: null },
    ],
    activity: [
      { id: "a-2", action: "stage_completed", occurredAt: "2026-10-04T11:40:00.000Z", employee: { id: "e-1", displayName: "Ana Popescu" }, order: { globalOrderId: "trendhome:91007", orderNumber: "91007", source: "trendhome" }, fromStage: { id: "ironing", label: "Călcare" }, toStage: { id: "height", label: "Înălțime" } },
      { id: "a-1", action: "claimed", occurredAt: "2026-10-04T11:10:00.000Z", employee: { id: "e-2", displayName: "Mihai Stan" }, order: { globalOrderId: "trendhome:91007", orderNumber: "91007", source: "trendhome" }, fromStage: { id: "ironing", label: "Călcare" }, toStage: null },
    ],
    sources: [
      { key: "outletperdele", name: "OutletPerdele", type: "woocommerce", health: "no_contact", lastContactAt: null, lastEventAt: null, activeOrders: 4 },
      { key: "trendhome", name: "Trendhome", type: "woocommerce", health: "healthy", lastContactAt: "2026-10-04T11:58:00.000Z", lastEventAt: "2026-10-04T11:58:00.000Z", activeOrders: 7 },
      { key: "trendyol", name: "Trendyol", type: "marketplace", health: "not_configured", lastContactAt: null, lastEventAt: null, activeOrders: 0 },
    ],
    ...overrides,
  };
}

function wrap(locale: Locale, node: React.ReactNode, profile: ManagementMe = me({ isRoot: true })) {
  const permissions = new Set(profile.permissions);
  return renderToStaticMarkup(
    <I18nProvider locale={locale}>
      <DashboardContext.Provider value={{
        api: createApi(API, (() => Promise.reject(new Error("no network in render tests"))) as typeof fetch),
        session: { employee: { employeeUuid: profile.employee.id, displayName: profile.employee.displayName, username: profile.employee.username, department: profile.employee.department, positionTitle: null, permissions: profile.permissions, applications: profile.applications, allowedStageIds: [], isRoot: profile.isRoot, mustChangePassword: false, authorizationVersion: profile.authorizationVersion }, expiresAt: "2026-10-04T20:00:00Z" },
        me: profile,
        navigate: () => undefined,
        can: (key) => profile.isRoot || permissions.has(key),
      }}>{node}</DashboardContext.Provider>
    </I18nProvider>,
  );
}

function panel(locale: Locale, props: Partial<ProductionPanelProps> = {}) {
  return wrap(locale, <ProductionPanel data={overview()} error={null} updatedAt={Date.parse("2026-10-04T12:00:05Z")} refreshing={false} refresh={() => undefined}
    source="" sourceOptions={[{ key: "trendhome", name: "Trendhome" }]} onSource={() => undefined} {...props} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const metric = (html: string, key: string) => html.match(new RegExp(`data-metric="${key}"><span>([^<]+)</span><strong>([^<]+)</strong>`))?.slice(1);
const stageCount = (html: string, id: string) => html.match(new RegExp(`data-stage="${id}"[^>]*>.*?class="pipeline-count"[^>]*>([^<]+)<`))?.[1];

test("summary cards show the API's numbers under the documented Romanian labels", () => {
  const html = panel("ro");
  assert.deepEqual(metric(html, "active"), ["Comenzi active", "11"]);
  assert.deepEqual(metric(html, "waiting"), ["În așteptare", "7"]);
  assert.deepEqual(metric(html, "inWork"), ["În lucru", "4"]);
  assert.deepEqual(metric(html, "unassigned"), ["Fără responsabil", "9"]);
  assert.deepEqual(metric(html, "completedToday"), ["Finalizate astăzi", "2"]);
});

test("the same panel renders the documented Turkish labels", () => {
  const html = panel("tr");
  assert.deepEqual(metric(html, "active"), ["Aktif Siparişler", "11"]);
  assert.deepEqual(metric(html, "waiting"), ["Bekleyenler", "7"]);
  assert.deepEqual(metric(html, "inWork"), ["İşlemde", "4"]);
  assert.deepEqual(metric(html, "unassigned"), ["Sorumlusu Olmayanlar", "9"]);
  assert.deepEqual(metric(html, "completedToday"), ["Bugün Tamamlananlar", "2"]);
  const body = text(html);
  for (const label of ["Üretim Akışı", "En Eski Aktif Siparişler", "Üretim Hareketleri", "Sipariş Kaynakları", "Yenile", "Çevrimiçi", "Yapılandırılmamış", "Henüz bağlantı yok", "Aşamayı tamamladı", "Siparişi üstlendi"]) {
    assert.ok(body.includes(label), `missing Turkish label: ${label}`);
  }
  for (const romanian of ["Comenzi active", "Fluxul de producție", "Actualizează", "Neconfigurat", "Cele mai vechi"]) {
    assert.ok(!body.includes(romanian), `Romanian text leaked into Turkish: ${romanian}`);
  }
});

test("the pipeline lists all 14 canonical stages in order with real and zero counts, translated by stage id", () => {
  for (const locale of ["ro", "tr"] as const) {
    const html = panel(locale);
    const ids = [...html.matchAll(/data-stage="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(ids, STAGE_IDS);
    assert.equal(stageCount(html, "waiting"), "7");
    assert.equal(stageCount(html, "labeling"), "3");
    assert.equal(stageCount(html, "sewing-finishing"), "1");
    assert.equal(stageCount(html, "delivery"), "0");
    assert.equal((html.match(/pipeline-stage is-empty/g) ?? []).length, 11);
    const catalog = MESSAGES[locale].catalog.stages;
    for (const id of STAGE_IDS) assert.ok(html.includes(catalog[id as keyof typeof catalog]), `${locale} label for ${id}`);
    assert.ok(!html.includes("API waiting"), "known stage ids use the localized label, not the server label");
  }
});

test("the busiest stage is marked from the counts, without alarm colours", () => {
  const html = panel("ro");
  assert.match(html, /data-stage="waiting" class="pipeline-stage is-peak"/);
  assert.equal((html.match(/is-peak/g) ?? []).length, 1);
  assert.ok(text(html).includes("Cea mai încărcată etapă"));
  assert.ok(!html.includes("badge-danger"));
});

test("an empty production shows zeros, the empty message and no busiest stage", () => {
  const empty = overview({
    summary: { active: 0, waiting: 0, inWork: 0, unassigned: 0, completedToday: 0 },
    stages: overview().stages.map((stage) => ({ ...stage, active: 0, unassigned: 0, oldestEnteredAt: null })),
    oldestOrders: [], activity: [],
  });
  const ro = text(panel("ro", { data: empty }));
  assert.ok(ro.includes("Nu există comenzi active."));
  assert.ok(ro.includes("Nu există activitate de producție încă."));
  assert.ok(!panel("ro", { data: empty }).includes("is-peak"));
  assert.ok(text(panel("tr", { data: empty })).includes("Aktif sipariş bulunmuyor."));
});

test("oldest orders keep the API order and show stage age, owner, source and commerce status", () => {
  const html = panel("ro");
  assert.deepEqual([...html.matchAll(/data-order="([^"]+)"/g)].map((match) => match[1]), ["91004", "91001"]);
  const body = text(html);
  assert.ok(body.includes("2 z 3 h"), "age of 91004 relative to generatedAt");
  assert.ok(body.includes("3 h 30 min"), "age of 91001 relative to generatedAt");
  assert.ok(body.includes("Nepreluată") && body.includes("Ana Popescu"));
  assert.ok(body.includes("OutletPerdele") && body.includes("Processing"));
  assert.ok(text(panel("tr")).includes("2 g 3 sa"));
  assert.match(html, /href="\/comenzi">Vezi toate comenzile</, "'see all' leads to the order workspace");
  assert.match(html, /href="\/comenzi\/trendhome%3A91004"[^>]*>91004</, "each order opens its Production Control detail");
});

test("production activity is labelled by action key and kept apart from the IAM audit", () => {
  const ro = text(panel("ro"));
  assert.ok(ro.includes("Ana Popescu A finalizat etapa 91007 · Călcare"));
  assert.ok(ro.includes("predată la Înălțime"));
  assert.ok(ro.includes("Mihai Stan A preluat comanda 91007"));
  const unknown = text(panel("ro", { data: overview({ activity: [{ ...overview().activity![1], action: "something_new" }] }) }));
  assert.ok(unknown.includes("Acțiune de producție") && !unknown.includes("something_new"));
});

test("source health distinguishes healthy, silent and unconfigured sources", () => {
  const html = panel("ro");
  assert.match(html, /data-source="trendhome" data-health="healthy".*?badge-success">Online</);
  assert.match(html, /data-source="trendyol" data-health="not_configured".*?badge-neutral">Neconfigurat</);
  assert.match(html, /data-source="outletperdele" data-health="no_contact".*?badge-warning">Fără contact încă</);
  assert.ok(!/data-source="trendyol"[^]*?badge-(danger|warning)/.test(html.slice(html.indexOf('data-source="trendyol"'))), "an unconfigured source is never shown as an outage");
});

test("sections the actor may not see explain the missing permission instead of failing", () => {
  const html = text(panel("ro", { data: overview({ oldestOrders: null, activity: null, sources: null }) }));
  assert.ok(html.includes("„Vizualizare toate comenzile”"));
  assert.ok(html.includes("„Vizualizare activitate”"));
  assert.ok(html.includes("„Vizualizare surse”"));
  assert.ok(html.includes("Comenzi active"), "aggregates still render");
});

test("loading, failed first load and failed refresh are distinct, localized states", () => {
  assert.ok(text(panel("ro", { data: null, refreshing: true, updatedAt: null })).includes("Se încarcă datele de producție…"));
  assert.ok(text(panel("tr", { data: null, refreshing: true, updatedAt: null })).includes("Üretim verileri yükleniyor…"));
  const failed = text(panel("ro", { data: null, error: new ApiError("NETWORK_UNAVAILABLE", 0), updatedAt: null }));
  assert.ok(failed.includes("Datele de producție nu au putut fi încărcate.") && failed.includes("Reîncearcă"));
  const stale = panel("tr", { error: new ApiError("SERVER_ERROR", 500) });
  assert.ok(text(stale).includes("Veriler güncellenemedi."));
  assert.equal(metric(stale, "active")?.[1], "11", "the last good data stays visible after a failed refresh");
});

test("refresh control and last-updated time follow the language and the request state", () => {
  const ro = text(panel("ro"));
  assert.ok(ro.includes("Actualizează") && /Actualizat la 15:00:05/.test(ro));
  assert.ok(/Son güncelleme: 15:00:05/.test(text(panel("tr"))));
  assert.match(panel("ro", { refreshing: true }), /disabled="">Se actualizează…</);
});

test("the overview home offers production only with production.view and stays read-only", () => {
  const withProduction = wrap("ro", <OverviewPage />, me({ permissions: ["dashboard.overview.view", "production.view"] }));
  assert.ok(text(withProduction).includes("Se încarcă datele de producție…"));
  const without = text(wrap("ro", <OverviewPage />, me({ permissions: ["dashboard.overview.view"] })));
  assert.ok(without.includes("Situația producției necesită permisiunea „Vizualizare producție”."));
  assert.ok(!without.includes("Se încarcă datele de producție"));
  const tr = text(wrap("tr", <OverviewPage />, me({ permissions: ["dashboard.overview.view"] })));
  assert.ok(tr.includes("“Üretimi görüntüleme” yetkisi"));
  const html = panel("ro");
  const buttons = [...html.matchAll(/<button[^>]*>([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(buttons, ["Actualizează"], "the only control is refresh: no claim, advance or handover");
});

test("the container renders the loading state before any data and the API method only reads", async () => {
  assert.ok(text(wrap("ro", <ProductionOverviewContainer />)).includes("Se încarcă datele de producție…"));
  const calls: Array<{ url: string; method: string }> = [];
  const api = createApi(API, (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    return new Response(JSON.stringify(overview()), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch);
  const result = await api.productionOverview("trendhome");
  assert.equal(result.summary.active, 11);
  assert.deepEqual(calls, [{ url: `${API}/management/production-overview?source=trendhome`, method: "GET" }]);
  await api.productionOverview(undefined);
  assert.equal(calls[1].url, `${API}/management/production-overview`);
});

test("durations are compact, localized and never negative", () => {
  const ro = createTranslator("ro");
  const tr = createTranslator("tr");
  assert.equal(ro.duration(-5_000), "sub 1 min");
  assert.equal(ro.duration(59_000), "sub 1 min");
  assert.equal(ro.duration(45 * 60_000), "45 min");
  assert.equal(ro.duration(2 * 3_600_000), "2 h");
  assert.equal(ro.duration(26 * 3_600_000 + 5 * 60_000), "1 z 2 h");
  assert.equal(tr.duration(3 * 3_600_000 + 20 * 60_000), "3 sa 20 dk");
  assert.equal(tr.duration(48 * 3_600_000), "2 g");
  assert.equal(ro.clock("2026-10-04T21:05:09Z"), "00:05:09", "clock shows Bucharest time");
});

// ---- Poller -------------------------------------------------------------------------------------------

function fakeEnvironment() {
  let now = 1_000;
  let visible = true;
  let timers: Array<{ id: number; at: number; callback: () => void }> = [];
  let nextId = 1;
  const environment: PollerEnvironment = {
    now: () => now,
    visible: () => visible,
    setTimer: (callback, milliseconds) => { const id = nextId++; timers.push({ id, at: now + milliseconds, callback }); return id; },
    clearTimer: (handle) => { timers = timers.filter((timer) => timer.id !== handle); },
  };
  return {
    environment,
    pending: () => timers.map((timer) => timer.at - now),
    setVisible: (value: boolean) => { visible = value; },
    advance: (milliseconds: number) => {
      now += milliseconds;
      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      due.forEach((timer) => timer.callback());
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

function deferredLoader() {
  const requests: Array<{ signal: AbortSignal; resolve: (value: number) => void; reject: (error: unknown) => void }> = [];
  const load = (signal: AbortSignal) => new Promise<number>((resolve, reject) => { requests.push({ signal, resolve, reject }); });
  return { requests, load };
}

test("the poller never overlaps requests and schedules the next one only after the previous settled", async () => {
  const clock = fakeEnvironment();
  const { requests, load } = deferredLoader();
  const seen: number[] = [];
  const poller = createPoller(load, 45_000, { onStart: () => undefined, onData: (value) => seen.push(value), onError: () => undefined }, clock.environment);
  poller.refresh();
  poller.refresh();
  assert.equal(requests.length, 1, "a manual refresh during a request is ignored");
  assert.deepEqual(clock.pending(), [], "nothing is scheduled while a request is in flight");
  clock.advance(120_000);
  assert.equal(requests.length, 1);
  requests[0].resolve(1);
  await flush();
  assert.deepEqual(seen, [1]);
  assert.deepEqual(clock.pending(), [45_000]);
  clock.advance(45_000);
  assert.equal(requests.length, 2);
  requests[1].resolve(2);
  await flush();
  assert.deepEqual(seen, [1, 2]);
  poller.dispose();
});

test("the poller keeps going after a failure and pauses while the page is hidden", async () => {
  const clock = fakeEnvironment();
  const { requests, load } = deferredLoader();
  const errors: unknown[] = [];
  const poller = createPoller(load, 45_000, { onStart: () => undefined, onData: () => undefined, onError: (error) => errors.push(error) }, clock.environment);
  poller.refresh();
  requests[0].reject(new ApiError("SERVER_ERROR", 500));
  await flush();
  assert.equal(errors.length, 1);
  assert.deepEqual(clock.pending(), [45_000], "a failed refresh is retried on the normal schedule");
  clock.setVisible(false);
  poller.visibilityChanged();
  assert.deepEqual(clock.pending(), [], "hidden pages schedule nothing");
  clock.advance(10 * 60_000);
  assert.equal(requests.length, 1, "no request while hidden");
  clock.setVisible(true);
  poller.visibilityChanged();
  assert.equal(requests.length, 2, "stale data refreshes as soon as the page is visible again");
  requests[1].resolve(1);
  await flush();
  clock.advance(10_000);
  clock.setVisible(false);
  poller.visibilityChanged();
  clock.setVisible(true);
  poller.visibilityChanged();
  assert.equal(requests.length, 2, "fresh data is not refetched on every focus");
  assert.deepEqual(clock.pending(), [35_000], "it waits only for the rest of the interval");
  poller.dispose();
});

test("disposing the poller aborts the request in flight and drops its late result", async () => {
  const clock = fakeEnvironment();
  const { requests, load } = deferredLoader();
  const seen: number[] = [];
  const poller = createPoller(load, 45_000, { onStart: () => undefined, onData: (value) => seen.push(value), onError: () => seen.push(-1) }, clock.environment);
  poller.refresh();
  poller.dispose();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(7);
  await flush();
  assert.deepEqual(seen, []);
  assert.deepEqual(clock.pending(), []);
  poller.refresh();
  assert.equal(requests.length, 1, "a disposed poller never requests again");
});

// ---- No fake analytics ----------------------------------------------------------------------------------

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

test("production numbers come only from the API response, never from constants in the source", () => {
  const html = panel("ro", { data: overview({ summary: { active: 4321, waiting: 1234, inWork: 3087, unassigned: 17, completedToday: 98 } }) });
  assert.deepEqual(["active", "waiting", "inWork", "unassigned", "completedToday"].map((key) => metric(html, key)?.[1]), ["4.321", "1.234", "3.087", "17", "98"]);
  const files = sourceFiles(join(import.meta.dirname, "..", "src"));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/from ["'](\.\.\/)+(e2e|tests)\//.test(source), `${file} must not import test fixtures`);
    assert.ok(!/\b(demo|mock|fixture|faker|Math\.random)\b/i.test(source), `${file} must not contain demo data or random values`);
  }
  const component = readFileSync(join(import.meta.dirname, "..", "src", "pages", "ProductionOverview.tsx"), "utf8");
  assert.ok(!/active:\s*\d|waiting:\s*\d|completedToday:\s*\d/.test(component), "no hard-coded metric values in the overview component");
});
