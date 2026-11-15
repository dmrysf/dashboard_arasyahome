import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  SKU_STATUSES, SOURCE_COLORS, SOURCE_ORDER, knownShare, reconciles, record, topSkus,
  type Bag, type CeoCompletions, type CeoOverview, type CeoSkus, type SkuFilters, type SkuMetric, type SkuRow, type SkuStatus,
} from "../api/ceo";
import { meterUnits } from "../api/intelligence";
import { useDashboard } from "../app/context";
import { Badge, Card, EmptyState, ErrorBanner, Field, Loading, Notice } from "../components/ui";
import { useI18n } from "../i18n/context";
import { ChartCard, HBars, StackedBars, type BarPoint, type Series } from "./CeoCharts";

/** Meters for display ("12545.190" -> "12.545,2"); malformed values show a dash, never 0. */
export function useMeterFormat() {
  const { locale } = useI18n();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "ro-RO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const m = (value: string | null | undefined) => { const units = meterUnits(value); return units === null ? "—" : format.format(units / 1000); };
    return { m, n: (value: number) => format.format(value) };
  }, [locale]);
}

const sourceLabel = (sources: Record<string, string>, key: string) => sources[key] ?? key;
const meters = (value: string) => Math.max(0, meterUnits(value) ?? 0) / 1000;

function Kpi({ title, value, hint, tone, children }: { title: string; value: ReactNode; hint?: ReactNode; tone?: "now" | "warn" | "panel" | "default"; children?: ReactNode }) {
  return (
    <article className={`ceo-kpi ceo-kpi-${tone ?? "default"}`}>
      <h3>{title}</h3>
      <p className="ceo-kpi-value">{value}</p>
      {hint && <p className="ceo-kpi-hint">{hint}</p>}
      {children}
    </article>
  );
}

// ------------------------------------------------------------------------------------------------- overview

export function CeoOverviewView({ data }: { data: CeoOverview }) {
  const { t, number, dateTime, stage } = useI18n(); const x = t.ceo; const s = t.intelligence.sources; const { m } = useMeterFormat();
  const completed = record(data.completed.bySource) as Record<string, Bag>;
  const th = completed.trendhome; const op = completed.outletperdele; const ty = completed.trendyol;
  const current = data.current;
  const byStage = record(current.byStage); const delayedByStage = record(current.delayedByStage);
  const received = data.received.bySource;
  const channelRows = SOURCE_ORDER.filter((key) => received[key] || completed[key]).map((key) => ({ key, received: received[key]?.orders ?? 0, receivedUnits: received[key]?.units ?? 0, completed: completed[key]?.orders ?? 0, completedUnits: completed[key]?.units ?? 0 }));
  const meterLines = record(data.quality.meterLinesByStatus); const panelLines = record(data.quality.panelLinesByStatus);
  const meterKnown = (meterLines.measured_source ?? 0) + (meterLines.not_metered ?? 0);
  const meterUnknown = (meterLines.unknown ?? 0) + (meterLines.unknown_basis ?? 0) + (meterLines.conflict ?? 0);
  const panelKnown = panelLines.verified ?? 0;
  const panelUnknown = Object.entries(panelLines).filter(([k]) => k !== "verified").reduce((sum, [, v]) => sum + v, 0);
  const ledger = data.ledger;
  return (
    <div className="ceo-stack">
      <p className="muted small ceo-freshness">{x.generatedAt(dateTime(data.generatedAt))} · {data.lastActivityAt ? x.lastActivity(dateTime(data.lastActivityAt)) : x.noActivity}</p>
      <section className="ceo-kpis" aria-label={x.tabs.overview}>
        <Kpi title={x.kpi.received} value={number(data.received.orders)} hint={x.kpi.receivedHint(data.received.units, data.received.cancelled)} />
        <Kpi title={x.kpi.worked} value={number(data.worked.orders)} hint={x.kpi.workedHint} />
        <Kpi title={x.kpi.completed} value={number(data.completed.orders)} hint={x.kpi.completedHint(data.completed.recompletions.orders)} />
        <Kpi title={x.kpi.units} value={number(data.completed.units)} />
        <Kpi title={x.kpi.thMeters} value={`${m(th?.fabricMeters ?? "0.000")} m`} hint={<>{x.kpi.lHint(th?.unknownLines ?? 0)}{th && meterUnits(th.railMeters) ? <><br />{x.rail(m(th.railMeters))}</> : null}</>} />
        <Kpi title={x.kpi.opMeters} value={`${m(op?.fabricMeters ?? "0.000")} m`} hint={<>{x.kpi.lHint(op?.unknownLines ?? 0)}{op && meterUnits(op.railMeters) ? <><br />{x.rail(m(op.railMeters))}</> : null}</>} />
        <Kpi title={x.kpi.tyPanel} tone="panel" value={`${m(ty?.panelWidthMeters ?? "0.000")} m`} hint={x.kpi.tyHint(ty?.panelUnknownLines ?? 0)} />
      </section>
      <p className="muted small" role="note">{x.noSum}</p>
      <section className="ceo-kpis ceo-kpis-now" aria-label={x.kpi.nowNote}>
        <Kpi title={x.kpi.inProduction} tone="now" value={number(current.inProduction)} hint={x.kpi.stopped(current.stopped)} />
        <Kpi title={x.kpi.waiting} tone="now" value={number(current.waiting)} hint={x.kpi.legacy(current.legacyActive)} />
        <Kpi title={x.kpi.delayed} tone={current.delayed > 0 ? "warn" : "now"} value={number(current.delayed)} hint={x.kpi.delayedHint(current.delayHours)}>
          {Object.keys(delayedByStage).length > 0 && <ul className="ceo-chips">{Object.entries(delayedByStage).map(([id, n]) => <li key={id}>{stage(id)} <strong>{number(n)}</strong></li>)}</ul>}
        </Kpi>
      </section>
      <p className="muted small">{x.kpi.nowNote}</p>
      <div className="ceo-columns">
        <Card title={x.concepts.title}>
          <dl className="ceo-concepts">
            <div><dt>{t.intelligence.concepts.ordered}</dt><dd>{ledger.available ? `${m(ledger.ordered.fabricMeters)} m` : <span className="ceo-unavailable">{x.concepts.unavailable}</span>}</dd></div>
            <div><dt>{t.intelligence.concepts.verifiedSale}</dt><dd>{ledger.available ? `${m(ledger.verifiedSale.fabricMeters)} m` : <span className="ceo-unavailable">{x.concepts.unavailable}</span>}</dd></div>
            <div><dt>{x.concepts.production}</dt><dd>{x.concepts.productionValue(m(data.completed.fabricMeters))}<small> · Trendyol {m(data.completed.panelWidthMeters)} m</small></dd></div>
            <div><dt>{x.concepts.shipped}</dt><dd><span className="muted">{x.concepts.noEvidence}</span></dd></div>
            <div><dt>{x.concepts.delivered}</dt><dd><span className="muted">{x.concepts.noEvidence}</span></dd></div>
          </dl>
        </Card>
        <Card title={x.charts.quality}>
          <QualityBars rows={[
            { key: "meters", label: x.quality.meters, known: meterKnown, unknown: meterUnknown },
            { key: "panel", label: x.quality.panel, known: panelKnown, unknown: panelUnknown },
            { key: "category", label: x.quality.category, known: data.quality.categoryKnownLines, unknown: data.quality.categoryUnknownLines },
          ]} />
          {!data.definitions.categoryCatalog && <p className="muted small">{x.catalogMissing}</p>}
        </Card>
      </div>
      <ChartCard title={x.charts.channels} reconciled={channelRows.reduce((sum, r) => sum + r.completed, 0) === data.completed.orders && channelRows.reduce((sum, r) => sum + r.received, 0) === data.received.orders}
        chart={<HBars label={x.charts.channels} rows={channelRows.flatMap((r) => [
          { key: `${r.key}-r`, label: `${sourceLabel(s, r.key)} · ${x.charts.channelsReceived}`, value: r.received, display: `${number(r.received)} · ${number(r.receivedUnits)} ${x.columns.units}`, color: SOURCE_COLORS[r.key] },
          { key: `${r.key}-c`, label: `${sourceLabel(s, r.key)} · ${x.charts.channelsCompleted}`, value: r.completed, display: `${number(r.completed)} · ${number(r.completedUnits)} ${x.columns.units}`, color: SOURCE_COLORS[r.key] },
        ])} />}
        table={<table className="data-table intelligence-table"><thead><tr><th scope="col">{x.columns.source}</th><th scope="col">{x.charts.channelsReceived}</th><th scope="col">{x.columns.units}</th><th scope="col">{x.charts.channelsCompleted}</th><th scope="col">{x.columns.units}</th></tr></thead>
          <tbody>{channelRows.map((r) => <tr key={r.key}><td>{sourceLabel(s, r.key)}</td><td className="num">{number(r.received)}</td><td className="num">{number(r.receivedUnits)}</td><td className="num">{number(r.completed)}</td><td className="num">{number(r.completedUnits)}</td></tr>)}
            <tr className="ceo-total"><th scope="row">{x.charts.total}</th><td className="num">{number(data.received.orders)}</td><td className="num">{number(data.received.units)}</td><td className="num">{number(data.completed.orders)}</td><td className="num">{number(data.completed.units)}</td></tr></tbody></table>} />
      <div className="ceo-columns">
        <Card title={x.kpi.inProduction}>
          {Object.keys(byStage).length === 0 ? <EmptyState title={x.charts.empty} /> : <HBars label={x.kpi.inProduction} rows={Object.entries(byStage).map(([id, n]) => ({ key: id, label: stage(id), value: n, display: number(n), note: delayedByStage[id] ? <Badge tone="warning">{number(delayedByStage[id])}</Badge> : null }))} />}
        </Card>
        <Card title={x.after.title} description={x.after.hint}>
          <dl className="ceo-concepts">
            <div><dt>{x.after.cancelled}</dt><dd>{number(data.completed.afterCompletion.cancelled.orders)}</dd></div>
            <div><dt>{x.after.returned}</dt><dd>{number(data.completed.afterCompletion.returned.orders)}</dd></div>
          </dl>
          {data.completed.recompletions.orders > 0 && <p className="muted small">{x.after.recompletions(data.completed.recompletions.orders)}</p>}
        </Card>
      </div>
    </div>
  );
}

function QualityBars({ rows }: { rows: { key: string; label: string; known: number; unknown: number }[] }) {
  const { t, number } = useI18n(); const x = t.ceo;
  return (
    <ul className="ceo-quality">
      {rows.map((row) => {
        const share = knownShare(row.known, row.unknown);
        return (
          <li key={row.key}>
            <span>{row.label}</span><strong>{x.quality.share(share)}</strong>
            <span className="ceo-quality-bar" aria-hidden="true"><span style={{ width: `${share ?? 0}%` }} /></span>
            <small className="muted">{number(row.known)} / {number(row.known + row.unknown)}</small>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------- completions

export function CeoCompletionsView({ data }: { data: CeoCompletions }) {
  const { t, number, stage } = useI18n(); const x = t.ceo; const s = t.intelligence.sources; const c = x.columns; const { m } = useMeterFormat();
  const totals = data.totals;
  const sources = SOURCE_ORDER.filter((key) => data.series.some((p) => record(p.bySource)[key]));
  const shopSources = sources.filter((key) => key !== "trendyol");
  const fabricSeries: Series[] = shopSources.map((key) => ({ key, label: sourceLabel(s, key), color: SOURCE_COLORS[key] }));
  const orderSeries: Series[] = sources.map((key) => ({ key, label: sourceLabel(s, key), color: SOURCE_COLORS[key] }));
  const tip = (p: CeoCompletions["series"][number], mode: "orders" | "fabric" | "panel") => (
    <>
      {mode === "orders" && <span>{c.orders}: {number(p.orders)} · {c.units}: {number(p.units)}</span>}
      {mode === "fabric" && <span>{c.fabric}: {m(p.fabricMeters)} m · {c.rail}: {m(p.railMeters)} m</span>}
      {mode === "panel" && <span>{c.panel}: {m(p.panelWidthMeters)} m</span>}
      {(mode === "orders" ? sources : mode === "fabric" ? shopSources : ["trendyol"]).map((key) => {
        const b = record(p.bySource)[key];
        if (!b) return null;
        return <span key={key}><i style={{ background: SOURCE_COLORS[key] }} aria-hidden="true" />{sourceLabel(s, key)}: {mode === "orders" ? `${number(b.orders)} · ${number(b.units)} ${c.units}` : mode === "fabric" ? `${m(b.fabricMeters)} m` : `${m(b.panelWidthMeters)} m`}</span>;
      })}
      {mode !== "panel" && p.unknownLines > 0 && <span className="muted">{c.unknown}: {number(p.unknownLines)}</span>}
      {mode === "panel" && p.panelUnknownLines > 0 && <span className="muted">{c.unknown}: {number(p.panelUnknownLines)}</span>}
    </>
  );
  const points = (mode: "orders" | "fabric" | "panel"): BarPoint[] => data.series.map((p) => ({
    label: p.period,
    values: Object.fromEntries((mode === "panel" ? ["trendyol"] : mode === "fabric" ? shopSources : sources).map((key) => {
      const b = record(p.bySource)[key];
      return [key, !b ? 0 : mode === "orders" ? b.orders : mode === "fabric" ? meters(b.fabricMeters) : meters(b.panelWidthMeters)];
    })),
    tooltip: tip(p, mode),
  }));
  const seriesTable = (
    <table className="data-table intelligence-table">
      <thead><tr><th scope="col">{c.period}</th><th scope="col">{c.orders}</th><th scope="col">{c.units}</th><th scope="col">{c.fabric}</th><th scope="col">{c.rail}</th><th scope="col">{c.panel}</th><th scope="col">{c.unknown}</th></tr></thead>
      <tbody>{data.series.map((p) => <tr key={p.period}><td className="mono">{p.period}</td><td className="num">{number(p.orders)}</td><td className="num">{number(p.units)}</td><td className="num">{m(p.fabricMeters)}</td><td className="num">{m(p.railMeters)}</td><td className="num">{m(p.panelWidthMeters)}</td><td className="num">{number(p.unknownLines + p.panelUnknownLines)}</td></tr>)}
        <tr className="ceo-total"><th scope="row">{x.charts.total}</th><td className="num">{number(totals.orders)}</td><td className="num">{number(totals.units)}</td><td className="num">{m(totals.fabricMeters)}</td><td className="num">{m(totals.railMeters)}</td><td className="num">{m(totals.panelWidthMeters)}</td><td className="num">{number(totals.unknownLines + totals.panelUnknownLines)}</td></tr></tbody>
    </table>
  );
  const seriesOk = reconciles(totals, data.series, ["orders", "units", "fabricMeters", "railMeters", "panelWidthMeters"]);
  const categories = data.byCategory;
  const skus = data.bySku.items;
  const after = data.afterCompletion;
  if (totals.orders === 0 && totals.recompletions.events === 0) return <EmptyState title={x.charts.empty} />;
  return (
    <div className="ceo-stack">
      <section className="ceo-kpis">
        <Kpi title={x.kpi.completed} value={number(totals.orders)} hint={x.kpi.completedHint(totals.recompletions.orders)} />
        <Kpi title={x.kpi.units} value={number(totals.units)} />
        <Kpi title={x.columns.fabric} value={`${m(totals.fabricMeters)} m`} hint={<>{x.kpi.lHint(totals.unknownLines)}<br />{x.rail(m(totals.railMeters))}</>} />
        <Kpi title={x.kpi.tyPanel} tone="panel" value={`${m(totals.panelWidthMeters)} m`} hint={x.kpi.tyHint(totals.panelUnknownLines)} />
      </section>
      <p className="muted small" role="note">{x.noSum}</p>
      <ChartCard title={x.charts.dailyOrders} description={x.charts.hover} reconciled={seriesOk} chart={<StackedBars points={points("orders")} series={orderSeries} label={x.charts.dailyOrders} format={(v) => number(Math.round(v))} />} table={seriesTable} />
      <div className="ceo-stack">
        <ChartCard title={x.charts.dailyMeters} reconciled={seriesOk} chart={<StackedBars points={points("fabric")} series={fabricSeries} label={x.charts.dailyMeters} format={(v) => `${v.toFixed(1)}`} />} table={seriesTable} />
        <ChartCard title={x.charts.dailyPanel} reconciled={seriesOk} chart={<StackedBars points={points("panel")} series={[{ key: "trendyol", label: sourceLabel(s, "trendyol"), color: SOURCE_COLORS.trendyol }]} label={x.charts.dailyPanel} format={(v) => `${v.toFixed(1)}`} />} table={seriesTable} />
      </div>
      <Card title={x.after.title} description={after.rule ? x.after.hint : undefined}>
        <table className="data-table intelligence-table">
          <thead><tr><th scope="col" /><th scope="col">{c.orders}</th><th scope="col">{c.units}</th><th scope="col">{c.fabric}</th><th scope="col">{c.panel}</th></tr></thead>
          <tbody>
            {([["net", after.net], ["cancelled", after.cancelled], ["returned", after.returned]] as const).map(([key, b]) => <tr key={key}><th scope="row">{x.after[key]}</th><td className="num">{number(b.orders)}</td><td className="num">{number(b.units)}</td><td className="num">{m(b.fabricMeters)}</td><td className="num">{m(b.panelWidthMeters)}</td></tr>)}
            <tr className="ceo-total"><th scope="row">{x.charts.total}</th><td className="num">{number(totals.orders)}</td><td className="num">{number(totals.units)}</td><td className="num">{m(totals.fabricMeters)}</td><td className="num">{m(totals.panelWidthMeters)}</td></tr>
          </tbody>
        </table>
        {totals.recompletions.orders > 0 && <p className="muted small">{x.after.recompletions(totals.recompletions.orders)}</p>}
      </Card>
      <ChartCard title={x.charts.categories} reconciled={reconciles(totals, categories)}
        chart={<HBars label={x.charts.categories} rows={categories.slice(0, 20).map((r) => ({ key: `${r.source}|${r.category}`, label: <>{r.category === "unknown" ? x.categories.unknown : r.category} <span className="muted">· {sourceLabel(s, r.source)}</span></>, value: r.orders, display: `${number(r.orders)} ${c.orders.toLowerCase()} · ${r.source === "trendyol" ? `${m(r.panelWidthMeters)} m ⊡` : `${m(r.fabricMeters)} m${meterUnits(r.railMeters) ? ` + ${m(r.railMeters)} m ${c.rail.toLowerCase()}` : ""}`} · ${number(r.units)} ${c.units}`, color: SOURCE_COLORS[r.source] }))} />}
        table={<table className="data-table intelligence-table"><thead><tr><th scope="col">{c.category}</th><th scope="col">{c.source}</th><th scope="col">{c.orders}</th><th scope="col">{c.units}</th><th scope="col">{c.fabric}</th><th scope="col">{c.rail}</th><th scope="col">{c.panel}</th><th scope="col">{c.unknown}</th></tr></thead>
          <tbody>{categories.map((r) => <tr key={`${r.source}|${r.category}`}><td>{r.category === "unknown" ? x.categories.unknown : r.category}<br /><small className="muted">{r.categorySources.map((k) => x.categorySources[k] ?? k).join(", ")}</small></td><td>{sourceLabel(s, r.source)}</td><td className="num">{number(r.orders)}</td><td className="num">{number(r.units)}</td><td className="num">{m(r.fabricMeters)}</td><td className="num">{m(r.railMeters)}</td><td className="num">{m(r.panelWidthMeters)}</td><td className="num">{number(r.unknownLines + r.panelUnknownLines)}</td></tr>)}
            <tr className="ceo-total"><th scope="row" colSpan={3}>{x.charts.total}</th><td className="num">{number(totals.units)}</td><td className="num">{m(totals.fabricMeters)}</td><td className="num">{m(totals.railMeters)}</td><td className="num">{m(totals.panelWidthMeters)}</td><td className="num">{number(totals.unknownLines + totals.panelUnknownLines)}</td></tr></tbody></table>} />
      <ChartCard title={x.charts.topSkus(20)} reconciled={data.bySku.truncated ? undefined : reconciles(totals, skus)}
        chart={<SkuTopLists rows={skus.map((r) => ({ ...asSkuRow(r) }))} metric="completed" n={20} />}
        table={<table className="data-table intelligence-table"><thead><tr><th scope="col">{c.source}</th><th scope="col">{c.code}</th><th scope="col">{c.name}</th><th scope="col">{c.category}</th><th scope="col">{c.orders}</th><th scope="col">{c.units}</th><th scope="col">{c.fabric}</th><th scope="col">{c.rail}</th><th scope="col">{c.panel}</th><th scope="col">{c.unknown}</th><th scope="col">{c.evidence}</th></tr></thead>
          <tbody>{skus.map((r) => <tr key={`${r.source}|${r.productCode ?? ""}`}><td>{sourceLabel(s, r.source)}</td><td className="mono">{r.productCode ?? <span className="muted">{x.sku.noCode}</span>}</td><td>{r.name}</td><td>{r.category === "unknown" ? x.categories.unknown : r.category}</td><td className="num">{number(r.orders)}</td><td className="num">{number(r.units)}</td><td className="num">{m(r.fabricMeters)}</td><td className="num">{m(r.railMeters)}</td><td className="num">{m(r.panelWidthMeters)}</td><td className="num">{number(r.unknownLines + r.panelUnknownLines)}</td><td className="small">{Object.entries(record(r.evidence)).map(([k, v]) => `${x.evidence[k] ?? k} ${v}`).join(", ")}</td></tr>)}</tbody></table>} />
      <div className="ceo-columns">
        <ChartCard title={x.charts.credits} reconciled={reconciles(totals, data.completionCredits, ["orders", "units", "fabricMeters", "panelWidthMeters"])}
          chart={data.completionCredits.length === 0 ? <EmptyState title={x.charts.empty} /> : <HBars label={x.charts.credits} rows={data.completionCredits.map((r) => ({ key: r.employeeId, label: r.employeeName, value: r.orders, display: `${number(r.orders)} · ${number(r.units)} ${c.units}` }))} />}
          table={<table className="data-table intelligence-table"><thead><tr><th scope="col">{c.employee}</th><th scope="col">{c.orders}</th><th scope="col">{c.units}</th><th scope="col">{c.fabric}</th><th scope="col">{c.panel}</th></tr></thead>
            <tbody>{data.completionCredits.map((r) => <tr key={r.employeeId}><td>{r.employeeName}</td><td className="num">{number(r.orders)}</td><td className="num">{number(r.units)}</td><td className="num">{m(r.fabricMeters)}</td><td className="num">{m(r.panelWidthMeters)}</td></tr>)}</tbody></table>} />
        <ChartCard title={x.charts.stageWork}
          chart={data.stageWork.length === 0 ? <EmptyState title={x.charts.empty} /> : <HBars label={x.charts.stageWork} rows={data.stageWork.slice(0, 24).map((r) => ({ key: `${r.employeeId}|${r.stageId}`, label: <>{r.employeeName} <span className="muted">· {stage(r.stageId)}</span></>, value: r.completions, display: number(r.completions) }))} />}
          table={<table className="data-table intelligence-table"><thead><tr><th scope="col">{c.employee}</th><th scope="col">{c.stage}</th><th scope="col">{c.completions}</th><th scope="col">{c.orders}</th></tr></thead>
            <tbody>{data.stageWork.map((r) => <tr key={`${r.employeeId}|${r.stageId}`}><td>{r.employeeName}</td><td>{stage(r.stageId)}</td><td className="num">{number(r.completions)}</td><td className="num">{number(r.orders)}</td></tr>)}</tbody></table>} />
      </div>
      <QualityCard quality={data.quality} catalog={data.definitions.categoryCatalog} />
    </div>
  );
}

function asSkuRow(r: CeoCompletions["bySku"]["items"][number]): SkuRow {
  return { source: r.source, productCode: r.productCode, name: r.name, category: r.category, categorySource: r.categorySource, variants: 0, orders: r.orders, units: r.units, lines: r.lines,
    processedOrders: 0, processedFabricMeters: "0.000", processedRailMeters: "0.000", processedPanelWidthMeters: "0.000",
    completedOrders: r.orders, completedUnits: r.units, completedFabricMeters: r.fabricMeters, completedRailMeters: r.railMeters, completedPanelWidthMeters: r.panelWidthMeters,
    unknownLines: r.unknownLines + r.panelUnknownLines, unknownUnits: r.unknownUnits + r.panelUnknownUnits, unknownByPopulation: { received: 0, processed: 0, completed: r.unknownLines + r.panelUnknownLines }, evidence: r.evidence };
}

function QualityCard({ quality, catalog }: { quality: CeoCompletions["quality"]; catalog: boolean }) {
  const { t, number } = useI18n(); const x = t.ceo;
  const meterLines = record(quality.meterLinesByStatus); const panelLines = record(quality.panelLinesByStatus); const evidence = record(quality.linesByEvidence);
  return (
    <Card title={x.charts.quality}>
      <div className="ceo-columns ceo-columns-3">
        <div><h3 className="ceo-subtitle">{x.quality.meters}</h3><ul className="intelligence-status-list">{Object.entries(meterLines).map(([k, v]) => <li key={k} className={["unknown", "unknown_basis", "conflict"].includes(k) ? "is-warning" : undefined}><span>{x.meterStatuses[k] ?? k}</span><strong>{number(v)}</strong></li>)}</ul></div>
        <div><h3 className="ceo-subtitle">{x.quality.panel}</h3><ul className="intelligence-status-list">{Object.entries(panelLines).map(([k, v]) => <li key={k} className={k !== "verified" ? "is-warning" : undefined}><span>{x.panelStatuses[k] ?? k}</span><strong>{number(v)}</strong></li>)}</ul></div>
        <div><h3 className="ceo-subtitle">{t.ceo.columns.evidence}</h3><ul className="intelligence-status-list">{Object.entries(evidence).map(([k, v]) => <li key={k}><span>{x.evidence[k] ?? k}</span><strong>{number(v)}</strong></li>)}
          <li><span>{x.quality.category}</span><strong>{x.quality.share(knownShare(quality.categoryKnownLines, quality.categoryUnknownLines))}</strong></li></ul></div>
      </div>
      {!catalog && <p className="muted small">{x.catalogMissing}</p>}
    </Card>
  );
}

/** Top-N lists that never mix units: web shop fabric meters and Trendyol panel width rank apart. */
export function SkuTopLists({ rows, metric, n }: { rows: SkuRow[]; metric: SkuMetric; n: number }) {
  const { t, number } = useI18n(); const x = t.ceo; const s = t.intelligence.sources; const { m } = useMeterFormat();
  const meterMetric = metric === "processed" || metric === "completed";
  const lists = meterMetric ? ([["fabric", x.sku.fabricTop], ["panel", x.sku.panelTop]] as const) : ([["any", ""]] as const);
  return (
    <div className={meterMetric ? "ceo-columns" : undefined}>
      {lists.map(([unit, title]) => {
        const top = topSkus(rows, metric, n, unit);
        return (
          <div key={unit}>
            {title && <h3 className="ceo-subtitle">{title}</h3>}
            {top.length === 0 ? <EmptyState title={x.charts.empty} /> : <HBars label={title || x.charts.topSkus(n)} rows={top.map((r) => {
              const field = metric === "processed" ? (r.source === "trendyol" ? r.processedPanelWidthMeters : r.processedFabricMeters) : metric === "completed" ? (r.source === "trendyol" ? r.completedPanelWidthMeters : r.completedFabricMeters) : null;
              return { key: `${r.source}|${r.productCode ?? ""}`, label: <><span className="mono">{r.productCode ?? x.sku.noCode}</span> <span className="muted">· {r.name}</span></>, value: field !== null ? meters(field) : metric === "units" ? r.units : r.orders,
                display: field !== null ? `${m(field)} m` : number(metric === "units" ? r.units : r.orders), color: SOURCE_COLORS[r.source], note: <span className="muted"> · {sourceLabel(s, r.source)}</span> };
            })} />}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------------- skus

export function CeoSkusView({ data, filters, onFilters, query }: { data: CeoSkus; filters: SkuFilters; onFilters: (next: SkuFilters) => void; query: Record<string, string | undefined> }) {
  const { t, number } = useI18n(); const x = t.ceo; const s = t.intelligence.sources; const c = x.columns; const { m } = useMeterFormat();
  const [draft, setDraft] = useState<SkuFilters>(filters);
  const [metric, setMetric] = useState<SkuMetric>("processed");
  const [n, setN] = useState<20 | 50>(20);
  const [detail, setDetail] = useState<{ source: string; code: string } | null>(null);
  const categories = data.categories;
  return (
    <div className="ceo-stack">
      <Card>
        <form className="intelligence-filters" onSubmit={(event) => { event.preventDefault(); onFilters(draft); }}>
          <Field label={x.sku.filters.category}>{(id) => <select id={id} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="">{x.sku.filters.allCategories}</option>{categories.map((k) => <option key={k} value={k}>{k === "unknown" ? x.categories.unknown : k}</option>)}</select>}</Field>
          <Field label={x.sku.filters.code}>{(id) => <input id={id} type="search" maxLength={120} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />}</Field>
          <Field label={x.sku.filters.variant}>{(id) => <input id={id} type="search" maxLength={160} value={draft.variant} onChange={(e) => setDraft({ ...draft, variant: e.target.value })} />}</Field>
          <Field label={x.sku.filters.status}>{(id) => <select id={id} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as SkuStatus })}>{SKU_STATUSES.map((k) => <option key={k} value={k}>{x.sku.statuses[k]}</option>)}</select>}</Field>
          <button type="submit" className="button button-primary">{t.intelligence.filters.apply}</button>
        </form>
        <p className="muted small">{x.sku.definitions}</p>
        {!data.definitions.categoryCatalog && <p className="muted small">{x.catalogMissing}</p>}
      </Card>
      {data.items.length === 0 ? <EmptyState title={x.sku.empty} /> : <>
        <ChartCard title={x.charts.topSkus(n)}
          actions={<>
            <label className="ceo-inline"><span>{x.sku.filters.metric}</span><select value={metric} onChange={(e) => setMetric(e.target.value as SkuMetric)}>{(["processed", "completed", "units", "orders"] as const).map((k) => <option key={k} value={k}>{x.sku.metrics[k]}</option>)}</select></label>
            <div className="ceo-segmented" role="group" aria-label={x.sku.filters.top}>{([20, 50] as const).map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => setN(k)}>{k}</button>)}</div>
          </>}
          chart={<SkuTopLists rows={data.items} metric={metric} n={n} />}
          table={<SkuTable rows={data.items} onOpen={(row) => setDetail({ source: row.source, code: row.productCode ?? "" })} />} />
        {data.truncated && <Notice tone="info">{x.sku.truncated(data.items.length, data.total)}</Notice>}
        <Card title={`${c.code} · ${number(data.total)}`}>
          <div className="table-wrap"><SkuTable rows={data.items.slice(0, 200)} onOpen={(row) => setDetail({ source: row.source, code: row.productCode ?? "" })} /></div>
          {data.items.length > 200 && <p className="muted small">{x.sku.truncated(200, data.items.length)}</p>}
        </Card>
      </>}
      {detail && detail.code && <SkuDetail source={detail.source} code={detail.code} query={query} onClose={() => setDetail(null)} formatMeters={m} sourceName={sourceLabel(s, detail.source)} />}
    </div>
  );
}

function SkuTable({ rows, onOpen }: { rows: SkuRow[]; onOpen: (row: SkuRow) => void }) {
  const { t, number } = useI18n(); const x = t.ceo; const s = t.intelligence.sources; const c = x.columns; const { m } = useMeterFormat();
  return (
    <table className="data-table intelligence-table">
      <thead><tr><th scope="col">{c.source}</th><th scope="col">{c.code}</th><th scope="col">{c.name}</th><th scope="col">{c.category}</th><th scope="col">{c.orders}</th><th scope="col">{c.units}</th><th scope="col">{c.processed}</th><th scope="col">{c.completed}</th><th scope="col">{c.unknown}</th><th scope="col">{c.evidence}</th><th scope="col"><span className="sr-only">{x.sku.open}</span></th></tr></thead>
      <tbody>{rows.map((r) => {
        const panel = r.source === "trendyol";
        return (
          <tr key={`${r.source}|${r.productCode ?? ""}`}>
            <td><span className="ceo-swatch" style={{ background: SOURCE_COLORS[r.source] }} aria-hidden="true" />{sourceLabel(s, r.source)}</td>
            <td className="mono">{r.productCode ?? <span className="muted">{x.sku.noCode}</span>}</td>
            <td>{r.name}{r.variants > 1 ? <small className="muted"> · {r.variants} {c.variants.toLowerCase()}</small> : null}</td>
            <td>{r.category === "unknown" ? <span className="muted">{x.categories.unknown}</span> : r.category}</td>
            <td className="num">{number(r.orders)}</td><td className="num">{number(r.units)}</td>
            <td className="num">{panel ? `${m(r.processedPanelWidthMeters)} m ⊡` : `${m(r.processedFabricMeters)} m`}{!panel && meterUnits(r.processedRailMeters) ? <small className="muted"> + {m(r.processedRailMeters)}</small> : null}</td>
            <td className="num">{panel ? `${m(r.completedPanelWidthMeters)} m ⊡` : `${m(r.completedFabricMeters)} m`}{!panel && meterUnits(r.completedRailMeters) ? <small className="muted"> + {m(r.completedRailMeters)}</small> : null}</td>
            <td className="num">{r.unknownLines > 0 ? <Badge tone="warning">{number(r.unknownLines)}</Badge> : "0"}</td>
            <td className="small">{Object.entries(record(r.evidence)).map(([k, v]) => `${x.evidence[k] ?? k} ${v}`).join(", ") || "—"}</td>
            <td>{r.productCode && <button type="button" className="button button-ghost" onClick={() => onOpen(r)}>{x.sku.open}</button>}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function SkuDetail({ source, code, query, onClose, formatMeters: m, sourceName }: { source: string; code: string; query: Record<string, string | undefined>; onClose: () => void; formatMeters: (v: string) => string; sourceName: string }) {
  const { api } = useDashboard();
  const { t, number } = useI18n(); const x = t.ceo; const c = x.columns;
  const [bucket, setBucket] = useState<"day" | "month">("day");
  const [state, setState] = useState<{ data: CeoSkus | null; error: unknown }>({ data: null, error: null });
  useEffect(() => {
    const abort = new AbortController();
    api.intelligence<CeoSkus>("skus", { ...query, source, sku: code, category: undefined, code: undefined, variant: undefined }, abort.signal).then(
      (data) => { if (!abort.signal.aborted) setState({ data, error: null }); },
      (error: unknown) => { if (!abort.signal.aborted) setState({ data: null, error }); },
    );
    return () => abort.abort();
  }, [api, code, query, source]);
  const panel = source === "trendyol";
  const points = state.data?.detail?.[bucket] ?? [];
  const value = (b: Bag) => meters(panel ? b.panelWidthMeters : b.fabricMeters);
  return (
    <section className="card ceo-detail" aria-label={x.sku.detail(code)}>
      <div className="ceo-card-head"><div><h2>{x.sku.detail(code)}</h2><p className="muted small">{sourceName}</p></div>
        <div className="ceo-card-actions"><div className="ceo-segmented" role="group">{(["day", "month"] as const).map((k) => <button key={k} type="button" aria-pressed={bucket === k} onClick={() => setBucket(k)}>{x.sku[k]}</button>)}</div>
          <button type="button" className="button button-secondary" onClick={onClose}>{x.sku.close}</button></div></div>
      {state.error !== null && <ErrorBanner error={state.error} />}
      {state.data === null && state.error === null && <Loading />}
      {state.data && <>
        <StackedBars grouped label={x.sku.detail(code)} format={(v) => v.toFixed(1)}
          series={[{ key: "processed", label: c.processedShort, color: "#2a78d6" }, { key: "completed", label: c.completedOrders, color: "#eb6834" }]}
          points={points.map((p) => ({ label: p.period, values: { processed: value(p.processed), completed: value(p.completed) },
            tooltip: <><span>{c.received}: {number(p.received.orders)} · {number(p.received.units)} {c.units}</span><span>{c.processedShort}: {m(panel ? p.processed.panelWidthMeters : p.processed.fabricMeters)} m</span><span>{c.completedOrders}: {m(panel ? p.completed.panelWidthMeters : p.completed.fabricMeters)} m</span></> }))} />
        <div className="table-wrap"><table className="data-table intelligence-table"><thead><tr><th scope="col">{c.period}</th><th scope="col">{c.received}</th><th scope="col">{c.units}</th><th scope="col">{c.processed}</th><th scope="col">{c.completed}</th><th scope="col">{c.unknown}</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.period}><td className="mono">{p.period}</td><td className="num">{number(p.received.orders)}</td><td className="num">{number(p.received.units)}</td><td className="num">{m(panel ? p.processed.panelWidthMeters : p.processed.fabricMeters)}</td><td className="num">{m(panel ? p.completed.panelWidthMeters : p.completed.fabricMeters)}</td><td className="num">{number(p.received.unknownLines + p.received.panelUnknownLines)}</td></tr>)}</tbody></table></div>
      </>}
    </section>
  );
}
