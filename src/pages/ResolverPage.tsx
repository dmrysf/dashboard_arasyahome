import { useEffect, useRef, useState } from "react";
import { ApiError, newIdempotencyKey } from "../api/client";
import { exceedsOutstanding, normalizeAmount } from "../api/interventions";
import { needsStatement, orderTone, resolverPath, validReference, validValueDate, type ResolverFix, type ResolverOrder, type ResolverStuck } from "../api/resolver";
import { useDashboard } from "../app/context";
import { Card, ConfirmDialog, EmptyState, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

type Feedback = { tone: "success" | "warning"; text: string } | null;

/**
 * The order resolver (Dashboard 0.21.0): one number, one answer, one button. Every read asks the shop, so nothing here
 * polls: the order is read when it is asked for and again after a step.
 */
export function ResolverPage({ number }: { number?: string }) {
  const { api, me, navigate } = useDashboard();
  const { t } = useI18n();
  const rv = t.resolver;
  const allowed = me.isRoot || Boolean(me.capabilities?.resolveOrders);
  const [typed, setTyped] = useState(number ?? "");
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<{ tick: number; orders: ResolverOrder[] | null; error: Problem | null }>({ tick: -1, orders: null, error: null });
  const [chosen, setChosen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // The page is mounted once per number (App keys it); `tick` asks again (after a step, or on demand).
  useEffect(() => {
    if (!allowed || !number) return;
    const controller = new AbortController();
    api.resolverFind(number, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setResult({ tick, orders: value.orders, error: null }); },
      (caught: unknown) => { if (!controller.signal.aborted) setResult({ tick, orders: null, error: toProblem(caught) }); },
    );
    return () => controller.abort();
  }, [allowed, number, tick, api]);
  const loading = Boolean(number) && result.tick !== tick;
  const orders = loading ? null : result.orders;
  const error = loading ? null : result.error;
  const selected = orders?.length === 1 ? orders[0].globalOrderId : chosen;
  const again = () => setTick((value) => value + 1);

  if (!allowed) return <PageHeader title={rv.title} description={rv.denied} />;
  const current = orders?.find((o) => o.globalOrderId === selected) ?? null;
  const replace = (order: ResolverOrder) => setResult((r) => ({ ...r, orders: (r.orders ?? [order]).map((o) => (o.globalOrderId === order.globalOrderId ? order : o)) }));

  return <div className="page resolver-page">
    <PageHeader title={rv.title} description={rv.lead} actions={me.isRoot ? <button type="button" className="button button-ghost" onClick={() => navigate("/interventii")}>{rv.advanced}</button> : undefined} />
    <Card>
      <form className="resolver-search" onSubmit={(event) => {
        event.preventDefault();
        const value = typed.trim();
        if (!value) return;
        setFeedback(null);
        if (value === number) again(); else navigate(resolverPath(value));
      }}>
        <label className="resolver-search-label" htmlFor="resolver-number">{rv.search}</label>
        <div className="resolver-search-row">
          <input id="resolver-number" inputMode="numeric" autoComplete="off" placeholder={rv.searchPlaceholder} value={typed} maxLength={60} onChange={(event) => setTyped(event.target.value)} />
          <button type="submit" className="button button-primary" disabled={loading || typed.trim() === ""}>{rv.searchButton}</button>
        </div>
      </form>
    </Card>
    {loading && <Loading label={rv.searching} />}
    {error && <ErrorBanner error={error} onRetry={number ? again : undefined} />}
    {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    {!loading && orders !== null && orders.length === 0 && number && <EmptyState title={rv.notFound(number)} />}
    {!loading && orders !== null && orders.length > 1 && <Card title={rv.several}>
      <div className="resolver-choices">{orders.map((o) => <button key={o.globalOrderId} type="button" className={`button ${o.globalOrderId === selected ? "button-primary" : "button-secondary"}`} onClick={() => setChosen(o.globalOrderId)}>
        #{o.orderNumber} · {rv.shops[o.source] ?? o.source}</button>)}</div>
    </Card>}
    {!loading && current && <OrderCard key={current.globalOrderId + current.fingerprint} order={current} onRefresh={() => { setFeedback(null); again(); }}
      onResolved={(order, text) => { replace(order); setFeedback(text); }} onChanged={() => { setFeedback({ tone: "warning", text: rv.changed }); again(); }} />}
    {!number && <StuckList />}
  </div>;
}

function OrderCard({ order, onRefresh, onResolved, onChanged }: { order: ResolverOrder; onRefresh: () => void; onResolved: (order: ResolverOrder, feedback: Feedback) => void; onChanged: () => void }) {
  const { t, dateTime } = useI18n();
  const rv = t.resolver;
  const tone = orderTone(order);
  const problem = order.problem;
  const facts = order.facts;
  const task = facts.financeTask;
  return <Card className={`resolver-card resolver-${tone}`}>
    <div className="resolver-head">
      <div>
        <h2>#{order.orderNumber} <span className="resolver-shop">{rv.shops[order.source] ?? order.source}</span></h2>
        <p className="resolver-sub">{rv.submitted}: {dateTime(order.submittedAt)}{order.paymentMethod === "cod" ? " · COD" : order.paymentMethod ? ` · ${order.paymentMethod}` : ""}</p>
      </div>
      <button type="button" className="button button-secondary" onClick={onRefresh}>{rv.refresh}</button>
    </div>
    <ol className="resolver-steps" aria-label={rv.title}>{order.steps.map((step) => <li key={step.key} className={`resolver-step step-${step.state}`}>
      <span className="resolver-dot" aria-hidden="true" /><span className="resolver-step-name">{rv.steps[step.key] ?? step.key}</span><span className="resolver-step-state">{rv.stepStates[step.state] ?? step.state}</span>
    </li>)}</ol>
    {problem === null ? <div className="resolver-verdict resolver-verdict-ok"><strong>{rv.ok}</strong><span>{rv.okHint}</span></div>
      : <div className={`resolver-verdict resolver-verdict-${tone}`}>
        <strong>{rv.problems[problem.code] ?? problem.code}</strong>
        <dl className="resolver-where">
          <div><dt>{rv.blockedIn}</dt><dd>{rv.systems[problem.system] ?? problem.system}</dd></div>
          <div><dt>{rv.waitingFor}</dt><dd>{problem.owner ?? rv.nobody}</dd></div>
          {problem.since && <div><dt>{rv.since}</dt><dd>{dateTime(problem.since)}</dd></div>}
        </dl>
      </div>}
    {(order.fix || order.alternative) ? <div className="resolver-fixes">
      <h3>{rv.fix.title}</h3>
      {order.fix && <FixButton order={order} fix={order.fix} primary onResolved={onResolved} onChanged={onChanged} />}
      {order.alternative && <><p className="resolver-or">{rv.fix.alternative}</p><FixButton order={order} fix={order.alternative} primary={false} onResolved={onResolved} onChanged={onChanged} /></>}
    </div> : problem !== null && <p className="resolver-nofix">{rv.fix.none}</p>}
    {order.flow === "confirmare" && <details className="resolver-facts">
      <summary>{rv.facts.title}</summary>
      <dl>
        <div><dt>{rv.facts.operator}</dt><dd>{facts.assignee ?? rv.facts.none}</dd></div>
        <div><dt>{rv.facts.money}</dt><dd>{facts.money ? rv.moneyStates[facts.money] ?? facts.money : rv.facts.none}</dd></div>
        {facts.outstanding && <div><dt>{rv.facts.outstanding}</dt><dd>{facts.outstanding} {facts.currency ?? "RON"}</dd></div>}
        <div><dt>{rv.facts.proforma}</dt><dd>{facts.proforma ? `${facts.proforma.series ?? ""} ${facts.proforma.number ?? ""}`.trim() : rv.facts.none}</dd></div>
        {facts.paymentReference && <div><dt>{rv.facts.paymentReference}</dt><dd>{facts.paymentReference}</dd></div>}
        <div><dt>{rv.facts.financeTask}</dt><dd>{task ? `${rv.financeStates[task.state] ?? task.state}${task.assignee ? ` · ${task.assignee}` : ""}${task.since ? ` · ${dateTime(task.since)}` : ""}` : rv.financeStates.never_sent}</dd></div>
        <div><dt>{rv.facts.shopEmployee}</dt><dd>{facts.shopEmployee ?? rv.facts.none}</dd></div>
        <div><dt>{rv.facts.stage}</dt><dd>{order.stage.name ?? order.stage.id}</dd></div>
      </dl>
    </details>}
  </Card>;
}

function FixButton({ order, fix, primary, onResolved, onChanged }: { order: ResolverOrder; fix: ResolverFix; primary: boolean; onResolved: (order: ResolverOrder, feedback: Feedback) => void; onChanged: () => void }) {
  const { api } = useDashboard();
  const { t, problem: wordProblem } = useI18n();
  const rv = t.resolver;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [declared, setDeclared] = useState(false);
  const [statement, setStatement] = useState({ amount: fix.defaults?.amount ?? "", reference: "", valueDate: fix.defaults?.valueDate ?? new Date().toISOString().slice(0, 10), overpayment: false, checked: false });
  const key = useRef<string | null>(null);
  const withStatement = needsStatement(fix);
  const amount = normalizeAmount(statement.amount);
  const over = exceedsOutstanding(amount, order.facts.outstanding);
  const statementProblem = !withStatement ? null
    : amount === null ? rv.statement.invalidAmount
      : !validReference(statement.reference) ? rv.statement.invalidReference
        : !validValueDate(statement.valueDate) ? rv.statement.invalidDate
          : over && !statement.overpayment ? rv.statement.overpaymentRequired
            : !statement.checked ? rv.statement.checkedRequired : null;
  const blocked = (fix.confirm === "customer_confirmed" && !declared) || statementProblem !== null;

  async function press() {
    if (busy || blocked) return;
    key.current ??= newIdempotencyKey();
    setBusy(true); setFailure(null);
    try {
      const fields = withStatement ? { amount, reference: statement.reference.trim(), valueDate: statement.valueDate, overpayment: over && statement.overpayment, statementChecked: statement.checked } : undefined;
      const result = await api.resolve(order.globalOrderId, { action: fix.action, fingerprint: order.fingerprint, ...(fields ? { fields } : {}) }, key.current);
      key.current = null;
      setOpen(false);
      onResolved(result.order, result.outcome === "unknown" || result.outcome === "recorded" ? { tone: "warning", text: rv.outcomeUnknown } : { tone: "success", text: rv.done });
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "";
      if (caught instanceof ApiError && caught.status < 500) key.current = null;
      if (code === "RESOLVER_CHANGED") {
        setOpen(false);
        onChanged();
        return;
      }
      setFailure(`${rv.errors[code] ?? wordProblem(caught)}${code ? ` (${code})` : ""}`);
    } finally { setBusy(false); }
  }

  return <div className={`resolver-fix ${primary ? "resolver-fix-primary" : ""}`}>
    <button type="button" className={`button ${primary ? "button-primary button-large" : "button-secondary"}`} onClick={() => { setFailure(null); setOpen(true); }}>
      {rv.fix.actions[fix.action] ?? fix.action}{fix.target ? ` ${rv.fix.to} ${fix.target}` : ""}
    </button>
    <small>{rv.fix.explain[fix.action] ?? ""}</small>
    {open && <ConfirmDialog title={rv.confirm.title} confirmLabel={rv.confirm.yes} busy={busy} confirmDisabled={blocked} onConfirm={press} onCancel={() => { if (!busy) setOpen(false); }}>
      <p><strong>#{order.orderNumber}</strong> · {rv.fix.actions[fix.action] ?? fix.action}{fix.target ? ` ${rv.fix.to} ${fix.target}` : ""}</p>
      <p>{rv.fix.explain[fix.action] ?? ""}</p>
      {fix.confirm === "customer_confirmed" && <label className="check-field"><input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} /> {rv.confirm.customer}</label>}
      {withStatement && <fieldset className="resolver-statement">
        <legend>{rv.statement.title}</legend>
        <div className="form-grid">
          <Field label={rv.statement.amount}>{(id) => <input id={id} inputMode="decimal" value={statement.amount} onChange={(e) => setStatement((s) => ({ ...s, amount: e.target.value }))} />}</Field>
          <Field label={rv.statement.valueDate}>{(id) => <input id={id} type="date" value={statement.valueDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStatement((s) => ({ ...s, valueDate: e.target.value }))} />}</Field>
          <Field label={rv.statement.reference}>{(id) => <input id={id} maxLength={64} autoComplete="off" value={statement.reference} onChange={(e) => setStatement((s) => ({ ...s, reference: e.target.value }))} />}</Field>
        </div>
        {over && <label className="check-field"><input type="checkbox" checked={statement.overpayment} onChange={(e) => setStatement((s) => ({ ...s, overpayment: e.target.checked }))} /> {rv.statement.overpayment}</label>}
        <label className="check-field"><input type="checkbox" checked={statement.checked} onChange={(e) => setStatement((s) => ({ ...s, checked: e.target.checked }))} /> {rv.statement.checked}</label>
        {statementProblem && <p className="field-hint">{statementProblem}</p>}
      </fieldset>}
      <p className="resolver-audited">{rv.confirm.audited}</p>
      {failure && <p className="form-error" role="alert">{failure}</p>}
    </ConfirmDialog>}
  </div>;
}

function StuckList() {
  const { api, navigate } = useDashboard();
  const { t, dateTime } = useI18n();
  const rv = t.resolver;
  const [data, setData] = useState<ResolverStuck | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.resolverStuck(controller.signal).then((value) => { if (!controller.signal.aborted) { setData(value); setError(null); } }, (caught: unknown) => { if (!controller.signal.aborted) setError(toProblem(caught)); });
    return () => controller.abort();
  }, [api, tick]);
  const shown = data?.items.slice(0, 100) ?? [];
  return <Card title={rv.stuck.title}>
    {error && <ErrorBanner error={error} onRetry={() => setTick((v) => v + 1)} />}
    {!data && !error && <Loading />}
    {data && (data.items.length === 0 ? <EmptyState title={rv.stuck.empty} /> : <div className="table-scroll"><table className="table resolver-table">
      <thead><tr><th>{rv.stuck.columns.order}</th><th>{rv.stuck.columns.shop}</th><th>{rv.stuck.columns.why}</th><th>{rv.stuck.columns.assignee}</th><th>{rv.stuck.columns.updated}</th><th /></tr></thead>
      <tbody>{shown.map((item) => <tr key={item.globalOrderId}>
        <td><strong>#{item.orderNumber}</strong></td>
        <td>{rv.shops[item.source] ?? item.source}</td>
        <td>{item.blockers.filter((b) => b !== "no_supervisor").map((b) => rv.blockers[b] ?? b).join(", ")}</td>
        <td>{item.assignee ?? "—"}</td>
        <td>{dateTime(item.updatedAt)}</td>
        <td><button type="button" className="button button-secondary" onClick={() => navigate(resolverPath(item.source === "outletperdele" ? `outletperdele:${item.orderNumber}` : item.orderNumber))}>{rv.stuck.open}</button></td>
      </tr>)}</tbody>
    </table>{data.items.length > shown.length && <p className="resolver-more">{rv.stuck.more(data.items.length - shown.length)}</p>}</div>)}
  </Card>;
}
