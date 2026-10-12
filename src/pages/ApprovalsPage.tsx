import { useCallback, useState } from "react";
import { useLoaderWithSignal } from "./useLoaderWithSignal";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { ExceptionDetail, ExceptionSummary, RestoreRecipient } from "../api/types";
import { useDashboard } from "../app/context";
import { useLive } from "../app/liveContext";
import { Badge, Card, ConfirmDialog, EmptyState, ErrorBanner, ErrorText, Field, Loading, Notice, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";
import { TransferQueue } from "./CuttingTransfersPage";

export type ApprovalView = "pending" | "waiting" | "mine";

/** "17.000" -> "17 m"; exact decimal string from the server, display only. */
export function meters(value: string): string {
  const trimmed = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return `${trimmed.replace(".", ",")} m`;
}

/**
 * The fault scope with unknown meters kept apart, e.g. "4,5 m + 1 produs fără metraj". Lines the source sent no
 * meters for are never shown as a measured zero, and no meters are derived for them.
 */
export function faultScope(x: { unmeasuredLines: (count: number) => string; noMeasuredMeters: string }, item: Pick<ExceptionSummary, "faultMeters" | "unmeasuredLineCount">): string {
  const unknown = item.unmeasuredLineCount ?? 0;
  const known = item.faultMeters !== null && Number(item.faultMeters) > 0 ? meters(item.faultMeters) : null;
  if (unknown === 0) return known ?? x.noMeasuredMeters;
  return known ? `${known} + ${x.unmeasuredLines(unknown)}` : x.unmeasuredLines(unknown);
}

export function ApprovalsPage({ view }: { view: ApprovalView }) {
  const { api, me, navigate } = useDashboard();
  const { t, dateTime } = useI18n();
  const x = t.exceptions;
  const load = useCallback((signal: AbortSignal) => api.exceptions(view, signal), [api, view]);
  const { data, error, reload } = useLoaderWithSignal(load, view);
  if (!me.capabilities?.approveExceptions) return <PageHeader title={x.pendingTitle} description={x.noAccess} />;
  const title = view === "pending" ? x.pendingTitle : view === "waiting" ? x.waitingTitle : x.mineTitle;
  const hint = view === "pending" ? x.pendingHint : view === "waiting" ? x.waitingHint : x.mineHint;
  return (
    <div className="page approvals-page">
      <PageHeader title={title} description={hint} />
      {me.capabilities.approvalViaBackup && <Notice tone="warning">{x.backupNotice}</Notice>}
      <TransferQueue view={view} />
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <EmptyState title={x.empty} />}
      {data && data.items.length > 0 && <ul className="exception-list">
        {data.items.map((item: ExceptionSummary) => <li key={item.id}>
          <button type="button" className="exception-item" onClick={() => navigate(`/aprobari/cerere/${item.id}`)}>
            <span className="exception-main"><strong>{x.order} {item.order.orderNumber}</strong><small>{item.order.sourceName} · {item.number}{item.type === "tailoring_defect" ? ` · ${x.tailoring.badge}` : ""}</small></span>
            <span className="exception-facts"><span>{(item.confirmedReason ?? item.reason).label}</span><span>{x.lines(item.lineCount)} · <b>{faultScope(x, item)}</b></span>
              <span className="muted small">{x.responsible}: {item.responsible.displayName}</span></span>
            <span className="exception-side">
              <Badge tone={item.status === "approved" ? "success" : item.status === "awaiting_approval" ? "accent" : item.status === "awaiting_acknowledgment" ? "warning" : "neutral"}>{x.status[item.status]}</Badge>
              {item.repeatedError && <Badge tone="danger">{x.repeated}</Badge>}
              {view === "pending" && item.pendingSince && <small className="muted">{x.waitingSince}: {dateTime(item.pendingSince)}</small>}
              {view !== "pending" && <small className="muted">{dateTime(item.resolvedAt ?? item.reportedAt)}</small>}
            </span>
          </button>
        </li>)}
      </ul>}
    </div>
  );
}

export function ApprovalDetailPage({ id }: { id: string }) {
  const { api, me, navigate } = useDashboard();
  const { t, dateTime, duration } = useI18n();
  const x = t.exceptions;
  const { last } = useLive();
  const load = useCallback((signal: AbortSignal) => api.exception(id, signal), [api, id]);
  const { data, error, reload } = useLoaderWithSignal<ExceptionDetail>(load, id);
  const [dialog, setDialog] = useState<null | "approve" | "reject" | "cancel">(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Problem | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<"cutter" | "none" | null>(null);
  const [recipients, setRecipients] = useState<RestoreRecipient[] | null>(null);
  const [recipientId, setRecipientId] = useState("");
  if (!me.capabilities?.approveExceptions) return <PageHeader title={x.pendingTitle} description={x.noAccess} />;
  if (error && !data) return <div className="page"><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Loading /></div>;

  const resolvedLive = last?.type === "exception.resolved" && last.exceptionId === id && data.status !== "awaiting_approval";
  async function submit(kind: "approve" | "reject" | "cancel") {
    if (busy || !data) return;
    const idempotencyKey = key ?? newIdempotencyKey();
    setKey(idempotencyKey);
    setBusy(true);
    setFailure(null);
    try {
      if (kind === "cancel") await api.cancelException(data.id, { expectedVersion: data.version, reason: comment.trim(), ...(data.actions.cancelNeedsRecipient ? { recipientEmployeeId: recipientId } : {}) }, idempotencyKey);
      else await api.decideException(data.id, { expectedVersion: data.version, decision: kind, ...(comment.trim() ? { comment: comment.trim() } : {}), ...(kind === "approve" && data.actions.requiresAttribution && attribution ? { attribution } : {}) }, idempotencyKey);
      setDialog(null);
      setComment("");
      setAttribution(null);
      setKey(null);
      reload();
    } catch (caught) {
      const problem = toProblem(caught);
      // The request changed or another manager decided first: drop the key, close and show fresh data.
      if (problem instanceof ApiError && ["EXCEPTION_ALREADY_RESOLVED", "EXCEPTION_CHANGED", "EXCEPTION_STATE_INVALID", "ORDER_CHANGED", "IDEMPOTENCY_CONFLICT"].includes(problem.code)) {
        setKey(null);
        setDialog(null);
        reload();
      }
      if (!(problem instanceof ApiError) || problem.status < 500) setKey(null);
      // The chosen recipient can no longer receive the product: refresh who can, the order stays blocked.
      if (problem instanceof ApiError && ["RESTORE_RECIPIENT_UNAVAILABLE", "RECIPIENT_INVALID", "RECIPIENT_NOT_ALLOWED"].includes(problem.code)) { setRecipientId(""); loadRecipients(); }
      setFailure(problem);
    } finally { setBusy(false); }
  }

  function loadRecipients() {
    setRecipients(null);
    api.restoreRecipients(id).then((answer) => setRecipients(answer.items)).catch((caught) => { setRecipients([]); setFailure(toProblem(caught)); });
  }
  function openCancel() {
    setFailure(null); setComment(""); setRecipientId(""); setDialog("cancel");
    if (data?.actions.cancelNeedsRecipient) loadRecipients();
  }

  const decidedBy = data.decisions.filter((decision) => decision.decidedBy).at(-1)?.decidedBy;
  const tailoring = data.type === "tailoring_defect";
  const needsAttribution = dialog === "approve" && Boolean(data.actions.requiresAttribution);
  return (
    <div className="page approval-detail">
      <button type="button" className="back-link" onClick={() => navigate("/aprobari")}>{x.back}</button>
      <PageHeader title={`${x.order} ${data.order.orderNumber}`} description={`${data.order.sourceName} · ${data.number}`}
        actions={<Badge tone={data.status === "approved" ? "success" : data.status === "awaiting_approval" ? "accent" : "warning"}>{x.status[data.status]}</Badge>} />
      {resolvedLive && decidedBy && <Notice tone="warning">{x.resolvedBy(decidedBy)}</Notice>}
      {failure && <ErrorBanner error={failure} />}
      {data.repeatedError && <Notice tone="warning">{x.repeated} · {x.arrival(data.arrivalNumber)}</Notice>}
      {data.actions.involved && data.status === "awaiting_approval" && <Notice tone="warning">{x.involved}</Notice>}
      {data.status === "awaiting_restore_receipt" && data.restoreRecipient && <Notice tone="warning">{x.tailoring.restorePending(data.restoreRecipient.displayName)}</Notice>}
      {(data.actions.canDecide || data.actions.canCancel) && <div className="decision-bar">
        {data.actions.canDecide && <button type="button" className="button button-primary" onClick={() => { setFailure(null); setComment(""); setDialog("approve"); }}>{x.approve}</button>}
        {data.actions.canDecide && <button type="button" className="button button-danger" onClick={() => { setFailure(null); setComment(""); setDialog("reject"); }}>{x.reject}</button>}
        {data.actions.canCancel && <button type="button" className="button button-secondary" onClick={openCancel}>{x.cancel}</button>}
      </div>}
      <div className="grid-2">
        <Card title={x.linesTitle} description={`${x.lines(data.lineCount)} · ${faultScope(x, data)}`}>
          <table className="table compact-table"><tbody>
            {data.lines.map((line) => <tr key={line.itemId}><td>{line.lineNumber}</td><td><strong>{line.name}</strong><br /><small className="muted">{[line.code, line.color, line.variant].filter(Boolean).join(" · ")}</small></td><td className="num">{line.meters === null ? x.unmeasured : meters(line.meters)}</td></tr>)}
          </tbody></table>
        </Card>
        <Card title={x.reason}>
          <dl className="facts">
            <dt>{x.reason}</dt><dd>{data.reason.label}</dd>
            {data.confirmedReason && <><dt>{x.tailoring.confirmedReason}</dt><dd>{data.confirmedReason.label}</dd></>}
            {tailoring && data.detectedStage && <><dt>{x.tailoring.detectedStage}</dt><dd>{data.detectedStage.label ?? data.detectedStage.id}</dd></>}
            {data.supervisor && <><dt>{x.tailoring.supervisor}</dt><dd>{data.supervisor.displayName}</dd></>}
            {data.detectorComment && <><dt>{x.detectorComment}</dt><dd>{data.detectorComment}</dd></>}
            <dt>{x.detector}</dt><dd>{data.detector.displayName}</dd>
            <dt>{x.responsible}</dt><dd>{data.responsible.displayName}</dd>
            {data.receiver && <><dt>{x.tailoring.receiver}</dt><dd>{data.receiver.displayName}</dd></>}
            {tailoring && data.physicalCustodian && <><dt>{x.tailoring.custodian}</dt><dd>{data.physicalCustodian.displayName}</dd></>}
            {data.restoreRecipient && <><dt>{data.restoreReceivedAt ? x.tailoring.restoreReceivedBy : x.tailoring.restoreRecipient}</dt><dd>{data.restoreRecipient.displayName}</dd></>}
            {data.restoreRequestedAt && <><dt>{x.tailoring.restoreRequestedAt}</dt><dd>{dateTime(data.restoreRequestedAt)}</dd></>}
            {data.restoreReceivedAt && <><dt>{x.tailoring.restoreReceivedAt}</dt><dd>{dateTime(data.restoreReceivedAt)}</dd></>}
            {data.cancelledByRoot && <><dt>{x.tailoring.recovery}</dt><dd>{data.cancelReason ?? "—"}</dd></>}
            {data.responsibilityPosition && <><dt>{x.tailoring.position}</dt><dd>{x.tailoring.positions[data.responsibilityPosition]}</dd></>}
            {data.attribution && <><dt>{x.tailoring.attribution}</dt><dd>{x.tailoring.decided[data.attribution]}</dd></>}
            {data.acknowledgmentComment && <><dt>{x.ackComment}</dt><dd>{data.acknowledgmentComment}</dd></>}
            <dt>{x.reported}</dt><dd>{dateTime(data.reportedAt)}</dd>
            <dt>{x.qrVerified}</dt><dd>{dateTime(data.qrVerifiedAt)}</dd>
            <dt>{x.arrival(data.arrivalNumber)}</dt><dd>{data.reworkCycle ? `#${data.reworkCycle}` : "—"}</dd>
          </dl>
        </Card>
      </div>
      <Card title={x.decisions}>
        <ol className="decision-history">{data.decisions.map((decision) => <li key={decision.attempt}>
          <strong>{x.attempt(decision.attempt)} · {x.status[decision.status === "pending" ? "awaiting_approval" : decision.status] ?? decision.status}</strong>
          {decision.openedReason === "rereview" && <span>{x.rereview(decision.openedBy)}{decision.openedComment ? `: „${decision.openedComment}”` : ""}</span>}
          {decision.decidedBy && <span>{decision.decidedBy}{decision.decidedVia ? ` (${x.via[decision.decidedVia] ?? decision.decidedVia})` : ""} · {dateTime(decision.decidedAt)}{decision.comment ? ` · „${decision.comment}”` : ""}</span>}
          {decision.waitSeconds !== null && <small className="muted">{x.waited}: {duration(decision.waitSeconds * 1000)}</small>}
        </li>)}</ol>
      </Card>
      <div className="grid-2">
        <Card title={x.timeline}>
          <ol className="timeline">{data.timeline.map((event) => <li key={event.version}><strong>{x.timelineActions[event.action] ?? event.action}</strong><span>{event.actor} · {dateTime(event.at)}</span></li>)}</ol>
        </Card>
        <Card title={x.orderHistory}>
          <ul className="history-list">{data.orderHistory.map((item) => <li key={item.id}><span>{item.number} · {item.reason.label} · {faultScope(x, item)}</span><Badge tone={item.status === "approved" ? "success" : "neutral"}>{x.status[item.status]}</Badge></li>)}</ul>
        </Card>
      </div>
      {dialog && <ConfirmDialog
        title={dialog === "approve" ? x.confirmApproveTitle : dialog === "reject" ? x.confirmRejectTitle : x.cancelTitle}
        confirmLabel={dialog === "approve" ? x.approve : dialog === "reject" ? x.reject : x.cancel}
        tone={dialog === "approve" ? "primary" : "danger"} busy={busy}
        onCancel={() => { setDialog(null); setKey(null); setAttribution(null); }}
        onConfirm={() => {
          if (dialog !== "approve" && comment.trim().length < 3) { setFailure(new ApiError("COMMENT_REQUIRED", 422)); return; }
          if (dialog === "cancel" && data.actions.cancelNeedsRecipient && !recipientId) { setFailure(new ApiError("RECIPIENT_REQUIRED", 422)); return; }
          if (needsAttribution && !attribution) { setFailure(new ApiError("ATTRIBUTION_REQUIRED", 422)); return; }
          void submit(dialog);
        }}>
        <p>{dialog === "approve" ? (tailoring ? `${x.tailoring.confirmApproveBody(data.order.orderNumber, faultScope(x, data))} ${x.tailoring.assignedTo(data.receiver?.displayName ?? data.responsible.displayName)}` : x.confirmApproveBody(data.order.orderNumber, faultScope(x, data)))
          : dialog === "reject" ? (tailoring ? x.tailoring.confirmRejectBody : x.confirmRejectBody) : data.actions.cancelNeedsRecipient ? x.recoveryBody : x.cancelBody}</p>
        {dialog === "cancel" && data.actions.cancelNeedsRecipient && (recipients === null ? <Loading /> : recipients.length === 0 ? <Notice tone="warning">{x.recoveryNone}</Notice>
          : <Field label={x.recoveryRecipient}>{(fieldId) => <select id={fieldId} data-testid="recovery-recipient" value={recipientId} onChange={(event) => { setRecipientId(event.target.value); setKey(null); }}>
            <option value="">{x.recoveryChoose}</option>{recipients.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>}</Field>)}
        {needsAttribution && <fieldset className="attribution-choice" data-testid="attribution-choice"><legend>{x.tailoring.attribution}</legend>
          <label className="checkbox"><input type="radio" name="attribution" checked={attribution === "cutter"} disabled={!data.actions.canAttributeToCutter} onChange={() => { setAttribution("cutter"); setKey(null); }} /> <span>{x.tailoring.attributionCutter}</span></label>
          <label className="checkbox"><input type="radio" name="attribution" checked={attribution === "none"} onChange={() => { setAttribution("none"); setKey(null); }} /> <span>{x.tailoring.attributionNone}</span></label>
          {!data.actions.canAttributeToCutter && <small className="muted">{x.tailoring.attributionMaterial}</small>}
        </fieldset>}
        <Field label={dialog === "approve" ? x.comment : dialog === "reject" ? x.rejectReason : x.cancelReason}>{(fieldId) => <textarea id={fieldId} rows={3} maxLength={1000} value={comment} onChange={(event) => { setComment(event.target.value); setKey(null); }} />}</Field>
        {failure && <ErrorText error={failure} />}
      </ConfirmDialog>}
    </div>
  );
}
