import { useCallback, useState } from "react";
import { useLoaderWithSignal } from "./useLoaderWithSignal";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { ExceptionDetail, ExceptionSummary } from "../api/types";
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
            <span className="exception-main"><strong>{x.order} {item.order.orderNumber}</strong><small>{item.order.sourceName} · {item.number}</small></span>
            <span className="exception-facts"><span>{item.reason.label}</span><span>{x.lines(item.lineCount)} · <b>{meters(item.faultMeters)}</b></span>
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
      if (kind === "cancel") await api.cancelException(data.id, { expectedVersion: data.version, reason: comment.trim() }, idempotencyKey);
      else await api.decideException(data.id, { expectedVersion: data.version, decision: kind, ...(comment.trim() ? { comment: comment.trim() } : {}) }, idempotencyKey);
      setDialog(null);
      setComment("");
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
      setFailure(problem);
    } finally { setBusy(false); }
  }

  const decidedBy = data.decisions.filter((decision) => decision.decidedBy).at(-1)?.decidedBy;
  return (
    <div className="page approval-detail">
      <button type="button" className="back-link" onClick={() => navigate("/aprobari")}>{x.back}</button>
      <PageHeader title={`${x.order} ${data.order.orderNumber}`} description={`${data.order.sourceName} · ${data.number}`}
        actions={<Badge tone={data.status === "approved" ? "success" : data.status === "awaiting_approval" ? "accent" : "warning"}>{x.status[data.status]}</Badge>} />
      {resolvedLive && decidedBy && <Notice tone="warning">{x.resolvedBy(decidedBy)}</Notice>}
      {failure && <ErrorBanner error={failure} />}
      {data.repeatedError && <Notice tone="warning">{x.repeated} · {x.arrival(data.arrivalNumber)}</Notice>}
      {data.actions.involved && data.status === "awaiting_approval" && <Notice tone="warning">{x.involved}</Notice>}
      {(data.actions.canDecide || data.actions.canCancel) && <div className="decision-bar">
        {data.actions.canDecide && <button type="button" className="button button-primary" onClick={() => { setFailure(null); setComment(""); setDialog("approve"); }}>{x.approve}</button>}
        {data.actions.canDecide && <button type="button" className="button button-danger" onClick={() => { setFailure(null); setComment(""); setDialog("reject"); }}>{x.reject}</button>}
        {data.actions.canCancel && <button type="button" className="button button-secondary" onClick={() => { setFailure(null); setComment(""); setDialog("cancel"); }}>{x.cancel}</button>}
      </div>}
      <div className="grid-2">
        <Card title={x.linesTitle} description={`${x.lines(data.lineCount)} · ${meters(data.faultMeters)}`}>
          <table className="table compact-table"><tbody>
            {data.lines.map((line) => <tr key={line.itemId}><td>{line.lineNumber}</td><td><strong>{line.name}</strong><br /><small className="muted">{[line.code, line.color, line.variant].filter(Boolean).join(" · ")}</small></td><td className="num">{meters(line.meters)}</td></tr>)}
          </tbody></table>
        </Card>
        <Card title={x.reason}>
          <dl className="facts">
            <dt>{x.reason}</dt><dd>{data.reason.label}</dd>
            {data.detectorComment && <><dt>{x.detectorComment}</dt><dd>{data.detectorComment}</dd></>}
            <dt>{x.detector}</dt><dd>{data.detector.displayName}</dd>
            <dt>{x.responsible}</dt><dd>{data.responsible.displayName}</dd>
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
          <ul className="history-list">{data.orderHistory.map((item) => <li key={item.id}><span>{item.number} · {item.reason.label} · {meters(item.faultMeters)}</span><Badge tone={item.status === "approved" ? "success" : "neutral"}>{x.status[item.status]}</Badge></li>)}</ul>
        </Card>
      </div>
      {dialog && <ConfirmDialog
        title={dialog === "approve" ? x.confirmApproveTitle : dialog === "reject" ? x.confirmRejectTitle : x.cancelTitle}
        confirmLabel={dialog === "approve" ? x.approve : dialog === "reject" ? x.reject : x.cancel}
        tone={dialog === "approve" ? "primary" : "danger"} busy={busy}
        onCancel={() => { setDialog(null); setKey(null); }}
        onConfirm={() => { if (dialog !== "approve" && comment.trim().length < 3) { setFailure(new ApiError("COMMENT_REQUIRED", 422)); return; } void submit(dialog); }}>
        <p>{dialog === "approve" ? x.confirmApproveBody(data.order.orderNumber, meters(data.faultMeters)) : dialog === "reject" ? x.confirmRejectBody : x.cancelBody}</p>
        <Field label={dialog === "approve" ? x.comment : dialog === "reject" ? x.rejectReason : x.cancelReason}>{(fieldId) => <textarea id={fieldId} rows={3} maxLength={1000} value={comment} onChange={(event) => { setComment(event.target.value); setKey(null); }} />}</Field>
        {failure && <ErrorText error={failure} />}
      </ConfirmDialog>}
    </div>
  );
}
