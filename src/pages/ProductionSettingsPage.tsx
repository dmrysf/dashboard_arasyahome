import { useState } from "react";
import { newIdempotencyKey } from "../api/client";
import type { ProductionSettings } from "../api/types";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Badge, Card, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

/** Root-only production policy: approval mode (read-only in V1), fault reasons, stage display labels. */
export function ProductionSettingsPage() {
  const { api, me } = useDashboard();
  const { t } = useI18n();
  const s = t.productionSettings;
  const allowed = Boolean(me.capabilities?.manageProductionSettings);
  const { data, error, reload, setData } = useLoader<ProductionSettings | null>(() => (allowed ? api.productionSettings() : Promise.resolve(null)), String(allowed));
  const [failure, setFailure] = useState<Problem | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ key: "", label: "", requiresComment: false, sortOrder: 100 });
  const [labels, setLabels] = useState<Record<string, string>>({});
  if (!allowed) return <PageHeader title={s.title} description={s.noAccess} />;
  if (error && !data) return <div className="page"><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Loading /></div>;

  async function run(action: (key: string) => Promise<ProductionSettings>) {
    if (busy) return false;
    setBusy(true); setFailure(null); setSaved(false);
    try { setData(await action(newIdempotencyKey())); setSaved(true); return true; }
    catch (caught) { setFailure(toProblem(caught)); return false; }
    finally { setBusy(false); }
  }

  return (
    <div className="page production-settings-page">
      <PageHeader title={s.title} description={s.hint} />
      {saved && <Notice tone="success">{s.saved}</Notice>}
      {failure && <ErrorBanner error={failure} />}
      <Card title={s.policy} description={s.policyNote}><Badge tone="accent">{s.modes[data.policy.approvalMode] ?? data.policy.approvalMode}</Badge></Card>
      <Card title={s.reasons}>
        <table className="table"><thead><tr><th>{s.key}</th><th>{s.label}</th><th>{s.requiresComment}</th><th>{s.sortOrder}</th><th /></tr></thead><tbody>
          {data.reasons.map((reason) => <tr key={reason.key}>
            <td><code>{reason.key}</code></td><td>{reason.label}</td><td>{reason.requiresComment ? "✓" : "—"}</td><td>{reason.sortOrder}</td>
            <td><button type="button" className="button button-ghost" disabled={busy} onClick={() => { void run((key) => api.updateReason(reason.key, { status: reason.status === "active" ? "inactive" : "active" }, key)); }}>{reason.status === "active" ? s.deactivate : s.activate}</button></td>
          </tr>)}
        </tbody></table>
        <form className="reason-form" onSubmit={(event) => { event.preventDefault(); void run((key) => api.createReason(draft, key)).then((ok) => { if (ok) setDraft({ key: "", label: "", requiresComment: false, sortOrder: 100 }); }); }}>
          <Field label={s.key}>{(id) => <input id={id} value={draft.key} pattern="[a-z][a-z0-9-]{1,59}" onChange={(event) => setDraft({ ...draft, key: event.target.value })} />}</Field>
          <Field label={s.label}>{(id) => <input id={id} value={draft.label} maxLength={160} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />}</Field>
          <Field label={s.sortOrder}>{(id) => <input id={id} type="number" min={0} max={9999} value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number.parseInt(event.target.value || "0", 10) })} />}</Field>
          <label className="checkbox"><input type="checkbox" checked={draft.requiresComment} onChange={(event) => setDraft({ ...draft, requiresComment: event.target.checked })} /> <span>{s.requiresComment}</span></label>
          <button type="submit" className="button button-primary" disabled={busy || !draft.key || draft.label.trim().length < 2}>{s.add}</button>
        </form>
      </Card>
      <Card title={s.stages} description={s.stagesNote}>
        <ul className="stage-labels">{data.stages.map((stage) => <li key={stage.id}>
          <span className="muted small">{stage.ordinal}. <code>{stage.id}</code></span>
          <input aria-label={`${stage.ordinal}. ${stage.id}`} value={labels[stage.id] ?? stage.label} maxLength={160} onChange={(event) => setLabels({ ...labels, [stage.id]: event.target.value })} />
          <button type="button" className="button button-secondary" disabled={busy || (labels[stage.id] ?? stage.label) === stage.label || (labels[stage.id] ?? "").trim().length < 2}
            onClick={() => { const label = labels[stage.id].trim(); void run((key) => api.renameStage(stage.id, label, key)).then((ok) => { if (ok) setLabels((current) => { const next = { ...current }; delete next[stage.id]; return next; }); }); }}>{s.save}</button>
        </li>)}</ul>
      </Card>
    </div>
  );
}
