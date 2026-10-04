import { useCallback } from "react";
import type { OrderDetail, OrderItem } from "../api/types";
import { useDashboard } from "../app/context";
import { usePolling } from "../app/usePolling";
import { Card, ErrorBanner, Loading, PageHeader, RefreshBar } from "../components/ui";
import { useI18n } from "../i18n/context";
import { CommerceChip, OwnerName, ProductionStateBadge, StageChip, TimeInStage } from "./orderParts";

const STAGE_COUNT = 14;

export function OrderDetailPage({ id }: { id: string }) {
  const { can, navigate } = useDashboard();
  const { t } = useI18n();
  if (!can("orders.view_all")) return <PageHeader title={t.orders.title} description={t.orders.noPermission} />;
  return <OrderDetailWorkspace id={id} onBack={() => navigate("/comenzi")} />;
}

function OrderDetailWorkspace({ id, onBack }: { id: string; onBack: () => void }) {
  const { api } = useDashboard();
  const load = useCallback((signal: AbortSignal) => api.order(id, signal), [api, id]);
  const polling = usePolling(load, id);
  return <OrderDetailView {...polling} onBack={onBack} />;
}

export type OrderDetailViewProps = { data: OrderDetail | null; error: unknown; updatedAt: number | null; refreshing: boolean; refresh: () => void; onBack: () => void };

export function OrderDetailView({ data, error, updatedAt, refreshing, refresh, onBack }: OrderDetailViewProps) {
  const { t } = useI18n();
  const o = t.orders;
  return (
    <div className="page order-detail">
      <button type="button" className="back-link" onClick={onBack}>{o.back}</button>
      {error !== null && data && <div className="notice notice-warning" role="status">{o.refreshFailed}</div>}
      {error !== null && !data && <ErrorBanner error={error} onRetry={refresh} />}
      {!data && error === null && <Loading label={o.loading} />}
      {data && <OrderDetailContent data={data} referenceTime={updatedAt ?? Date.parse(data.importedAt)} toolbar={<RefreshBar updatedAt={updatedAt} refreshing={refreshing} hasData onRefresh={refresh} />} />}
    </div>
  );
}

export function OrderDetailContent({ data, referenceTime, toolbar }: { data: OrderDetail; referenceTime: number; toolbar?: React.ReactNode }) {
  const { t, dateTime } = useI18n();
  const o = t.orders;
  const { commerce, production } = data;
  return (
    <>
      <PageHeader title={`${o.order} ${data.orderNumber}`} description={`${data.source.name} · ${data.globalOrderId}`} actions={toolbar} />
      <p className="muted small read-only-note">{o.readOnly}</p>
      <div className="grid-2 order-states">
        <section className="card state-card state-commerce" data-section="commerce">
          <div className="card-header"><div><h2>{o.commerceTitle}</h2><p>{o.commerceHint}</p></div></div>
          <dl className="facts">
            <dt>{o.commerceStatus}</dt><dd><CommerceChip status={commerce.status} /></dd>
            <dt>{o.availability}</dt><dd>{commerce.availability === "cancelled" ? o.availabilityCancelled : o.availabilityActive}</dd>
            <dt>{o.acceptedAt}</dt><dd>{dateTime(data.acceptedAt)}</dd>
            <dt>{o.sourceChangedAt}</dt><dd>{dateTime(commerce.sourceChangedAt)}</dd>
            <dt>{o.lastSourceSeenAt}</dt><dd>{dateTime(commerce.lastSourceSeenAt)}</dd>
          </dl>
        </section>
        <section className="card state-card state-production" data-section="production">
          <div className="card-header"><div><h2>{o.productionTitle}</h2><p>{o.productionHint}</p></div><ProductionStateBadge state={production.state} /></div>
          <StageProgress ordinal={production.stage.ordinal} state={production.state} />
          <dl className="facts">
            <dt>{o.stage}</dt><dd><StageChip stage={production.stage} /> <span className="muted small">{o.stageProgress(String(production.stage.ordinal))}</span></dd>
            <dt>{o.owner}</dt><dd><OwnerName owner={production.owner} /></dd>
            {production.claimedAt && <><dt>{o.claimedAt}</dt><dd>{dateTime(production.claimedAt)}</dd></>}
            <dt>{o.stageEnteredAt}</dt><dd>{dateTime(production.stageEnteredAt)}</dd>
            <dt>{o.timeInStage}</dt><dd><TimeInStage order={data} referenceTime={referenceTime} /></dd>
            <dt>{o.changedAt}</dt><dd>{dateTime(production.changedAt)}</dd>
            <dt>{o.completedAt}</dt><dd>{production.completedAt ? dateTime(production.completedAt) : <span className="muted">{o.notCompleted}</span>}</dd>
            <dt>{o.arasyaImportedAt}</dt><dd>{dateTime(data.importedAt)}</dd>
          </dl>
          {production.completedAt && <p className="muted small">{o.completionNote}</p>}
        </section>
      </div>
      <Items items={data.items} notes={production.notes} />
      <Timeline data={data} />
    </>
  );
}

function StageProgress({ ordinal, state }: { ordinal: number; state: OrderDetail["production"]["state"] }) {
  const { t } = useI18n();
  const done = state === "completed" ? STAGE_COUNT : ordinal - 1;
  return (
    <ol className="stage-progress" aria-label={t.orders.stageProgress(String(ordinal))}>
      {Array.from({ length: STAGE_COUNT }, (_, index) => (
        <li key={index} className={index < done ? "is-done" : index === ordinal - 1 && state === "active" ? "is-current" : ""} />
      ))}
    </ol>
  );
}

function Items({ items, notes }: { items: OrderItem[]; notes: string | null }) {
  const { t, number } = useI18n();
  const o = t.orders;
  const measure = (value: number | null, unit: string | null) => (value === null ? "—" : `${number(value)}${unit ? ` ${unit}` : ""}`);
  return (
    <Card title={o.items}>
      {items.length === 0 ? <p className="muted">{o.noItems}</p> : (
        <div className="table-scroll">
          <table className="data-table compact-table items-table">
            <thead><tr><th>{o.product}</th><th>{o.sku}</th><th>{o.variant}</th><th>{o.color}</th><th>{o.width}</th><th>{o.height}</th><th>{o.meters}</th><th>{o.quantity}</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.line} data-item={item.line}>
                  <td data-label={o.product}><strong>{item.name}</strong></td>
                  <td data-label={o.sku} className="mono">{item.sku ?? "—"}</td>
                  <td data-label={o.variant}>{item.variant ?? "—"}</td>
                  <td data-label={o.color}>{item.color ?? "—"}</td>
                  <td data-label={o.width}>{measure(item.width, item.unit)}</td>
                  <td data-label={o.height}>{measure(item.height, item.unit)}</td>
                  <td data-label={o.meters}>{item.meters === null ? "—" : `${number(item.meters)} m`}</td>
                  <td data-label={o.quantity}>{number(item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notes && <div className="production-notes"><h3>{o.notes}</h3><p>{notes}</p></div>}
    </Card>
  );
}

function Timeline({ data }: { data: OrderDetail }) {
  const { t, dateTime, stage: stageName, productionAction } = useI18n();
  const o = t.orders;
  return (
    <Card title={o.timeline} description={o.timelineHint}>
      {data.activity === null ? <p className="muted">{o.timelineNeedsPermission}</p> : (
        <ol className="timeline">
          <li data-event="imported">
            <time dateTime={data.importedAt}>{dateTime(data.importedAt)}</time>
            <div><strong>{o.timelineImported}</strong><span className="muted small">{data.source.name}</span></div>
          </li>
          {data.activity.map((event) => (
            <li key={event.id} data-event={event.action}>
              <time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
              <div>
                <strong>{productionAction(event.action)}</strong>
                <span>{event.employee.displayName}</span>
                <span className="muted small">
                  {o.from}: {stageName(event.fromStage.id, event.fromStage.label)}
                  {event.toStage && <> → {o.to}: {stageName(event.toStage.id, event.toStage.label)}</>}
                </span>
              </div>
            </li>
          ))}
          {data.activity.length === 0 && <li className="muted">{o.timelineEmpty}</li>}
        </ol>
      )}
      {data.activityTruncated && <p className="muted small">{o.timelineTruncated}</p>}
    </Card>
  );
}
