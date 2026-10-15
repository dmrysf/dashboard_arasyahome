import { useCallback, useEffect, useState } from "react";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { CancellationControlView, OrderCancellation, PhysicalOutcome } from "../api/types";
import { useDashboard } from "../app/context";
import { Badge, ConfirmDialog, ErrorText, Loading, Notice } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

type Dialog = "stop" | "physical" | "release" | null;

/**
 * API 2.35.0 cancellation control of one order. The server decides everything: the stop blocks every manufacturing
 * command, a release is accepted only when the source no longer reports a cancellation, the physical state was
 * verified and the document is usable. Buttons follow the server's capabilities and are a convenience, not security.
 * Nothing here writes to a source; a "cancellation at the source" is only recorded as a request.
 */
export function CancellationPanel({ orderId, revision, onChanged }: { orderId: string; revision: number; onChanged?: () => void }) {
  const { api } = useDashboard();
  const { t } = useI18n();
  const [data, setData] = useState<OrderCancellation | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.orderCancellation(orderId, controller.signal).then((value) => { setData(value); setError(null); }, (caught: unknown) => { if (!controller.signal.aborted) setError(toProblem(caught)); });
    return () => controller.abort();
  }, [api, orderId, revision, reload]);
  const changed = useCallback((next: OrderCancellation) => { setData(next); onChanged?.(); }, [onChanged]);
  if (error && !data) return <section className="card cancellation-card" data-section="cancellation"><ErrorText error={error} /></section>;
  if (!data) return <section className="card cancellation-card" data-section="cancellation"><Loading label={t.orders.cancellation.loading} /></section>;
  return <CancellationPanelView data={data} onChanged={changed} onConflict={() => setReload((value) => value + 1)}
    stop={(body, key) => api.stopProduction(orderId, body, key)}
    physical={(body, key) => api.recordPhysical(orderId, body, key)}
    release={(body, key) => api.releaseStop(orderId, body, key)} />;
}

export type CancellationPanelViewProps = {
  data: OrderCancellation;
  onChanged: (next: OrderCancellation) => void;
  onConflict: () => void;
  stop: (body: { reason: string; requestSourceCancellation: boolean }, key: string) => Promise<OrderCancellation>;
  physical: (body: { expectedVersion: number; outcome: PhysicalOutcome; note: string; qrToken?: string }, key: string) => Promise<OrderCancellation>;
  release: (body: { expectedVersion: number; reason: string }, key: string) => Promise<OrderCancellation>;
};

export function CancellationPanelView({ data, onChanged, onConflict, stop, physical, release }: CancellationPanelViewProps) {
  const { t } = useI18n();
  const c = t.orders.cancellation;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<"done" | "changed" | null>(null);
  const control = data.cancellation;
  const held = control?.state === "stopped";
  const finish = (next: OrderCancellation) => { setDialog(null); setNotice("done"); onChanged(next); };
  const conflict = () => { setDialog(null); setNotice("changed"); onConflict(); };
  return (
    <section className="card cancellation-card" data-section="cancellation" data-stop-state={control?.state ?? "none"}>
      <div className="card-header"><div><h2>{c.title}</h2><p>{c.hint}</p></div>{control && <Badge tone={held ? "danger" : "neutral"}>{c.state[control.state]}</Badge>}</div>
      {notice && <Notice tone={notice === "changed" ? "warning" : "success"}>{notice === "changed" ? c.changed : c.done}</Notice>}
      {control ? <ControlFacts control={control} /> : <p className="muted" data-empty="cancellation">{c.none}</p>}
      <div className="button-row cancellation-actions">
        {data.capabilities.stop && !held && !data.productionCompleted && <button type="button" className="button button-danger" data-action="stop" onClick={() => { setNotice(null); setDialog("stop"); }}>{c.stop}</button>}
        {data.capabilities.recordPhysical && held && <button type="button" className="button button-secondary" data-action="physical" onClick={() => { setNotice(null); setDialog("physical"); }}>{c.physicalAction}</button>}
        {data.capabilities.release && held && control?.release.possible && <button type="button" className="button button-primary" data-action="release" onClick={() => { setNotice(null); setDialog("release"); }}>{c.releaseAction}</button>}
      </div>
      {held && control && !control.release.possible && control.release.refusal && <p className="muted small" data-release-refusal={control.release.refusal}>{c.releaseBlocked} {c.refusal[control.release.refusal] ?? control.release.refusal}</p>}
      <Events data={data} />
      {dialog === "stop" && <StopDialog onCancel={() => setDialog(null)} onDone={finish} onConflict={conflict} submit={stop} />}
      {dialog === "physical" && control && <PhysicalDialog control={control} onCancel={() => setDialog(null)} onDone={finish} onConflict={conflict} submit={physical} />}
      {dialog === "release" && control && <ReleaseDialog control={control} onCancel={() => setDialog(null)} onDone={finish} onConflict={conflict} submit={release} />}
    </section>
  );
}

function ControlFacts({ control }: { control: CancellationControlView }) {
  const { t, dateTime, stage: stageName } = useI18n();
  const c = t.orders.cancellation;
  const f = c.facts;
  return (
    <dl className="facts cancellation-facts">
      <dt>{f.category}</dt><dd data-category={control.category}><strong>{c.category[control.category] ?? control.category}</strong></dd>
      <dt>{f.nextAction}</dt><dd data-next-action={control.nextAction}>{c.nextAction[control.nextAction] ?? control.nextAction}</dd>
      <dt>{f.origin}</dt><dd>{c.origin[control.origin]} · {c.reason[control.reason] ?? control.reason}</dd>
      {control.reasonNote && <><dt>{f.note}</dt><dd>{control.reasonNote}</dd></>}
      <dt>{f.source}</dt><dd>{c.sourceStatus[control.source.status]}{control.source.statusLabel && <span className="muted small"> · {control.source.statusLabel}</span>}</dd>
      {control.source.cancellationReceivedAt && <><dt>{f.received}</dt><dd>{dateTime(control.source.cancellationReceivedAt)}</dd></>}
      <dt>{f.request}</dt><dd>{c.request[control.source.request]}<small className="cell-sub">{c.outbound}</small></dd>
      <dt>{f.atStop}</dt><dd>{c.phase[control.atStop.phase]}</dd>
      <dt>{f.stage}</dt><dd>{stageName(control.atStop.stageId, control.atStop.stageId)}</dd>
      <dt>{f.owner}</dt><dd>{control.atStop.owner?.displayName ?? t.orders.noOwner}</dd>
      <dt>{f.exception}</dt><dd>{control.atStop.exceptionId ? c.yes : c.no}</dd>
      {control.atStop.tracks.length > 0 && <><dt>{f.tracks}</dt><dd>{control.atStop.tracks.map((track) => stageName(track.stageId, track.stageId)).join(", ")}</dd></>}
      <dt>{f.physical}</dt><dd data-physical={control.physical.status}>{c.physical[control.physical.status]}{control.physical.outcome && <> · {c.outcome[control.physical.outcome]}</>}</dd>
      {control.physical.note && <><dt>{f.note}</dt><dd>{control.physical.note}{control.physical.scan && <small className="cell-sub">{c.scan[control.physical.scan]}</small>}</dd></>}
      {control.physical.verifiedBy && <><dt>{f.verifiedBy}</dt><dd>{control.physical.verifiedBy.displayName} · {dateTime(control.physical.verifiedAt)}</dd></>}
      <dt>{f.heldAt}</dt><dd>{dateTime(control.heldAt)}{control.heldBy && <span className="muted small"> · {control.heldBy.displayName}</span>}</dd>
      {control.releasedAt && <><dt>{f.releasedAt}</dt><dd>{dateTime(control.releasedAt)}{control.releasedBy && <span className="muted small"> · {control.releasedBy.displayName}</span>}</dd></>}
      {control.releaseReason && <><dt>{f.releaseReason}</dt><dd>{control.releaseReason}</dd></>}
      <dt>{f.version}</dt><dd className="mono">{control.version}</dd>
    </dl>
  );
}

function Events({ data }: { data: OrderCancellation }) {
  const { t, dateTime } = useI18n();
  const c = t.orders.cancellation;
  if (data.events.length === 0) return null;
  return (
    <div className="cancellation-events">
      <h3>{c.events}</h3>
      <p className="muted small">{c.eventsHint}</p>
      <ol className="timeline">
        {data.events.map((event) => (
          <li key={event.id} data-event={event.type}>
            <strong>{c.event[event.type] ?? event.type}</strong>
            <span className="muted small"> · {dateTime(event.occurredAt)}{event.actor && ` · ${event.actor.displayName}`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type DialogProps<B> = { onCancel: () => void; onDone: (next: OrderCancellation) => void; onConflict: () => void; submit: (body: B, key: string) => Promise<OrderCancellation> };

function useSubmit<B>({ onDone, onConflict, submit }: DialogProps<B>) {
  const [key] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const run = async (body: B) => {
    setBusy(true); setError(null);
    try { onDone(await submit(body, key)); }
    catch (caught) {
      if (caught instanceof ApiError && caught.code === "CANCELLATION_CHANGED") onConflict();
      else setError(toProblem(caught));
    } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function StopDialog(props: DialogProps<{ reason: string; requestSourceCancellation: boolean }>) {
  const { t } = useI18n();
  const c = t.orders.cancellation;
  const [reason, setReason] = useState("");
  const [requestSource, setRequestSource] = useState(false);
  const { busy, error, run } = useSubmit(props);
  return (
    <ConfirmDialog title={c.stopTitle} confirmLabel={c.confirmStop} tone="danger" busy={busy} confirmDisabled={reason.trim().length < 10}
      onConfirm={() => { void run({ reason: reason.trim(), requestSourceCancellation: requestSource }); }} onCancel={props.onCancel}>
      <p>{c.stopBody}</p>
      <label className="field"><span>{c.stopReason}</span><textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="check-field"><input type="checkbox" checked={requestSource} onChange={(event) => setRequestSource(event.target.checked)} /> {c.requestSource}</label>
      <p className="muted small">{c.requestSourceHint}</p>
      {error && <ErrorText error={error} />}
    </ConfirmDialog>
  );
}

function PhysicalDialog({ control, ...props }: DialogProps<{ expectedVersion: number; outcome: PhysicalOutcome; note: string; qrToken?: string }> & { control: CancellationControlView }) {
  const { t } = useI18n();
  const c = t.orders.cancellation;
  const [version] = useState(control.version);
  const outcomes: PhysicalOutcome[] = control.atStop.phase === "completed" ? ["secured", "left_factory"] : ["secured", "nothing_produced", "left_factory"];
  const [outcome, setOutcome] = useState<PhysicalOutcome>("secured");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState("");
  const { busy, error, run } = useSubmit(props);
  const ready = note.trim().length >= 5 && (outcome !== "secured" || qr.trim() !== "");
  return (
    <ConfirmDialog title={c.physicalTitle} confirmLabel={c.confirmPhysical} busy={busy} confirmDisabled={!ready}
      onConfirm={() => { void run({ expectedVersion: version, outcome, note: note.trim(), ...(qr.trim() === "" ? {} : { qrToken: qr.trim() }) }); }} onCancel={props.onCancel}>
      <p>{c.physicalBody}</p>
      <label className="field"><span>{c.physicalOutcome}</span>
        <select value={outcome} onChange={(event) => setOutcome(event.target.value as PhysicalOutcome)}>{outcomes.map((value) => <option key={value} value={value}>{c.outcome[value]}</option>)}</select>
      </label>
      <label className="field"><span>{c.physicalNote}</span><textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} /></label>
      <label className="field"><span>{c.physicalQr}</span><input value={qr} autoComplete="off" spellCheck={false} onChange={(event) => setQr(event.target.value)} /></label>
      <p className="muted small">{c.physicalQrHint}</p>
      {error && <ErrorText error={error} />}
    </ConfirmDialog>
  );
}

function ReleaseDialog({ control, ...props }: DialogProps<{ expectedVersion: number; reason: string }> & { control: CancellationControlView }) {
  const { t } = useI18n();
  const c = t.orders.cancellation;
  const [version] = useState(control.version);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(props);
  return (
    <ConfirmDialog title={c.releaseTitle} confirmLabel={c.confirmRelease} busy={busy} confirmDisabled={reason.trim().length < 10}
      onConfirm={() => { void run({ expectedVersion: version, reason: reason.trim() }); }} onCancel={props.onCancel}>
      <p>{c.releaseBody}</p>
      <label className="field"><span>{c.releaseReason}</span><textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
      {error && <ErrorText error={error} />}
    </ConfirmDialog>
  );
}
