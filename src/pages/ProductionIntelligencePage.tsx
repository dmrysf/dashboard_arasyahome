import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SKU_STATUSES, isCeoCoverage, isCeoOverview, refreshSeconds, type CeoCompletions, type CeoCoverage, type CeoOverview, type CeoSkus, type SkuFilters, type SkuStatus } from "../api/ceo";
import { ApiError } from "../api/client";
import {
  CEO_SECTIONS, COVERAGE_STATUSES, HISTORY_FLOOR, INTELLIGENCE_SOURCES, PAYMENT_CLASSES, PERIODS, isCurrentSummary, ledgerState, meterUnits, periodQuery, share, validCustomRange,
  type EmployeeRow, type IntelligenceEmployees, type IntelligenceProducts, type IntelligenceSection, type IntelligenceSeries, type IntelligenceSummary,
  type PaymentClass, type Period, type ProductRow, type SeriesBucket, type SeriesPoint,
} from "../api/intelligence";
import { useDashboard } from "../app/context";
import { intelligencePath } from "../app/router";
import { Badge, Card, EmptyState, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";
import { useI18n } from "../i18n/context";
import { CeoCoverageView, SalesSection } from "./CeoMeters";
import { CeoCompletionsView, CeoOverviewView, CeoSkusView } from "./CeoViews";

type Filters = { period: Period; from: string; to: string; source: string; bucket: SeriesBucket } & SkuFilters;
type Result = IntelligenceSummary | IntelligenceProducts | IntelligenceEmployees | IntelligenceSeries | CeoOverview | CeoCompletions | CeoSkus | CeoCoverage;

/** The page's filters from the address bar. The CEO overview opens on today, every other report on this month. */
export function initialFilters(section: IntelligenceSection = "summary", locationSearch?: string): Filters {
  const query = new URLSearchParams(locationSearch ?? (typeof window === "undefined" ? "" : window.location.search));
  const period = query.get("period");
  const source = query.get("source") ?? "";
  const bucket = query.get("bucket");
  const status = query.get("status") ?? "all";
  const from = query.get("from") ?? ""; const to = query.get("to") ?? "";
  return {
    period: from && to ? "custom" : PERIODS.includes(period as Period) && period !== "custom" ? period as Period : section === "overview" ? "today" : "month",
    from, to,
    source: (INTELLIGENCE_SOURCES as readonly string[]).includes(source) ? source : "",
    bucket: bucket === "day" || bucket === "week" || bucket === "month" ? bucket : "day",
    category: (query.get("category") ?? "").slice(0, 120), code: (query.get("code") ?? "").slice(0, 120), variant: (query.get("variant") ?? "").slice(0, 160),
    status: (SKU_STATUSES as readonly string[]).includes(status) ? status as SkuStatus : "all",
  };
}

export function search(filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.period === "custom") { query.set("from", filters.from); query.set("to", filters.to); } else query.set("period", filters.period);
  if (filters.source) query.set("source", filters.source);
  if (filters.bucket !== "day") query.set("bucket", filters.bucket);
  if (filters.category) query.set("category", filters.category);
  if (filters.code) query.set("code", filters.code);
  if (filters.variant) query.set("variant", filters.variant);
  if (filters.status !== "all") query.set("status", filters.status);
  return `?${query}`;
}

/** The report range as Bucharest calendar days: the first day and the last day included (the API sends UTC instants, end exclusive). */
export function bucharestRange(fromUtc: string, toUtcExclusive: string): [string, string] {
  const day = (instant: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
  const parse = (value: string) => Date.parse(`${value.replace(" ", "T")}Z`);
  return [day(parse(fromUtc)), day(parse(toUtcExclusive) - 1)];
}

/** The API query of one section: buckets only where the API accepts them, SKU filters only on the SKU analysis. */
export function sectionQuery(section: IntelligenceSection, filters: Filters, now = new Date()): Record<string, string | undefined> {
  return {
    ...periodQuery(filters.period, filters, now), source: filters.source || undefined,
    ...(section === "series" || section === "completions" ? { bucket: filters.bucket } : {}),
    ...(section === "skus" ? { category: filters.category || undefined, code: filters.code || undefined, variant: filters.variant || undefined, status: filters.status === "all" ? undefined : filters.status } : {}),
  };
}


/** Meters for display: "13428.240" -> "13.428,2" (ro) / "13.428,2" (tr). Malformed values show a dash, never 0. */
function useMeters() {
  const { locale } = useI18n();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "ro-RO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return (value: string | null | undefined) => { const units = meterUnits(value); return units === null ? "—" : format.format(units / 1000); };
  }, [locale]);
}

/** Management Production Intelligence: Root and the canonical CEO only; every request is read only. */
export function ProductionIntelligencePage({ section }: { section: IntelligenceSection }) {
  const { api, me, navigate } = useDashboard();
  const { t } = useI18n(); const x = t.intelligence;
  const allowed = Boolean(me.capabilities?.viewProductionIntelligence);
  const [draft, setDraft] = useState<Filters>(() => initialFilters(section));
  const [filters, setFilters] = useState<Filters>(() => initialFilters(section));
  const [invalid, setInvalid] = useState(false);
  const [revision, setRevision] = useState(0);
  // Kept in memory only (the Dashboard stores nothing but the language in the browser); on by default.
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [result, setResult] = useState<{ key: string; base: string; data: Result | null; error: unknown }>({ key: "", base: "", data: null, error: null });
  const query = useMemo(() => sectionQuery(section, filters), [filters, section]);
  const baseKey = JSON.stringify([section, query]);
  const requestKey = JSON.stringify([section, query, revision]);
  // A refresh of the same report keeps the previous numbers on screen until the new ones arrive.
  const data = result.key === requestKey || result.base === baseKey ? result.data : null;
  const error = result.key === requestKey ? result.error : null;
  const ceo = (CEO_SECTIONS as readonly string[]).includes(section);

  useEffect(() => {
    if (!allowed) return undefined;
    const abort = new AbortController();
    api.intelligence<Result>(section, query, abort.signal).then(
      (value) => { if (!abort.signal.aborted) setResult({ key: requestKey, base: baseKey, data: value, error: null }); },
      (caught: unknown) => { if (!abort.signal.aborted) setResult({ key: requestKey, base: "", data: null, error: caught }); },
    );
    return () => abort.abort();
  }, [allowed, api, baseKey, query, requestKey, section]);

  // Light, controlled refresh of the CEO overview: only while the page is visible, at the server's suggested pace (at
  // most every 2 minutes), and once more when the tab becomes visible again. It reads the same report; nothing is
  // scheduled on the server.
  const suggested = section === "overview" && data && isCeoOverview(data) ? data.refresh.suggestedSeconds : undefined;
  useEffect(() => {
    if (!allowed || section !== "overview" || !autoRefresh) return undefined;
    const every = refreshSeconds(suggested) * 1000;
    let last = Date.now();
    const tick = () => { if (document.visibilityState === "visible") { last = Date.now(); setRevision((value) => value + 1); } };
    const timer = window.setInterval(tick, every);
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - last >= every) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [allowed, autoRefresh, section, suggested]);

  if (!allowed) return <div className="page"><PageHeader title={x.title} /><ErrorBanner error={new ApiError("UNAUTHORIZED_ACTION", 403)} /><p className="muted small">{x.denied}</p></div>;

  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (draft.period === "custom" && !validCustomRange(draft.from, draft.to)) { setInvalid(true); return; }
    setInvalid(false);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search(draft)}`);
    setFilters(draft);
  };
  const tabs: IntelligenceSection[] = ["overview", "completions", "skus", "coverage", "summary", "products", "employees", "series"];
  const range = data && "range" in data ? x.range(...bucharestRange(data.range.fromUtc, data.range.toUtcExclusive)) : null;
  const stale = (section === "summary" && data !== null && !isCurrentSummary(data)) || (section === "overview" && data !== null && !isCeoOverview(data))
    || (section === "coverage" && data !== null && !isCeoCoverage(data));
  const applySku = (next: SkuFilters) => {
    const merged = { ...filters, ...next };
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search(merged)}`);
    setDraft(merged); setFilters(merged);
  };
  return (
    <div className="page intelligence-page">
      <PageHeader title={x.title} description={x.hint} actions={<div className="ceo-header-actions">
        {section === "overview" && <label className="ceo-inline"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />{t.ceo.autoRefresh(Math.round(refreshSeconds(suggested) / 60))}</label>}
        <button type="button" className="button button-secondary" onClick={() => setRevision((value) => value + 1)}>{x.filters.refresh}</button>
      </div>} />
      <nav className="intelligence-tabs" aria-label={x.title}>
        {tabs.map((key) => {
          const href = `${intelligencePath(key)}${search(filters)}`;
          const label = (CEO_SECTIONS as readonly string[]).includes(key) ? t.ceo.tabs[key as (typeof CEO_SECTIONS)[number]] : x.tabs[key as "summary" | "products" | "employees" | "series"];
          return <a key={key} href={href} className={(CEO_SECTIONS as readonly string[]).includes(key) ? "is-ceo" : undefined} aria-current={key === section ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigate(intelligencePath(key)); window.history.replaceState(window.history.state, "", href); }}>{label}</a>;
        })}
      </nav>
      <Card>
        <form className="intelligence-filters" onSubmit={apply}>
          <Field label={x.filters.period}>{(id) => <select id={id} value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value as Period })}>{PERIODS.map((key) => <option key={key} value={key}>{x.periods[key]}</option>)}</select>}</Field>
          {draft.period === "custom" && <>
            <Field label={x.filters.from}>{(id) => <input id={id} type="date" required min={HISTORY_FLOOR} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />}</Field>
            <Field label={x.filters.to}>{(id) => <input id={id} type="date" required min={draft.from || HISTORY_FLOOR} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />}</Field>
          </>}
          <Field label={x.filters.source}>{(id) => <select id={id} value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}><option value="">{x.filters.allSources}</option>{INTELLIGENCE_SOURCES.map((key) => <option key={key} value={key}>{x.sources[key]}</option>)}</select>}</Field>
          {(section === "series" || section === "completions") && <Field label={x.filters.bucket}>{(id) => <select id={id} value={draft.bucket} onChange={(event) => setDraft({ ...draft, bucket: event.target.value as SeriesBucket })}>{(["day", "week", "month"] as const).map((key) => <option key={key} value={key}>{x.buckets[key]}</option>)}</select>}</Field>}
          <button type="submit" className="button button-primary">{x.filters.apply}</button>
        </form>
        {invalid && <p className="form-error" role="alert">{x.filters.invalidRange}</p>}
      </Card>
      {range && <p className="muted small intelligence-range">{range}</p>}
      {error !== null && (error instanceof ApiError && error.status === 404 ? <Notice tone="warning">{ceo ? t.ceo.unavailable : x.unavailable}</Notice> : <ErrorBanner error={error} onRetry={() => setRevision((value) => value + 1)} />)}
      {data === null && error === null && <Loading />}
      {stale && <Notice tone="warning">{ceo ? t.ceo.unavailable : x.unavailable}</Notice>}
      {data && !stale && section === "overview" && <><SalesSection data={data as CeoOverview} /><CeoOverviewView data={data as CeoOverview} /></>}
      {data && !stale && section === "coverage" && <CeoCoverageView data={data as CeoCoverage} />}
      {data && section === "completions" && <CeoCompletionsView data={data as CeoCompletions} />}
      {data && section === "skus" && <CeoSkusView data={data as CeoSkus} filters={{ category: filters.category, code: filters.code, variant: filters.variant, status: filters.status }} onFilters={applySku} query={query} />}
      {data && !stale && section === "summary" && <SummaryView data={data as IntelligenceSummary} />}
      {data && section === "products" && <ProductsView data={data as IntelligenceProducts} />}
      {data && section === "employees" && <EmployeesView data={data as IntelligenceEmployees} />}
      {data && section === "series" && <SeriesView data={data as IntelligenceSeries} />}
    </div>
  );
}

export function SummaryView({ data }: { data: IntelligenceSummary }) {
  const { t, number, dateTime } = useI18n(); const x = t.intelligence; const m = useMeters();
  const ledger = ledgerState(data);
  const hidden = ledger === "empty";
  const unknownLines = Object.entries(Array.isArray(data.coverage.linesByStatus) ? {} : data.coverage.linesByStatus)
    .filter(([status]) => ["unknown_basis", "unknown", "unknown_marketplace", "conflict"].includes(status)).reduce((total, [, count]) => total + count, 0);
  const outside = data.ordered.byOrigin.outside_arasya;
  const byStatus = Array.isArray(outside.ordersByShopStatus) ? {} : outside.ordersByShopStatus;
  return (
    <div className="intelligence-summary">
      {ledger === "empty" && <Notice tone="warning">{x.ledger.empty}</Notice>}
      {ledger === "manual" && <Notice tone="warning">{x.ledger.manual}</Notice>}
      {ledger === "automatic" && data.ordered.syncedThrough && <p className="muted small">{x.ledger.automatic(dateTime(data.ordered.syncedThrough))}</p>}
      <section className="concept-grid" aria-label={x.title}>
        <ConceptTile title={x.concepts.ordered} hint={x.concepts.orderedHint} tone="ordered" hidden={hidden} hiddenText={x.ledger.hidden}
          primary={`${m(data.ordered.fabricMeters)} m`} secondary={`${x.rail}: ${m(data.ordered.railMeters)} m`} />
        <ConceptTile title={x.concepts.verifiedSale} hint={x.concepts.verifiedSaleHint} tone="verified" hidden={hidden} hiddenText={x.ledger.hidden}
          primary={`${m(data.verifiedSale.fabricMeters)} m`} secondary={`${x.rail}: ${m(data.verifiedSale.railMeters)} m · ${x.concepts.notVerified(m(data.verifiedSale.notVerified.fabricMeters))}`} />
        <ConceptTile title={x.concepts.production} hint={x.concepts.productionHint} tone="production"
          primary={`${m(data.completed.fabricMeters)} m`} secondary={`${x.concepts.completed} · ${x.concepts.cut}: ${m(data.cut.fabricMeters)} m`} />
        <ConceptTile title={x.concepts.shipped} hint={x.concepts.noEvidence} tone="none" primary="—" secondary={x.concepts.marketplace(data.shipped.marketplaceOrders)} />
        <ConceptTile title={x.concepts.delivered} hint={x.concepts.noEvidence} tone="none" primary="—" secondary={x.concepts.marketplace(data.delivered.marketplaceOrders)} />
      </section>
      {unknownLines > 0 && <Notice tone="warning">{x.coverage.warning(unknownLines)}</Notice>}
      <div className="intelligence-columns">
        <Card title={x.payment.title} description={x.payment.hint} className="intelligence-payment">
          {hidden ? <EmptyState title={x.ledger.hidden} /> : <PaymentBreakdown data={data} />}
        </Card>
        <Card title={x.origin.title}>
          <dl className="intelligence-facts">
            <div><dt>{x.origin.arasya}</dt><dd>{hidden ? "—" : `${m(data.ordered.byOrigin.arasya.fabricMeters)} m`}</dd><small>{x.rail}: {hidden ? "—" : `${m(data.ordered.byOrigin.arasya.railMeters)} m`}</small></div>
            <div><dt>{x.origin.outside} · {x.origin.verified}</dt><dd>{m(outside.fabricMeters)} m</dd><small>{x.orders(outside.verifiedSaleOrders)} · {x.rail}: {m(outside.railMeters)} m</small></div>
            <div><dt>{x.origin.outside} · {x.origin.open}</dt><dd>{outside.openFabricMeters !== undefined ? `${m(outside.openFabricMeters)} m` : "—"}</dd><small>{x.origin.notVerified(outside.notVerifiedOrders)}</small></div>
          </dl>
          <p className="muted small">{x.origin.outsideHint}</p>
          {Object.keys(byStatus).length > 0 && <details className="intelligence-details"><summary>{x.origin.byStatus}</summary>
            <ul className="intelligence-status-list">{Object.entries(byStatus).map(([status, count]) => <li key={status}><span className="mono">{status}</span><strong>{number(count)}</strong></li>)}</ul></details>}
        </Card>
      </div>
      <div className="intelligence-columns">
        <Card title={x.productionCard.title} description={x.productionCard.evidence}>
          <dl className="intelligence-facts">
            {([["cut", data.cut], ["recut", data.recut], ["completed", data.completed]] as const).map(([key, metric]) => (
              <div key={key}><dt>{x.productionCard[key]}</dt><dd>{m(metric.fabricMeters)} m</dd><small>{x.orders(metric.orders)}{metric.unknownLines > 0 ? ` · ${x.productionCard.unknown(metric.ordersWithUnknownLines, metric.unknownLines)}` : ""}</small></div>
            ))}
          </dl>
          <p className="muted small">{x.productionCard.stageCompletions(data.processed.stageCompletions)}</p>
        </Card>
        <Card title={x.coverage.title} description={x.coverage.hint}>
          <CoverageList lines={Array.isArray(data.coverage.linesByStatus) ? {} : data.coverage.linesByStatus} />
        </Card>
      </div>
    </div>
  );
}

function ConceptTile({ title, hint, primary, secondary, tone, hidden = false, hiddenText }: { title: string; hint: string; primary: string; secondary: string; tone: "ordered" | "verified" | "production" | "none"; hidden?: boolean; hiddenText?: string }) {
  return (
    <article className={`concept-tile concept-${tone}`}>
      <h2>{title}</h2>
      <p className="concept-value">{hidden ? <span className="concept-hidden">{hiddenText}</span> : primary}</p>
      {!hidden && <p className="concept-secondary">{secondary}</p>}
      <p className="concept-hint">{hint}</p>
    </article>
  );
}

/** One-hue ramp by strength of payment evidence (dark = proven); unknown and reversed are neutral with texture. */
const PAYMENT_FILL: Record<PaymentClass, string> = {
  paid: "#104281", advance_verified: "#256abf", partial: "#5598e7", no_charge: "#86b6ef", unverified: "#b7d3f6", reversed: "#8a8780", unknown: "#d3d6dc",
};

export function PaymentBreakdown({ data }: { data: IntelligenceSummary }) {
  const { t, number } = useI18n(); const x = t.intelligence; const m = useMeters();
  const [active, setActive] = useState<PaymentClass | null>(null);
  const units = PAYMENT_CLASSES.map((key) => Math.max(0, meterUnits(data.ordered.byPayment[key]?.fabricMeters) ?? 0));
  const total = units.reduce((sum, value) => sum + value, 0);
  return (
    <div className="payment-breakdown">
      {total > 0 && <div className="payment-bar" role="img" aria-label={x.payment.chart}>
        {PAYMENT_CLASSES.map((key, index) => units[index] > 0 && (
          <span key={key} className={`payment-segment payment-${key}${active === key ? " is-active" : ""}`} style={{ flexGrow: units[index], background: PAYMENT_FILL[key] }}
            onMouseEnter={() => setActive(key)} onMouseLeave={() => setActive(null)} title={`${x.payment.classes[key]}: ${m(data.ordered.byPayment[key].fabricMeters)} m (${share(units[index], total) ?? 0}%)`} />
        ))}
      </div>}
      <table className="payment-table">
        <thead><tr><th scope="col">{x.payment.column.class}</th><th scope="col">{x.payment.column.fabric}</th><th scope="col">{x.payment.column.rail}</th><th scope="col">{x.payment.column.orders}</th><th scope="col">{x.payment.column.share}</th></tr></thead>
        <tbody>
          {PAYMENT_CLASSES.map((key, index) => {
            const row = data.ordered.byPayment[key];
            return (
              <tr key={key} className={active === key ? "is-active" : undefined} onMouseEnter={() => setActive(key)} onMouseLeave={() => setActive(null)}>
                <th scope="row"><span className={`payment-swatch payment-${key}`} style={{ background: PAYMENT_FILL[key] }} aria-hidden="true" />{x.payment.classes[key]}{key === "paid" && <> <Badge tone="success">✓</Badge></>}</th>
                <td>{m(row?.fabricMeters)} m</td><td>{m(row?.railMeters)} m</td><td>{number(row?.orders ?? 0)}</td><td>{share(units[index], total) === null ? "—" : `${share(units[index], total)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small payment-as-of" role="note">{x.payment.asOf}</p>
      {(data.ordered.byPayment.unknown?.orders ?? 0) > 0 && <p className="muted small">{x.payment.unknownHint}</p>}
    </div>
  );
}

function CoverageList({ lines }: { lines: Record<string, number> }) {
  const { t, number } = useI18n(); const x = t.intelligence;
  const total = Object.values(lines).reduce((sum, value) => sum + value, 0);
  const known = new Set<string>(COVERAGE_STATUSES);
  const keys = [...COVERAGE_STATUSES.filter((key) => (lines[key] ?? 0) > 0), ...Object.keys(lines).filter((key) => !known.has(key))];
  if (total === 0) return <EmptyState title={x.series.empty} />;
  return (
    <ul className="coverage-list">
      {keys.map((key) => {
        const warn = ["unknown_basis", "unknown", "unknown_marketplace", "conflict"].includes(key);
        return <li key={key} className={warn ? "is-warning" : undefined}>
          <span>{x.coverage.statuses[key] ?? key}</span><strong>{number(lines[key])}</strong>
          <span className="coverage-meter" aria-hidden="true"><span style={{ width: `${share(lines[key], total) ?? 0}%` }} /></span>
        </li>;
      })}
    </ul>
  );
}

type SortKey = "ordered" | "verified" | "cut" | "completed" | "unknown";
const sortValue: Record<SortKey, (row: ProductRow) => number> = {
  ordered: (row) => meterUnits(row.orderedFabricMeters) ?? 0,
  verified: (row) => meterUnits(row.verifiedSaleFabricMeters) ?? 0,
  cut: (row) => meterUnits(row.cutFabricMeters) ?? 0,
  completed: (row) => meterUnits(row.completedFabricMeters) ?? 0,
  unknown: (row) => row.unknownLines,
};

export function ProductsView({ data }: { data: IntelligenceProducts }) {
  const { t, number } = useI18n(); const x = t.intelligence; const m = useMeters();
  const [needle, setNeedle] = useState(""); const [sort, setSort] = useState<SortKey>("ordered");
  const rows = useMemo(() => {
    const term = needle.trim().toLowerCase();
    return data.items.filter((row) => !term || `${row.productCode ?? ""} ${row.variant ?? ""}`.toLowerCase().includes(term))
      .sort((a, b) => sortValue[sort](b) - sortValue[sort](a));
  }, [data.items, needle, sort]);
  const c = x.products.columns;
  return (
    <>
      <div className="intelligence-toolbar">
        <Field label={x.products.search}>{(id) => <input id={id} type="search" maxLength={80} value={needle} onChange={(event) => setNeedle(event.target.value)} />}</Field>
        <Field label={x.products.sort}>{(id) => <select id={id} value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>{(Object.keys(sortValue) as SortKey[]).map((key) => <option key={key} value={key}>{x.products.sorts[key]}</option>)}</select>}</Field>
      </div>
      {data.truncated && <Notice tone="info">{x.products.truncated(data.items.length, data.total)}</Notice>}
      {rows.length === 0 ? <EmptyState title={x.products.empty} /> : (
        <div className="table-wrap"><table className="data-table intelligence-table">
          <thead><tr><th scope="col">{c.source}</th><th scope="col">{c.code}</th><th scope="col">{c.variant}</th><th scope="col">{c.ordered}</th><th scope="col">{c.verified}</th><th scope="col">{c.rail}</th><th scope="col">{c.outside}</th><th scope="col">{c.cut}</th><th scope="col">{c.completed}</th><th scope="col">{c.unknown}</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={`${row.source}|${row.productCode ?? ""}|${row.variant ?? ""}`}>
              <td>{x.sources[row.source] ?? row.source}</td>
              <td className="mono">{row.productCode ?? <span className="muted">{x.products.noCode}</span>}</td>
              <td>{row.variant ?? "—"}</td>
              <td className="num">{m(row.orderedFabricMeters)}</td><td className="num">{m(row.verifiedSaleFabricMeters)}</td><td className="num">{m(row.orderedRailMeters)}</td>
              <td className="num">{m(row.orderedOutsideArasyaFabricMeters)}</td><td className="num">{m(row.cutFabricMeters)}</td><td className="num">{m(row.completedFabricMeters)}</td>
              <td className="num">{row.unknownLines > 0 ? <Badge tone="warning">{number(row.unknownLines)}</Badge> : "0"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

export function EmployeesView({ data }: { data: IntelligenceEmployees }) {
  const { t, number, stage } = useI18n(); const x = t.intelligence; const m = useMeters(); const c = x.employees.columns;
  const rows = [...data.items].sort((a: EmployeeRow, b: EmployeeRow) => (meterUnits(b.fabricMeters) ?? 0) - (meterUnits(a.fabricMeters) ?? 0));
  return (
    <>
      <p className="muted small intelligence-note">{x.employees.hint}</p>
      {rows.length === 0 ? <EmptyState title={x.employees.empty} /> : (
        <div className="table-wrap"><table className="data-table intelligence-table">
          <thead><tr><th scope="col">{c.employee}</th><th scope="col">{c.stage}</th><th scope="col">{c.completions}</th><th scope="col">{c.cuts}</th><th scope="col">{c.recuts}</th><th scope="col">{c.meters}</th><th scope="col">{c.unknown}</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={`${row.employeeId}|${row.stageId}`}>
              <td>{row.employeeName}</td><td>{stage(row.stageId)}</td><td className="num">{number(row.completions)}</td><td className="num">{number(row.cuts)}</td>
              <td className="num">{number(row.recuts)}</td><td className="num">{m(row.fabricMeters)}</td>
              <td className="num">{row.completionsWithoutMeters > 0 ? <Badge tone="warning">{number(row.completionsWithoutMeters)}</Badge> : "0"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

/** Three categorical slots in fixed order (validated all-pairs; the third is below 3:1, so direct labels and a table exist). */
const SERIES = [
  { key: "ordered", field: "orderedFabricMeters", color: "#2a78d6" },
  { key: "verified", field: "verifiedSaleFabricMeters", color: "#eb6834" },
  { key: "completed", field: "completedFabricMeters", color: "#1baf7a" },
] as const;

export function SeriesView({ data }: { data: IntelligenceSeries }) {
  const { t } = useI18n(); const x = t.intelligence; const m = useMeters(); const c = x.series.columns;
  const [table, setTable] = useState(false);
  if (data.items.length === 0) return <EmptyState title={x.series.empty} />;
  return (
    <Card title={x.series.chart} actions={<button type="button" className="button button-ghost" aria-pressed={table} onClick={() => setTable((value) => !value)}>{x.series.table}</button>}>
      <p className="muted small series-note" role="note">{x.series.dateNote}</p>
      <ul className="series-legend">{SERIES.map((s) => <li key={s.key}><span className="series-key" style={{ background: s.color }} aria-hidden="true" />{x.series.legend[s.key]}</li>)}</ul>
      {!table && <SeriesChart items={data.items} />}
      {table && <div className="table-wrap"><table className="data-table intelligence-table">
        <thead><tr><th scope="col">{c.period}</th><th scope="col">{c.ordered}</th><th scope="col">{c.verified}</th><th scope="col">{c.outside}</th><th scope="col">{c.cut}</th><th scope="col">{c.completed}</th><th scope="col">{c.rail}</th></tr></thead>
        <tbody>{data.items.map((p) => <tr key={p.period}><td className="mono">{p.period}</td><td className="num">{m(p.orderedFabricMeters)}</td><td className="num">{m(p.verifiedSaleFabricMeters)}</td><td className="num">{m(p.orderedOutsideArasyaFabricMeters)}</td><td className="num">{m(p.cutFabricMeters)}</td><td className="num">{m(p.completedFabricMeters)}</td><td className="num">{m(p.orderedRailMeters)}</td></tr>)}</tbody>
      </table></div>}
    </Card>
  );
}

const W = 900; const H = 300; const PAD = { top: 16, right: 160, bottom: 30, left: 60 };

export function SeriesChart({ items }: { items: SeriesPoint[] }) {
  const { t, number } = useI18n(); const x = t.intelligence; const m = useMeters();
  const [hover, setHover] = useState<number | null>(null);
  const values = SERIES.map((s) => items.map((p) => Math.max(0, meterUnits(p[s.field]) ?? 0) / 1000));
  const max = Math.max(1, ...values.flat());
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const xAt = (index: number) => PAD.left + (items.length === 1 ? (W - PAD.left - PAD.right) / 2 : (index * (W - PAD.left - PAD.right)) / (items.length - 1));
  const yAt = (value: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - value / top);
  const ticks = [0, top / 2, top];
  const labelEvery = Math.max(1, Math.ceil(items.length / 8));
  const ends = SERIES.map((s, index) => ({ key: s.key, color: s.color, y: yAt(values[index][items.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  return (
    <div className="series-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={x.series.chart} onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => <g key={tick}><line x1={PAD.left} x2={W - PAD.right} y1={yAt(tick)} y2={yAt(tick)} className="series-grid" /><text x={PAD.left - 8} y={yAt(tick) + 4} textAnchor="end" className="series-axis">{number(Math.round(tick))}</text></g>)}
        {items.map((p, index) => index % labelEvery === 0 && <text key={p.period} x={xAt(index)} y={H - 10} textAnchor="middle" className="series-axis">{p.period}</text>)}
        {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={H - PAD.bottom} className="series-crosshair" />}
        {SERIES.map((s, index) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={values[index].map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ")} />
            {items.length <= 40 && values[index].map((v, i) => <circle key={i} cx={xAt(i)} cy={yAt(v)} r={hover === i ? 4.5 : 3} fill={s.color} stroke="#ffffff" strokeWidth={2} />)}
          </g>
        ))}
        {ends.map((end) => <text key={end.key} x={W - PAD.right + 8} y={end.y + 4} className="series-end">{x.series.legend[end.key]}</text>)}
        {items.map((p, index) => {
          const half = items.length === 1 ? (W - PAD.left - PAD.right) / 2 : (W - PAD.left - PAD.right) / (items.length - 1) / 2;
          return <rect key={p.period} x={xAt(index) - half} y={PAD.top} width={half * 2} height={H - PAD.top - PAD.bottom} fill="transparent" onMouseEnter={() => setHover(index)} />;
        })}
      </svg>
      {hover !== null && (
        <div className="series-tooltip" role="status" style={{ left: `${(xAt(hover) / W) * 100}%` }}>
          <strong>{items[hover].period}</strong>
          {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} aria-hidden="true" />{x.series.legend[s.key]}: {m(items[hover][s.field])} m</span>)}
        </div>
      )}
    </div>
  );
}
