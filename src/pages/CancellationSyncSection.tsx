import { useState } from "react";
import { ApiError, newIdempotencyKey, type SyncOperationAction, type SyncOperationBody } from "../api/client";
import type { CancellationSyncView, SyncAttempt, SyncMechanism, SyncOperationView, SyncState } from "../api/types";
import { Badge, ConfirmDialog, ErrorText, Notice } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

const TONE: Record<SyncState, "success" | "warning" | "danger" | "neutral"> = {
  queued: "neutral", processing: "neutral", awaiting_pickup: "neutral", awaiting_confirmation: "warning", retry_scheduled: "warning", uncertain: "warning",
  confirmed: "success", rejected: "danger", failed: "danger", manual_review: "danger", withdrawn: "neutral", closed: "neutral",
};

type SyncDialog = "send" | SyncOperationAction | null;

export type CancellationSyncActions = {
  send: (body: { expectedVersion: number; reasonCode?: number; note?: string }, key: string) => Promise<SyncOperationView>;
  operation: (operationId: string, action: SyncOperationAction, body: SyncOperationBody, key: string) => Promise<SyncOperationView>;
};

/**
 * Trendyol's outbound call is the seller's unsupplied declaration, not a customer cancellation: its states are named as
 * such. The other channels keep the generic names.
 */
function useStateText(mechanism: SyncMechanism) {
  const { t } = useI18n();
  const s = t.orders.cancellation.sync;
  return {
    label: (state: SyncState) => (mechanism === "api" ? s.apiState[state] : undefined) ?? s.state[state] ?? state,
    hint: (state: SyncState) => (mechanism === "api" ? s.apiStateHint[state] : undefined) ?? s.stateHint[state],
  };
}

/**
 * API 2.36.0: the cancellation of this stop at its sales channel. The page never decides anything: the server says which
 * mechanism the channel has (Trendyol: Arasya calls the documented unsupplied notice; Trend Home / Outlet Perdele: the
 * shop's own connector picks the request up; B2B: a person acts), whether both gates are open, and which actions this
 * person may take. A provider's "accepted" is never shown as a confirmation, and nothing here starts a refund.
 */
export function CancellationSyncSection({ sync, controlVersion, actions, onChanged, onConflict }: {
  sync: CancellationSyncView; controlVersion: number; actions: CancellationSyncActions; onChanged: () => void; onConflict: () => void;
}) {
  const { t, dateTime, number } = useI18n();
  const s = t.orders.cancellation.sync;
  const [dialog, setDialog] = useState<SyncDialog>(null);
  const [notice, setNotice] = useState<"done" | "changed" | null>(null);
  const operation = sync.operation;
  const provider = sync.provider;
  const stateText = useStateText(provider.mechanism);
  const evidence = operation?.providerEvidence ?? null;
  const done = () => { setDialog(null); setNotice("done"); onChanged(); };
  const conflict = () => { setDialog(null); setNotice("changed"); onConflict(); };
  return (
    <div className="cancellation-sync" data-section="cancellation-sync" data-mechanism={provider.mechanism} data-sync-state={operation?.state ?? "none"}>
      <h3>{provider.mechanism === "api" ? s.apiTitle : s.title}</h3>
      <p className="muted small" data-sync-meaning={provider.mechanism}>{provider.mechanism === "api" ? s.apiHint : s.hint}</p>
      {notice && <Notice tone={notice === "changed" ? "warning" : "success"}>{notice === "changed" ? s.changed : s.done}</Notice>}
      <dl className="facts cancellation-facts">
        <dt>{s.facts.mechanism}</dt><dd data-provider-mechanism={provider.mechanism}>{s.mechanism[provider.mechanism]}</dd>
        <dt>{s.facts.gates}</dt>
        <dd data-provider-active={String(provider.active)}>
          {provider.mechanism === "manual" ? s.gate.manual : provider.active ? s.gate.active : !provider.configured ? s.gate.notConfigured : !provider.serverEnabled ? s.gate.serverOff : s.gate.flagOff}
        </dd>
        <dt>{s.facts.confirmation}</dt><dd>{s.confirmation[provider.confirmation] ?? provider.confirmation}</dd>
        {provider.unsupported.length > 0 && <><dt>{s.facts.unsupported}</dt><dd>{provider.unsupported.map((key) => s.unsupported[key] ?? key).join(" · ")}</dd></>}
        {operation && <>
          <dt>{s.facts.state}</dt><dd><Badge tone={TONE[operation.state]}>{stateText.label(operation.state)}</Badge><small className="cell-sub">{stateText.hint(operation.state)}</small></dd>
          {operation.reasonCode && <><dt>{s.facts.reason}</dt><dd>{provider.reasons?.[operation.reasonCode] ?? operation.reasonCode}</dd></>}
          <dt>{s.facts.attempts}</dt><dd className="mono">{number(operation.attempts)}</dd>
          {operation.nextAttemptAt && <><dt>{s.facts.nextAttempt}</dt><dd>{dateTime(operation.nextAttemptAt)}</dd></>}
          {operation.lastPulledAt && <><dt>{s.facts.pickedUp}</dt><dd>{dateTime(operation.lastPulledAt)}</dd></>}
          {operation.providerStatus && <><dt>{s.facts.providerStatus}</dt><dd className="mono">{operation.providerStatus}</dd></>}
          {operation.lastError && <><dt>{s.facts.lastError}</dt><dd data-sync-error={operation.lastError}>{s.error[operation.lastError] ?? operation.lastError}</dd></>}
          {operation.providerCheckRequired && evidence && <><dt>{s.facts.evidence}</dt>
            <dd data-sync-evidence={evidence.status}>{s.evidence[evidence.status] ?? evidence.status}
              {evidence.readAt && <small className="cell-sub">{s.evidenceRead} {dateTime(evidence.readAt)}{evidence.providerStatus && <> · <span className="mono">{evidence.providerStatus}</span></>}</small>}</dd></>}
          {operation.confirmedAt && <><dt>{s.facts.confirmedAt}</dt><dd>{dateTime(operation.confirmedAt)}{operation.confirmedBy && <small className="cell-sub">{s.confirmedBy[operation.confirmedBy]}</small>}</dd></>}
        </>}
      </dl>
      {!operation && <p className="muted" data-empty="cancellation-sync">{sync.required ? s.none : s.notRequired}</p>}
      <div className="button-row cancellation-actions">
        {sync.actions.send && <button type="button" className="button button-danger" data-action="sync-send" onClick={() => { setNotice(null); setDialog("send"); }}>{provider.mechanism === "manual" ? s.sendManual : provider.mechanism === "api" ? s.sendApi : s.send}</button>}
        {sync.actions.retry && operation && <button type="button" className="button button-secondary" data-action="sync-retry" onClick={() => { setNotice(null); setDialog("retry"); }}>{provider.mechanism === "api" ? s.retryApi : s.retry}</button>}
        {sync.actions.recheck && operation && <button type="button" className="button button-secondary" data-action="sync-recheck" onClick={() => { setNotice(null); setDialog("recheck"); }}>{s.recheck}</button>}
        {sync.actions.withdraw && operation && <button type="button" className="button button-secondary" data-action="sync-withdraw" onClick={() => { setNotice(null); setDialog("withdraw"); }}>{s.withdraw}</button>}
        {sync.actions.close && operation && <button type="button" className="button button-secondary" data-action="sync-close" onClick={() => { setNotice(null); setDialog("close"); }}>{s.close}</button>}
      </div>
      <p className="muted small">{s.noRefund}</p>
      {operation && operation.history.length > 0 && <History history={operation.history} mechanism={provider.mechanism} />}
      {dialog === "send" && <SendDialog sync={sync} controlVersion={controlVersion} onCancel={() => setDialog(null)} onDone={done} onConflict={conflict} submit={actions.send} />}
      {dialog !== null && dialog !== "send" && operation && (
        <OperationDialog action={dialog} operation={operation} onCancel={() => setDialog(null)} onDone={done} onConflict={conflict} submit={(body, key) => actions.operation(operation.id, dialog, body, key)} />
      )}
    </div>
  );
}

function History({ history, mechanism }: { history: SyncAttempt[]; mechanism: SyncMechanism }) {
  const { t, dateTime } = useI18n();
  const s = t.orders.cancellation.sync;
  const stateText = useStateText(mechanism);
  return (
    <div className="cancellation-events">
      <h3>{s.history}</h3>
      <ol className="timeline">
        {history.map((attempt) => (
          <li key={attempt.sequence} data-sync-attempt={attempt.kind} data-outcome={attempt.outcome}>
            <strong>{s.kind[attempt.kind] ?? attempt.kind}</strong>
            <span className="muted small"> · {stateText.label(attempt.to)}{attempt.httpStatus !== null && ` · HTTP ${attempt.httpStatus}`}{attempt.error && ` · ${s.error[attempt.error] ?? attempt.error}`}</span>
            <span className="muted small"> · {dateTime(attempt.occurredAt)}{attempt.actor && ` · ${"displayName" in attempt.actor ? attempt.actor.displayName : s.system}`}</span>
            {attempt.evidence?.attestation && (
              <span className="cell-sub small" data-sync-attestation>
                {s.attestation} {dateTime(attempt.evidence.attestation.checkedAt)}: „{attempt.evidence.attestation.note}”
                {attempt.evidence.serverRead && <> · {s.evidenceRead} {attempt.evidence.serverRead.readAt ? dateTime(attempt.evidence.serverRead.readAt) : "—"}{attempt.evidence.serverRead.providerStatus && <> · <span className="mono">{attempt.evidence.serverRead.providerStatus}</span></>}</>}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

type DialogProps<B> = { onCancel: () => void; onDone: () => void; onConflict: () => void; submit: (body: B, key: string) => Promise<SyncOperationView> };

function useSubmit<B>({ onDone, onConflict, submit }: DialogProps<B>) {
  const [key] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const run = async (body: B) => {
    setBusy(true); setError(null);
    try { await submit(body, key); onDone(); }
    catch (caught) {
      if (caught instanceof ApiError && (caught.code === "CANCELLATION_CHANGED" || caught.code === "CANCELLATION_SYNC_CHANGED")) onConflict();
      else setError(toProblem(caught));
    } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function SendDialog({ sync, controlVersion, ...props }: DialogProps<{ expectedVersion: number; reasonCode?: number; note?: string }> & { sync: CancellationSyncView; controlVersion: number }) {
  const { t } = useI18n();
  const s = t.orders.cancellation.sync;
  const [version] = useState(controlVersion);
  const api = sync.provider.mechanism === "api";
  const reasons = Object.entries(sync.provider.reasons ?? {});
  // A reason is chosen by a person, never preselected.
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useSubmit(props);
  const ready = !api || reason !== "";
  return (
    <ConfirmDialog title={s.sendTitle} confirmLabel={s.confirmSend} tone="danger" busy={busy} confirmDisabled={!ready}
      onConfirm={() => { void run({ expectedVersion: version, ...(api ? { reasonCode: Number(reason) } : {}), ...(note.trim() === "" ? {} : { note: note.trim() }) }); }} onCancel={props.onCancel}>
      <p>{s.sendBody[sync.provider.mechanism]}</p>
      {api && (
        <label className="field"><span>{s.reasonLabel}</span>
          <select value={reason} onChange={(event) => setReason(event.target.value)} data-field="sync-reason">
            <option value="">{s.reasonChoose}</option>
            {reasons.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>{s.noteLabel}</span><textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} /></label>
      <p className="muted small">{s.noRefund}</p>
      {error && <ErrorText error={error} />}
    </ConfirmDialog>
  );
}

export function OperationDialog({ action, operation, ...props }: DialogProps<SyncOperationBody> & { action: SyncOperationAction; operation: SyncOperationView }) {
  const { t, dateTime } = useI18n();
  const s = t.orders.cancellation.sync;
  const [version] = useState(operation.version);
  const [text, setText] = useState("");
  const { busy, error, run } = useSubmit(props);
  const needsText = action === "withdraw" || action === "close";
  // A retry after a possible delivery may repeat a notice the channel already received. The server requires its own fresh
  // evidence (a status read that found the package open after the observation window) and the person's dated statement
  // of their own check; the page asks for the statement only when the server's evidence allows a retry at all.
  const gated = action === "retry" && operation.providerCheckRequired === true;
  const evidence = operation.providerEvidence ?? null;
  const evidenceOk = evidence?.status === "ok";
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const statementReady = checkedAt !== null && text.trim().length >= 10;
  const disabled = (needsText && text.trim().length < 10) || (gated && (!evidenceOk || !statementReady));
  const body = (): SyncOperationBody => {
    if (action === "withdraw") return { expectedVersion: version, reason: text.trim() };
    if (action === "close") return { expectedVersion: version, note: text.trim() };
    if (gated && checkedAt !== null) return { expectedVersion: version, providerCheck: { checkedAt, note: text.trim() } };
    return { expectedVersion: version };
  };
  return (
    <ConfirmDialog title={s.dialog[action].title} confirmLabel={s.dialog[action].confirm} busy={busy} confirmDisabled={disabled}
      onConfirm={() => { void run(body()); }} onCancel={props.onCancel}>
      <p>{s.dialog[action].body}</p>
      {gated && (
        <>
          <p className="notice notice-warning" data-sync-uncertain>{s.dialog.retry.uncertain}</p>
          <p className="small" data-sync-evidence={evidence?.status ?? "missing"}>
            <strong>{s.facts.evidence}:</strong> {s.evidence[evidence?.status ?? "missing"]}
            {evidence?.readAt && <> · {s.evidenceRead} {dateTime(evidence.readAt)}{evidence.providerStatus && <> · <span className="mono">{evidence.providerStatus}</span></>}</>}
          </p>
          {!evidenceOk && <p className="notice notice-danger" data-sync-evidence-blocked>{s.dialog.retry.evidenceBlocked}</p>}
          {evidenceOk && (
            <>
              <label className="checkbox"><input type="checkbox" checked={checkedAt !== null} onChange={(event) => setCheckedAt(event.target.checked ? new Date().toISOString() : null)} data-field="sync-uncertain-checked" /> <span>{s.dialog.retry.uncertainConfirm}</span></label>
              <label className="field"><span>{s.dialog.retry.field}</span><textarea value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} data-field="sync-provider-check-note" /></label>
              <p className="muted small">{s.dialog.retry.attestationHint}</p>
            </>
          )}
        </>
      )}
      {needsText && <label className="field"><span>{s.dialog[action].field}</span><textarea value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} /></label>}
      {error && <ErrorText error={error} />}
    </ConfirmDialog>
  );
}
