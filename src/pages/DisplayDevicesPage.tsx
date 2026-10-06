import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, newIdempotencyKey } from "../api/client";
import type { DisplayPairing } from "../api/cutting";
import { useDashboard } from "../app/context";
import { useI18n } from "../i18n/context";
import { toProblem, type Problem } from "../i18n";
import { Card, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";
import { useLoaderWithSignal } from "./useLoaderWithSignal";

export function DisplayDevicesPage() {
  const { api, me } = useDashboard(); const { dateTime } = useI18n();
  const load = useCallback((signal: AbortSignal) => api.displayDevices(signal), [api]);
  const { data, error, reload } = useLoaderWithSignal(load, "display-devices");
  const [name, setName] = useState("Zona de tăiere perdele"); const [pairing, setPairing] = useState<DisplayPairing | null>(null);
  const [busy, setBusy] = useState(false); const [failure, setFailure] = useState<Problem | null>(null); const [notice, setNotice] = useState("");
  const [thresholds, setThresholds] = useState<string[]>([]); const key = useRef("");
  useEffect(() => {
    if (!pairing || !me.isRoot) return;
    const abort = new AbortController();
    const timer = window.setInterval(() => {
      api.displayDevices(abort.signal).then(d => {
        const current = d.items.find(device => device.id === pairing.id);
        if (!current?.pairingExpiresAt || new Date(pairing.pairingExpiresAt).getTime() <= Date.now()) { setPairing(null); reload(); }
      }, () => undefined);
    }, 5000);
    return () => { window.clearInterval(timer); abort.abort(); };
  }, [api, pairing, me.isRoot, reload]);
  if (!me.isRoot) return <PageHeader title="Dispozitive de afișare" description="Doar Root poate administra dispozitivele și pragurile." />;
  async function run(action: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setFailure(null); setNotice("");
    try {
      const result = await action();
      if (result && typeof result === "object" && "pairingExpiresAt" in result) {
        const next = result as DisplayPairing; setPairing(next);
        if (!next.pairingCode) setNotice("Cererea a fost deja aplicată. Pentru un cod nou, folosește Reasociază.");
      }
      key.current = ""; reload();
    } catch(e) { const problem = toProblem(e); setFailure(problem); if (problem instanceof ApiError && problem.status < 500) key.current = ""; } finally { setBusy(false); }
  }
  const mutationKey = () => { key.current ||= newIdempotencyKey(); return key.current; };
  return <div className="page"><PageHeader title="Dispozitive de afișare · Root" description="Sesiuni separate, numai citire. Nu folosi conturi permanente de angajat pe televizor." />
    {(error || failure) && <ErrorBanner error={(failure ?? error)!} onRetry={reload} />}{notice && <Notice>{notice}</Notice>}
    {pairing?.pairingCode && <Card title="Cod unic de asociere"><p>Pe televizor deschide <a href="https://staff.arasyahome.ro/cutting-board" target="_blank" rel="noreferrer">panoul de tăiere</a> și introdu codul:</p><p className="pairing-code" aria-label="Cod unic">{pairing.pairingCode}</p><p>Expiră: {dateTime(pairing.pairingExpiresAt)} · o singură utilizare. Codul nu este salvat pentru reafișare.</p><button type="button" className="button button-secondary" onClick={() => setPairing(null)}>Ascunde codul</button></Card>}
    <Card title="Asociază un dispozitiv nou"><form onSubmit={e => { e.preventDefault(); void run(() => api.createDisplay(name.trim(), mutationKey())); }}><Field label="Nume dispozitiv">{id => <input id={id} maxLength={100} minLength={3} required value={name} onChange={e => { setName(e.target.value); key.current = ""; }} />}</Field><button type="submit" className="button button-primary" disabled={busy}>Creează și generează codul</button></form></Card>
    {!data && !error && <Loading />}{data && <>
      <Card title="Dispozitive și ultima conectare"><div className="table-scroll"><table className="table"><thead><tr><th>Dispozitiv</th><th>Ultima conectare</th><th>Stare</th><th>Acțiuni Root</th></tr></thead><tbody>{data.items.map(d => <tr key={d.id}><td>{d.name}</td><td>{dateTime(d.lastSeenAt)}</td><td>{d.revokedAt ? "Revocat" : d.pairingExpiresAt ? "Așteaptă asocierea" : d.sessionExpiresAt ? "Asociat" : "Neasociat"}</td><td><div className="row-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => { if (window.confirm("Revoci sesiunea veche și generezi un cod nou?")) { key.current = ""; void run(() => api.repairDisplay(d.id, mutationKey())); } }}>Reasociază</button><button type="button" className="button button-danger" disabled={busy} onClick={() => { if (window.confirm("Revoci imediat accesul acestui dispozitiv?")) { key.current = ""; void run(() => api.revokeDisplay(d.id, mutationKey())); } }}>Revocă</button></div></td></tr>)}</tbody></table></div></Card>
      <Card title="Praguri de timp · doar Root"><p>Culori neutre după minute active. Așteptarea aprobării nu mărește avertizarea angajatului.</p><form onSubmit={e => { e.preventDefault(); void run(() => api.displayThresholds(data.settings.version, thresholds.length ? thresholds.map(Number) : data.settings.thresholds, mutationKey())); }}><div className="grid-3">{[0,1,2].map(i => <Field key={i} label={`Prag ${i + 1} (minute)`}>{id => <input id={id} type="number" min={1} max={1440} required value={thresholds[i] ?? data.settings.thresholds[i]} onChange={e => { setThresholds(current => data.settings.thresholds.map((v, n) => n === i ? e.target.value : current[n] ?? String(v))); key.current = ""; }} />}</Field>)}</div><button type="submit" className="button button-primary" disabled={busy}>Salvează pragurile</button></form></Card>
    </>}
  </div>;
}
