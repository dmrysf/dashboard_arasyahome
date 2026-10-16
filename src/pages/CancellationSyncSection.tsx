import { useState } from "react";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { CancellationSyncView, SyncAttempt, SyncOperationView, SyncState } from "../api/types";
import { Badge, ConfirmDialog, ErrorText, Notice } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

const TONE: Record<SyncState, "success" | "warning" | "danger" | "neutral"> = {
  queued: "neutral", processing: "neutral", awaiting_pickup: "neutral", awaiting_confirmation: "warning", retry_scheduled: "warning", uncertain: "warning",
  confirmed: "success", rejected: "danger", failed: "danger", manual_review: "danger", withdrawn: "neutral", closed: "neutral",
};

type SyncDialog = "send" | "retry" | "withdraw" | "close" | null;

export type CancellationSyncActions = {
  send: (body: { expectedVersion: number; reasonCode?: number; note?: string }, key: string) => Promise<SyncOperationView>;
  operation: (operationId: string, action: "retry" | "withdraw" | "close", body: { expectedVersion: number; reason?: string; note?: string }, key: string) => Promise<SyncOperationView>;
};

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
  const done = () => { setDialog(null); setNotice("done"); onChanged(); };
  const conflict = () => { setDialog(null); setNotice("changed"); onConflict(); };
  return (
    <div className="cancellation-sync" data-section="cancellation-sync" data-mechanism={provider.mechanism} data-sync-state={operation?.state ?? "none"}>
      <h3>{s.title}</h3>
      <p className="muted small">{s.hint}</p>
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
          <dt>{s.facts.state}</dt><dd><Badge tone={TONE[operation.state]}>{s.state[operation.state]}</Badge><small className="cell-sub">{s.stateHint[operation.state]}</small></dd>
          {operation.reasonCode && <><dt>{s.facts.reason}</dt><dd>{provider.reasons?.[operation.reasonCode] ?? operation.reasonCode}</dd></>}
          <dt>{s.facts.attempts}</dt><dd className="mono">{number(operation.attempts)}</dd>
          {operation.nextAttemptAt && <><dt>{s.facts.nextAttempt}</dt><dd>{dateTime(operation.nextAttemptAt)}</dd></>}
          {operation.lastPulledAt && <><dt>{s.facts.pickedUp}</dt><dd>{dateTime(operation.lastPulledAt)}</dd></>}
          {operation.providerStatus && <><dt>{s.facts.providerStatus}</dt><dd className="mono">{operation.providerStatus}</dd></>}
          {operation.lastError && <><dt>{s.facts.lastError}</dt><dd data-sync-error={operation.lastError}>{s.error[operation.lastError] ?? operation.lastError}</dd></>}
          {operation.confirmedAt && <><dt>{s.facts.confirmedAt}</dt><dd>{dateTime(operation.confirmedAt)}{operation.confirmedBy && <small className="cell-sub">{s.confirmedBy[operation.confirmedBy]}</small>}</dd></>}
        </>}
      </dl>
      {!operation && <p className="muted" data-empty="cancellation-sync">{sync.required ? s.none : s.notRequired}</p>}
      <div className="button-row cancellation-actions">
        {sync.actions.send && <button type="button" className="button button-danger" data-action="sync-send" onClick={() => { setNotice(null); setDialog("send"); }}>{provider.mechanism === "manual" ? s.sendManual : s.send}</button>}
        {sync.actions.retry && operation && <button type="button" className="button button-secondary" data-action="sync-retry" onClick={() => { setNotice(null); setDialog("retry"); }}>{s.retry}</button>}
        {sync.actions.withdraw && operation && <button type="button" className="button button-secondary" data-action="sync-withdraw" onClick={() => { setNotice(null); setDialog("withdraw"); }}>{s.withdraw}</button>}
        {sync.actions.close && operation && <button type="button" className="button button-secondary" data-action="sync-close" onClick={() => { setNotice(null); setDialog("close"); }}>{s.close}</button>}
      </div>
      <p className="muted small">{s.noRefund}</p>
      {operation && operation.history.length > 0 && <History history={operation.history} />}
      {dialog === "send" && <SendDialog sync={sync} controlVersion={controlVersion} onCancel={() => setDialog(null)} onDone={done} onConflict={conflict} submit={actions.send} />}
      {dialog !== null && dialog !== "send" && operation && (
        <OperationDialog action={dialog} operation={operation} onCancel={() => setDialog(null)} onDone={done} onConflict={conflict} submit={(body, key) => actions.operation(operation.id, dialog, body, key)} />
      )}
    </div>
  );
}

function History({ history }: { history: SyncAttempt[] }) {
  const { t, dateTime } = useI18n();
  const s = t.orders.cancellation.sync;
  return (
    <div className="cancellation-events">
      <h3>{s.history}</h3>
      <ol className="timeline">
        {history.map((attempt) => (
          <li key={attempt.sequence} data-sync-attempt={attempt.kind} data-outcome={attempt.outcome}>
            <strong>{s.kind[attempt.kind] ?? attempt.kind}</strong>
            <span className="muted small"> · {s.state[attempt.to] ?? attempt.to}{attempt.httpStatus !== null && ` · HTTP ${attempt.httpStatus}`}{attempt.error && ` · ${s.error[attempt.error] ?? attempt.error}`}</span>
            <span className="muted small"> · {dateTime(attempt.occurredAt)}{attempt.actor && ` · ${"displayName" in attempt.actor ? attempt.actor.displayName : s.system}`}</span>
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

function OperationDialog({ action, operation, ...props }: DialogProps<{ expectedVersion: number; reason?: string; note?: string }> & { action: "retry" | "withdraw" | "close"; operation: SyncOperationView }) {
  const { t } = useI18n();
  const s = t.orders.cancellation.sync;
  const [version] = useState(operation.version);
  const [text, setText] = useState("");
  const { busy, error, run } = useSubmit(props);
  const needsText = action !== "retry";
  return (
    <ConfirmDialog title={s.dialog[action].title} confirmLabel={s.dialog[action].confirm} busy={busy} confirmDisabled={needsText && text.trim().length < 10}
      onConfirm={() => { void run({ expectedVersion: version, ...(action === "withdraw" ? { reason: text.trim() } : action === "close" ? { note: text.trim() } : {}) }); }} onCancel={props.onCancel}>
      <p>{s.dialog[action].body}</p>
      {needsText && <label className="field"><span>{s.dialog[action].field}</span><textarea value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} /></label>}
      {error && <ErrorText error={error} />}
    </ConfirmDialog>
  );
}
