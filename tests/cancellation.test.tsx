import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createApi } from "../src/api/client";
import type { CancellationSyncOverview, CancellationSyncView, ManagementMe, OrderCancellation, OrderSummary, ProductionOverview, SyncOperationView } from "../src/api/types";
import { DashboardContext } from "../src/app/context";
import { MESSAGES, type Locale } from "../src/i18n";
import { I18nProvider } from "../src/i18n/context";
import { CancellationPanelView } from "../src/pages/CancellationPanel";
import { CancellationSyncOverviewView } from "../src/pages/CancellationSyncOverview";
import { StopBadge } from "../src/pages/orderParts";
import { ProductionPanel } from "../src/pages/ProductionOverview";
import { API, fakeFetch, me } from "./support";

function wrap(locale: Locale, node: React.ReactNode, profile: ManagementMe = me({ isRoot: true })) {
  const permissions = new Set(profile.permissions);
  return renderToStaticMarkup(
    <I18nProvider locale={locale}>
      <DashboardContext.Provider value={{
        api: createApi(API, (() => Promise.reject(new Error("no network in render tests"))) as typeof fetch),
        session: { employee: { employeeUuid: profile.employee.id, displayName: profile.employee.displayName, username: profile.employee.username, department: profile.employee.department, positionTitle: null, permissions: profile.permissions, applications: profile.applications, allowedStageIds: [], isRoot: profile.isRoot, mustChangePassword: false, authorizationVersion: profile.authorizationVersion }, expiresAt: "2026-10-16T20:00:00Z" },
        me: profile,
        navigate: () => undefined,
        can: (key) => profile.isRoot || permissions.has(key),
      }}>{node}</DashboardContext.Provider>
    </I18nProvider>,
  );
}

function cancellation(overrides: Partial<OrderCancellation> = {}, control: Partial<NonNullable<OrderCancellation["cancellation"]>> = {}): OrderCancellation {
  return {
    orderId: "trendhome:70100", orderNumber: "70100", source: "trendhome", stage: { id: "ironing" }, productionVersion: 9, productionCompleted: false, sourceAvailability: "active",
    cancellation: {
      state: "stopped", category: "reactivated_awaiting_release", nextAction: "physical_reconciliation", origin: "source", reason: "source_cancelled", reasonNote: null,
      source: { status: "reactivated", statusCode: "processing", statusLabel: "Processing", changedAt: "2026-10-16T07:50:00.000Z", cancellationReceivedAt: "2026-10-16T07:40:00.000Z", evidenceAt: "2026-10-16T07:50:00.000Z", request: "not_requested", requestedAt: null, outbound: "not_sent" },
      atStop: { phase: "in_progress", stageId: "ironing", owner: { id: "e-9", displayName: "Ana Popescu" }, exceptionId: null, productionVersion: 9, completedAt: null, cuttingStartedAt: "2026-10-15T08:00:00.000Z", tracks: [] },
      physical: { status: "pending", outcome: null, note: null, scan: null, verifiedBy: null, verifiedAt: null },
      heldAt: "2026-10-16T07:40:00.000Z", heldBy: null, releasedAt: null, releasedBy: null, releaseReason: null,
      release: { possible: false, refusal: "physical_unverified" }, version: 2, ...control,
    },
    events: [
      { id: "ev-1", sequence: 1, type: "source_cancellation_received", controlVersion: null, actor: null, sourceEventRef: "evt-1", stageId: "ironing", productionVersion: 9, details: null, occurredAt: "2026-10-16T07:40:00.000Z" },
      { id: "ev-2", sequence: 2, type: "hold_applied", controlVersion: 1, actor: null, sourceEventRef: null, stageId: "ironing", productionVersion: 9, details: null, occurredAt: "2026-10-16T07:40:00.000Z" },
      { id: "ev-3", sequence: 3, type: "source_reactivated", controlVersion: 2, actor: null, sourceEventRef: "evt-2", stageId: "ironing", productionVersion: 9, details: null, occurredAt: "2026-10-16T07:50:00.000Z" },
    ],
    eventsTruncated: false,
    capabilities: { stop: true, recordPhysical: true, release: false },
    ...overrides,
  };
}
const noop = () => Promise.reject(new Error("not called in render tests"));
const view = (locale: Locale, data: OrderCancellation) => wrap(locale, <CancellationPanelView data={data} onChanged={() => undefined} onConflict={() => undefined} stop={noop} physical={noop} release={noop} />);

test("a stopped order shows its category, the party that acts next and an ordered audit, in Romanian", () => {
  const html = view("ro", cancellation());
  assert.match(html, /Oprire producție și anulare/);
  assert.match(html, /data-stop-state="stopped"/);
  assert.match(html, /Reactivată de sursă, așteaptă decizia/);
  assert.match(html, /Conducerea: verificare fizică a produsului/);
  assert.match(html, /Sursa raportează din nou comanda activă/);
  assert.match(html, /Arasya nu a trimis nimic către sursă/);
  assert.match(html, /Ana Popescu/);
  const order = ["Anulare primită de la sursă", "Producția a fost oprită", "Sursa a reactivat comanda (oprirea rămâne)"].map((text) => html.indexOf(text));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), "events are listed in their sequence");
  assert.match(html, /Reluarea nu este posibilă acum: Lipsește verificarea fizică a produsului/);
});

test("actions follow the server capabilities and the stop state", () => {
  const stopper = view("ro", cancellation());
  assert.match(stopper, /data-action="physical"/);
  assert.doesNotMatch(stopper, /data-action="stop"/, "an order already stopped is not stopped again");
  assert.doesNotMatch(stopper, /data-action="release"/, "no release without the permission");
  const releasable = view("ro", cancellation({ capabilities: { stop: false, recordPhysical: false, release: true } }, { release: { possible: true, refusal: null }, physical: { status: "verified", outcome: "secured", note: "Raft oprire", scan: "order_qr", verifiedBy: { id: "e-2", displayName: "Mihai Stan" }, verifiedAt: "2026-10-16T08:00:00.000Z" } }));
  assert.match(releasable, /data-action="release"/);
  assert.doesNotMatch(releasable, /data-action="physical"/);
  assert.match(releasable, /Produs identificat și pus deoparte/);
  const readOnly = view("ro", cancellation({ capabilities: { stop: false, recordPhysical: false, release: false } }));
  assert.doesNotMatch(readOnly, /data-action=/, "an approver of exceptions without the cancellation permissions only reads");
  const none = view("ro", cancellation({ cancellation: null, events: [] }));
  assert.match(none, /nu a fost oprită niciodată/);
  assert.match(none, /data-action="stop"/);
  const completed = view("ro", cancellation({ cancellation: null, events: [], productionCompleted: true }));
  assert.doesNotMatch(completed, /data-action="stop"/);
});

test("Turkish copy exists for every cancellation state and the catalogs share their shape", () => {
  const html = view("tr", cancellation());
  assert.match(html, /Üretim durdurma ve iptal/);
  assert.match(html, /Kaynak yeniden etkinleştirdi, karar bekliyor/);
  const ro = MESSAGES.ro.orders.cancellation;
  const tr = MESSAGES.tr.orders.cancellation;
  for (const group of ["category", "nextAction", "event", "refusal", "outcome", "physical", "request", "sourceStatus"] as const) {
    assert.deepEqual(Object.keys(tr[group]).sort(), Object.keys(ro[group]).sort(), group);
  }
});

test("the order list badge shows the category next to the production state", () => {
  const stop: OrderSummary["production"]["stop"] = { state: "stopped", category: "source_cancelled", nextAction: "physical_reconciliation", physical: "pending", version: 1, heldAt: "2026-10-16T07:40:00.000Z", releasedAt: null };
  assert.match(wrap("ro", <StopBadge stop={stop} />), /data-stop-category="source_cancelled"[^]*Anulată de sursă/);
  assert.equal(wrap("ro", <StopBadge stop={null} />), "");
  assert.equal(MESSAGES.ro.orders.states.stopped, "Producție oprită");
});

test("the overview lists stopped orders once each, with who acts next, apart from active production", () => {
  const data = {
    generatedAt: "2026-10-16T08:00:00.000Z", timezone: "Europe/Bucharest", filters: { source: null },
    summary: { active: 3, waiting: 1, inWork: 2, unassigned: 1, completedToday: 4 }, stages: [], oldestOrders: null, activity: null, sources: null,
    cancellations: {
      counts: { completed_then_cancelled: 1, source_cancelled: 2, pending_source_confirmation: 0, reactivated_awaiting_release: 1, stopped: 0, released: 1 },
      stopped: 4, physicalPending: 3, nextActions: { physical_reconciliation: 3, source_confirmation: 0, release_decision: 1 },
      items: [{ globalOrderId: "trendyol:1", orderNumber: "119001", source: { key: "trendyol", name: "Trendyol" }, stage: { id: "packing", label: "Ambalare" }, category: "source_cancelled", nextAction: "physical_reconciliation",
        origin: "source", reason: "marketplace_cancelled", physical: "pending", physicalOutcome: null, productionCompleted: false, heldAt: "2026-10-16T07:00:00.000Z", releasedAt: null }],
      more: false, releasedWindowDays: 7,
    },
  } as unknown as ProductionOverview;
  const html = wrap("ro", <ProductionPanel data={data} error={null} updatedAt={Date.parse("2026-10-16T08:00:05Z")} refreshing={false} refresh={() => undefined} source="" sourceOptions={[]} onSource={() => undefined} />);
  assert.match(html, /data-testid="production-cancellations"/);
  assert.match(html, /4 oprite · 3 așteaptă verificarea fizică/);
  assert.match(html, /data-category="source_cancelled"[^]*Anulată de sursă/);
  assert.doesNotMatch(html, /data-category="stopped"/, "categories without orders are not listed");
  assert.match(html, /data-cancelled-order="119001" data-category="source_cancelled" data-next-action="physical_reconciliation"/);
});

test("the API client calls the four cancellation routes with idempotency keys and exact bodies", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: cancellation() }));
  const api = createApi(API, fetchImpl);
  await api.orderCancellation("trendhome:70100");
  await api.stopProduction("trendhome:70100", { reason: "Clientul a anulat telefonic.", requestSourceCancellation: true }, "key-stop-0000000001");
  await api.recordPhysical("trendhome:70100", { expectedVersion: 2, outcome: "secured", note: "Raft oprire", qrToken: "ARASYA:Q1:AAAAAAAAAAAAAAAAAAAAAAAAAA" }, "key-phys-0000000001");
  await api.releaseStop("trendhome:70100", { expectedVersion: 3, reason: "Clientul a confirmat din nou." }, "key-rels-0000000001");
  const routes = calls.filter((call) => call.url.pathname.includes("/cancellation"));
  assert.deepEqual(routes.map((call) => `${call.method} ${call.url.pathname}`), [
    "GET /management/orders/trendhome%3A70100/cancellation",
    "POST /management/orders/trendhome%3A70100/cancellation/stop",
    "POST /management/orders/trendhome%3A70100/cancellation/physical",
    "POST /management/orders/trendhome%3A70100/cancellation/release",
  ]);
  assert.deepEqual(routes[1].body, { reason: "Clientul a anulat telefonic.", requestSourceCancellation: true });
  assert.equal(routes[3].headers["Idempotency-Key"] ?? routes[3].headers["idempotency-key"], "key-rels-0000000001");
});

// ---- API 2.36.0 cancellation synchronization ------------------------------------------------------------------------
const trendyolProvider = {
  source: "trendyol", mechanism: "api" as const, serverEnabled: true, flagEnabled: true, active: true, configured: true, inbound: "marketplace_sync", outbound: "api",
  confirmation: "status_read", retry: "bounded_backoff_after_status_read", reconciliation: "package_status_read", unsupported: ["refund", "shipped_package_cancellation"],
  endpoint: "PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/items/unsupplied",
  reasons: { "500": "Stoc epuizat", "501": "Produs defect sau deteriorat", "506": "Forță majoră" },
};
function syncOperation(overrides: Partial<SyncOperationView> = {}): SyncOperationView {
  return {
    id: "op-1", state: "awaiting_confirmation", staffState: "awaiting_confirmation", mechanism: "api", generation: 1, reasonCode: "500", attempts: 1, nextAttemptAt: "2026-10-16T08:02:00.000Z",
    dispatchedAt: "2026-10-16T08:00:00.000Z", lastPulledAt: null, providerResult: "accepted", providerStatus: "Created", confirmedAt: null, confirmedBy: null, lastError: null, lastErrorAt: null,
    createdAt: "2026-10-16T07:59:00.000Z", version: 4,
    history: [
      { sequence: 1, kind: "create", from: "queued", to: "queued", outcome: "created", httpStatus: null, error: null, providerStatus: null, actor: { id: "e-1", displayName: "Ana Manager" }, occurredAt: "2026-10-16T07:59:00.000Z" },
      { sequence: 2, kind: "status_read", from: "queued", to: "processing", outcome: "leased", httpStatus: null, error: null, providerStatus: null, actor: { system: "worker-1" }, occurredAt: "2026-10-16T08:00:00.000Z" },
      { sequence: 3, kind: "submit", from: "processing", to: "awaiting_confirmation", outcome: "accepted", httpStatus: 200, error: null, providerStatus: "Created", actor: { system: "worker-1" }, occurredAt: "2026-10-16T08:00:01.000Z" },
    ],
    ...overrides,
  };
}
function withSync(sync: Partial<CancellationSyncView>, control: Partial<NonNullable<OrderCancellation["cancellation"]>> = {}): OrderCancellation {
  return cancellation({ source: "trendyol", capabilities: { stop: true, recordPhysical: true, release: true, sync: true } }, {
    category: "pending_source_confirmation", nextAction: "source_confirmation", origin: "local", reason: "manager_stop",
    source: { status: "not_reported", statusCode: null, statusLabel: null, changedAt: null, cancellationReceivedAt: null, evidenceAt: null, request: "pending", requestedAt: "2026-10-16T07:58:00.000Z", outbound: sync.operation?.state ?? "not_sent" },
    release: { possible: false, refusal: "sync_open" },
    sync: { provider: trendyolProvider, operation: null, openOperationId: null, required: true, actions: { send: false, retry: false, withdraw: false, close: false }, ...sync },
    ...control,
  });
}
const syncActions = { send: () => Promise.reject(new Error("not called")), operation: () => Promise.reject(new Error("not called")) };
const syncView = (locale: Locale, data: OrderCancellation) => wrap(locale, <CancellationPanelView data={data} onChanged={() => undefined} onConflict={() => undefined} stop={noop} physical={noop} release={noop} sync={syncActions} />);

test("API 2.36.0: an accepted Trendyol request is shown as awaiting confirmation, never as confirmed, with its history", () => {
  const html = syncView("ro", withSync({ operation: syncOperation(), openOperationId: "op-1", actions: { send: false, retry: false, withdraw: false, close: false } }));
  assert.match(html, /data-section="cancellation-sync" data-mechanism="api" data-sync-state="awaiting_confirmation"/);
  assert.match(html, /Arasya trimite cererea prin API \(Trendyol\)/);
  assert.match(html, /Activă pentru acest canal/);
  assert.match(html, /Așteaptă confirmarea canalului/);
  assert.match(html, /Canalul a primit cererea; anularea nu este încă vizibilă acolo/);
  assert.doesNotMatch(html, /Confirmată de canal|data-sync-state="confirmed"/, "accepted is not confirmed");
  assert.match(html, /Stoc epuizat/, "the chosen reason is shown by its label");
  assert.match(html, /data-sync-attempt="submit" data-outcome="accepted"[^]*HTTP 200/);
  assert.match(html, /Arasya nu inițiază nicio rambursare/);
  assert.match(html, /data-release-refusal="sync_open"[^]*O cerere de anulare către canal este încă deschisă/);
  assert.match(html, /Cerere către sursă<\/dt><dd>[^<]*<small class="cell-sub">Așteaptă confirmarea canalului/);
  assert.doesNotMatch(html, /data-action="release"/, "no release while the request is open");
  assert.doesNotMatch(html, /data-action="sync-(send|retry|withdraw|close)"/, "no action the server did not offer");
});

test("API 2.36.0: actions follow the server; gates and manual channels are explained", () => {
  const send = syncView("ro", withSync({ actions: { send: true, retry: false, withdraw: false, close: false } }));
  assert.match(send, /data-action="sync-send"[^>]*>Trimite anularea la canal/);
  assert.match(send, /Nu a fost trimisă nicio cerere de anulare pentru această oprire/);
  const off = syncView("ro", withSync({ provider: { ...trendyolProvider, serverEnabled: false, active: false } }));
  assert.match(off, /Oprită pe server \(ARASYA_CANCELLATION_SYNC\)/);
  assert.doesNotMatch(off, /data-action="sync-send"/);
  const flagOff = syncView("ro", withSync({ provider: { ...trendyolProvider, flagEnabled: false, active: false } }));
  assert.match(flagOff, /Oprită pentru acest canal \(flag dezactivat\)/);
  const b2b = syncView("ro", withSync({ provider: { ...trendyolProvider, source: "b2b", mechanism: "manual", active: false, configured: false, reasons: undefined, reason: "B2B_OUTBOUND_NOT_AVAILABLE" },
    operation: syncOperation({ state: "manual_review", staffState: "attention", mechanism: "manual", reasonCode: null, attempts: 0, providerResult: null, providerStatus: null, lastError: "B2B_OUTBOUND_NOT_AVAILABLE", history: [] }),
    actions: { send: false, retry: false, withdraw: false, close: true } }));
  assert.match(b2b, /Fără apel automat: o persoană anulează în platforma canalului/);
  assert.match(b2b, /Necesită verificare manuală/);
  assert.match(b2b, /B2B nu are încă o anulare automată/);
  assert.match(b2b, /data-action="sync-close"/);
  const woo = syncView("ro", withSync({ provider: { ...trendyolProvider, source: "trendhome", mechanism: "source_pull", confirmation: "inbound_event", reasons: undefined },
    operation: syncOperation({ state: "manual_review", staffState: "attention", mechanism: "source_pull", reasonCode: null, lastError: "PAID_ORDER_REQUIRES_PERSON", history: [] }),
    actions: { send: false, retry: true, withdraw: false, close: true } }));
  assert.match(woo, /Conectorul magazinului preia cererea \(WooCommerce\)/);
  assert.match(woo, /Comanda este plătită: o persoană decide \(fără rambursare automată\)/);
  assert.match(woo, /Evenimentul următor primit de la canal/);
  assert.match(woo, /data-action="sync-retry"/);
  const confirmed = syncView("ro", withSync({ operation: syncOperation({ state: "confirmed", staffState: "confirmed", confirmedAt: "2026-10-16T08:03:00.000Z", confirmedBy: "status_read", providerStatus: "Cancelled" }) }));
  assert.match(confirmed, /Confirmată de canal/);
  assert.match(confirmed, /prin citirea statusului la Trendyol/);
  // An API before 2.36.0 has no sync block: the Phase 1 text stays.
  assert.match(syncView("ro", cancellation()), /Arasya nu a trimis nimic către sursă/);
  assert.doesNotMatch(syncView("ro", cancellation()), /data-section="cancellation-sync"/);
});

test("API 2.36.0: Turkish copy exists for every synchronization state, mechanism and finding", () => {
  const ro = MESSAGES.ro.orders.cancellation.sync;
  const tr = MESSAGES.tr.orders.cancellation.sync;
  for (const state of ["queued", "processing", "awaiting_pickup", "awaiting_confirmation", "retry_scheduled", "uncertain", "confirmed", "rejected", "failed", "manual_review", "withdrawn", "closed"]) {
    assert.ok(ro.state[state] && tr.state[state] && ro.stateHint[state] && tr.stateHint[state], `state ${state}`);
  }
  assert.deepEqual(Object.keys(tr.error).sort(), Object.keys(ro.error).sort());
  assert.deepEqual(Object.keys(MESSAGES.tr.production.cancellationSync.kindLabel).sort(), Object.keys(MESSAGES.ro.production.cancellationSync.kindLabel).sort());
  assert.match(syncView("tr", withSync({ operation: syncOperation() })), /Kanal onayını bekliyor/);
});

test("API 2.36.0: the synchronization overview lists channels, states and findings; a dry run is offered only with the permission", () => {
  const overview: CancellationSyncOverview = {
    ready: true,
    providers: [trendyolProvider, { ...trendyolProvider, source: "trendhome", mechanism: "source_pull", active: false, flagEnabled: false, reasons: undefined }, { ...trendyolProvider, source: "b2b", mechanism: "manual", active: false, configured: false, reasons: undefined }],
    operations: { trendyol: { confirmed: 3, awaiting_confirmation: 1 } },
    discrepancies: [{ id: "d-1", kind: "operation_manual_review", severity: "medium", orderId: "trendhome:70100", orderNumber: "70100", operationId: "op-1", source: "trendhome", remediation: "person_decides", retryEligible: true, state: "open", details: {}, detectedAt: "2026-10-16T08:00:00.000Z", lastSeenAt: "2026-10-16T08:00:00.000Z", resolvedAt: null }],
    capabilities: { sync: true },
  };
  const html = wrap("ro", <CancellationSyncOverviewView data={overview} dryRun={() => Promise.reject(new Error("not called"))} />);
  assert.match(html, /data-provider="trendyol" data-active="true"/);
  assert.match(html, /Confirmată de canal: 3/);
  assert.match(html, /data-provider="trendhome" data-active="false"[^]*Oprită pentru acest canal/);
  assert.match(html, /data-finding="operation_manual_review" data-severity="medium"[^]*Necesită o decizie[^]*O persoană decide/);
  assert.match(html, /data-action="sync-dry-run"/);
  const readOnly = wrap("ro", <CancellationSyncOverviewView data={{ ...overview, capabilities: { sync: false } }} dryRun={() => Promise.reject(new Error("not called"))} />);
  assert.doesNotMatch(readOnly, /data-action="sync-dry-run"/);
  assert.match(wrap("ro", <CancellationSyncOverviewView data={{ ...overview, ready: false }} dryRun={() => Promise.reject(new Error("not called"))} />), /migrarea 034/);
});

test("API 2.36.0: the client calls the synchronization routes with idempotency keys and exact bodies", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ body: syncOperation() }));
  const api = createApi(API, fetchImpl);
  await api.sendCancellation("trendyol:1", { expectedVersion: 3, reasonCode: 500 }, "key-sync-0000000001");
  await api.syncOperation("op-1", "withdraw", { expectedVersion: 4, reason: "Clientul păstrează comanda." }, "key-sync-0000000002");
  await api.cancellationSyncOverview();
  await api.reconcileCancellationSync();
  const routes = calls.filter((call) => call.url.pathname.includes("cancellation"));
  assert.deepEqual(routes.map((call) => `${call.method} ${call.url.pathname}`), [
    "POST /management/orders/trendyol%3A1/cancellation/sync",
    "POST /management/cancellation-sync/operations/op-1/withdraw",
    "GET /management/cancellation-sync",
    "POST /management/cancellation-sync/reconcile",
  ]);
  assert.deepEqual(routes[0].body, { expectedVersion: 3, reasonCode: 500 });
  assert.equal(routes[1].headers["Idempotency-Key"] ?? routes[1].headers["idempotency-key"], "key-sync-0000000002");
});
