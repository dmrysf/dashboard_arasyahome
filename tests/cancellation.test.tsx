import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createApi } from "../src/api/client";
import type { ManagementMe, OrderCancellation, OrderSummary, ProductionOverview } from "../src/api/types";
import { DashboardContext } from "../src/app/context";
import { MESSAGES, type Locale } from "../src/i18n";
import { I18nProvider } from "../src/i18n/context";
import { CancellationPanelView } from "../src/pages/CancellationPanel";
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
