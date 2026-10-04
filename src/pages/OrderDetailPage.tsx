import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { EligibleOwners, OrderDetail, OrderItem } from "../api/types";
import { useDashboard } from "../app/context";
import { usePolling } from "../app/usePolling";
import { Card, ConfirmDialog, ErrorBanner, ErrorText, Loading, Notice, PageHeader, RefreshBar } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";
import { AttentionBadge, CommerceChip, OwnerName, ProductionStateBadge, StageChip, TimeInStage } from "./orderParts";

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
      {data && <OrderDetailContent data={data} referenceTime={updatedAt ?? Date.parse(data.importedAt)} onChanged={refresh} toolbar={<RefreshBar updatedAt={updatedAt} refreshing={refreshing} hasData onRefresh={refresh} />} />}
    </div>
  );
}

export function OrderDetailContent({ data, referenceTime, toolbar, onChanged }: { data: OrderDetail; referenceTime: number; toolbar?: React.ReactNode; onChanged?: () => void }) {
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
            <dt>{o.owner}</dt><dd><OwnerName owner={production.owner} /> <AttentionBadge attention={production.attention} /></dd>
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
      <ProductionControl data={data} onChanged={onChanged} />
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
                {event.action === "owner_reassigned" && <span data-owner-change="">{o.ownerChange(event.previousOwner?.displayName ?? o.nobody, event.newOwner?.displayName ?? o.nobody)}</span>}
                {event.action === "owner_released" && <span data-owner-change="">{o.ownerReleased(event.previousOwner?.displayName ?? o.nobody)}</span>}
                <span className="muted small">
                  {event.toStage || event.action === "claimed" ? <>{o.from}: {stageName(event.fromStage.id, event.fromStage.label)}</> : <>{o.stage}: {stageName(event.fromStage.id, event.fromStage.label)}</>}
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

type ControlNotice = { kind: "reassigned"; name: string } | { kind: "released" } | { kind: "conflict" };

/**
 * Production Control V2: supervisor interventions on the current production owner only. There is no stage
 * control here by design; the stage moves only through Staff. The server re-checks permission, eligibility,
 * authority and the production version on every submission; hiding buttons is a convenience, not security.
 */
export function ProductionControl({ data, onChanged }: { data: OrderDetail; onChanged?: () => void }) {
  const { api } = useDashboard();
  const { t, dateTime, stage: stageName } = useI18n();
  const o = t.orders;
  const c = o.control;
  const { production } = data;
  const control = production.control;
  const [dialog, setDialog] = useState<"reassign" | "release" | null>(null);
  const [notice, setNotice] = useState<ControlNotice | null>(null);
  const canAct = control.canManageOwner && control.blockedReason === null && production.state === "active";
  const finish = (next: ControlNotice) => { setDialog(null); setNotice(next); onChanged?.(); };
  return (
    <section className="card control-card" data-section="control">
      <div className="card-header"><div><h2>{c.title}</h2><p>{c.hint}</p></div></div>
      {notice && <Notice tone={notice.kind === "conflict" ? "warning" : "success"}>{notice.kind === "reassigned" ? c.reassigned(notice.name) : notice.kind === "released" ? c.released : c.conflict}</Notice>}
      <dl className="facts">
        <dt>{o.stage}</dt><dd><StageChip stage={production.stage} /></dd>
        <dt>{o.owner}</dt><dd><OwnerName owner={production.owner} /> <AttentionBadge attention={production.attention} /></dd>
        {production.claimedAt && <><dt>{o.claimedAt}</dt><dd>{dateTime(production.claimedAt)}</dd></>}
        <dt>{o.state}</dt><dd><ProductionStateBadge state={production.state} /> <span className="muted small">{c.version} {production.version}</span></dd>
        <dt>{c.intervention}</dt><dd data-intervention={control.blockedReason ?? (control.canManageOwner ? "allowed" : "no_permission")}>
          {control.blockedReason ? (c.blocked[control.blockedReason] ?? control.blockedReason) : control.canManageOwner ? c.allowed : <span className="muted">{c.noPermission}</span>}
        </dd>
      </dl>
      {canAct && (
        <div className="button-row control-actions">
          <button type="button" className="button button-secondary" onClick={() => { setNotice(null); setDialog("reassign"); }}>{production.owner ? c.reassign : c.assign}</button>
          {production.owner && <button type="button" className="button button-ghost" onClick={() => { setNotice(null); setDialog("release"); }}>{c.release}</button>}
        </div>
      )}
      {dialog === "reassign" && <ReassignDialog data={data} onDone={finish} onCancel={() => setDialog(null)} load={(signal) => api.eligibleOwners(data.globalOrderId, signal)}
        submit={(employeeId, version, key) => api.reassignOwner(data.globalOrderId, employeeId, version, key)} />}
      {dialog === "release" && <ReleaseDialog data={data} onDone={finish} onCancel={() => setDialog(null)} stageLabel={stageName(production.stage.id, production.stage.label)}
        submit={(version, key) => api.releaseOwner(data.globalOrderId, version, key)} />}
    </section>
  );
}

function ReleaseDialog({ data, stageLabel, submit, onDone, onCancel }: {
  data: OrderDetail; stageLabel: string; submit: (version: number, key: string) => Promise<unknown>; onDone: (notice: ControlNotice) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const c = t.orders.control;
  const [key] = useState(newIdempotencyKey);
  const [version] = useState(data.production.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const confirm = async () => {
    setBusy(true); setError(null);
    try { await submit(version, key); onDone({ kind: "released" }); }
    catch (caught) {
      if (caught instanceof ApiError && caught.code === "ORDER_CHANGED") onDone({ kind: "conflict" });
      else setError(toProblem(caught));
    } finally { setBusy(false); }
  };
  return (
    <ConfirmDialog title={c.releaseTitle} confirmLabel={c.confirmRelease} busy={busy} onConfirm={() => { void confirm(); }} onCancel={onCancel}>
      <p>{c.releaseBody}</p>
      <dl className="facts owner-summary">
        <dt>{c.currentOwner}</dt><dd><strong>{data.production.owner?.displayName ?? t.orders.noOwner}</strong></dd>
        <dt>{c.currentStage}</dt><dd>{stageLabel}</dd>
      </dl>
      <p className="muted small">{c.warning}</p>
      {error && <ErrorText error={error} />}
    </ConfirmDialog>
  );
}

function ReassignDialog({ data, load, submit, onDone, onCancel }: {
  data: OrderDetail;
  load: (signal: AbortSignal) => Promise<EligibleOwners>;
  submit: (employeeId: string, version: number, key: string) => Promise<unknown>;
  onDone: (notice: ControlNotice) => void;
  onCancel: () => void;
}) {
  const [key] = useState(newIdempotencyKey);
  const [version] = useState(data.production.version);
  const [eligible, setEligible] = useState<EligibleOwners | null>(null);
  const [loadError, setLoadError] = useState<Problem | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(setEligible, (caught: unknown) => { if (!controller.signal.aborted) setLoadError(toProblem(caught)); });
    return () => controller.abort();
  }, [load]);
  const confirm = async () => {
    const candidate = eligible?.items.find((item) => item.id === selected);
    if (!candidate) return;
    setBusy(true); setError(null);
    try { await submit(candidate.id, version, key); onDone({ kind: "reassigned", name: candidate.displayName }); }
    catch (caught) {
      if (caught instanceof ApiError && caught.code === "ORDER_CHANGED") onDone({ kind: "conflict" });
      else setError(toProblem(caught));
    } finally { setBusy(false); }
  };
  return <ReassignDialogView data={data} eligible={eligible} loadError={loadError} selected={selected} busy={busy} error={error}
    onSelect={setSelected} onConfirm={() => { void confirm(); }} onCancel={onCancel} />;
}

export type ReassignDialogViewProps = {
  data: OrderDetail;
  eligible: EligibleOwners | null;
  loadError: Problem | null;
  selected: string;
  busy: boolean;
  error: Problem | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Picker plus the explicit before/after summary. Only server-listed eligible employees can be chosen. */
export function ReassignDialogView({ data, eligible, loadError, selected, busy, error, onSelect, onConfirm, onCancel }: ReassignDialogViewProps) {
  const { t, stage: stageName } = useI18n();
  const o = t.orders;
  const c = o.control;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  const candidate = eligible?.items.find((item) => item.id === selected) ?? null;
  const stageLabel = stageName(data.production.stage.id, data.production.stage.label);
  return (
    <dialog ref={ref} className="dialog owner-dialog" aria-labelledby="reassign-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id="reassign-title">{c.reassignTitle}</h2>
      <div className="dialog-body">
        <fieldset className="owner-picker" disabled={busy}>
          <legend>{c.eligible}</legend>
          <p className="muted small">{c.eligibleHint}</p>
          {loadError ? <ErrorText error={loadError} />
            : !eligible ? <Loading label={c.loadingEligible} />
              : eligible.items.length === 0 ? <p className="muted" data-empty="eligible">{c.noEligible}</p>
                : (
                  <div className="owner-options">
                    {eligible.items.map((item) => (
                      <label key={item.id} className="owner-option" data-candidate={item.id} aria-label={item.displayName}>
                        <input type="radio" name="owner-candidate" value={item.id} checked={selected === item.id} onChange={() => onSelect(item.id)} />
                        <span>
                          <strong>{item.displayName}</strong>
                          <small>{[item.department, item.positionTitle].filter(Boolean).join(" · ")}</small>
                          <small className="muted">{c.stagePermission(stageName(item.stage.id, item.stage.label))}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
        </fieldset>
        <dl className="facts owner-summary" data-summary="">
          <dt>{c.currentOwner}</dt><dd data-summary-current="">{data.production.owner?.displayName ?? o.noOwner}</dd>
          <dt>{c.newOwner}</dt><dd data-summary-new="">{candidate ? <strong>{candidate.displayName}</strong> : <span className="muted">{c.notSelected}</span>}</dd>
          <dt>{c.currentStage}</dt><dd data-summary-stage="">{stageLabel}</dd>
        </dl>
        <p className="notice notice-info owner-warning" role="note">{c.warning}</p>
        {error && <ErrorText error={error} />}
      </div>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>{t.common.cancel}</button>
        <button type="button" className="button button-primary" onClick={onConfirm} disabled={busy || !candidate}>{busy ? t.common.saving : c.confirmReassign}</button>
      </div>
    </dialog>
  );
}
