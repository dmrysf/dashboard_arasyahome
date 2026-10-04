import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { describeAuditEvent } from "../src/api/audit";
import { ApiError, createApi, newIdempotencyKey } from "../src/api/client";
import type { AuditEvent, EligibleOwners, ManagementMe, OrderDetail, OrderSummary } from "../src/api/types";
import { DashboardContext } from "../src/app/context";
import { createTranslator, type Locale } from "../src/i18n";
import { I18nProvider } from "../src/i18n/context";
import { PilotReadiness } from "../src/pages/EmployeeDetailPage";
import { OrderDetailView, ReassignDialogView } from "../src/pages/OrderDetailPage";
import { DEFAULT_ORDER_FILTERS, OrdersView } from "../src/pages/OrdersPage";
import { API, apiError, employee, fakeFetch, me } from "./support";

// Production Control V2: supervisor owner interventions in the Dashboard. The server is authoritative;
// these tests cover what the interface offers, says and sends.

const ALI = { id: "11111111-1111-4111-8111-111111111111", displayName: "Ali Demir" };
const MEHMET = { id: "22222222-2222-4222-8222-222222222222", displayName: "Mehmet Yılmaz" };
const DIRECTOR = { id: "33333333-3333-4333-8333-333333333333", displayName: "Yusuf Supervizor" };

function summary(production: Partial<OrderSummary["production"]> = {}): OrderSummary {
  return {
    globalOrderId: "trendhome:9101",
    orderNumber: "9101",
    source: { key: "trendhome", name: "Trendhome" },
    commerce: { status: { code: "processing", label: "Se procesează" }, availability: "active" },
    production: { state: "active", stage: { id: "waiting", label: "În așteptare", ordinal: 1 }, owner: ALI, claimedAt: "2026-10-04T10:15:00.000Z", stageEnteredAt: "2026-10-04T10:00:00.000Z", completedAt: null, attention: null, ...production },
    importedAt: "2026-10-04T09:00:00.000Z",
    acceptedAt: "2026-10-04T08:55:00.000Z",
  };
}

function detail(production: Partial<OrderDetail["production"]> = {}, rest: Partial<OrderDetail> = {}): OrderDetail {
  const base = summary();
  return {
    ...base,
    commerce: { ...base.commerce, sourceChangedAt: "2026-10-04T08:56:00.000Z", lastSourceSeenAt: "2026-10-04T09:00:00.000Z" },
    production: { ...base.production, changedAt: null, version: 5, notes: null, control: { canManageOwner: true, blockedReason: null }, ...production },
    items: [],
    activity: [
      { id: "e1", action: "claimed", occurredAt: "2026-10-04T10:15:00.000Z", employee: ALI, fromStage: { id: "waiting", label: "În așteptare" }, toStage: null, previousOwner: null, newOwner: null, productionVersion: 2 },
      { id: "e2", action: "owner_reassigned", occurredAt: "2026-10-04T11:32:00.000Z", employee: DIRECTOR, fromStage: { id: "waiting", label: "În așteptare" }, toStage: null, previousOwner: ALI, newOwner: MEHMET, productionVersion: 3 },
      { id: "e3", action: "owner_released", occurredAt: "2026-10-04T13:04:00.000Z", employee: DIRECTOR, fromStage: { id: "waiting", label: "În așteptare" }, toStage: null, previousOwner: MEHMET, newOwner: null, productionVersion: 4 },
      { id: "e4", action: "claimed", occurredAt: "2026-10-04T13:08:00.000Z", employee: MEHMET, fromStage: { id: "waiting", label: "În așteptare" }, toStage: null, previousOwner: null, newOwner: null, productionVersion: 5 },
    ],
    activityTruncated: false,
    ...rest,
  };
}

const eligible: EligibleOwners = {
  stage: { id: "waiting", label: "În așteptare" },
  productionVersion: 5,
  blockedReason: null,
  items: [
    { id: MEHMET.id, displayName: MEHMET.displayName, department: "Pregătire Material", positionTitle: "Croitor", stage: { id: "waiting", label: "În așteptare" } },
    { id: "44444444-4444-4444-8444-444444444444", displayName: "Cem Kaya", department: "Atelier", positionTitle: null, stage: { id: "waiting", label: "În așteptare" } },
  ],
};

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
const view = (locale: Locale, data: OrderDetail) => wrap(locale, <OrderDetailView data={data} error={null} updatedAt={Date.parse("2026-10-04T14:00:00Z")} refreshing={false} refresh={noop} onBack={noop} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)</g)].map((match) => match[1]);
const section = (html: string, name: string) => html.slice(html.indexOf(`data-section="${name}"`), html.indexOf("</section>", html.indexOf(`data-section="${name}"`)));
const dialog = (locale: Locale, props: Partial<Parameters<typeof ReassignDialogView>[0]> = {}) => wrap(locale, <ReassignDialogView data={detail()} eligible={eligible} loadError={null} selected="" busy={false} error={null} onSelect={noop} onConfirm={noop} onCancel={noop} {...props} />);

test("owner controls appear only for production.manage_owner and only while production is active", () => {
  const allowed = view("ro", detail());
  assert.deepEqual(buttons(section(allowed, "control")), ["Schimbă responsabilul", "Eliberează responsabilul"]);
  assert.ok(text(section(allowed, "control")).includes("Control producție"));
  assert.ok(text(section(allowed, "control")).includes("Permisă"));

  const viewer = view("ro", detail({ control: { canManageOwner: false, blockedReason: null } }));
  assert.deepEqual(buttons(section(viewer, "control")), [], "no intervention buttons without the permission");
  assert.ok(text(section(viewer, "control")).includes("„Intervenție responsabil producție”"));

  const unowned = view("ro", detail({ owner: null, claimedAt: null, attention: "unassigned" }));
  assert.deepEqual(buttons(section(unowned, "control")), ["Atribuie responsabil"], "an unowned order can be assigned, not released");

  const completed = view("ro", detail({ state: "completed", owner: null, completedAt: "2026-10-04T15:00:00.000Z", control: { canManageOwner: true, blockedReason: "production_completed" } }));
  assert.deepEqual(buttons(section(completed, "control")), []);
  assert.ok(text(section(completed, "control")).includes("Nu: producția este finalizată"));
  const cancelled = view("ro", detail({ state: "cancelled", control: { canManageOwner: true, blockedReason: "order_unavailable" } }));
  assert.deepEqual(buttons(section(cancelled, "control")), []);
});

test("the control section shows stage, owner, claimed time, version and state, and never a stage control", () => {
  const html = view("ro", detail());
  const control = text(section(html, "control"));
  assert.ok(control.includes("În așteptare") && control.includes("Ali Demir") && control.includes("Versiune producție 5") && control.includes("Activă"));
  assert.ok(!/<select/.test(html), "no stage dropdown anywhere on the page");
  for (const forbidden of ["Setează etapa", "Mută în etapa", "Resetează etapa", "Redeschide"]) assert.ok(!text(html).includes(forbidden));
  assert.ok(text(section(html, "commerce")).includes("Se procesează"), "the store status stays in its own section");
});

test("Turkish control labels follow the specification", () => {
  const html = view("tr", detail());
  assert.deepEqual(buttons(section(html, "control")), ["Sorumluyu Değiştir", "Sorumluluğu Serbest Bırak"]);
  assert.ok(text(section(html, "control")).includes("Üretim Kontrolü"));
});

test("the reassign dialog lists only the server's eligible employees with department, position and stage permission", () => {
  const html = dialog("ro");
  assert.deepEqual([...html.matchAll(/data-candidate="([^"]+)"/g)].map((match) => match[1]), eligible.items.map((item) => item.id));
  const ro = text(html);
  assert.ok(ro.includes("Mehmet Yılmaz") && ro.includes("Pregătire Material · Croitor") && ro.includes("Etapă permisă: În așteptare"));
  assert.ok(ro.includes("Cem Kaya") && ro.includes("Atelier"));
  assert.ok(!/authorityRank|permissions|isRoot|password/i.test(html), "no IAM internals");
  assert.ok(text(dialog("ro", { eligible: { ...eligible, items: [] } })).includes("Niciun angajat eligibil pentru etapa curentă."));
  assert.ok(text(dialog("ro", { eligible: null })).includes("Se încarcă angajații eligibili"));
  assert.ok(text(dialog("ro", { eligible: null, loadError: new ApiError("UNAUTHORIZED_ACTION", 403) })).includes("Nu ai permisiunea pentru această acțiune."));
});

test("before submission the dialog shows current owner, new owner and stage with the exact warning; confirm needs a choice", () => {
  const empty = dialog("ro");
  assert.match(empty, /<button[^>]*disabled=""[^>]*>Confirmă schimbarea</, "nothing selected: confirmation disabled");
  assert.ok(text(empty).includes("Alege un angajat"));
  const chosen = dialog("ro", { selected: MEHMET.id });
  assert.doesNotMatch(chosen, /<button[^>]*disabled=""[^>]*>Confirmă schimbarea</);
  const ro = text(chosen);
  assert.ok(ro.includes("Responsabil curent Ali Demir") && ro.includes("Responsabil nou Mehmet Yılmaz") && ro.includes("Etapa de producție curentă În așteptare"), ro);
  assert.ok(ro.includes("Această acțiune schimbă doar responsabilul de producție. Etapa de producție și statusul magazinului nu vor fi modificate."));
  const tr = text(dialog("tr", { selected: MEHMET.id }));
  assert.ok(tr.includes("Bu işlem yalnızca üretim sorumlusunu değiştirir. Üretim aşaması ve mağaza sipariş durumu değişmez."));
  assert.ok(tr.includes("Mevcut sorumlu") && tr.includes("Yeni sorumlu") && tr.includes("Mevcut üretim aşaması"));
});

test("concurrency and permission failures are shown in the active language", () => {
  const t = createTranslator("ro");
  assert.equal(t.problem(new ApiError("ORDER_CHANGED", 409)), "Comanda s-a schimbat între timp. Reîncarcă datele și încearcă din nou.");
  assert.equal(t.problem(new ApiError("EMPLOYEE_NOT_ELIGIBLE_FOR_STAGE", 422)).startsWith("Angajatul ales nu poate lucra"), true);
  assert.equal(t.problem(new ApiError("AUTHORITY_EXCEEDED", 403)), "Modificarea depășește nivelul tău de autoritate.");
  assert.equal(createTranslator("tr").problem(new ApiError("ORDER_CHANGED", 409)), "Sipariş bu arada değişti. Verileri yeniden yükleyip tekrar deneyin.");
  assert.equal(createTranslator("tr").problem(new ApiError("PRODUCTION_COMPLETED", 409)), "Üretim tamamlandı; sorumlu artık değiştirilemez.");
  const failed = text(dialog("ro", { selected: MEHMET.id, error: new ApiError("EMPLOYEE_NOT_ELIGIBLE_FOR_STAGE", 422) }));
  assert.ok(failed.includes("Angajatul ales nu poate lucra în etapa de producție curentă"));
});

test("the timeline shows ownership interventions chronologically with supervisor, previous and new owner", () => {
  const html = view("ro", detail());
  assert.deepEqual([...html.matchAll(/data-event="([^"]+)"/g)].map((match) => match[1]), ["imported", "claimed", "owner_reassigned", "owner_released", "claimed"]);
  const ro = text(html);
  assert.ok(ro.includes("A schimbat responsabilul Yusuf Supervizor Responsabil: Ali Demir → Mehmet Yılmaz Etapă producție: În așteptare"), ro);
  assert.ok(ro.includes("A eliberat responsabilul Yusuf Supervizor Responsabil eliberat: Mehmet Yılmaz"));
  const tr = text(view("tr", detail()));
  assert.ok(tr.includes("Sorumluyu değiştirdi") && tr.includes("Sorumlu: Ali Demir → Mehmet Yılmaz") && tr.includes("Sorumluluğu serbest bıraktı"));
});

test("the order list shows objective attention and keeps unassigned work visible, never SLA words", () => {
  const items = [
    summary({ attention: null }),
    { ...summary({ owner: null, claimedAt: null, attention: "unassigned" }), globalOrderId: "trendhome:9102", orderNumber: "9102" },
    { ...summary({ attention: "owner_inactive" }), globalOrderId: "trendhome:9103", orderNumber: "9103" },
    { ...summary({ attention: "owner_stage_not_allowed" }), globalOrderId: "trendhome:9104", orderNumber: "9104" },
  ];
  const html = wrap("ro", <OrdersView data={{ items, nextCursor: null, facets: { sources: [], stages: [], commerceStatuses: [], owners: [] }, counts: { unassignedActive: 7, ownerAttention: 2 } }} error={null} updatedAt={Date.parse("2026-10-04T14:00:00Z")} refreshing={false} refresh={noop}
    filters={DEFAULT_ORDER_FILTERS} facets={{ sources: [], stages: [], commerceStatuses: [], owners: [] }} page={1} onFilters={noop} onNext={noop} onPrevious={noop} onFirst={noop} />);
  const ro = text(html);
  assert.ok(ro.includes("7 active fără responsabil") && ro.includes("2 cu responsabil care nu mai poate lucra"));
  assert.ok(ro.includes("Responsabil inactiv") && ro.includes("Responsabil fără etapa curentă"));
  assert.match(html, /<option value="owner_attention">Responsabil care nu mai poate lucra<\/option>/);
  assert.deepEqual([...html.matchAll(/<tr[^>]*data-attention="([^"]+)"/g)].map((match) => match[1]), ["unassigned", "owner_inactive", "owner_stage_not_allowed"]);
  for (const word of ["Întârziat", "Depășit", "Late", "Overdue", "Delayed", "Gecikmiş"]) assert.ok(!ro.includes(word), word);
  const none = text(wrap("ro", <OrdersView data={{ items, nextCursor: null, facets: { sources: [], stages: [], commerceStatuses: [], owners: [] }, counts: { unassignedActive: 0, ownerAttention: 0 } }} error={null} updatedAt={null} refreshing={false} refresh={noop}
    filters={DEFAULT_ORDER_FILTERS} facets={{ sources: [], stages: [], commerceStatuses: [], owners: [] }} page={1} onFilters={noop} onNext={noop} onPrevious={noop} onFirst={noop} />));
  assert.ok(none.includes("0 active fără responsabil") && !none.includes("nu mai poate lucra 0"), "the unassigned counter stays visible at zero");
});

test("the API client sends interventions with CSRF, an Idempotency-Key and only the documented fields", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url.pathname === "/auth/session") return { body: { employee: { employeeUuid: DIRECTOR.id, displayName: DIRECTOR.displayName, username: "yusuf", department: "Conducere", permissions: [], applications: ["dashboard"], allowedStageIds: [], isRoot: false, mustChangePassword: false, authorizationVersion: 1 }, expiresAt: "2026-10-04T20:00:00Z", csrfToken: "csrf-1" } };
    if (call.url.pathname.endsWith("/eligible-owners")) return { body: eligible };
    if (call.method === "POST") return apiError("ORDER_CHANGED", 409);
    return { body: { globalOrderId: "trendhome:9101", action: "owner_reassigned", production: { version: 6, stage: { id: "waiting", label: "În așteptare" }, owner: MEHMET, previousOwner: ALI } } };
  });
  const api = createApi(API, fetchImpl);
  await api.getSession();
  await api.eligibleOwners("trendhome:9101");
  const result = await api.reassignOwner("trendhome:9101", MEHMET.id, 5, "dash-key-reassign-0001");
  await assert.rejects(api.releaseOwner("trendhome:9101", 6, "dash-key-release-00001"), (error: unknown) => error instanceof ApiError && error.code === "ORDER_CHANGED");
  const [, list, reassign, release] = calls;
  assert.equal(list.url.toString(), `${API}/management/orders/trendhome%3A9101/eligible-owners`);
  assert.equal(list.method, "GET");
  assert.equal(reassign.url.toString(), `${API}/management/orders/trendhome%3A9101/owner`);
  assert.equal(reassign.method, "PUT");
  assert.deepEqual(reassign.body, { employeeId: MEHMET.id, expectedVersion: 5 });
  assert.equal(reassign.headers["X-CSRF-Token"], "csrf-1");
  assert.equal(reassign.headers["Idempotency-Key"], "dash-key-reassign-0001");
  assert.equal(reassign.credentials, "include");
  assert.equal(release.url.toString(), `${API}/management/orders/trendhome%3A9101/release-owner`);
  assert.equal(release.method, "POST");
  assert.deepEqual(release.body, { expectedVersion: 6 });
  assert.equal(release.headers["Idempotency-Key"], "dash-key-release-00001");
  assert.equal(result.production.stage.id, "waiting", "the server reports the stage unchanged");
  assert.ok(calls.every((call) => call.url.origin === API), "no request leaves the Operations API");
  const key = newIdempotencyKey();
  assert.match(key, /^[A-Za-z0-9][A-Za-z0-9_-]{15,99}$/);
  assert.notEqual(key, newIdempotencyKey());
});

test("IAM audit renders ownership interventions from stable keys in both languages", () => {
  const event = (action: string, newOwner: unknown): AuditEvent => ({
    id: "a1", actorId: DIRECTOR.id, actorLabel: "Yusuf Supervizor (yusuf)", actorType: "employee", action, targetType: "order", targetId: "trendhome:9101", targetLabel: "9101 · trendhome",
    metadata: { stage: { id: "waiting", label: "În așteptare" }, previousOwner: ALI, newOwner, productionVersion: { after: 3, before: 2 } }, createdAt: "2026-10-04T11:32:00.000Z",
  });
  const ro = createTranslator("ro");
  const moved = describeAuditEvent(event("production.owner.reassigned", MEHMET), ro);
  assert.deepEqual(moved.sentences, ["Yusuf Supervizor a schimbat responsabilul de producție al comenzii 9101 · trendhome."]);
  assert.deepEqual(moved.details, ["responsabil: Ali Demir → Mehmet Yılmaz", "etapa de producție neschimbată: În așteptare"]);
  const released = describeAuditEvent(event("production.owner.released", null), ro);
  assert.deepEqual(released.details, ["responsabil: Ali Demir → nimeni", "etapa de producție neschimbată: În așteptare"]);
  assert.equal(ro.auditAction("production.owner.released"), "Responsabil producție eliberat");
  const tr = createTranslator("tr");
  assert.equal(tr.auditAction("production.owner.reassigned"), "Üretim sorumlusu değiştirildi");
  assert.deepEqual(describeAuditEvent(event("production.owner.reassigned", MEHMET), tr).details, ["sorumlu: Ali Demir → Mehmet Yılmaz", "üretim aşaması değişmedi: Bekliyor"]);
  assert.equal(ro.permission("production.manage_owner"), "Intervenție responsabil producție");
  assert.equal(tr.permission("production.manage_owner"), "Üretim Sorumlusuna Müdahale");
});

test("the pilot readiness card summarises the account from booleans only", () => {
  const ready = wrap("ro", <PilotReadiness data={employee({ stageIds: ["waiting", "material-preparation"], lastLoginAt: "2026-10-04T08:00:00.000Z" })} />);
  assert.match(ready, /data-pilot="ready"/);
  assert.ok(text(ready).includes("Contul poate lucra în Staff") && text(ready).includes("2 etape Staff atribuite") && text(ready).includes("Parola temporară a fost schimbată"));
  const pending = wrap("ro", <PilotReadiness data={employee({ mustChangePassword: true })} />);
  assert.match(pending, /data-pilot="pending"/);
  const missing = wrap("ro", <PilotReadiness data={employee({ applications: ["dashboard"], stageIds: [], status: "inactive" })} />);
  assert.match(missing, /data-pilot="not_ready"/);
  assert.deepEqual([...missing.matchAll(/data-check="([^"]+)" data-ok="(true|false)"/g)].map((match) => `${match[1]}:${match[2]}`), ["active:false", "staff:false", "stages:false", "password:true", "login:false"]);
  assert.ok(!/hash|token|session|password_hash/i.test(missing.replace(/data-check="password"/g, "")), "no credential material");
  assert.ok(text(wrap("tr", <PilotReadiness data={employee({ stageIds: ["waiting"] })} />)).includes("Pilot Hazırlığı"));
});
