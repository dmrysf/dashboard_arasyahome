import { useCallback, useState } from "react";
import type { ProductionOverview as Overview, SourceHealth } from "../api/types";
import { useDashboard } from "../app/context";
import { orderPath } from "../app/router";
import { usePolling } from "../app/usePolling";
import { Badge, ErrorBanner, Loading, RefreshBar } from "../components/ui";
import { useI18n } from "../i18n/context";

const HEALTH_TONE: Record<SourceHealth, "success" | "warning" | "neutral"> = {
  healthy: "success", stale: "warning", offline: "warning", no_contact: "warning", not_configured: "neutral", disabled: "neutral",
};

/**
 * Read-only production snapshot. Every number comes from GET /management/production-overview; this
 * component only lays it out. It offers no production action (claim, advance, handover).
 */
export function ProductionOverview() {
  const { api } = useDashboard();
  const [source, setSource] = useState("");
  const [sourceOptions, setSourceOptions] = useState<Array<{ key: string; name: string }>>([]);
  const load = useCallback((signal: AbortSignal) => api.productionOverview(source || undefined, signal).then((result) => {
    if (result.sources) setSourceOptions(result.sources.map(({ key, name }) => ({ key, name })));
    return result;
  }), [api, source]);
  const polling = usePolling(load, source);
  return <ProductionPanel {...polling} source={source} sourceOptions={sourceOptions} onSource={setSource} />;
}

export type ProductionPanelProps = {
  data: Overview | null;
  error: unknown;
  updatedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
  source: string;
  sourceOptions: Array<{ key: string; name: string }>;
  onSource: (source: string) => void;
};

/** Presentation of one polling state: first load, data, a failed first load, or stale data after a failed refresh. */
export function ProductionPanel({ data, error, updatedAt, refreshing, refresh, source, sourceOptions, onSource }: ProductionPanelProps) {
  const { t } = useI18n();
  const p = t.production;
  return (
    <section className="production stack" aria-labelledby="production-title">
      <div className="section-head">
        <div>
          <h2 id="production-title">{p.title}</h2>
          <p>{p.description}</p>
        </div>
        <div className="section-tools">
          {sourceOptions.length > 0 && (
            <label className="inline-select">
              <span>{p.source}</span>
              <select value={source} onChange={(event) => onSource(event.target.value)}>
                <option value="">{p.allSources}</option>
                {sourceOptions.map((option) => <option key={option.key} value={option.key}>{option.name}</option>)}
              </select>
            </label>
          )}
          <RefreshBar updatedAt={updatedAt} refreshing={refreshing} hasData={data !== null} onRefresh={refresh} />
        </div>
      </div>
      {error !== null && data && <div className="notice notice-warning" role="status">{p.refreshFailed}</div>}
      {error !== null && !data && <div className="stack"><p className="muted">{p.loadFailed}</p><ErrorBanner error={error} onRetry={refresh} /></div>}
      {!data && error === null && <Loading label={p.loading} />}
      {data && <ProductionContent data={data} />}
    </section>
  );
}

function ProductionContent({ data }: { data: Overview }) {
  const { t, number } = useI18n();
  const p = t.production;
  const metrics = [
    ["active", p.active, p.activeHint, data.summary.active],
    ["waiting", p.waiting, p.waitingHint, data.summary.waiting],
    ["inWork", p.inWork, p.inWorkHint, data.summary.inWork],
    ["unassigned", p.unassigned, p.unassignedHint, data.summary.unassigned],
    ["completedToday", p.completedToday, p.completedTodayHint, data.summary.completedToday],
  ] as const;
  return (
    <>
      <div className="metric-grid" role="list" aria-label={p.summaryLabel}>
        {metrics.map(([key, label, hint, value]) => (
          <div className="metric metric-static" role="listitem" key={key} data-metric={key}><span>{label}</span><strong>{number(value)}</strong><small>{hint}</small></div>
        ))}
      </div>
      <Pipeline data={data} />
      <div className="grid-2 production-detail">
        <OldestOrders data={data} />
        <Activity data={data} />
      </div>
      <Sources data={data} />
    </>
  );
}

function Pipeline({ data }: { data: Overview }) {
  const { t, number, stage: stageName, duration } = useI18n();
  const p = t.production;
  const generatedAt = Date.parse(data.generatedAt);
  const peak = Math.max(0, ...data.stages.map((stage) => stage.active));
  return (
    <section className="card">
      <div className="card-header"><div><h2>{p.pipeline}</h2><p>{p.pipelineHint}</p></div></div>
      {data.summary.active === 0 && <p className="muted">{p.noActive}</p>}
      <ol className="pipeline">
        {data.stages.map((stage) => {
          const busiest = peak > 0 && stage.active === peak;
          return (
            <li key={stage.id} data-stage={stage.id} className={["pipeline-stage", stage.active === 0 && "is-empty", busiest && "is-peak"].filter(Boolean).join(" ")}>
              <div className="pipeline-head"><span className="ordinal">{stage.ordinal}</span><span className="pipeline-label">{stageName(stage.id, stage.label)}</span></div>
              <strong className="pipeline-count" aria-label={p.stageOrders(number(stage.active))}>{number(stage.active)}</strong>
              <span className="pipeline-bar" aria-hidden="true"><span style={{ width: peak > 0 ? `${(stage.active / peak) * 100}%` : "0%" }} /></span>
              {stage.active > 0 && <span className="pipeline-meta">{p.stageUnassigned(number(stage.unassigned))}</span>}
              {stage.oldestEnteredAt && <span className="pipeline-meta">{p.stageOldest(duration(generatedAt - Date.parse(stage.oldestEnteredAt)))}</span>}
              {busiest && <span className="pipeline-flag">{p.busiest}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function OldestOrders({ data }: { data: Overview }) {
  const { navigate } = useDashboard();
  const { t, dateTime, duration, stage: stageName } = useI18n();
  const p = t.production;
  const generatedAt = Date.parse(data.generatedAt);
  return (
    <section className="card">
      <div className="card-header"><div><h2>{p.oldest}</h2><p>{p.oldestHint}</p></div>
        {data.oldestOrders !== null && <a className="button button-ghost" href="/comenzi" onClick={(event) => { event.preventDefault(); navigate("/comenzi"); }}>{t.orders.seeAll}</a>}</div>
      {data.oldestOrders === null ? <p className="muted">{p.oldestNeedsPermission}</p>
        : data.oldestOrders.length === 0 ? <p className="muted">{p.noActive}</p>
          : (
            <div className="table-scroll">
              <table className="data-table compact-table">
                <thead><tr><th>{p.order}</th><th>{p.stage}</th><th>{p.timeInStage}</th><th>{p.owner}</th><th>{p.commerceStatus}</th></tr></thead>
                <tbody>
                  {data.oldestOrders.map((order) => (
                    <tr key={order.globalOrderId} data-order={order.orderNumber}>
                      <td data-label={p.order}><a className="mono order-link" href={orderPath(order.globalOrderId)} onClick={(event) => { event.preventDefault(); navigate(orderPath(order.globalOrderId)); }}>{order.orderNumber}</a><small className="cell-sub">{order.source.name}</small></td>
                      <td data-label={p.stage}>{stageName(order.stage.id, order.stage.label)}</td>
                      <td data-label={p.timeInStage}><span>{duration(generatedAt - Date.parse(order.stageEnteredAt))}</span><small className="cell-sub" title={p.enteredAt}>{dateTime(order.stageEnteredAt)}</small></td>
                      <td data-label={p.owner}>{order.owner ? order.owner.displayName : <span className="muted">{p.noOwner}</span>}</td>
                      <td data-label={p.commerceStatus}>{order.commerceStatus ? (order.commerceStatus.label ?? order.commerceStatus.code) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </section>
  );
}

function Activity({ data }: { data: Overview }) {
  const { t, dateTime, stage: stageName, productionAction } = useI18n();
  const p = t.production;
  return (
    <section className="card">
      <div className="card-header"><div><h2>{p.activity}</h2><p>{p.activityHint}</p></div></div>
      {data.activity === null ? <p className="muted">{p.activityNeedsPermission}</p>
        : data.activity.length === 0 ? <p className="muted">{p.noActivity}</p>
          : (
            <ul className="activity-list">
              {data.activity.map((event) => (
                <li key={event.id} data-action={event.action}>
                  <div className="audit-main">
                    <strong>{event.employee.displayName}</strong>
                    <span>{productionAction(event.action)} <strong className="mono">{event.order.orderNumber}</strong> · {stageName(event.fromStage.id, event.fromStage.label)}</span>
                    {event.toStage && <span className="muted small">{p.handedTo(stageName(event.toStage.id, event.toStage.label))}</span>}
                  </div>
                  <div className="audit-meta"><span>{dateTime(event.occurredAt)}</span></div>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}

function Sources({ data }: { data: Overview }) {
  const { t, dateTime, number, sourceHealth, sourceHealthHint } = useI18n();
  const p = t.production;
  return (
    <section className="card">
      <div className="card-header"><div><h2>{p.sources}</h2><p>{p.sourcesHint}</p></div></div>
      {data.sources === null ? <p className="muted">{p.sourcesNeedPermission}</p> : (
        <ul className="source-list">
          {data.sources.map((source) => (
            <li key={source.key} data-source={source.key} data-health={source.health}>
              <div className="source-name"><strong>{source.name}</strong><span className="muted small">{p.sourceActive(number(source.activeOrders))}</span></div>
              <div className="source-state">
                <Badge tone={HEALTH_TONE[source.health] ?? "neutral"}>{sourceHealth(source.health)}</Badge>
                <span className="muted small">{sourceHealthHint(source.health)}</span>
                <span className="muted small">{p.lastContact}: {source.lastContactAt ? dateTime(source.lastContactAt) : p.never}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
