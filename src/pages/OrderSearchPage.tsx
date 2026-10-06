import { useCallback, useState } from "react";
import type { LookupDetail, LookupMatch } from "../api/types";
import { useDashboard } from "../app/context";
import { Badge, Card, EmptyState, ErrorBanner, ErrorText, Field, Loading, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";
import { meters } from "./ApprovalsPage";
import { useLoaderWithSignal } from "./useLoaderWithSignal";

/** Exact order search: one typed number, exact matches only, never a list of orders. */
export function OrderSearchPage() {
  const { api, me, navigate } = useDashboard();
  const { t, stage } = useI18n();
  const l = t.lookup;
  const [number, setNumber] = useState("");
  const [result, setResult] = useState<LookupMatch[] | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me.capabilities?.lookupOrders) return <PageHeader title={l.title} description={t.exceptions.noAccess} />;
  async function search() {
    if (!number.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const found = (await api.lookupOrders(number.trim())).items;
      if (found.length === 1) navigate(`/cauta-comanda/${encodeURIComponent(found[0].id)}`);
      else setResult(found);
    } catch (caught) { setError(toProblem(caught)); setResult(null); }
    finally { setBusy(false); }
  }
  return (
    <div className="page lookup-page">
      <PageHeader title={l.title} description={l.hint} />
      <Card>
        <form className="lookup-form" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <Field label={l.label}>{(id) => <input id={id} autoComplete="off" spellCheck={false} maxLength={128} value={number} onChange={(event) => setNumber(event.target.value)} />}</Field>
          <button type="submit" className="button button-primary" disabled={busy || !number.trim()}>{l.submit}</button>
        </form>
        {error && <ErrorText error={error} />}
      </Card>
      {result && result.length === 0 && <EmptyState title={l.none} />}
      {result && result.length > 1 && <Card title={l.several}><ul className="lookup-matches">{result.map((match) => <li key={match.id}>
        <button type="button" className="exception-item" onClick={() => navigate(`/cauta-comanda/${encodeURIComponent(match.id)}`)}>
          <span className="exception-main"><strong>{match.orderNumber}</strong><small>{match.sourceName}</small></span>
          <span>{stage(match.stage.id, match.stage.label)}</span>
          {match.blockedByException && <Badge tone="warning">{l.blocked}</Badge>}
        </button></li>)}</ul></Card>}
    </div>
  );
}

export function OrderLookupDetailPage({ id }: { id: string }) {
  const { api, me, navigate } = useDashboard();
  const { t, stage, dateTime } = useI18n();
  const l = t.lookup;
  const x = t.exceptions;
  const load = useCallback((signal: AbortSignal) => api.lookupOrder(id, signal), [api, id]);
  const { data, error, reload } = useLoaderWithSignal<LookupDetail>(load, id);
  if (!me.capabilities?.lookupOrders) return <PageHeader title={l.title} description={x.noAccess} />;
  if (error && !data) return <div className="page"><button type="button" className="back-link" onClick={() => navigate("/cauta-comanda")}>{l.back}</button><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const o = data.order;
  return (
    <div className="page lookup-detail">
      <button type="button" className="back-link" onClick={() => navigate("/cauta-comanda")}>{l.back}</button>
      <PageHeader title={`${x.order} ${o.orderNumber}`} description={`${o.sourceName} · ${o.id}`} actions={<>
        {o.openExceptionId && <Badge tone="warning">{l.blocked}</Badge>}
        {o.completed && <Badge tone="success">{l.completed}</Badge>}
        {o.unavailable && <Badge tone="danger">{l.unavailable}</Badge>}
        {o.repeatedErrors && <Badge tone="danger">{x.repeated}</Badge>}
      </>} />
      <div className="grid-2">
        <Card title={l.stage}>
          <dl className="facts">
            <dt>{l.stage}</dt><dd>{o.stage.ordinal}. {stage(o.stage.id, o.stage.label)}</dd>
            <dt>{l.owner}</dt><dd>{o.owner ? `${o.owner.displayName}${o.owner.department ? ` · ${o.owner.department}` : ""}` : l.noOwner}</dd>
            {o.owner?.since && <><dt>{x.waitingSince}</dt><dd>{dateTime(o.owner.since)}</dd></>}
            <dt>{x.arrival(o.arrivalNumber)}</dt><dd>{l.reworkCycles(o.reworkCycles)}</dd>
          </dl>
          {o.openExceptionId && <button type="button" className="button button-secondary" onClick={() => navigate(`/aprobari/cerere/${o.openExceptionId}`)}>{x.open}</button>}
        </Card>
        <Card title={l.items}>
          <table className="table compact-table"><thead><tr><th>#</th><th>{l.items}</th><th className="num">{l.meters}</th><th className="num">{l.quantity}</th></tr></thead><tbody>
            {o.items.map((item) => <tr key={item.id}><td>{item.lineNumber}</td><td><strong>{item.name}</strong><br /><small className="muted">{[item.code, item.color, item.variant].filter(Boolean).join(" · ")}</small></td><td className="num">{item.meters ? meters(item.meters) : "—"}</td><td className="num">{item.quantity}</td></tr>)}
          </tbody></table>
        </Card>
      </div>
      <Card title={l.exceptions}>
        {data.exceptions.length === 0 ? <p className="muted">{l.noExceptions}</p> : <ul className="history-list">{data.exceptions.map((item) => <li key={item.id}>
          <button type="button" className="link-button" onClick={() => navigate(`/aprobari/cerere/${item.id}`)}>{item.number} · {item.reason.label} · {meters(item.faultMeters)} · {x.responsible}: {item.responsible.displayName}</button>
          <Badge tone={item.status === "approved" ? "success" : "neutral"}>{x.status[item.status]}</Badge></li>)}</ul>}
      </Card>
    </div>
  );
}
