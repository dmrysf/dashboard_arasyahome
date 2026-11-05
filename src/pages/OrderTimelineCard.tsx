import { useMemo, useState } from "react";
import type { TimelineEvent, TimelineKind } from "../api/types";
import { Card, EmptyState } from "../components/ui";
import type { Locale } from "../i18n";
import { useI18n } from "../i18n/context";
import type { timelineRo } from "../i18n/timeline";

type Texts = typeof timelineRo;
export type TimelineFilter = keyof Texts["filters"];

const FILTERS: Record<TimelineFilter, TimelineKind[] | null> = {
  all: null,
  production: ["production"],
  intake: ["intake", "confirmation"],
  documents: ["document", "qr"],
  exceptions: ["exception", "cancellation"],
};

const INTL: Record<Locale, string> = { ro: "ro-RO", tr: "tr-TR" };

/** One timeline row with the derived durations: how long the order waited for the claim and how long the work took. */
export type TimelineRow = TimelineEvent & { waitedMs: number | null; workMs: number | null };

/**
 * Production durations from the event order alone: a claim waited since the previous hand-over (submission, stage
 * completion, approved return); a stage completion took the time since that claim. Other kinds never get a duration.
 */
export function timelineRows(items: TimelineEvent[]): TimelineRow[] {
  let handedAt: number | null = null;
  let claimedAt: number | null = null;
  return items.map((event) => {
    const at = Date.parse(event.at);
    const row: TimelineRow = { ...event, waitedMs: null, workMs: null };
    if (event.kind !== "production" || Number.isNaN(at)) return row;
    if (event.action === "claimed") {
      if (handedAt !== null) row.waitedMs = Math.max(0, at - handedAt);
      claimedAt = at;
    } else if (event.action === "stage_completed" || event.action === "production_completed") {
      if (claimedAt !== null) row.workMs = Math.max(0, at - claimedAt);
      handedAt = at;
      claimedAt = null;
    } else if (event.action === "production_submitted" || event.action === "fault_returned" || event.action === "owner_released" || event.action === "defect_restored") {
      handedAt = at;
      claimedAt = null;
    }
    return row;
  });
}

/** Exact elapsed time with seconds: "3 s", "4 min 5 s", "1 h 23 min", "2 z 3 h". */
export function span(texts: Texts, milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  if (seconds < 60) return texts.span.seconds(seconds);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return texts.span.minutes(minutes, seconds % 60);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return texts.span.hours(hours, minutes % 60);
  return texts.span.days(Math.floor(hours / 24), hours % 24);
}

/** The human detail of one event from its whitelisted codes. */
export function detailText(texts: Texts, event: TimelineEvent): string[] {
  const d = event.detail ?? {};
  const s = (key: string): string | null => (typeof d[key] === "string" && d[key] !== "" ? (d[key] as string) : typeof d[key] === "number" ? String(d[key]) : null);
  const parts: string[] = [];
  if (event.kind === "intake") {
    if (s("from") && s("to")) parts.push(texts.detail.marketplace(`${s("from")} → ${s("to")}`));
    else if (s("status")) parts.push(texts.detail.marketplace(s("status")!));
    if (typeof d.lines === "number") parts.push(texts.detail.lines(d.lines));
    if (s("productionTitle")) parts.push(s("productionTitle")!);
    if (s("kind")) parts.push(texts.detail.kind[s("kind")!] ?? s("kind")!);
    if (s("widthCm") && s("heightCm")) parts.push(texts.detail.size(s("widthCm")!, s("heightCm")!));
    if (s("meters")) parts.push(texts.detail.meters(s("meters")!));
  } else if (event.kind === "confirmation") {
    const status = (value: string | null) => (value === null ? null : texts.detail.confirmation[value] ?? value);
    if (s("from") && s("to") && s("from") !== s("to")) parts.push(`${status(s("from"))} → ${status(s("to"))}`);
    if (s("assignee")) parts.push(texts.detail.assignee(s("assignee")!));
  } else if (event.kind === "document" || event.kind === "qr") {
    if (typeof d.revision === "number") parts.push(texts.detail.revision(d.revision));
    if (s("reason")) parts.push(s("reason")!);
  } else if (event.kind === "exception") {
    if (s("exception")) parts.push(texts.detail.exception(s("exception")!));
  } else if (event.kind === "production") {
    if (s("meters")) parts.push(texts.detail.meters(s("meters")!));
  }
  return parts;
}

export function actionLabel(texts: Texts, event: TimelineEvent): string {
  return texts.actions[event.kind]?.[event.action] ?? `${texts.kinds[event.kind] ?? texts.unknown} · ${event.action}`;
}

export function OrderTimelineCard({ timeline }: { timeline: { items: TimelineEvent[]; truncated: boolean } | undefined }) {
  const { t, stage, locale } = useI18n();
  const texts = t.timeline;
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const rows = useMemo(() => timelineRows(timeline?.items ?? []), [timeline]);
  const formats = useMemo(() => ({
    day: new Intl.DateTimeFormat(INTL[locale], { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" }),
    time: new Intl.DateTimeFormat(INTL[locale], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "Europe/Bucharest" }),
    key: new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Bucharest" }),
  }), [locale]);
  if (!timeline) return <Card title={texts.title}><p className="muted">{texts.unavailable}</p></Card>;
  const kinds = FILTERS[filter];
  const visible = kinds === null ? rows : rows.filter((row) => kinds.includes(row.kind));
  const count = (key: TimelineFilter) => (FILTERS[key] === null ? rows.length : rows.filter((row) => FILTERS[key]!.includes(row.kind)).length);
  const dayOf = (row: TimelineRow) => (Number.isNaN(Date.parse(row.at)) ? "" : formats.key.format(new Date(row.at)));
  return (
    <Card title={texts.title} description={texts.hint} className="order-timeline">
      <div className="timeline-filters" role="group" aria-label={texts.title}>
        {(Object.keys(FILTERS) as TimelineFilter[]).map((key) => count(key) > 0 || key === "all" ? (
          <button key={key} type="button" className="count-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>{texts.filters[key]} <span className="muted">{count(key)}</span></button>
        ) : null)}
      </div>
      {timeline.truncated && <p className="muted small">{texts.truncated(timeline.items.length)}</p>}
      {visible.length === 0 ? <EmptyState title={texts.empty} /> : (
        <ol className="order-events">
          {visible.map((row, index) => {
            const at = new Date(row.at);
            const valid = !Number.isNaN(at.getTime());
            const header = index === 0 || dayOf(visible[index - 1]) !== dayOf(row) ? (valid ? formats.day.format(at) : "—") : null;
            const details = detailText(texts, row);
            return (
              <li key={row.id} className={`order-event order-event-${row.kind}`} data-kind={row.kind} data-action={row.action}>
                {header && <h3 className="order-event-day">{header}</h3>}
                <time className="order-event-time" dateTime={row.at}>{valid ? formats.time.format(at) : "—"}</time>
                <div className="order-event-body">
                  <p className="order-event-what"><span className="chip chip-commerce">{texts.kinds[row.kind]}</span> <strong>{actionLabel(texts, row)}</strong></p>
                  {(row.fromStage || row.toStage) && <p className="order-event-stage">
                    {row.fromStage && stage(row.fromStage.id, row.fromStage.label)}
                    {row.fromStage && row.toStage && " → "}
                    {row.toStage && <strong>{stage(row.toStage.id, row.toStage.label)}</strong>}
                  </p>}
                  <p className="order-event-who">
                    {row.actor ? <><strong>{row.actor.displayName}</strong>{row.actor.department && <span className="muted"> · {row.actor.department}</span>}</> : <span className="muted">{texts.system(row.system ?? "system")}</span>}
                    {row.waitedMs !== null && <span className="muted"> · {texts.waited(span(texts, row.waitedMs))}</span>}
                    {row.workMs !== null && <span className="muted"> · {texts.work(span(texts, row.workMs))}</span>}
                  </p>
                  {details.length > 0 && <p className="order-event-detail muted">{details.join(" · ")}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="muted small">{texts.count(visible.length)}</p>
    </Card>
  );
}
