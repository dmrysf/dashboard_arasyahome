import type { ReactNode } from "react";
import { record, type Bag, type CeoCoverage, type CeoOverview, type Sales, type ShopCoverage } from "../api/ceo";
import { meterUnits } from "../api/intelligence";
import { Badge, Card, Notice } from "../components/ui";
import { useI18n } from "../i18n/context";
import { useMeterFormat } from "./CeoViews";

/**
 * CEO sales meters and data coverage (Dashboard 0.22.0, API 2.76.0). Every value comes from the server as decimal
 * meters; a missing or malformed value shows a dash, never 0. Fabric, rail and Trendyol panel width stay apart.
 */

const SHOP_ORDER = ["trendhome", "outletperdele", "b2b"] as const;

function Tile({ title, value, hint, tone, children }: { title: string; value: ReactNode; hint?: ReactNode; tone?: "now" | "warn" | "panel" | "default"; children?: ReactNode }) {
  return (
    <article className={`ceo-kpi ceo-kpi-${tone ?? "default"}`}>
      <h3>{title}</h3>
      <p className="ceo-kpi-value">{value}</p>
      {hint && <p className="ceo-kpi-hint">{hint}</p>}
      {children}
    </article>
  );
}

/** The twelve CEO sales figures of the overview (API 2.76.0). Older APIs send no `sales` block: a notice, never zeros. */
export function SalesSection({ data }: { data: CeoOverview }) {
  const { t, number, dateTime } = useI18n(); const x = t.meters; const s = t.intelligence.sources; const { m } = useMeterFormat();
  const sales: Sales | undefined = data.sales;
  if (!sales) return <Notice tone="warning">{x.unavailable}</Notice>;
  const src = (key: string) => sales.bySource[key];
  const empty = sales.state === "empty";
  const value = (meters: string | undefined) => (empty || meters === undefined ? "—" : `${m(meters)} m`);
  const current = data.current.meters;
  const active = current ? sumBags(current.inProduction, current.waiting) : null;
  const unknownBySource = record(sales.unknown.linesBySource);
  return (
    <section className="ceo-stack" aria-label={x.title}>
      <h2 className="ceo-section-title">{x.title}</h2>
      <p className="muted small">{x.hint}</p>
      {empty && <Notice tone="warning">{x.ledgerEmpty}</Notice>}
      {sales.state === "manual" && <Notice tone="warning">{x.ledgerManual}</Notice>}
      <div className="ceo-kpis" role="list">
        <Tile title={x.kpi.total} value={value(sales.total.fabric.net)} hint={x.kpi.totalHint} />
        {src("trendhome") && <Tile title={x.kpi.th} value={value(src("trendhome").fabric.net)} hint={src("trendhome").outsideArasya ? x.outside(m(src("trendhome").outsideArasya!.fabricMeters)) : undefined} />}
        {src("outletperdele") && <Tile title={x.kpi.op} value={value(src("outletperdele").fabric.net)} hint={src("outletperdele").outsideArasya ? x.outside(m(src("outletperdele").outsideArasya!.fabricMeters)) : undefined} />}
        {src("b2b") && <Tile title={x.kpi.b2b} value={value(src("b2b").fabric.net)} hint={x.kpi.b2bHint} />}
        <Tile title={x.kpi.verified} value={value(sales.total.fabric.verified)} hint={x.kpi.verifiedHint} />
        <Tile title={x.kpi.inProduction} tone="now" value={active ? x.inProductionValue(active.orders, m(active.fabricMeters)) : "—"} hint={active && active.unknownLines > 0 ? x.kpi.unknownHint(active.unknownLines) : undefined} />
        <Tile title={x.kpi.completed} value={`${m(data.completed.fabricMeters)} m`} hint={x.orders(data.completed.orders)} />
        <Tile title={x.kpi.cancelled} tone={meterUnits(sales.total.fabric.cancelled) ? "warn" : "default"} value={value(sales.total.fabric.cancelled)} />
        <Tile title={x.kpi.rail} value={value(sales.total.rail.net)} />
        {sales.trendyolPanel && <Tile title={x.kpi.panel} tone="panel" value={`${m(sales.trendyolPanel.widthMeters)} m`} hint={x.kpi.panelHint(sales.trendyolPanel.unknownLines)} />}
        <Tile title={x.kpi.unknown} tone={sales.unknown.lines > 0 ? "warn" : "default"} value={number(sales.unknown.lines)} hint={x.kpi.unknownHint(sales.unknown.orders)} />
        <Tile title={x.kpi.sync} value={sales.syncedThrough ? dateTime(sales.syncedThrough) : x.kpi.syncNever} hint={sales.lastRun ? x.lastRun(dateTime(sales.lastRun.at), x.lastRunDetail(sales.lastRun.orders, sales.lastRun.entries)) : undefined} />
      </div>
      <Card title={x.table.title}>
        <div className="table-scroll">
          <table className="data-table intelligence-table">
            <thead><tr><th scope="col">{x.table.source}</th><th scope="col">{x.table.ordered}</th><th scope="col">{x.table.cancelled}</th><th scope="col">{x.table.net}</th><th scope="col">{x.table.verified}</th><th scope="col">{x.table.rail}</th><th scope="col">{x.table.orders}</th><th scope="col">{x.kpi.unknown}</th></tr></thead>
            <tbody>
              {SHOP_ORDER.filter((key) => src(key)).map((key) => (
                <tr key={key}><th scope="row">{s[key] ?? key}</th><td className="num">{value(src(key).fabric.ordered)}</td><td className="num">{value(src(key).fabric.cancelled)}</td>
                  <td className="num">{value(src(key).fabric.net)}</td><td className="num">{value(src(key).fabric.verified)}</td><td className="num">{value(src(key).rail.net)}</td>
                  <td className="num">{number(src(key).orders)}</td><td className="num">{number(unknownBySource[key] ?? 0)}</td></tr>
              ))}
              <tr className="ceo-total"><th scope="row">{x.table.total}</th><td className="num">{value(sales.total.fabric.ordered)}</td><td className="num">{value(sales.total.fabric.cancelled)}</td>
                <td className="num">{value(sales.total.fabric.net)}</td><td className="num">{value(sales.total.fabric.verified)}</td><td className="num">{value(sales.total.rail.net)}</td>
                <td className="num">{number(sales.total.orders)}</td><td className="num">{number(sales.unknown.lines)}</td></tr>
            </tbody>
          </table>
        </div>
        <h3 className="ceo-subtitle">{x.payment.title}</h3>
        <ul className="ceo-chips">
          {Object.entries(record(sales.total.byPayment)).filter(([, p]) => meterUnits(p.fabricMeters) !== 0 || p.orders > 0).map(([key, p]) => (
            <li key={key}>{x.payment[key] ?? key} <strong>{value(p.fabricMeters)}</strong> <span className="muted">· {x.orders(p.orders)}</span></li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function sumBags(a: Bag, b: Bag): { orders: number; fabricMeters: string; unknownLines: number } {
  const units = (meterUnits(a.fabricMeters) ?? 0) + (meterUnits(b.fabricMeters) ?? 0);
  return { orders: a.orders + b.orders, fabricMeters: `${Math.floor(units / 1000)}.${String(units % 1000).padStart(3, "0")}`, unknownLines: a.unknownLines + b.unknownLines };
}

/** Data coverage over all time (API 2.76.0 section `coverage`). */
export function CeoCoverageView({ data }: { data: CeoCoverage }) {
  const { t, number, dateTime } = useI18n(); const x = t.meters.coverage; const s = t.intelligence.sources; const { m } = useMeterFormat();
  const c = data.coverage;
  const day = (iso: string | null) => (iso ? dateTime(iso) : x.none);
  const pct = (value: string | null) => (value === null ? x.none : `${value}%`);
  const shops: [string, ShopCoverage][] = [["trendhome", c.sources.trendhome], ["outletperdele", c.sources.outletperdele]];
  const ty = c.sources.trendyol; const b2b = c.sources.b2b; const cohort = c.b2bTestCohort;
  return (
    <div className="ceo-stack">
      <h2 className="ceo-section-title">{x.title}</h2>
      <p className="muted small">{x.hint}</p>
      <Notice tone="info">{x.productionStart(c.productionStart)}</Notice>
      <Card title={x.title}>
        <div className="table-scroll">
          <table className="data-table intelligence-table">
            <thead><tr><th scope="col">{x.source}</th><th scope="col">{x.first}</th><th scope="col">{x.last}</th><th scope="col">{x.orders}</th><th scope="col">{x.metered}</th><th scope="col">{x.unknown}</th><th scope="col">{x.coverage}</th><th scope="col">{x.cancelled}</th><th scope="col">{x.production}</th><th scope="col">{x.gaps}</th></tr></thead>
            <tbody>
              {shops.map(([key, row]) => (
                <tr key={key}><th scope="row">{s[key]}</th><td>{day(row.firstOrderAt)}</td><td>{day(row.lastOrderAt)}</td><td className="num">{number(row.orders)}</td>
                  <td className="num">{number(row.meteredLines)}</td><td className="num">{number(row.unknownLines)}</td><td className="num">{pct(row.coveragePercent)}</td>
                  <td className="num">{number(row.arasya.cancelled + row.outsideArasya.noSaleOrders)}</td><td className="num">{number(row.arasya.enteredProduction)}</td>
                  <td>{row.gapMonths.length === 0 ? x.none : row.gapMonths.join(", ")}</td></tr>
              ))}
              <tr><th scope="row">{s.trendyol}</th><td>{day(ty.firstOrderAt)}</td><td>{day(ty.lastOrderAt)}</td><td className="num">{number(ty.orders)}</td>
                <td className="num">{x.none}</td><td className="num">{x.none}</td><td className="num">{pct(ty.panelCoveragePercent)}</td><td className="num">{number(ty.cancelled)}</td>
                <td className="num">{number(ty.enteredProduction)}</td><td>{ty.gapMonths.length === 0 ? x.none : ty.gapMonths.join(", ")}</td></tr>
              <tr><th scope="row">{s.b2b}</th><td>{day(b2b.firstOrderAt)}</td><td>{day(b2b.lastOrderAt)}</td><td className="num">{number(b2b.realOrders)}</td>
                <td className="num">{number(b2b.realLinesByStatus.measured_source ?? 0)}</td><td className="num">{number(b2b.realLinesByStatus.unknown ?? 0)}</td><td className="num">{pct(b2b.coveragePercent)}</td>
                <td className="num">{number(b2b.realCancelled)}</td><td className="num">{number(b2b.handedOff)}</td><td>{b2b.gapMonths.length === 0 ? x.none : b2b.gapMonths.join(", ")}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted small">{x.trendyolFabric} {ty.panelCoveragePercent !== null && x.panelCoverage(ty.panelCoveragePercent)}</p>
        <p className="muted small">{x.b2bCounts(b2b.realOrders, b2b.testOrders)} · {x.b2bFinalized(b2b.realFinalized)}</p>
      </Card>
      <Card title={x.outsideTitle}>
        {shops.map(([key, row]) => (
          <p key={key} className="small"><strong>{s[key]}</strong> · {number(row.outsideArasya.orders)} {x.orders.toLowerCase()} · {day(row.outsideArasya.firstOrderAt)} – {day(row.outsideArasya.lastOrderAt)}
            <br /><span className="muted">{row.outsideArasya.lastImportAt ? x.outsideImport(dateTime(row.outsideArasya.lastImportAt)) : x.outsideNever}</span></p>
        ))}
      </Card>
      <Card title={x.cohortTitle} description={cohort.available && cohort.enteredMeters !== undefined ? `${x.cohortSummary(cohort.orders, m(cohort.enteredMeters))} · ${x.cohortProduction(cohort.canonicalOrders ?? 0, cohort.canonicalExcluded ?? 0)}` : undefined}>
        {cohort.items.length > 0 && (
          <div className="table-scroll">
            <table className="data-table intelligence-table">
              <thead><tr><th scope="col">{x.cohortCode}</th><th scope="col">{x.cohortStatus}</th><th scope="col">{x.cohortMeters}</th><th scope="col">{x.cohortCanonical}</th><th scope="col">{x.cohortExcluded}</th><th scope="col">{x.cohortBooked}</th></tr></thead>
              <tbody>{cohort.items.map((item) => (
                <tr key={item.orderCode}><td className="mono">{item.orderCode}</td><td>{item.statusNow}</td><td className="num">{m(item.enteredMeters)}</td>
                  <td>{item.canonicalOrder ? <Badge tone="neutral">{x.yes}</Badge> : x.none}</td>
                  <td>{item.canonicalOrder ? (item.canonicalExcluded ? <Badge tone="success">{x.yes}</Badge> : <Badge tone="danger">{x.no}</Badge>) : x.none}</td>
                  <td className="num">{m(item.soldMetersBooked)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="ceo-columns">
        <Card title={x.ledgerTitle}>
          <p className="small">{x.ledgerLine(c.ledger.canonicalEntries, c.ledger.b2bEntries ?? x.none)} · {x.ledgerExclusions(c.ledger.exclusions)}</p>
          <p className="muted small">{c.ledger.syncedThrough ? t.meters.syncedThrough(dateTime(c.ledger.syncedThrough)) : t.meters.kpi.syncNever}</p>
        </Card>
        <Card title={x.categoriesTitle}>
          {c.categories.map((row) => <p key={row.source_key} className="small">{x.categoriesLine(s[row.source_key] ?? row.source_key, row.products)}</p>)}
        </Card>
      </div>
    </div>
  );
}
