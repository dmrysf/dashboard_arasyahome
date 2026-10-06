import { useCallback, useRef, useState } from "react";
import { newIdempotencyKey, ApiError } from "../api/client";
import { transferStatus } from "../api/cutting";
import { useDashboard } from "../app/context";
import { useI18n } from "../i18n/context";
import { toProblem, type Problem } from "../i18n";
import { Badge, Card, ConfirmDialog, EmptyState, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";
import { useLoaderWithSignal } from "./useLoaderWithSignal";
const historyLabels: Record<string, string> = { requested: "Transfer solicitat", approved: "Aprobat de manager", rejected: "Respins de manager", accepted: "Acceptat de destinatar", completed: "QR verificat · proprietar schimbat", cancelled: "Recuperare Root · cerere anulată" };

/** Shared operational queue: same authority as cutting-fault decisions, not general ownership admin. */
export function TransferQueue({ view }: { view: "pending" | "waiting" | "mine" }) {
  const { api, me, navigate } = useDashboard();
  const load = useCallback((signal: AbortSignal) => api.cuttingTransfers(view, signal), [api, view]);
  const { data, error, reload } = useLoaderWithSignal(load, view);
  if (!me.capabilities?.approveExceptions) return null;
  return <Card title="Transferuri de tăiere" description="Aprobarea nu schimbă proprietarul. Colegul acceptă și scanează aceeași etichetă QR.">
    {error && <ErrorBanner error={error} onRetry={reload} />}{!data && !error && <Loading />}
    {data && data.items.length === 0 && <EmptyState title="Nu există transferuri în această secțiune." />}
    {data && <ul className="exception-list">{data.items.map(t => <li key={t.id}><button type="button" className="exception-item" onClick={() => navigate(`/aprobari/transfer/${t.id}`)}>
      <span className="exception-main"><strong>Comanda #{t.order.orderNumber}</strong><small>Transfer de tăiere · {t.order.source}</small></span><span className="exception-facts"><strong>{t.from.name} → {t.to.name}</strong><span>{t.reason.label}</span></span><Badge tone={t.status === "pending" ? "accent" : t.status === "completed" ? "success" : "neutral"}>{transferStatus[t.status]}</Badge>
    </button></li>)}</ul>}
  </Card>;
}

export function TransferDetailPage({ id }: { id: string }) {
  const { api, me, navigate } = useDashboard(); const { dateTime } = useI18n();
  const load = useCallback((signal: AbortSignal) => api.cuttingTransfer(id, signal), [api, id]);
  const { data, error, reload } = useLoaderWithSignal(load, id);
  const [dialog, setDialog] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false); const [failure, setFailure] = useState<Problem | null>(null);
  const key = useRef("");
  if (!me.capabilities?.approveExceptions) return <PageHeader title="Transfer de tăiere" description="Acces nepermis." />;
  if (!data) return <div className="page">{error ? <ErrorBanner error={error} onRetry={reload} /> : <Loading />}</div>;
  async function submit() {
    if (busy || !dialog || !data) return;
    if (dialog !== "approve" && comment.trim().length < 3) { setFailure(new ApiError("COMMENT_REQUIRED", 422)); return; }
    setBusy(true); setFailure(null); key.current ||= newIdempotencyKey();
    try {
      if (dialog === "cancel") await api.cancelTransfer(id, data.version, comment.trim(), key.current);
      else await api.decideTransfer(id, { expectedVersion: data.version, decision: dialog, ...(comment.trim() ? { comment: comment.trim() } : {}) }, key.current);
      setDialog(null); setComment(""); key.current = ""; reload();
    } catch (e) {
      const problem = toProblem(e); setFailure(problem);
      if (problem instanceof ApiError && problem.status < 500) { key.current = ""; if (problem.status === 409) { setDialog(null); reload(); } }
    } finally { setBusy(false); }
  }
  return <div className="page approval-detail"><button type="button" className="back-link" onClick={() => navigate("/aprobari")}>Înapoi la aprobări</button>
    <PageHeader title={`Transfer · comanda #${data.order.orderNumber}`} description={`${data.order.source} · ${transferStatus[data.status]}`} />
    {error && <ErrorBanner error={error} onRetry={reload} />}{failure && <ErrorBanner error={failure} />}
    <Notice>Aprobarea NU schimbă proprietarul. {data.from.name} rămâne responsabil până când {data.to.name} acceptă explicit și verifică QR-ul aceleiași comenzi.</Notice>
    <Card title="Cererea"><dl className="facts"><dt>Proprietar actual al cererii</dt><dd>{data.from.name}</dd><dt>Destinatar</dt><dd>{data.to.name}</dd><dt>Motiv</dt><dd>{data.reason.label}</dd>{data.reason.comment && <><dt>Comentariu</dt><dd>{data.reason.comment}</dd></>}<dt>Solicitat</dt><dd>{dateTime(data.requestedAt)}</dd><dt>Decizie</dt><dd>{data.decidedBy ?? "—"} · {dateTime(data.decidedAt)}</dd>{data.decisionComment && <><dt>Motiv decizie</dt><dd>{data.decisionComment}</dd></>}<dt>Acceptat de destinatar</dt><dd>{dateTime(data.acceptedAt)}</dd><dt>QR verificat / transfer complet</dt><dd>{dateTime(data.qrVerifiedAt)}</dd></dl></Card>
    <div className="decision-bar">{data.actions.canDecide && <><button type="button" className="button button-primary" onClick={() => { setComment(""); setDialog("approve"); key.current = ""; }}>Aprobă transferul</button><button type="button" className="button button-danger" onClick={() => { setComment(""); setDialog("reject"); key.current = ""; }}>Respinge transferul</button></>}{data.actions.canCancel && <button type="button" className="button button-secondary" onClick={() => { setComment(""); setDialog("cancel"); key.current = ""; }}>Root · recuperează cererea blocată</button>}</div>
    <Card title="Istoric păstrat"><ol className="timeline">{data.history?.map((e, i) => <li key={`${e.at}-${i}`}><strong>{historyLabels[e.action.replace("cutting.transfer.", "")] ?? "Eveniment de transfer"}</strong><span>{e.actor} · {dateTime(e.at)}</span>{typeof e.facts?.comment === "string" && <p>{e.facts.comment}</p>}</li>)}</ol></Card>
    {dialog && <ConfirmDialog title={dialog === "approve" ? "Aprobă transferul" : dialog === "reject" ? "Respinge transferul" : "Recuperare Root"} confirmLabel="Confirmă decizia" tone={dialog === "approve" ? "primary" : "danger"} busy={busy} onCancel={() => { setDialog(null); key.current = ""; }} onConfirm={() => void submit()}><p>{dialog === "approve" ? "Se aprobă doar cererea, nu se schimbă proprietarul." : "Motivul este obligatoriu și rămâne în istoricul cererii."}</p><Field label={dialog === "approve" ? "Comentariu (opțional)" : "Motiv obligatoriu"}>{field => <textarea id={field} maxLength={1000} value={comment} onChange={e => { setComment(e.target.value); key.current = ""; }} />}</Field>{failure && <ErrorBanner error={failure} />}</ConfirmDialog>}
  </div>;
}
