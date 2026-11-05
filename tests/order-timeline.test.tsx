import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineEvent } from "../src/api/types";
import { MESSAGES } from "../src/i18n";
import { I18nProvider } from "../src/i18n/context";
import { actionLabel, detailText, OrderTimelineCard, span, timelineRows } from "../src/pages/OrderTimelineCard";

const person = (displayName: string, department: string | null = "Producție") => ({ displayName, department });
const event = (id: number, at: string, kind: TimelineEvent["kind"], action: string, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: `${kind}:${id}`, at, kind, action, actor: null, system: null, fromStage: null, toStage: null, detail: {}, ...extra,
});

// The shape of the live Trendyol order 11779043715 (API 2.59.0 payload), times in UTC.
const items: TimelineEvent[] = [
  event(1, "2026-11-03T12:50:03.142Z", "intake", "received", { system: "trendyol-sync", detail: { status: "ReadyToShip", lines: 2 } }),
  event(2, "2026-11-03T13:05:03.000Z", "intake", "marketplace_updated", { system: "trendyol-sync", detail: { from: "ReadyToShip", to: "Picking" } }),
  event(3, "2026-11-03T13:06:54.000Z", "intake", "line_prepared", { actor: person("Ayşe Hopcu", "Trendyol"), detail: { kind: "curtain", widthCm: "150", heightCm: "210", productionTitle: "Perdea Milan In Ivory" } }),
  event(4, "2026-11-03T13:07:00.593Z", "intake", "released", { actor: person("Ayşe Hopcu", "Trendyol"), detail: { stageId: "waiting" } }),
  event(5, "2026-11-03T13:07:00.600Z", "production", "production_submitted", { actor: person("Ayşe Hopcu", "Trendyol"), fromStage: { id: "waiting", label: "În așteptare" } }),
  event(6, "2026-11-03T13:07:00.610Z", "qr", "issued", { system: "system", detail: { revision: 1 } }),
  event(7, "2026-11-03T13:07:04.000Z", "document", "printed", { actor: person("Ayşe Hopcu", "Trendyol"), detail: { revision: 1 } }),
  event(8, "2026-11-03T13:40:17.000Z", "production", "claimed", { actor: person("Ayşe Hopcu", "Trendyol"), fromStage: { id: "waiting", label: "În așteptare" } }),
  event(9, "2026-11-03T13:40:18.000Z", "production", "stage_completed", { actor: person("Ayşe Hopcu", "Trendyol"), fromStage: { id: "waiting", label: "În așteptare" }, toStage: { id: "material-preparation", label: "Tăiere" } }),
  event(10, "2026-11-03T15:03:32.000Z", "production", "claimed", { actor: person("REJEPOV AYMYRAT", "Croitorie"), fromStage: { id: "material-preparation", label: "Tăiere" } }),
  event(11, "2026-11-03T15:03:35.000Z", "production", "stage_completed", { actor: person("REJEPOV AYMYRAT", "Croitorie"), fromStage: { id: "material-preparation", label: "Tăiere" }, toStage: { id: "workshop-receiving", label: "Primire Croitorie" } }),
  event(12, "2026-11-04T06:09:24.000Z", "production", "claimed", { actor: person("VASILOAIA IULIANA"), fromStage: { id: "workshop-receiving", label: "Primire Croitorie" } }),
  event(13, "2026-11-04T06:09:28.000Z", "production", "stage_completed", { actor: person("VASILOAIA IULIANA"), fromStage: { id: "workshop-receiving", label: "Primire Croitorie" }, toStage: { id: "labeling", label: "Etichetare" } }),
];

test("waiting and work durations come from the production event order only", () => {
  const rows = timelineRows(items);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId["production:8"].waitedMs, 33 * 60_000 + 16_400, "the first claim waited since the submission");
  assert.equal(byId["production:9"].workMs, 1000);
  assert.equal(byId["production:10"].waitedMs, (15 * 3600 + 3 * 60 + 32 - (13 * 3600 + 40 * 60 + 18)) * 1000, "the cutter's claim waited since the previous stage completion");
  assert.equal(byId["production:11"].workMs, 3000, "the cutting itself took 3 s");
  assert.equal(byId["intake:3"].waitedMs, null);
  assert.equal(byId["qr:6"].workMs, null, "only production events get durations");
  assert.deepEqual(timelineRows([event(1, "2026-11-03T10:00:00Z", "production", "stage_completed")])[0].workMs, null, "a completion without a claim has no duration");
});

test("durations keep seconds in both languages", () => {
  assert.equal(span(MESSAGES.tr.timeline, 3000), "3 sn");
  assert.equal(span(MESSAGES.tr.timeline, 245_000), "4 dk 5 sn");
  assert.equal(span(MESSAGES.tr.timeline, (3600 + 23 * 60) * 1000), "1 sa 23 dk");
  assert.equal(span(MESSAGES.ro.timeline, (2 * 24 + 3) * 3600_000), "2 z 3 h");
  assert.equal(span(MESSAGES.ro.timeline, -5), "0 s", "never negative");
});

test("event details are built from the whitelisted codes", () => {
  const tr = MESSAGES.tr.timeline;
  assert.deepEqual(detailText(tr, items[1]), ["Trendyol: ReadyToShip → Picking"]);
  assert.deepEqual(detailText(tr, items[0]), ["Trendyol: ReadyToShip", "2 ürün"]);
  assert.deepEqual(detailText(tr, items[2]), ["Perdea Milan In Ivory", "tül perde", "150 × 210 cm"]);
  assert.deepEqual(detailText(tr, items[6]), ["revizyon 1"]);
  assert.deepEqual(detailText(tr, event(1, "2026-11-03T10:00:00Z", "confirmation", "assigned", { detail: { from: "pending", to: "pending", assignee: "Zelal" } })), ["atanan: Zelal"]);
  assert.deepEqual(detailText(tr, event(1, "2026-11-03T10:00:00Z", "confirmation", "approved", { detail: { from: "pending", to: "approved" } })), ["bekliyor → onaylandı"]);
  assert.equal(actionLabel(tr, items[3]), "Onaylayıp üretime gönderdi");
  assert.equal(actionLabel(tr, event(1, "2026-11-03T10:00:00Z", "production", "future_action")), "Üretim · future_action", "an unknown action keeps its code");
});

test("every event kind and action has Romanian and Turkish labels", () => {
  const ro = MESSAGES.ro.timeline.actions;
  const tr = MESSAGES.tr.timeline.actions;
  assert.deepEqual(Object.keys(tr), Object.keys(ro));
  for (const kind of Object.keys(ro)) assert.deepEqual(Object.keys(tr[kind]), Object.keys(ro[kind]), kind);
  for (const kind of ["intake", "confirmation", "production", "document", "qr", "exception", "cancellation"] as const) {
    assert.ok(MESSAGES.ro.timeline.kinds[kind] && MESSAGES.tr.timeline.kinds[kind] && ro[kind] && tr[kind], kind);
  }
});

test("the card shows Bucharest date and second-exact time, who, what and the stage move", () => {
  const html = renderToStaticMarkup(<I18nProvider locale="tr"><OrderTimelineCard timeline={{ items, truncated: false }} /></I18nProvider>);
  assert.match(html, /Sipariş geçmişi/);
  assert.match(html, /3 Kasım 2026 Salı/, "events are grouped by the Bucharest day");
  assert.match(html, /4 Kasım 2026 Çarşamba/);
  assert.match(html, />14:50:03</, "12:50:03 UTC is 14:50:03 in Bucharest, with seconds");
  assert.match(html, />17:03:35</);
  assert.match(html, /REJEPOV AYMYRAT/);
  assert.match(html, /iş: 3 sn/, "the 3 s cutting is visible");
  assert.match(html, /bekledi: 1 sa 23 dk/);
  assert.match(html, /Trendyol senkronizasyonu/, "automatic events name the system");
  assert.match(html, /Aşamayı tamamladı/);
  assert.match(html, /→ <strong>/, "a stage move shows the stage reached");
  assert.equal((html.match(/<li /g) ?? []).length, items.length);
  assert.match(html, /aria-pressed="true"[^>]*>Tümü/);
  assert.doesNotMatch(html, /İstisna ve iptal/, "a filter without events is hidden");
});

test("an older API without a timeline and an empty timeline are explained", () => {
  assert.match(renderToStaticMarkup(<I18nProvider locale="ro"><OrderTimelineCard timeline={undefined} /></I18nProvider>), /API-ului \(2\.59\.0\)/);
  assert.match(renderToStaticMarkup(<I18nProvider locale="ro"><OrderTimelineCard timeline={{ items: [], truncated: false }} /></I18nProvider>), /Niciun eveniment înregistrat/);
  assert.match(renderToStaticMarkup(<I18nProvider locale="ro"><OrderTimelineCard timeline={{ items: items.slice(0, 2), truncated: true }} /></I18nProvider>), /ultimele 2 evenimente/);
});
