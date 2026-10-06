import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { AnalyticsMeta, AnalyticsOrder, AnalyticsPolicy, ClockKind, CompanyReport, DepartmentReport, Distribution, Duration, EmployeeAnalytics, EmployeeDetailReport, EmployeeReport, GroupAnalytics, GroupReport, Interval, Lifecycle, ManagerReport, OrderDetailReport, OrderPage, Rate, Trend } from "../api/analytics";
import { useDashboard } from "../app/context";
import { useI18n } from "../i18n/context";
import { Card, EmptyState, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";

type Section = "employees" | "departments" | "managers" | "sources" | "companies" | "orders" | "policy";
const paths: Record<Section, string> = { employees: "angajati", departments: "departamente", managers: "aprobari", sources: "surse", companies: "firme", orders: "comenzi", policy: "politica" };
const periods = ["today", "yesterday", "week", "month", "previous_month", "custom"] as const;
type Period = typeof periods[number];
type Result = EmployeeReport | EmployeeDetailReport | DepartmentReport | ManagerReport | GroupReport | CompanyReport | OrderDetailReport | (AnalyticsMeta & OrderPage);
function initialFilters(): Record<string, string | undefined> {
  const query = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  if (query.has("from") && query.has("to")) return { from: query.get("from")!, to: query.get("to")! };
  const period = query.get("period"); return { period: periods.includes(period as Period) && period !== "custom" ? period! : "month" };
}
function dateSearch(): string { return typeof window === "undefined" ? "" : window.location.search; }

/** Reports are explicitly refreshed, not rebuilt on every live production event. */
export function AnalyticsPage({ section, id }: { section: Section; id?: string }) {
  const { api, me, navigate } = useDashboard(); const { t, dateTime } = useI18n(); const a = t.analytics;
  const allowed = Boolean(me.capabilities?.viewAnalytics);
  const [period, setPeriod] = useState<Period>(() => initialFilters().from ? "custom" : initialFilters().period as Period); const [from, setFrom] = useState(() => initialFilters().from ?? ""); const [to, setTo] = useState(() => initialFilters().to ?? "");
  const [search, setSearch] = useState(""); const [department, setDepartment] = useState(""); const [source, setSource] = useState("");
  const [clock, setClock] = useState<ClockKind>("businessSeconds"); const [cursor, setCursor] = useState<string | undefined>();
  const [filters, setFilters] = useState<Record<string, string | undefined>>(initialFilters); const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Result | null; error: unknown }>({ key: "", data: null, error: null });
  const [departments, setDepartments] = useState<DepartmentReport["items"]>([]);
  const endpoint = `${section}${id ? `/${encodeURIComponent(id)}` : ""}`;
  const cursorName = section === "managers" ? "afterRequest" : section === "sources" || (section === "companies" && !id) ? "afterGroup" : section === "orders" && id ? "afterVersion" : "cursor";
  const requestKey = JSON.stringify([endpoint, filters, cursor, cursorName, revision]);
  const data = result.key === requestKey ? result.data : null; const error = result.key === requestKey ? result.error : null;
  useEffect(() => {
    if (!allowed || section === "policy") return;
    const abort = new AbortController();
    api.analytics<Result>(endpoint, { ...filters, [cursorName]: cursor, limit: "50" }, abort.signal).then(data => { if (!abort.signal.aborted) setResult({ key: requestKey, data, error: null }); }, error => { if (!abort.signal.aborted) setResult({ key: requestKey, data: null, error }); });
    return () => abort.abort();
  }, [api, endpoint, filters, cursor, cursorName, requestKey, allowed, section]);
  useEffect(() => {
    if (!allowed || section !== "employees" || id) return;
    const abort = new AbortController();
    api.analytics<DepartmentReport>("departments", filters, abort.signal).then(result => { if (!abort.signal.aborted) setDepartments(result.items); }, () => undefined);
    return () => abort.abort();
  }, [api, filters, section, id, allowed]);
  if (!allowed) return <div className="page"><PageHeader title={a.title} /><ErrorBanner error={new ApiError("UNAUTHORIZED_ACTION", 403)} /></div>;
  const next = data ? nextCursor(data, section, Boolean(id)) : null;
  return <div className="page analytics-page">
    <PageHeader title={`${a.title} · ${a[section]}`} description={a.hint} actions={<button type="button" className="button button-secondary" onClick={() => setRevision(r => r + 1)}>{a.refresh}</button>} />
    <nav className="analytics-tabs" aria-label={a.title}>{(Object.keys(paths) as Section[]).filter(key => key !== "policy" || me.capabilities?.manageAnalyticsPolicy).map(key => <a key={key} href={`/analiza/${paths[key]}${dateSearch()}`} aria-current={key === section ? "page" : undefined} onClick={event => { event.preventDefault(); navigate(`/analiza/${paths[key]}${dateSearch()}`); }}>{a[key]}</a>)}</nav>
    {section === "policy" ? <AnalyticsPolicyForm key={revision} /> : <>
      <Card><form className="analytics-filters" onSubmit={event => {
        event.preventDefault(); const dates = period === "custom" ? { from, to } : { period };
        const query = new URLSearchParams(); for (const [key, value] of Object.entries(dates)) if (value) query.set(key, value);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${query}`);
        setCursor(undefined); setFilters({ ...dates, ...(section === "employees" && !id ? { search, departmentId: department } : {}), ...(section === "orders" && !id ? { source: source || undefined } : {}) });
      }}>
        <Field label={a.period}>{field => <select id={field} value={period} onChange={event => setPeriod(event.target.value as Period)}>{periods.map(key => <option key={key} value={key}>{a[key]}</option>)}</select>}</Field>
        {period === "custom" && <><Field label={a.from}>{field => <input id={field} type="date" required value={from} onChange={event => setFrom(event.target.value)} />}</Field><Field label={a.to}>{field => <input id={field} type="date" required min={from || undefined} value={to} onChange={event => setTo(event.target.value)} />}</Field></>}
        {section === "employees" && !id && <><Field label={a.search}>{field => <input id={field} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} />}</Field><Field label={a.department}>{field => <select id={field} value={department} onChange={event => setDepartment(event.target.value)}><option value="">{a.all}</option>{departments.map(d => <option key={d.department.id} value={d.department.id}>{d.department.name}</option>)}</select>}</Field></>}
        {section === "orders" && !id && <Field label={a.source}>{field => <input id={field} maxLength={60} value={source} onChange={event => setSource(event.target.value)} />}</Field>}
        <button type="submit" className="button button-primary">{a.apply}</button>
        <Field label={a.clockMode}>{field => <select id={field} value={clock} onChange={event => setClock(event.target.value as ClockKind)}><option value="businessSeconds">{a.business}</option><option value="wallSeconds">{a.wall}</option></select>}</Field>
      </form></Card>
      <details className="analytics-method"><summary>{a.title}</summary><p>{a.completionHint}</p><p>{a.qualityHint}</p><p>{a.timingHint}</p><p>{a.membership}</p><p>{a.smallSample}</p></details>
      {error !== null && <ErrorBanner error={error} onRetry={() => setRevision(r => r + 1)} />}{data === null && error === null && <Loading />}
      {data && <>
        <p className="muted small">{a.asOf}: {dateTime(data.asOf)} · Europe/Bucharest · {a.approvalsGrace}: {data.approvalGraceMinutes} {a.minutes}</p>
        {data.coverage?.rebuildRequired && <Notice tone="warning">{a.coverage} ({data.coverage.projectedOrders} / {data.coverage.totalOrders})</Notice>}
        {section === "employees" && !id && <EmployeeList data={data as EmployeeReport} clock={clock} />}
        {section === "employees" && id && <EmployeeDetail data={data as EmployeeDetailReport} clock={clock} />}
        {section === "departments" && <DepartmentList data={data as DepartmentReport} clock={clock} />}
        {section === "managers" && <ManagerList data={data as ManagerReport} clock={clock} />}
        {(section === "sources" || (section === "companies" && !id)) && <GroupList data={data as GroupReport} companies={section === "companies"} clock={clock} />}
        {section === "companies" && id && <CompanyDetail data={data as CompanyReport} clock={clock} />}
        {section === "orders" && !id && <OrderList data={data as AnalyticsMeta & OrderPage} clock={clock} />}
        {section === "orders" && id && <OrderDetail data={data as OrderDetailReport} clock={clock} />}
        <div className="row-actions">{cursor && <button type="button" className="button button-secondary" onClick={() => setCursor(undefined)}>{a.reset}</button>}{next && <button type="button" className="button button-secondary" onClick={() => setCursor(next)}>{a.next}</button>}</div>
      </>}
    </>}
  </div>;
}
function nextCursor(data: Result, section: Section, detail: boolean): string | null {
  if (section === "managers") return (data as ManagerReport).nextRequestCursor;
  if (section === "sources" || (section === "companies" && !detail)) return (data as GroupReport).nextGroupCursor;
  if (section === "orders" && detail) { const next = (data as OrderDetailReport).nextVersion; return next === null ? null : String(next); }
  if ((section === "employees" || section === "companies") && detail) return (data as EmployeeDetailReport | CompanyReport).orders.nextCursor;
  return "nextCursor" in data ? data.nextCursor : null;
}
function AnalyticsLink({ section, id, children }: { section: Section; id: string; children: ReactNode }) {
  const { navigate } = useDashboard(); const path = `/analiza/${paths[section]}/${encodeURIComponent(id)}${dateSearch()}`;
  return <a href={path} onClick={event => { event.preventDefault(); navigate(path); }}>{children}</a>;
}
function Stat({ label, value }: { label: string; value: ReactNode }) { return <div className="analytics-stat"><dt>{label}</dt><dd>{value}</dd></div>; }
function DurationText({ seconds }: { seconds: number | null | undefined }) {
  const { t, number } = useI18n();
  if (seconds === null || seconds === undefined) return <span>{t.analytics.unavailable}</span>;
  const rounded = Math.round(seconds);
  return <span>{number(Math.floor(rounded / 3600))} {t.analytics.hours} {Math.floor(rounded % 3600 / 60)} {t.analytics.minutes} {rounded % 60} s</span>;
}
function DistributionView({ value }: { value: Distribution }) {
  const { t, number } = useI18n(); const a = t.analytics;
  return <dl className="analytics-stats"><Stat label={a.sample} value={number(value.sampleCount)} />{(["mean", "median", "p25", "p75", "p90", "p95"] as const).map(key => <Stat key={key} label={a[key]} value={<DurationText seconds={value[key]} />} />)}{value.totalSeconds !== undefined && <Stat label={a.total} value={<DurationText seconds={value.totalSeconds} />} />}</dl>;
}
function RateView({ label, value }: { label: string; value: Rate }) {
  const { t } = useI18n();
  return <div className="analytics-stat"><dt>{label}</dt><dd>{value.percent === null ? t.analytics.unavailable : `${String(value.percent).replace(".", ",")} %`}</dd><small>{t.analytics.denominator}: {value.numerator} / {value.denominator ?? t.analytics.unavailable}</small></div>;
}
function StageActivity({ stages }: { stages: Record<string, number> }) {
  const { t, stage, number } = useI18n();
  return <div><h3>{t.analytics.stageActivity}</h3><dl className="analytics-stats">{Object.entries(stages).map(([id, count]) => <Stat key={id} label={stage(id)} value={number(count)} />)}</dl>{Object.keys(stages).length === 0 && <p className="muted">{t.analytics.noData}</p>}</div>;
}
function EmployeeCard({ employee: r, clock, linked = true }: { employee: EmployeeAnalytics; clock: ClockKind; linked?: boolean }) {
  const { t, number } = useI18n(); const a = t.analytics;
  const cutting = ["pregatire-material", "taiere"].includes(r.department.key) || r.completedOrders > 0 || r.faultOrders > 0;
  return <Card className="analytics-employee"><h2>{linked ? <AnalyticsLink section="employees" id={r.id}>{r.name}</AnalyticsLink> : r.name}</h2><p className="muted">{r.department.name}{r.positionTitle && ` · ${r.positionTitle}`}</p>
    {cutting && <><dl className="analytics-stats"><Stat label={a.completed} value={number(r.completedOrders)} /><Stat label={a.lines} value={number(r.completedLines)} /><Stat label={a.meters} value={r.completedMeters} /><Stat label={a.averageMeters} value={r.averageMetersPerOrder ?? a.unavailable} /></dl>
      <div className="analytics-quality"><section><h3>{a.responsible}</h3><dl className="analytics-stats"><Stat label={a.faultOrders} value={r.faultOrders} /><Stat label={a.faultLines} value={r.faultLines} /><Stat label={a.faultMeters} value={r.faultMeters} /><Stat label={a.rework} value={r.reworkCycles} /><Stat label={a.repeated} value={r.repeatedCycles} /></dl></section><section><h3>{a.detected}</h3><dl className="analytics-stats"><Stat label={a.detectedOrders} value={r.detectedOrders} /><Stat label={a.detectedLines} value={r.detectedLines} /><Stat label={a.detectedMeters} value={r.detectedMeters} /></dl></section></div>
      <dl className="analytics-stats"><RateView label={a.meterRate} value={r.faultMeterRate} /><RateView label={a.orderRate} value={r.faultOrderRate} /><RateView label={a.lineRate} value={r.faultLineRate} /></dl>
      {(r.missingMeterSamples > 0 || r.missingLineSamples > 0) && <Notice>{a.missingSamples}</Notice>}
      <h3>{a.completedHandling}</h3><DistributionView value={r.completedHandling[clock]} />
    </>}
    {cutting && <dl className="analytics-stats"><Stat label={a.repeatedOrders} value={r.repeatedOrders} /><Stat label={a.repeatedMeters} value={r.repeatedMeters} /></dl>}
    {!cutting && <StageActivity stages={r.stageCompletions} />}
    {(r.department.key === "vanzari-online" || r.onlineSubmissions > 0) && <dl className="analytics-stats"><Stat label={a.onlineSubmitted} value={r.onlineSubmissions} /></dl>}
    {!cutting && r.detectedOrders > 0 && <dl className="analytics-stats"><Stat label={a.detectedOrders} value={r.detectedOrders} /><Stat label={a.detectedLines} value={r.detectedLines} /><Stat label={a.detectedMeters} value={r.detectedMeters} /></dl>}
    <dl className="analytics-stats"><Stat label={a.active} value={<DurationText seconds={(cutting ? r.cuttingActiveHandling : r.activeHandling)[clock]} />} /><Stat label={a.initiated} value={r.initiatedTransfers} /><Stat label={a.outgoing} value={r.outgoingTransfers} /><Stat label={a.incoming} value={r.incomingTransfers} /></dl>
  </Card>;
}
function EmployeeList({ data, clock }: { data: EmployeeReport; clock: ClockKind }) {
  const { t } = useI18n(); return <>{data.items.length === 0 && <EmptyState title={t.analytics.noData} />}{data.items.map(employee => <EmployeeCard key={employee.id} employee={employee} clock={clock} />)}</>;
}
function Trends({ title, values, clock }: { title: string; values: Record<string, Trend> | []; clock: ClockKind }) {
  const { t } = useI18n(); const a = t.analytics;
  return <Card title={title}><div className="analytics-trends">{Object.entries(values).map(([date, value]) => <section key={date}><h3>{date}</h3><dl className="analytics-stats"><Stat label={a.completed} value={value.completedOrders} /><Stat label={a.meters} value={value.meters} /><Stat label={a.active} value={<DurationText seconds={value[clock]} />} /><Stat label={a.rework} value={value.faultCycles} /><Stat label={a.faultMeters} value={value.faultMeters} /><Stat label={a.detected} value={value.detectedCycles} /><Stat label={a.detectedMeters} value={value.detectedMeters} /></dl></section>)}</div>{Object.keys(values).length === 0 && <EmptyState title={a.noData} />}</Card>;
}
function IntervalList({ title, intervals, clock }: { title: string; intervals: Interval[]; clock: ClockKind }) {
  const { t, dateTime, stage } = useI18n(); const a = t.analytics;
  return <Card title={title}><ol className="analytics-timeline">{intervals.map((r, i) => <li key={`${r.start}-${i}`}><strong>{r.orderId ? <AnalyticsLink section="orders" id={r.orderId}>{r.orderNumber ?? r.orderId}</AnalyticsLink> : stage(r.stageId)}</strong>{r.employeeId && <p><AnalyticsLink section="employees" id={r.employeeId}>{a.employee} · {r.employeeId}</AnalyticsLink></p>}<p>{stage(r.stageId)} · {dateTime(r.start)} → {r.end ? dateTime(r.end) : a.open}</p><DurationText seconds={r.duration[clock]} /></li>)}</ol>{intervals.length === 0 && <EmptyState title={a.noData} />}</Card>;
}
function EmployeeDetail({ data, clock }: { data: EmployeeDetailReport; clock: ClockKind }) {
  const { t } = useI18n(); return <><EmployeeCard employee={data.employee} clock={clock} linked={false} /><Trends title={t.analytics.daily} values={data.employee.daily} clock={clock} /><Trends title={t.analytics.weekly} values={data.employee.weekly} clock={clock} /><IntervalList title={t.analytics.longest} intervals={data.longestIntervals} clock={clock} /><h2>{t.analytics.related}</h2><OrderList data={data.orders} clock={clock} /></>;
}
function DepartmentList({ data, clock }: { data: DepartmentReport; clock: ClockKind }) {
  const { t } = useI18n(); const a = t.analytics;
  return <>{data.items.map(r => <Card key={r.department.id} title={r.department.name}><dl className="analytics-stats"><Stat label={a.employees} value={r.employees} /><Stat label={a.active} value={<DurationText seconds={r.activeHandling[clock]} />} /><Stat label={a.departmentManagerWait} value={<DurationText seconds={r.managerWaitingForRelatedOrders[clock]} />} />{r.metricSet === "canonical_online_activity" && <Stat label={a.onlineSubmitted} value={r.onlineSubmissions} />}{r.metricSet === "cutting" && <><Stat label={a.completed} value={r.completedOrders} /><Stat label={a.lines} value={r.completedLines} /><Stat label={a.meters} value={r.completedMeters} /><Stat label={a.faultLines} value={r.faultLines} /><Stat label={a.faultMeters} value={r.faultMeters} /><Stat label={a.rework} value={r.reworkCycles} /><Stat label={a.repeated} value={r.repeatedCycles} /></>}</dl><StageActivity stages={r.stageCompletions} />{r.detectedLines > 0 && <dl className="analytics-stats"><Stat label={a.detectedLines} value={r.detectedLines} /><Stat label={a.detectedMeters} value={r.detectedMeters} /></dl>}</Card>)}</>;
}
function DecisionStatus({ value }: { value: string }) { const { t } = useI18n(); const a = t.analytics; return <>{({ approved: a.approved, rejected: a.rejected, pending: a.pending, cancelled: a.cancelled, completed: a.approved, accepted: a.approved } as Record<string, string>)[value] ?? a.unknown}</>; }
function ManagerList({ data, clock }: { data: ManagerReport; clock: ClockKind }) {
  const { t, dateTime } = useI18n(); const a = t.analytics;
  return <><Notice>{a.pendingHint} {a.rereviewHint}</Notice>{data.historicalRequestsWithoutEligibility > 0 && <Notice>{a.eligibilityUnknown} ({data.historicalRequestsWithoutEligibility})</Notice>}{data.items.map(r => <Card key={r.id} title={r.name ?? a.unavailable}><dl className="analytics-stats"><Stat label={a.received} value={r.received ?? a.unavailable} /><Stat label={a.knownReceived} value={r.knownEligibleReceived} /><Stat label={a.approved} value={r.approved} /><Stat label={a.rejected} value={r.rejected} /><Stat label={a.decisions} value={r.decisions} /><Stat label={a.backup} value={r.backupDecisions} /><Stat label={a.rereviews} value={r.rereviewsAfterRejection} /><Stat label={a.pending} value={r.pendingEligible} /><Stat label={a.pendingElapsed} value={<DurationText seconds={r.pendingElapsed[clock]} />} /></dl>{(["exception", "transfer"] as const).map(type => <section key={type}><h3>{a[type]}</h3><dl className="analytics-stats"><Stat label={a.approved} value={r.byType[type].approved} /><Stat label={a.rejected} value={r.byType[type].rejected} /></dl></section>)}<h3>{a.response}</h3><DistributionView value={clock === "wallSeconds" ? r.wallResponse : r.businessResponse} /></Card>)}<Card title={a.requests}><ol className="analytics-timeline">{data.requests.map(r => <li key={r.id}><AnalyticsLink section="orders" id={r.orderId}>{r.type === "transfer" ? a.transfer : a.exception} · {a.attempt} {r.attempt}</AnalyticsLink><p><DecisionStatus value={r.status} /> · {dateTime(r.openedAt)} → {r.decidedAt ? dateTime(r.decidedAt) : a.open}</p><DurationText seconds={r.response[clock]} />{r.previousDecisionId && <p className="small">{a.previousDecision}: <code>{r.previousDecisionId}</code></p>}{!r.eligibilityCaptured && <p className="small muted">{a.eligibilityUnknown}</p>}</li>)}</ol></Card>{data.items.length === 0 && <EmptyState title={a.noData} />}</>;
}
function GroupCard({ group: r, companies, clock }: { group: GroupAnalytics; companies: boolean; clock: ClockKind }) {
  const { t } = useI18n(); const a = t.analytics;
  return <Card><h2>{companies ? <AnalyticsLink section="companies" id={r.id}>{r.name ?? a.unavailable}</AnalyticsLink> : r.name ?? r.id}</h2><dl className="analytics-stats"><Stat label={a.groupOrders} value={r.orders} /><Stat label={a.deliveryOrders} value={r.completedOrders} /><Stat label={a.orderMeters} value={r.meters} /><Stat label={a.orderLines} value={r.knownLineCount} /><Stat label={a.cancelledBefore} value={r.cancelledBeforeWork} /><Stat label={a.cancelledAfter} value={r.cancelledAfterWork} /></dl>{([[a.qrCompletion, r.qrToCompletion], [a.claimCompletion, r.claimToCompletion], [a.firstClaimDelay, r.firstClaimDelay], [a.cuttingWait, r.cuttingWaiting], [a.cuttingActive, r.cuttingActive], [a.managerWait, r.managerWaiting], [a.exceptionWait, r.exceptionBlocked]] as [string, Record<ClockKind, Distribution>][]).map(([label, distribution]) => <section key={label}><h3>{label}</h3><DistributionView value={distribution[clock]} /></section>)}{(r.missingMeterSamples > 0 || r.missingLineSamples > 0) && <p className="muted">{a.missingSamples}</p>}{companies && <p className="muted">{a.customerUnknown}</p>}</Card>;
}
function GroupList({ data, companies, clock }: { data: GroupReport; companies: boolean; clock: ClockKind }) { const { t } = useI18n(); return <><Notice>{t.analytics.groupHint}</Notice>{data.items.map(r => <GroupCard key={r.id} group={r} companies={companies} clock={clock} />)}{data.items.length === 0 && <EmptyState title={t.analytics.noData} />}</>; }
function CompanyDetail({ data, clock }: { data: CompanyReport; clock: ClockKind }) { const { t } = useI18n(); return <>{data.company.qrToCompletion ? <GroupCard group={data.company as GroupAnalytics} companies clock={clock} /> : <Card title={data.company.name ?? t.analytics.unavailable}><EmptyState title={t.analytics.noData} /></Card>}<h2>{t.analytics.related}</h2><OrderList data={data.orders} clock={clock} /></>; }
function LifecycleView({ lifecycle: r, clock }: { lifecycle: Lifecycle; clock: ClockKind }) {
  const { t } = useI18n(); const a = t.analytics;
  const metrics: [string, Duration | null][] = [[a.qrCompletion, r.qrToCompletion], [a.claimCompletion, r.claimToCompletion], [a.firstClaimDelay, r.firstClaimDelay], [a.elapsed, r.elapsedFromQr], [a.cuttingWait, r.cuttingWaiting], [a.cuttingActive, r.cuttingActive], [a.active, r.activeHandling], [a.managerWait, r.managerWaiting], [a.transferWait, r.transferWaiting], [a.exceptionWait, r.exceptionBlocked], [a.blockedUnion, r.blockedUnion], [a.nonWorker, r.nonWorker]];
  return <>{!r.isComplete && !r.closedByCancellation && <p className="muted">{a.partial}</p>}<dl className="analytics-stats">{metrics.map(([label, duration]) => <Stat key={label} label={label} value={<DurationText seconds={duration?.[clock]} />} />)}</dl></>;
}
function OrderList({ data, clock }: { data: OrderPage; clock: ClockKind }) {
  const { t, stage, dateTime } = useI18n(); const a = t.analytics;
  return <>{data.items.map((r: AnalyticsOrder) => <Card key={r.id}><h2><AnalyticsLink section="orders" id={r.id}>{r.number}</AnalyticsLink></h2><p>{r.source} · {r.stageId ? stage(r.stageId) : a.delivery}</p><dl className="analytics-stats"><Stat label={a.created} value={dateTime(r.createdAt)} /><Stat label={a.orderMeters} value={r.orderMeters ?? a.unavailable} /><Stat label={a.orderLines} value={r.orderLines ?? a.unavailable} /></dl><LifecycleView lifecycle={r.lifecycle} clock={clock} /></Card>)}{data.items.length === 0 && <EmptyState title={a.noData} />}</>;
}
function OrderDetail({ data, clock }: { data: OrderDetailReport; clock: ClockKind }) {
  const { t, dateTime } = useI18n(); const a = t.analytics; const r = data.order;
  return <><Card title={r.number}><p>{r.source}{r.companyId && <> · <AnalyticsLink section="companies" id={r.companyId}>{r.companyName ?? a.companies}</AnalyticsLink></>}</p><dl className="analytics-stats">{([[a.created, r.sourceImportedAt], [a.qr, r.qrCreatedAt], [a.document, r.documentCreatedAt], [a.firstClaim, r.firstClaimAt], [a.delivery, r.completedAt]] as [string, string | null][]).map(([label, date]) => <Stat key={label} label={label} value={date ? dateTime(date) : a.unavailable} />)}</dl><LifecycleView lifecycle={data.lifecycle} clock={clock} />{r.cancelledAt && <Notice>{a.cancellation}: {dateTime(r.cancelledAt)} · {r.cancellationPhase === "after_work" ? a.cancelledAfter : a.cancelledBefore}. {a.cancellationHint}</Notice>}</Card>
    <IntervalList title={a.interval} intervals={data.lifecycle.intervals ?? []} clock={clock} />
    <Card title={a.timeline}><ol className="analytics-timeline">{data.timeline.map(event => <li key={event.event_id}><strong>{a.actions[event.action as keyof typeof a.actions] ?? a.unknown}</strong><p>{dateTime(event.occurred_at)} · {event.employee_name ?? a.employee}</p><p>{event.from_stage_label_snapshot}{event.to_stage_label_snapshot && ` → ${event.to_stage_label_snapshot}`}{event.meters_snapshot && ` · ${event.meters_snapshot} m`}</p></li>)}</ol></Card>
    <Card title={a.poolFacts}><ol className="analytics-timeline">{data.poolFacts.map(fact => <li key={fact.fact_uuid}><strong>{fact.fact_type === "pool_entered" ? a.pool : fact.fact_type === "first_claim" ? a.firstClaim : a.cancellation}</strong><p>{dateTime(fact.occurred_at)}</p></li>)}</ol></Card>
    <Card title={a.requests}><ol className="analytics-timeline">{data.decisions.map(d => <li key={d.decision_uuid}><strong>{a.exception} · {a.attempt} {d.attempt_number}</strong><p><DecisionStatus value={d.status} /> · {dateTime(d.opened_at)} → {d.decided_at ? dateTime(d.decided_at) : a.open}</p>{d.previous_decision_uuid && <p className="small">{a.previousDecision}: {d.previous_decision_uuid}</p>}</li>)}{data.transfers.map(d => <li key={d.transfer_uuid}><strong>{a.transfer}</strong><p><DecisionStatus value={d.status} /> · {dateTime(d.requested_at)} → {d.resolved_at ? dateTime(d.resolved_at) : a.open}</p></li>)}</ol></Card>
    <Card title={a.comparable}><div className="analytics-lines">{data.comparableLines.map(line => <dl key={line.line_number} className="analytics-stats"><Stat label={a.line} value={line.line_number} /><Stat label={a.orderMeters} value={line.meters ?? a.unavailable} /><Stat label={a.quantity} value={line.quantity} /></dl>)}</div>{data.moreComparableLines && <p className="muted">{a.rowCount}: &gt; 100</p>}<p className="muted">{a.qualityHint}</p></Card>
  </>;
}
function AnalyticsPolicyForm() {
  const { api, me } = useDashboard(); const { t } = useI18n(); const a = t.analytics;
  const [data, setData] = useState<AnalyticsPolicy | null>(null); const [value, setValue] = useState(""); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const key = useRef("");
  useEffect(() => { if (!me.isRoot) return; const abort = new AbortController(); api.analyticsPolicy(abort.signal).then(result => { if (!abort.signal.aborted) { setData(result); setValue(String(result.approvalGraceMinutes)); } }, failure => { if (!abort.signal.aborted) setError(failure); }); return () => abort.abort(); }, [api, me.isRoot]);
  if (!me.isRoot) return <ErrorBanner error={new ApiError("ROOT_REQUIRED", 403)} />;
  return <Card title={a.policy} description={a.graceHint}>{error !== null && <ErrorBanner error={error} />}{saved && <Notice>{a.saved}</Notice>}{data === null && error === null && <Loading />}{data && <form onSubmit={event => {
    event.preventDefault(); if (busy) return; key.current ||= newIdempotencyKey(); setBusy(true); setError(null); setSaved(false);
    void api.updateAnalyticsPolicy({ approvalGraceMinutes: Number(value), expectedVersion: data.version }, key.current).then(result => { setData(result); setValue(String(result.approvalGraceMinutes)); key.current = ""; setSaved(true); }, failure => { setError(failure); if (failure instanceof ApiError && failure.status < 500) key.current = ""; }).finally(() => setBusy(false));
  }}><Field label={a.grace}>{field => <input id={field} type="number" min={0} max={240} step={1} required value={value} onChange={event => { setValue(event.target.value); key.current = ""; }} />}</Field><button type="submit" className="button button-primary" disabled={busy}>{busy ? t.common.saving : t.common.save}</button></form>}</Card>;
}
