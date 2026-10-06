import { useCallback, useState } from "react";
import { useLoaderWithSignal } from "./useLoaderWithSignal";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { DocumentChange, DocumentLookupItem, OrderDocuments, RevisionRequest } from "../api/types";
import { useDashboard } from "../app/context";
import { useLive } from "../app/liveContext";
import { Badge, Card, ConfirmDialog, EmptyState, ErrorBanner, ErrorText, Field, Loading, Notice, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

export type RevisionView = "pending" | "history";
const tone = (status: string) => status === "approved" || status === "generated" ? "success" : status === "pending" ? "accent" : status === "rejected" ? "danger" : "neutral";

/** Human-readable production diff: the reviewed change, never raw JSON, prices or contact data beyond the print. */
export function ChangeTable({ changes }: { changes: DocumentChange[] }) {
  const { t } = useI18n();
  const d = t.documents;
  if (changes.length === 0) return <p className="muted">{d.noChanges}</p>;
  return (
    <table className="table compact-table document-diff">
      <thead><tr><th scope="col">{d.changes}</th><th scope="col">{d.before}</th><th scope="col">{d.after}</th></tr></thead>
      <tbody>{changes.map((change, index) => <tr key={index}>
        <td><strong>{d.fields[change.field] ?? change.field}</strong>{change.line !== null && <><br /><small className="muted">{d.line(change.line)}</small></>}</td>
        <td className="diff-before">{change.before ?? "—"}</td>
        <td className="diff-after"><strong>{change.after ?? "—"}</strong></td>
      </tr>)}</tbody>
    </table>
  );
}

/** The revision approver's queue (primary approver or the CEO's scoped backup). */
export function DocumentRevisionsPage({ view }: { view: RevisionView }) {
  const { api, me, navigate } = useDashboard();
  const { t, dateTime } = useI18n();
  const d = t.documents;
  const { revision } = useLive();
  const load = useCallback((signal: AbortSignal) => api.documentRequests(view, signal), [api, view]);
  const { data, error, reload } = useLoaderWithSignal(load, `${view}-${revision}`);
  if (!me.capabilities?.approveDocumentRevisions && !me.isRoot) return <PageHeader title={d.queueTitle} description={d.noAccess} />;
  return (
    <div className="page document-revisions-page">
      <PageHeader title={view === "pending" ? d.queueTitle : d.historyTitle} description={view === "pending" ? d.queueHint : d.historyHint} />
      {me.capabilities?.documentRevisionViaBackup && <Notice tone="warning">{d.backupNotice}</Notice>}
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <EmptyState title={view === "pending" ? d.empty : d.emptyHistory} />}
      {data && data.items.length > 0 && <ul className="exception-list">
        {data.items.map((item) => <li key={item.id}>
          <button type="button" className="exception-item" onClick={() => navigate(`/revizii-documente/cerere/${item.id}`)}>
            <span className="exception-main"><strong>{d.order} {item.order.number}</strong><small>{item.order.source} · {d.requestFor(item.targetRevision)}</small></span>
            <span className="exception-facts">
              {item.changes.map((change, index) => <span key={index}>{d.fields[change.field] ?? change.field}{change.line !== null ? ` (${d.line(change.line)})` : ""}: {change.before ?? "—"} → <b>{change.after ?? "—"}</b></span>)}
              {(item.changeCount ?? 0) > item.changes.length && <span className="muted small">+{(item.changeCount ?? 0) - item.changes.length}</span>}
              <span className="muted small">{d.requestedBy}: {item.requestedBy} · {item.order.stageLabel ?? item.order.stageId}</span>
            </span>
            <span className="exception-side">
              <Badge tone={tone(item.status)}>{d.statuses[item.status]}</Badge>
              <small className="muted">{dateTime(view === "pending" ? item.requestedAt : item.decidedAt ?? item.requestedAt)}</small>
            </span>
          </button>
        </li>)}
      </ul>}
    </div>
  );
}

export function DocumentRevisionDetailPage({ id }: { id: string }) {
  const { api, me, navigate } = useDashboard();
  const { t, dateTime } = useI18n();
  const d = t.documents;
  const { last, revision } = useLive();
  const load = useCallback((signal: AbortSignal) => api.documentRequest(id, signal), [api, id]);
  // Another approver's decision arrives as a live event for this request: the page re-reads itself.
  const liveKey = last?.requestId === id ? `${id}-${revision}` : id;
  const { data, error, reload } = useLoaderWithSignal<RevisionRequest>(load, liveKey);
  const [dialog, setDialog] = useState<null | "approve" | "reject">(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Problem | null>(null);
  const [key, setKey] = useState<string | null>(null);
  if (!me.capabilities?.approveDocumentRevisions && !me.isRoot) return <PageHeader title={d.queueTitle} description={d.noAccess} />;
  if (error && !data) return <div className="page"><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const request = data;
  const resolvedLive = last?.type === "document.request_resolved" && last.requestId === id && request.status !== "pending";
  const canDecide = request.status === "pending" && request.requestedById !== me.employee.id;

  async function submit(kind: "approve" | "reject") {
    if (busy) return;
    const idempotencyKey = key ?? newIdempotencyKey();
    setKey(idempotencyKey);
    setBusy(true);
    setFailure(null);
    try {
      await api.decideDocumentRequest(request.id, { expectedVersion: request.version, decision: kind, ...(comment.trim() ? { comment: comment.trim() } : {}) }, idempotencyKey);
      setDialog(null);
      setComment("");
      setKey(null);
      reload();
    } catch (caught) {
      const problem = toProblem(caught);
      // Another approver decided first, or the content changed: close and show the fresh state.
      if (problem instanceof ApiError && ["DOCUMENT_REQUEST_RESOLVED", "DOCUMENT_REQUEST_CHANGED", "DOCUMENT_CONTENT_CHANGED", "IDEMPOTENCY_CONFLICT"].includes(problem.code)) {
        setKey(null);
        setDialog(null);
        reload();
      }
      if (!(problem instanceof ApiError) || problem.status < 500) setKey(null);
      setFailure(problem);
    } finally { setBusy(false); }
  }

  return (
    <div className="page approval-detail document-revision-detail">
      <button type="button" className="back-link" onClick={() => navigate("/revizii-documente")}>{d.queueTitle}</button>
      <PageHeader title={`${d.order} ${request.order.number} · ${d.revision(request.targetRevision)}`} description={`${request.order.source} · ${d.requestFor(request.targetRevision)}`}
        actions={<Badge tone={tone(request.status)}>{d.statuses[request.status]}</Badge>} />
      {resolvedLive && <Notice tone="warning">{request.decidedBy ? d.resolvedElsewhere(request.decidedBy) : d.resolvedLive}</Notice>}
      {failure && <ErrorBanner error={failure} />}
      {canDecide && <div className="decision-bar">
        <button type="button" className="button button-primary" onClick={() => { setFailure(null); setComment(""); setDialog("approve"); }}>{d.approve}</button>
        <button type="button" className="button button-danger" onClick={() => { setFailure(null); setComment(""); setDialog("reject"); }}>{d.reject}</button>
      </div>}
      <Card title={d.changes}><ChangeTable changes={request.changes} /></Card>
      <div className="grid-2">
        <Card title={d.requestFor(request.targetRevision)}>
          <dl className="facts">
            <dt>{d.requestedBy}</dt><dd>{request.requestedBy}</dd>
            <dt>{d.requestedAt}</dt><dd>{dateTime(request.requestedAt)}</dd>
            {request.comment && <><dt>{d.comment}</dt><dd>{request.comment}</dd></>}
            <dt>{d.oldDocument}</dt><dd>{d.revision(request.baseRevision.number)} · {d.baseStates[request.baseRevision.status]}</dd>
            {request.decidedBy && <><dt>{d.decidedBy}</dt><dd>{request.decidedBy}{request.decidedVia ? ` (${d.via[request.decidedVia] ?? request.decidedVia})` : ""} · {dateTime(request.decidedAt)}{request.decisionComment ? ` · „${request.decisionComment}”` : ""}</dd></>}
            {request.resolutionNote && <><dt>{d.statuses[request.status]}</dt><dd>{request.resolutionNote}</dd></>}
          </dl>
        </Card>
        <Card title={d.order}>
          <dl className="facts">
            <dt>{d.stage}</dt><dd>{request.order.stageLabel ?? request.order.stageId}</dd>
            <dt>{d.owner}</dt><dd>{request.order.ownerName ?? d.noOwner}</dd>
            <dt>{request.productionStarted ? d.productionStarted : d.productionNotStarted}</dt><dd>{d.documentStatus[request.order.documentStatus] ?? request.order.documentStatus}</dd>
            {request.previousRequest && <><dt>{d.previous}</dt><dd>{d.statuses[request.previousRequest.status]}{request.previousRequest.decisionComment ? ` · „${request.previousRequest.decisionComment}”` : ""}</dd></>}
          </dl>
          {me.capabilities?.viewDocumentHistory && <button type="button" className="button button-secondary" onClick={() => navigate(`/documente/${encodeURIComponent(request.order.id)}`)}>{d.openDocuments}</button>}
        </Card>
      </div>
      {dialog && <ConfirmDialog
        title={dialog === "approve" ? d.confirmApproveTitle : d.confirmRejectTitle}
        confirmLabel={dialog === "approve" ? d.approve : d.reject}
        tone={dialog === "approve" ? "primary" : "danger"} busy={busy}
        onCancel={() => { setDialog(null); setKey(null); }}
        onConfirm={() => { if (dialog === "reject" && comment.trim().length < 3) { setFailure(new ApiError("COMMENT_REQUIRED", 422)); return; } void submit(dialog); }}>
        <p>{dialog === "approve" ? d.confirmApproveBody(request.order.number, request.targetRevision) : d.rejectReason}</p>
        {dialog === "reject" && <Field label={d.rejectReason}>{(fieldId) => <textarea id={fieldId} rows={3} maxLength={1000} value={comment} onChange={(event) => { setComment(event.target.value); setKey(null); }} />}</Field>}
        {failure && <ErrorText error={failure} />}
      </ConfirmDialog>}
    </div>
  );
}

/** Read-only document history of one order (revisions, prints, QR state); root may revoke the active document. */
export function OrderDocumentsPage({ id }: { id?: string }) {
  const { api, me, navigate } = useDashboard();
  const { t, dateTime } = useI18n();
  const d = t.documents;
  const [number, setNumber] = useState("");
  const [matches, setMatches] = useState<DocumentLookupItem[] | null>(null);
  const [failure, setFailure] = useState<Problem | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { revision } = useLive();
  const load = useCallback((signal: AbortSignal) => (id ? api.orderDocuments(id, undefined, signal) : Promise.resolve(null)), [api, id]);
  const { data, error, reload } = useLoaderWithSignal<OrderDocuments | null>(load, `${id ?? ""}-${revision}`);
  if (!me.capabilities?.viewDocumentHistory && !me.isRoot) return <PageHeader title={d.documentsTitle} description={d.noAccess} />;

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!number.trim()) return;
    setFailure(null);
    try {
      const found = (await api.documentLookup(number.trim())).items;
      setMatches(found);
      if (found.length === 1) navigate(`/documente/${encodeURIComponent(found[0].orderId)}`);
    } catch (caught) { setFailure(toProblem(caught)); }
  }
  async function revoke() {
    if (!data || !revoking || revoking.trim().length < 3 || busy) return;
    setBusy(true);
    setFailure(null);
    try { await api.revokeDocument(data.order.id, { expectedDocumentVersion: data.version, reason: revoking.trim() }, newIdempotencyKey()); setRevoking(null); reload(); }
    catch (caught) { setFailure(toProblem(caught)); }
    finally { setBusy(false); }
  }

  return (
    <div className="page order-documents-page">
      <PageHeader title={data ? `${d.documentsTitle} · ${d.order} ${data.order.number}` : d.documentsTitle} description={d.documentsHint} />
      <form className="inline-form" onSubmit={(event) => void search(event)}>
        <Field label={d.lookup}>{(fieldId) => <input id={fieldId} value={number} maxLength={120} autoComplete="off" onChange={(event) => setNumber(event.target.value)} />}</Field>
        <button type="submit" className="button button-primary">{d.lookupButton}</button>
      </form>
      {matches && matches.length === 0 && <Notice tone="warning">{d.notFound}</Notice>}
      {matches && matches.length > 1 && <ul className="history-list">{matches.map((match) => <li key={match.orderId}><button type="button" className="button button-ghost" onClick={() => navigate(`/documente/${encodeURIComponent(match.orderId)}`)}>{match.orderNumber} · {match.source}</button><Badge tone="neutral">{d.documentStatus[match.documentStatus] ?? match.documentStatus}</Badge></li>)}</ul>}
      {failure && <ErrorBanner error={failure} />}
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {id && !data && !error && <Loading />}
      {data && <>
        <Card title={d.documentStatus[data.status]} description={`${data.order.stageLabel ?? data.order.stageId} · ${data.order.ownerName ?? d.noOwner}`}
          actions={me.capabilities?.revokeDocuments && (data.status === "active" || data.status === "stale") ? <button type="button" className="button button-danger" onClick={() => setRevoking("")}>{d.revoke}</button> : undefined}>
          {data.request && <><p><strong>{d.requestFor(data.request.targetRevision)}</strong> · <Badge tone={tone(data.request.status)}>{d.statuses[data.request.status]}</Badge></p><ChangeTable changes={data.request.changes} /></>}
        </Card>
        <Card title={d.revisions}>
          <table className="table compact-table"><tbody>{data.revisions.map((item) => <tr key={item.id}>
            <td><strong>{d.revision(item.number)}</strong><br /><Badge tone={item.status === "active" ? "success" : item.status === "revoked" ? "danger" : "neutral"}>{d.revisionStates[item.status]}</Badge></td>
            <td><small>{d.generatedBy}: {item.generatedBy} · {dateTime(item.generatedAt)}</small>{item.approvedBy && <><br /><small>{d.approvedBy}: {item.approvedBy} · {dateTime(item.approvedAt)}</small></>}
              {item.revokedBy && <><br /><small>{item.revokedBy} · {dateTime(item.revokedAt)} · „{item.revokeReason}”</small></>}</td>
            <td><small>{d.prints(item.prints)}</small><br /><small className="muted">{d.qr}: …{item.qrHint}</small></td>
          </tr>)}</tbody></table>
        </Card>
        <Card title={d.history}>
          <ol className="timeline">{(data.history ?? []).map((event) => <li key={event.seq}>
            <strong>{d.events[event.type] ?? event.type}{event.revisionNumber !== null ? ` · ${d.revision(event.revisionNumber)}` : ""}</strong>
            <span>{event.actorName ?? "—"} · {dateTime(event.occurredAt)}{typeof event.details?.reason === "string" ? ` · „${event.details.reason}”` : ""}{typeof event.details?.comment === "string" ? ` · „${event.details.comment}”` : ""}</span>
          </li>)}</ol>
        </Card>
      </>}
      {revoking !== null && data && <ConfirmDialog title={d.revokeTitle} confirmLabel={d.revoke} tone="danger" busy={busy} onCancel={() => setRevoking(null)}
        onConfirm={() => { if (revoking.trim().length < 3) { setFailure(new ApiError("COMMENT_REQUIRED", 422)); return; } void revoke(); }}>
        <p>{d.revokeBody}</p>
        <Field label={d.revokeReason}>{(fieldId) => <textarea id={fieldId} rows={3} maxLength={1000} value={revoking} onChange={(event) => setRevoking(event.target.value)} />}</Field>
        {failure && <ErrorText error={failure} />}
      </ConfirmDialog>}
    </div>
  );
}
