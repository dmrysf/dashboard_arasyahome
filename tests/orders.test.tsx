import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError, createApi } from "../src/api/client";
import type { ManagementMe, OrderDetail, OrderFacets, OrderSummary } from "../src/api/types";
import { DashboardContext } from "../src/app/context";
import { orderPath, parseRoute } from "../src/app/router";
import { Shell } from "../src/components/Shell";
import type { Locale } from "../src/i18n";
import { I18nProvider } from "../src/i18n/context";
import { OrderDetailPage, OrderDetailView } from "../src/pages/OrderDetailPage";
import { DEFAULT_ORDER_FILTERS, OrdersPage, OrdersView, type OrdersViewProps } from "../src/pages/OrdersPage";
import { API, me } from "./support";

const WORKER = { id: "55555555-5555-4555-8555-555555555555", displayName: "Mehmet Yılmaz" };

function summary(overrides: Omit<Partial<OrderSummary>, "production"> & { production?: Partial<OrderSummary["production"]> } = {}): OrderSummary {
  const { production, ...rest } = overrides;
  return {
    globalOrderId: "trendhome:7001",
    orderNumber: "7001",
    source: { key: "trendhome", name: "Trendhome" },
    commerce: { status: { code: "processing", label: "Se procesează" }, availability: "active" },
    production: {
      state: "active", stage: { id: "quality-control", label: "Control calitate", ordinal: 12 }, owner: WORKER,
      claimedAt: "2026-10-04T09:14:00.000Z", stageEnteredAt: "2026-10-04T09:00:00.000Z", completedAt: null, attention: null, ...production,
    },
    importedAt: "2026-10-04T07:10:00.000Z",
    acceptedAt: "2026-10-04T07:05:00.000Z",
    ...rest,
  };
}

const rows: OrderSummary[] = [
  summary(),
  summary({ globalOrderId: "outletperdele:7001", source: { key: "outletperdele", name: "OutletPerdele" }, commerce: { status: { code: "on-hold", label: null }, availability: "active" }, production: { stage: { id: "labeling", label: "Etichetare", ordinal: 4 }, owner: null, claimedAt: null } }),
  summary({ globalOrderId: "trendhome:6990", orderNumber: "6990", commerce: { status: { code: "completed", label: "Finalizată" }, availability: "active" }, production: { state: "completed", stage: { id: "delivery", label: "Livrare", ordinal: 14 }, owner: null, completedAt: "2026-10-03T16:00:00.000Z" } }),
];
const facets: OrderFacets = {
  sources: [{ key: "outletperdele", name: "OutletPerdele" }, { key: "trendhome", name: "Trendhome" }, { key: "trendyol", name: "Trendyol" }],
  stages: [{ id: "waiting", label: "În așteptare", ordinal: 1 }, { id: "quality-control", label: "Control calitate", ordinal: 12 }],
  commerceStatuses: [{ code: "on-hold", label: null }, { code: "processing", label: "Se procesează" }],
  owners: [WORKER],
};

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  const base = summary();
  return {
    ...base,
    commerce: { ...base.commerce, sourceChangedAt: "2026-10-04T07:06:00.000Z", lastSourceSeenAt: "2026-10-04T11:00:00.000Z" },
    production: { ...base.production, changedAt: "2026-10-04T09:00:00.000Z", version: 24, notes: "Tiv dublu.\nVerifică sensul materialului.", control: { canManageOwner: false, blockedReason: null } },
    items: [
      { line: 1, name: "Draperie Velvet", sku: "DV-302", variant: "Inele", color: "Bej", width: 300, height: 260.5, unit: "cm", meters: 8.4, quantity: 2 },
      { line: 2, name: "Perdea In", sku: null, variant: null, color: null, width: null, height: null, unit: null, meters: null, quantity: 1 },
    ],
    activity: [
      { id: "a1", action: "claimed", occurredAt: "2026-10-04T07:14:00.000Z", employee: WORKER, fromStage: { id: "waiting", label: "În așteptare" }, toStage: null, previousOwner: null, newOwner: null, productionVersion: 2 },
      { id: "a2", action: "stage_completed", occurredAt: "2026-10-04T07:20:00.000Z", employee: WORKER, fromStage: { id: "waiting", label: "În așteptare" }, toStage: { id: "material-preparation", label: "Pregătire material" }, previousOwner: null, newOwner: null, productionVersion: 3 },
    ],
    activityTruncated: false,
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

const noop = () => undefined;
function list(locale: Locale, props: Partial<OrdersViewProps> = {}) {
  return wrap(locale, <OrdersView data={{ items: rows, nextCursor: "next-1", facets, counts: { unassignedActive: 1, ownerAttention: 0 } }} error={null} updatedAt={Date.parse("2026-10-04T12:00:00Z")} refreshing={false} refresh={noop}
    filters={DEFAULT_ORDER_FILTERS} facets={facets} page={1} onFilters={noop} onNext={noop} onPrevious={noop} onFirst={noop} {...props} />);
}
function view(locale: Locale, data: OrderDetail | null = detail(), extra: { error?: unknown } = {}) {
  return wrap(locale, <OrderDetailView data={data} error={extra.error ?? null} updatedAt={Date.parse("2026-10-04T12:00:00Z")} refreshing={false} refresh={noop} onBack={noop} />);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const headers = (html: string) => [...html.matchAll(/<th>([^<]+)<\/th>/g)].map((match) => match[1]);
const row = (html: string, id: string) => html.slice(html.indexOf(`data-order="${id}"`), html.indexOf("</tr>", html.indexOf(`data-order="${id}"`)));

test("the order list shows the documented Romanian and Turkish columns, store status and production stage as separate concepts", () => {
  assert.deepEqual(headers(list("ro")), ["Comandă", "Sursă", "Status magazin", "Etapă producție", "Responsabil", "Timp în etapă", "Preluată la", "Stare producție"]);
  assert.deepEqual(headers(list("tr")), ["Sipariş", "Kaynak", "Mağaza Durumu", "Üretim Aşaması", "Sorumlu", "Aşamada Geçen Süre", "Alınma Zamanı", "Üretim Durumu"]);
  const first = row(list("ro"), "trendhome:7001");
  assert.match(first, /data-kind="commerce"[^>]*>.*Se procesează/);
  assert.match(first, /data-kind="production" data-stage-id="quality-control"[^>]*>.*Control calitate/);
  assert.ok(!/>Status</.test(list("ro")), "no ambiguous bare 'Status' heading");
  const tr = row(list("tr"), "trendhome:7001");
  assert.ok(tr.includes("Kalite Kontrol"), "the stage label is translated by stage id");
  assert.ok(tr.includes("Se procesează"), "the store status is business data from the source, shown as received");
});

test("owner, unassigned state, time in stage and production state come from the row", () => {
  const html = list("ro");
  assert.ok(text(row(html, "trendhome:7001")).includes("Mehmet Yılmaz"));
  assert.ok(text(row(html, "outletperdele:7001")).includes("Fără responsabil"));
  assert.ok(text(row(list("tr"), "outletperdele:7001")).includes("Sorumlu Atanmamış"));
  assert.ok(text(row(html, "trendhome:7001")).includes("3 h"), "12:00 minus stage entry 09:00");
  assert.ok(text(row(html, "outletperdele:7001")).includes("on-hold"), "a status without label falls back to its code");
  assert.match(row(html, "trendhome:6990"), /data-production-state="completed".*Finalizată/);
  assert.match(row(html, "trendhome:6990"), /Timp în etapă">.*?—/, "completed production has no running stage time");
  for (const late of ["Întârziat", "Late", "Overdue", "Gecikmiş"]) assert.ok(!text(list("ro")).includes(late) && !text(list("tr")).includes(late), "no SLA wording");
});

test("filters cover search, source, stage, store status, owner, assignment, state and page size from the server facets", () => {
  const html = list("ro");
  for (const label of ["Caută", "Sursă", "Etapă producție", "Status magazin", "Responsabil", "Responsabil atribuit", "Stare producție", "Pe pagină"]) assert.ok(html.includes(`aria-label="${label}"`), `filter ${label}`);
  assert.ok(html.includes('<option value="trendyol">Trendyol</option>'), "sources come from the API");
  assert.ok(html.includes(`<option value="${WORKER.id}">${WORKER.displayName}</option>`), "owners come from the API");
  assert.ok(html.includes('<option value="unassigned">Fără responsabil</option>') && html.includes('<option value="assigned">Cu responsabil</option>'));
  assert.ok(html.includes('<option value="completed">Finalizată</option>'));
  for (const size of ["25", "50", "100"]) assert.ok(html.includes(`<option value="${size}"`));
  const tr = list("tr");
  for (const label of ["Ara", "Kaynak", "Üretim Aşaması", "Mağaza Durumu", "Sorumlu", "Üretim Durumu"]) assert.ok(tr.includes(`aria-label="${label}"`), `TR filter ${label}`);
  assert.ok(tr.includes(">Atanmış<") && tr.includes(">Atanmamış<") && tr.includes(">Aktif<") && tr.includes(">Tamamlandı<"));
});

test("cursor pagination offers next, previous and first only when they exist", () => {
  const first = text(list("ro"));
  assert.ok(first.includes("Pagina următoare") && !first.includes("Pagina anterioară") && first.includes("Pagina 1 · 3 comenzi"));
  const third = text(list("ro", { page: 3, data: { items: rows, nextCursor: null, facets, counts: { unassignedActive: 1, ownerAttention: 0 } } }));
  assert.ok(!third.includes("Pagina următoare") && third.includes("Pagina anterioară") && third.includes("Prima pagină"));
});

test("loading, failed load, stale data after a failed refresh and empty results are distinct states", () => {
  assert.ok(text(list("ro", { data: null, updatedAt: null, refreshing: true })).includes("Se încarcă comenzile…"));
  const failed = text(list("tr", { data: null, error: new ApiError("NETWORK_UNAVAILABLE", 0), updatedAt: null }));
  assert.ok(failed.includes("Siparişler yüklenemedi."));
  const stale = list("ro", { error: new ApiError("SERVER_ERROR", 500) });
  assert.ok(text(stale).includes("Datele nu au putut fi actualizate.") && stale.includes('data-order="trendhome:7001"'), "last good rows stay visible");
  assert.ok(text(list("ro", { data: { items: [], nextCursor: null, facets, counts: { unassignedActive: 1, ownerAttention: 0 } } })).includes("Nicio comandă pentru aceste filtre."));
  assert.match(list("ro", { refreshing: true }), /disabled="">Se actualizează…</);
  assert.ok(text(list("tr")).includes("Yenile"));
});

test("every list cell carries a label so phones show stacked cards instead of a wide spreadsheet", () => {
  const html = list("ro");
  const cells = [...html.matchAll(/<td([^>]*)>/g)].map((match) => match[1]);
  assert.equal(cells.length, rows.length * 8);
  assert.ok(cells.every((attributes) => attributes.includes("data-label=")));
});

test("order detail separates the store section from the Arasya production section", () => {
  const html = view("ro");
  const commerce = html.slice(html.indexOf('data-section="commerce"'), html.indexOf('data-section="production"'));
  const production = html.slice(html.indexOf('data-section="production"'), html.indexOf("</section>", html.indexOf('data-section="production"')));
  assert.ok(commerce.includes("Magazin (sursă)") && commerce.includes("Se procesează") && !commerce.includes("Control calitate"));
  assert.ok(text(commerce).includes("Acțiunile de producție Arasya nu modifică statusul magazinului."));
  assert.ok(production.includes("Producție Arasya") && production.includes("Control calitate") && !production.includes("Se procesează"));
  assert.ok(text(production).includes("Etapa 12 din 14") && text(production).includes("Mehmet Yılmaz"));
  assert.equal((html.match(/class="is-done"/g) ?? []).length, 11);
  assert.equal((html.match(/class="is-current"/g) ?? []).length, 1);
  const tr = text(view("tr"));
  assert.ok(tr.includes("Mağaza (kaynak)") && tr.includes("Arasya Üretimi") && tr.includes("Aşama 12 / 14") && tr.includes("Kalite Kontrol"));
});

test("items show normalized measurements and leave missing values empty instead of inventing them", () => {
  const ro = text(view("ro"));
  for (const heading of ["Produs", "SKU", "Variantă", "Culoare", "Lățime", "Înălțime", "Metri", "Cantitate"]) assert.ok(ro.includes(heading), heading);
  assert.ok(ro.includes("Draperie Velvet DV-302 Inele Bej 300 cm 260,5 cm 8,4 m 2"));
  assert.ok(ro.includes("Perdea In — — — — — — 1"));
  assert.ok(ro.includes("Note de producție") && view("ro").includes("Tiv dublu.\nVerifică sensul materialului."));
  const tr = text(view("tr"));
  for (const heading of ["Ürün", "Varyasyon", "Genişlik", "Yükseklik", "Metre", "Adet"]) assert.ok(tr.includes(heading), heading);
  assert.ok(tr.includes("260,5 cm"));
});

test("the production timeline lists the import and then the immutable activity in order, with localized actions", () => {
  const html = view("ro");
  assert.deepEqual([...html.matchAll(/data-event="([^"]+)"/g)].map((match) => match[1]), ["imported", "claimed", "stage_completed"]);
  const ro = text(html);
  assert.ok(ro.includes("Comanda a fost importată în Arasya"));
  assert.ok(ro.includes("A preluat comanda Mehmet Yılmaz Din: În așteptare"));
  assert.ok(ro.includes("A finalizat etapa Mehmet Yılmaz Din: În așteptare → Către: Pregătire material"));
  const tr = text(view("tr"));
  assert.ok(tr.includes("Siparişi üstlendi") && tr.includes("Aşamayı tamamladı") && tr.includes("Malzeme Hazırlığı"));
  assert.ok(text(view("ro", detail({ activity: null }))).includes("„Vizualizare activitate”"));
  assert.ok(text(view("ro", detail({ activity: [], activityTruncated: false }))).includes("Nicio acțiune de producție încă."));
  assert.ok(text(view("ro", detail({ activityTruncated: true }))).includes("primele 500"));
});

test("completed production is explicitly not a completed or shipped store order", () => {
  const done = detail({ commerce: { status: { code: "processing", label: "Se procesează" }, availability: "active", sourceChangedAt: "2026-10-04T07:06:00.000Z", lastSourceSeenAt: "2026-10-04T11:00:00.000Z" },
    production: { ...detail().production, state: "completed", stage: { id: "delivery", label: "Livrare", ordinal: 14 }, owner: null, completedAt: "2026-10-04T11:30:00.000Z" } });
  const ro = text(view("ro", done));
  assert.ok(ro.includes("Finalizarea producției Arasya nu finalizează și nu expediază comanda în magazin."));
  assert.ok(ro.includes("Se procesează"), "the store status stays whatever the source last sent");
  assert.equal((view("ro", done).match(/class="is-done"/g) ?? []).length, 14);
});

test("the order detail has no stage control: no stage selector, no claim or override; a viewer gets only back and refresh", () => {
  const html = view("ro");
  assert.ok(!/<select/.test(html), "no stage dropdown");
  const buttons = [...html.matchAll(/<button[^>]*>([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(buttons, ["← Comenzi", "Actualizează"]);
  assert.ok(text(html).includes("Etapa de producție se schimbă numai din Staff"));
  const failed = text(view("ro", null, { error: new ApiError("ORDER_NOT_FOUND", 404) }));
  assert.ok(failed.includes("Comanda nu a fost găsită."));
  assert.ok(text(view("tr", null, { error: new ApiError("ORDER_NOT_FOUND", 404) })).includes("Sipariş bulunamadı."));
});

test("without orders.view_all the module explains the permission and never polls", () => {
  const profile = me({ permissions: ["dashboard.overview.view", "production.view"] });
  assert.ok(text(wrap("ro", <OrdersPage />, profile)).includes("„Vizualizare toate comenzile”"));
  assert.ok(text(wrap("tr", <OrderDetailPage id="trendhome:7001" />, profile)).includes("“Tüm siparişleri görüntüleme”"));
  const navWithout = wrap("ro", <Shell pathname="/" onLogout={noop}>x</Shell>, profile);
  assert.ok(!navWithout.includes('href="/comenzi"'));
  const navWith = wrap("ro", <Shell pathname="/comenzi" onLogout={noop}>x</Shell>, me({ permissions: ["orders.view_all"] }));
  assert.match(navWith, /href="\/comenzi" class="active" aria-current="page">Comenzi</);
  assert.match(wrap("tr", <Shell pathname="/" onLogout={noop}>x</Shell>, me({ permissions: ["orders.view_all"] })), />Siparişler</);
});

test("routes use the source-aware global order id, never the bare order number", () => {
  assert.equal(orderPath("trendhome:7001"), "/comenzi/trendhome%3A7001");
  assert.deepEqual(parseRoute("/comenzi"), { name: "orders" });
  assert.deepEqual(parseRoute("/comenzi/trendhome%3A7001"), { name: "order", id: "trendhome:7001" });
  assert.deepEqual(parseRoute("/comenzi/outletperdele:7001/"), { name: "order", id: "outletperdele:7001" });
  assert.deepEqual(parseRoute("/comenzi/%E0%A4%A"), { name: "not-found" });
  assert.match(row(list("ro"), "outletperdele:7001"), /href="\/comenzi\/outletperdele%3A7001"/);
});

test("the API client sends only GET requests with the chosen filters and encodes the global id", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const api = createApi(API, (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    return new Response(JSON.stringify({ items: [], nextCursor: null, facets, counts: { unassignedActive: 1, ownerAttention: 0 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch);
  await api.orders({ search: "#7001", source: "trendhome", stage: undefined, state: "active", limit: "25", cursor: "abc" });
  await api.order("trendhome:7001");
  assert.deepEqual(calls, [
    { url: `${API}/management/orders?search=%237001&source=trendhome&state=active&limit=25&cursor=abc`, method: "GET" },
    { url: `${API}/management/orders/trendhome%3A7001`, method: "GET" },
  ]);
});
