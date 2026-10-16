import { useEffect, useState } from "react";
import type { CancellationSyncDryRun, CancellationSyncOverview as Overview, SyncDiscrepancy } from "../api/types";
import { useDashboard } from "../app/context";
import { orderPath } from "../app/router";
import { Badge, ErrorText, Loading } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

/**
 * API 2.36.0: the cancellation synchronization at a glance. Each sales channel with its mechanism and gates, the
 * operations by state, and the reconciliation findings the operator recorded. A dry run lists the current findings
 * without changing or recording anything; only the operator CLI records them.
 */
export function CancellationSyncOverview() {
  const { api, can } = useDashboard();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  useEffect(() => {
    if (!can("orders.view_all")) return;
    const controller = new AbortController();
    api.cancellationSyncOverview(controller.signal).then((value) => { setData(value); setError(null); }, (caught: unknown) => { if (!controller.signal.aborted) setError(toProblem(caught)); });
    return () => controller.abort();
  }, [api, can]);
  if (!can("orders.view_all")) return null;
  if (error && !data) return <section className="card" data-testid="cancellation-sync-overview"><ErrorText error={error} /></section>;
  if (!data) return <section className="card" data-testid="cancellation-sync-overview"><Loading label="…" /></section>;
  return <CancellationSyncOverviewView data={data} dryRun={() => api.reconcileCancellationSync()} />;
}

export function CancellationSyncOverviewView({ data, dryRun }: { data: Overview; dryRun: () => Promise<CancellationSyncDryRun> }) {
  const { t, number, dateTime } = useI18n();
  const s = t.orders.cancellation.sync;
  const o = t.production.cancellationSync;
  const [result, setResult] = useState<CancellationSyncDryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { setResult(await dryRun()); } catch (caught) { setError(toProblem(caught)); } finally { setBusy(false); }
  };
  if (!data.ready) return <section className="card" data-testid="cancellation-sync-overview" data-ready="false"><div className="card-header"><div><h2>{o.title}</h2><p>{o.notReady}</p></div></div></section>;
  return (
    <section className="card" data-testid="cancellation-sync-overview" data-ready="true">
      <div className="card-header"><div><h2>{o.title}</h2><p>{o.hint}</p></div></div>
      <div className="table-scroll">
        <table className="data-table compact-table">
          <thead><tr><th>{o.channel}</th><th>{s.facts.mechanism}</th><th>{s.facts.gates}</th><th>{o.operations}</th></tr></thead>
          <tbody>
            {data.providers.map((provider) => {
              const states = Object.entries(data.operations[provider.source] ?? {}).filter(([, count]) => (count ?? 0) > 0);
              return (
                <tr key={provider.source} data-provider={provider.source} data-active={String(provider.active)}>
                  <td data-label={o.channel}>{o.source[provider.source] ?? provider.source}</td>
                  <td data-label={s.facts.mechanism}>{s.mechanism[provider.mechanism]}</td>
                  <td data-label={s.facts.gates}><Badge tone={provider.active ? "success" : "neutral"}>{provider.mechanism === "manual" ? s.gate.manual : provider.active ? s.gate.active : !provider.configured ? s.gate.notConfigured : !provider.serverEnabled ? s.gate.serverOff : s.gate.flagOff}</Badge></td>
                  <td data-label={o.operations}>{states.length === 0 ? "—" : states.map(([state, count]) => `${s.state[state] ?? state}: ${number(count ?? 0)}`).join(" · ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>{o.findings}</h3>
      <Findings items={data.discrepancies} empty={o.findingsNone} />
      {data.capabilities.sync && (
        <div className="button-row">
          <button type="button" className="button button-secondary" data-action="sync-dry-run" disabled={busy} onClick={() => { void run(); }}>{o.dryRun}</button>
        </div>
      )}
      <p className="muted small">{o.dryRunHint}</p>
      {error && <ErrorText error={error} />}
      {result && (
        <div data-testid="cancellation-sync-dry-run">
          <p className="muted small">{o.dryRunResult(number(result.findings.length), dateTime(result.checkedAt))}</p>
          <Findings items={result.findings} empty={o.findingsNone} />
        </div>
      )}
    </section>
  );
}

function Findings({ items, empty }: { items: SyncDiscrepancy[]; empty: string }) {
  const { navigate } = useDashboard();
  const { t } = useI18n();
  const o = t.production.cancellationSync;
  if (items.length === 0) return <p className="muted" data-empty="sync-findings">{empty}</p>;
  return (
    <div className="table-scroll">
      <table className="data-table compact-table">
        <thead><tr><th>{o.order}</th><th>{o.kind}</th><th>{o.remediation}</th></tr></thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id ?? `${item.kind}-${item.orderId ?? index}`} data-finding={item.kind} data-severity={item.severity}>
              <td data-label={o.order}>{item.orderId ? <a className="mono order-link" href={orderPath(item.orderId)} onClick={(event) => { event.preventDefault(); navigate(orderPath(item.orderId as string)); }}>{item.orderNumber ?? item.orderId}</a> : "—"}
                {item.beforeBaseline && <small className="cell-sub">{o.beforeBaseline}</small>}</td>
              <td data-label={o.kind}><Badge tone={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "neutral"}>{o.kindLabel[item.kind] ?? item.kind}</Badge></td>
              <td data-label={o.remediation}>{o.remediationLabel[item.remediation] ?? item.remediation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
