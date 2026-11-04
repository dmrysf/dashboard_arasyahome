import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, newIdempotencyKey } from "../api/client";
import { RECONCILE_ACTION, exceedsOutstanding, isAvailable, normalizeAmount, type EditCatalog, type EditField, type EditOperation, type EditPreview, type EditProduct, type InterventionAction, type InterventionOrder, type InterventionOverview } from "../api/interventions";
import { useDashboard } from "../app/context";
import { interventionPath, orderPath } from "../app/router";
import { Badge, Card, EmptyState, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

const SHOPS: Record<string, string> = { trendhome: "Trend Home", outletperdele: "Outlet Perdele" };
const shop = (key: string) => SHOPS[key] ?? key;

/** Reads once and on demand only: every read of an order asks the shop, so live events never trigger it. */
function useOnce<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: Problem | null }>({ data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then((data) => { if (!controller.signal.aborted) setState({ data, error: null }); }, (caught: unknown) => { if (!controller.signal.aborted) setState((s) => ({ data: s.data, error: toProblem(caught) })); });
    return () => controller.abort();
  }, [load, tick]);
  return { ...state, reload: useCallback(() => setTick((v) => v + 1), []) };
}

export function InterventionsPage() {
  const { api, me, navigate } = useDashboard();
  const { t, dateTime } = useI18n();
  const iv = t.interventions;
  const [view, setView] = useState<"stuck" | "all">("stuck");
  const [typed, setTyped] = useState("");
  const [number, setNumber] = useState<string | undefined>(undefined);
  const load = useCallback((signal: AbortSignal) => api.interventions(view, number, signal), [api, view, number]);
  const { data, error, reload } = useOnce<InterventionOverview>(load);
  if (!me.isRoot) return <PageHeader title={iv.title} description={iv.rootOnly} />;
  return <div className="page">
    <PageHeader title={iv.title} description={iv.hint} actions={<button type="button" className="button button-secondary" onClick={reload}>{t.common.retry}</button>} />
    {error && <ErrorBanner error={error} onRetry={reload} />}
    <Card>
      <div className="row-actions">
        <button type="button" className={`button ${view === "stuck" ? "button-primary" : "button-secondary"}`} onClick={() => setView("stuck")}>{iv.viewStuck}</button>
        <button type="button" className={`button ${view === "all" ? "button-primary" : "button-secondary"}`} onClick={() => setView("all")}>{iv.viewAll}</button>
        <form className="row-actions" onSubmit={(e) => { e.preventDefault(); setNumber(typed.trim() || undefined); }}>
          <input aria-label={iv.search} placeholder={iv.search} value={typed} maxLength={40} onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" className="button button-secondary">{iv.searchButton}</button>
        </form>
      </div>
    </Card>
    {!data && !error && <Loading />}
    {data && <>
      <Card title={iv.staffing}>
        <ul className="plain-list">{data.sources.map((s) => <li key={s.source}><strong>{shop(s.source)}</strong> · {iv.staffingLine(s.operators, s.supervisors)} · {iv.lastContact}: {dateTime(s.lastContactAt ?? null)}{s.supervisors === 0 && <> · <Badge tone="warning">{iv.blockers.no_supervisor}</Badge></>}</li>)}</ul>
        {data.sources.some((s) => s.supervisors === 0) && <Notice tone="warning">{iv.noSupervisorWarning}</Notice>}
      </Card>
      <Card>
        {data.items.length === 0 ? <EmptyState title={iv.empty} /> : <div className="table-scroll"><table className="table">
          <thead><tr><th>{iv.columns.order}</th><th>{iv.columns.shop}</th><th>{iv.columns.status}</th><th>{iv.columns.assignee}</th><th>{iv.columns.why}</th><th>{iv.columns.updated}</th><th /></tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.globalOrderId}>
            <td><strong>#{item.orderNumber}</strong>{item.paymentMethod === "cod" ? " · COD" : ""}</td>
            <td>{shop(item.source)}</td>
            <td>{iv.statuses[item.status] ?? item.status}</td>
            <td>{item.assignee ?? iv.nobody}</td>
            <td>{item.blockers.filter((b) => b !== "no_supervisor").map((b) => <div key={b}>{iv.blockers[b] ?? b}</div>)}</td>
            <td>{dateTime(item.updatedAt)}</td>
            <td><button type="button" className="button button-primary" onClick={() => navigate(interventionPath(item.globalOrderId))}>{iv.open}</button></td>
          </tr>)}</tbody>
        </table></div>}
      </Card>
      {data.otherFlows && <Card title={iv.otherFlows.title}>
        <ul className="plain-list">{data.otherFlows.map((f) => <li key={f.flow}>{(iv.otherFlows as Record<string, unknown>)[f.flow] as string ?? f.flow} · {iv.otherFlows.open(f.open)}</li>)}</ul>
      </Card>}
    </>}
  </div>;
}

export function InterventionPage({ id }: { id: string }) {
  const { api, me, navigate } = useDashboard();
  const { t, dateTime, problem } = useI18n();
  const iv = t.interventions;
  const load = useCallback((signal: AbortSignal) => api.intervention(id, signal), [api, id]);
  const { data, error, reload } = useOnce<InterventionOrder>(load);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const keys = useRef(new Map<string, string>());
  if (!me.isRoot) return <PageHeader title={iv.title} description={iv.rootOnly} />;

  /** One action; the same submission retried reuses its key, a different one gets a new key. */
  async function act(action: InterventionAction, body: Record<string, unknown>) {
    if (busy) return;
    if (reason.trim().length < 5) { setFailure(iv.reasonMissing); return; }
    const signature = JSON.stringify([action, body, reason.trim()]);
    if (!keys.current.has(signature)) keys.current.set(signature, newIdempotencyKey());
    setBusy(true); setFailure(null); setNotice("");
    try {
      const result = await api.intervene(id, action, { reason: reason.trim(), ...body }, keys.current.get(signature)!);
      setNotice(result.state === "unknown" || result.step === "recorded" ? iv.unknown : iv.done);
      keys.current.delete(signature);
      reload();
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "";
      setFailure(`${iv.errors[code] ?? problem(caught)}${code ? ` (${code})` : ""}`);
      if (caught instanceof ApiError && caught.status < 500) { keys.current.delete(signature); reload(); }
    } finally { setBusy(false); }
  }

  return <div className="page">
    <button type="button" className="button button-ghost" onClick={() => navigate("/interventii")}>{iv.back}</button>
    {error && <ErrorBanner error={error} onRetry={reload} />}
    {!data && !error && <Loading />}
    {data && <>
      <PageHeader title={`${iv.order.title} #${data.confirmare.orderNumber} · ${shop(data.confirmare.sourceKey)}`} description={iv.statuses[data.confirmare.status] ?? data.confirmare.status}
        actions={<button type="button" className="button button-secondary" onClick={reload} disabled={busy}>{t.common.retry}</button>} />
      <Card title={iv.columns.why}>
        {data.blockers.length === 0 ? <p>—</p> : <ul className="plain-list">{data.blockers.map((b) => <li key={b}><Badge tone={b === "payment_waiting" || b === "waiting_call" ? "neutral" : "warning"}>{iv.blockers[b] ?? b}</Badge></li>)}</ul>}
        {data.missing.length > 0 && <p>{iv.missingTitle}: {data.missing.map((m) => iv.missing[m] ?? m).join(", ")}</p>}
      </Card>
      <Card title={iv.reason}>
        <Field label={iv.reason} hint={iv.reasonHint}>{(fid) => <textarea id={fid} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {failure && <p className="form-error" role="alert">{failure}</p>}
        {notice && <Notice tone="success">{notice}</Notice>}
      </Card>
      <OrderCard data={data} busy={busy} act={act} />
      <ProformaCard data={data} busy={busy} act={act} />
      <AdvanceCard data={data} busy={busy} act={act} />
      <RequestCard data={data} busy={busy} act={act} />
      <HandoffCard data={data} busy={busy} act={act} />
      <UnansweredCard data={data} busy={busy} act={act} />
      <EditCard id={id} data={data} busy={busy} act={act} />
      <OperationsCard data={data} busy={busy} act={act} />
      <InvoiceCard data={data} busy={busy} act={act} />
      <EfacturaCard data={data} busy={busy} act={act} />
      <ProductionCard data={data} />
      <Card title={iv.interventionsTitle}>
        {data.interventions.length === 0 ? <p>—</p> : <ul className="plain-list">{data.interventions.map((h, i) => <li key={i}>{dateTime(h.at)} · <strong>{h.action}</strong> · {iv.outcomes[h.outcome ?? ""] ?? h.outcome}{h.code ? ` (${h.code})` : ""} · {h.reason}</li>)}</ul>}
      </Card>
      <Card title={iv.history}>
        <ul className="plain-list">{data.confirmare.events.map((e, i) => <li key={i}>{dateTime(e.at)} · {iv.events[e.action] ?? e.action} · {e.actor ?? "Sistem"}{e.assignee ? ` → ${e.assignee}` : ""}{e.reasonCode ? ` (${e.reasonCode})` : ""}</li>)}</ul>
      </Card>
    </>}
  </div>;
}

type PartProps = { data: InterventionOrder; busy: boolean; act: (action: InterventionAction, body: Record<string, unknown>) => Promise<void> };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title}>{children}</Card>;
}

function OrderCard({ data, busy, act }: PartProps) {
  const { t } = useI18n();
  const iv = t.interventions;
  const c = data.confirmare;
  const [employee, setEmployee] = useState("");
  const [declared, setDeclared] = useState(false);
  const operators = data.operators.filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i);
  return <Section title={iv.order.title}>
    {(c.status === "rejected" || (c.status === "approved" && data.blockers.includes("stale_approval"))) && <div className="field">
      <p>{iv.order.reopenHint}</p>
      <button type="button" className="button button-primary" disabled={busy} onClick={() => void act("reopen", { expectedVersion: c.version })}>{iv.order.reopen}</button>
    </div>}
    {c.status === "pending" && <>
      <div className="row-actions">
        <select aria-label={iv.order.assign} value={employee} onChange={(e) => setEmployee(e.target.value)}>
          <option value="">—</option>{operators.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}
        </select>
        <button type="button" className="button button-secondary" disabled={busy || !employee} onClick={() => void act("assign", { expectedVersion: c.version, employeeId: employee })}>{iv.order.assign}</button>
      </div>
      <div className="field">
        <p>{iv.order.approveHint}</p>
        <label><input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} /> {iv.order.approveDeclaration}</label>
        <button type="button" className="button button-primary" disabled={busy || !declared} onClick={() => void act("approve", { expectedVersion: c.version })}>{iv.order.approve}</button>
      </div>
    </>}
  </Section>;
}

function ProformaCard({ data, busy, act }: PartProps) {
  const { t } = useI18n();
  const iv = t.interventions;
  const [accept, setAccept] = useState(false);
  const [cancelReason, setCancelReason] = useState("order_changed");
  const [noPayment, setNoPayment] = useState(false);
  if (!isAvailable(data.invoice)) return <Section title={iv.proforma.title}><p>{iv.unavailable(data.invoice.reason)}</p></Section>;
  const revision = data.invoice.summary?.revision ?? "";
  const document = data.invoice.summary?.proforma?.document ?? null;
  const money = isAvailable(data.finance) ? data.finance.summary : null;
  return <Section title={iv.proforma.title}>
    <p>{iv.proforma.current}: <strong>{document?.number ? `${document.series ?? ""} ${document.number}` : iv.proforma.none}</strong>{money?.advance?.proforma?.amount ? ` · ${money.advance.proforma.amount} RON` : ""}{money?.advance?.proformaCancelled ? " · ✕" : ""}</p>
    {money && <p>{iv.proforma.total}: <strong>{money.totals.current ?? "—"} RON</strong> · {iv.advance.required}: {money.advance?.required ?? "—"} RON</p>}
    <div className="field">
      <label><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> {iv.proforma.acceptDeclaration}</label>
      <button type="button" className="button button-secondary" disabled={busy || !accept} onClick={() => void act("proforma", { route: "accept-total", fields: { expectedRevision: revision, declaration: true } })}>{iv.proforma.acceptTotal}</button>
    </div>
    {document?.number && !money?.advance?.proformaCancelled && <div className="field">
      <Field label={iv.proforma.cancelReason}>{(fid) => <select id={fid} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>{Object.entries(iv.proforma.cancelReasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
      <label><input type="checkbox" checked={noPayment} onChange={(e) => setNoPayment(e.target.checked)} /> {iv.proforma.cancelConfirm}</label>
      <button type="button" className="button button-danger" disabled={busy || !noPayment} onClick={() => void act("proforma", { route: "cancel", fields: { expectedRevision: revision, reasonCode: cancelReason, confirmNoPayment: true } })}>{iv.proforma.cancel}</button>
    </div>}
    <button type="button" className="button button-primary" disabled={busy} onClick={() => void act("proforma", { route: "issue", fields: { expectedRevision: revision } })}>{iv.proforma.issue}</button>
  </Section>;
}

function AdvanceCard({ data, busy, act }: PartProps) {
  const { t } = useI18n();
  const iv = t.interventions;
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [valueDate, setValueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState("");
  if (!isAvailable(data.finance)) return <Section title={iv.advance.title}><p>{iv.unavailable(data.finance.reason)}</p></Section>;
  const s = data.finance.summary;
  const normalized = normalizeAmount(amount);
  const exceeds = exceedsOutstanding(normalized, s.advance?.outstanding);
  const submit = () => {
    if (!normalized) return setProblem(iv.advance.amountInvalid);
    if (reference.trim().length < 3) return setProblem(iv.advance.referenceInvalid);
    if (exceeds && !over) return setProblem(iv.advance.overpaymentRequired);
    setProblem("");
    void act("advance", { expectedRevision: s.revision, amount: normalized, reference: reference.trim(), valueDate, overpayment: exceeds });
  };
  return <Section title={iv.advance.title}>
    <p>{iv.advance.required}: <strong>{s.advance?.required ?? "—"}</strong> · {iv.advance.collected}: {s.advance?.collected ?? "—"} · {iv.advance.outstanding}: <strong>{s.advance?.outstanding ?? "—"}</strong> · {iv.advance.reference}: <code>{s.advance?.paymentReference ?? "—"}</code></p>
    {s.entries.length > 0 && <><h3>{iv.advance.entries}</h3><ul className="plain-list">{s.entries.map((e) => <li key={e.id}>{e.amount} RON · {e.reference} · {e.valueDate} · {e.state}{e.flags?.length ? ` · ${e.flags.join(", ")}` : ""}</li>)}</ul></>}
    {data.finance.allowedActions.includes("submit_transfer") && <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p>{iv.advance.recordHint}</p>
      <div className="grid-3">
        <Field label={iv.advance.amount}>{(fid) => <input id={fid} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label={iv.advance.bankReference}>{(fid) => <input id={fid} maxLength={64} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        <Field label={iv.advance.valueDate}>{(fid) => <input id={fid} type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)} />}</Field>
      </div>
      {exceeds && <label><input type="checkbox" checked={over} onChange={(e) => setOver(e.target.checked)} /> {iv.advance.overpayment}</label>}
      {problem && <p className="form-error" role="alert">{problem}</p>}
      <button type="submit" className="button button-primary" disabled={busy}>{iv.advance.record}</button>
    </form>}
  </Section>;
}

function RequestCard({ data, busy, act }: PartProps) {
  const { t } = useI18n();
  const iv = t.interventions;
  const [cancelReason, setCancelReason] = useState("already_settled");
  if (!isAvailable(data.request)) return <Section title={iv.request.title}><p>{iv.unavailable(data.request.reason)}</p></Section>;
  const r = data.request.request;
  if (!r || ["verified", "not_received", "cancelled", "requires_manual_review", "resolved"].includes(r.state)) return <Section title={iv.request.title}><p>{iv.request.none}</p></Section>;
  return <Section title={iv.request.title}>
    <p>{iv.request.state}: <strong>{iv.request.states[r.state] ?? r.state}</strong>{r.reasonCode ? ` (${t.interventions.blockers[r.reasonCode] ?? r.reasonCode})` : ""} · {iv.request.proforma}: {r.proforma ? `${r.proforma.series ?? ""} ${r.proforma.number}` : "—"}{r.assignee ? ` · ${r.assignee}` : ""}</p>
    <div className="row-actions">
      {r.state === "needs_clarification" && <button type="button" className="button button-primary" disabled={busy} onClick={() => void act("request-resubmit", { expectedVersion: r.version })}>{iv.request.resubmit}</button>}
      {["requested", "assigned", "needs_clarification"].includes(r.state) && <>
        <select aria-label={iv.request.cancel} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>{Object.entries(iv.request.cancelReasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void act("request-cancel", { expectedVersion: r.version, reasonCode: cancelReason })}>{iv.request.cancel}</button>
      </>}
    </div>
  </Section>;
}

function HandoffCard({ data, busy, act }: PartProps) {
  const { t, dateTime } = useI18n();
  const iv = t.interventions;
  const [employee, setEmployee] = useState("");
  return <Section title={iv.handoff.title}>
    <p>{data.shop.employee ? <>{iv.handoff.current}: <strong>{data.shop.employee}</strong> · {dateTime(data.shop.assignedAt)}</> : iv.handoff.none}</p>
    {data.shop.candidates.length === 0 ? <p>{iv.handoff.noCandidates}</p> : <div className="row-actions">
      <select aria-label={iv.handoff.assign} value={employee} onChange={(e) => setEmployee(e.target.value)}><option value="">—</option>{data.shop.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button type="button" className="button button-primary" disabled={busy || !employee} onClick={() => void act("shop-assign", { employeeId: employee, expectedAssigneeId: data.shop.employeeId })}>{iv.handoff.assign}</button>
    </div>}
  </Section>;
}

function UnansweredCard({ data, busy, act }: PartProps) {
  const { t, dateTime } = useI18n();
  const iv = t.interventions;
  return <Section title={iv.unanswered.title}>
    {data.unanswered.length === 0 ? <p>{iv.unanswered.none}</p> : <ul className="plain-list">{data.unanswered.map((u) => <li key={u.idempotencyKey}>
      {iv.unanswered.kinds[u.kind] ?? u.kind} · {u.action} · {u.state} · {u.employee ?? "—"} · {dateTime(u.requestedAt)}{" "}
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void act(RECONCILE_ACTION[u.kind], { idempotencyKey: u.idempotencyKey })}>{iv.unanswered.ask}</button>
    </li>)}</ul>}
  </Section>;
}

/** Reads (catalog, product, preview) need no reason and change nothing; only the apply is an audited change. */
function EditCard({ id, data, busy, act }: PartProps & { id: string }) {
  const { api } = useDashboard();
  const { t, problem } = useI18n();
  const iv = t.interventions;
  const [catalog, setCatalog] = useState<EditCatalog["catalog"] | null>(null);
  const [product, setProduct] = useState<EditProduct["product"] | null>(null);
  const [sku, setSku] = useState("");
  const [variation, setVariation] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<EditOperation[]>([]);
  const [preview, setPreview] = useState<EditPreview["preview"] | null>(null);
  const [failure, setFailure] = useState("");
  if (data.confirmare.status !== "pending") return <Section title={iv.edit.title}><p>{iv.edit.hint}</p></Section>;
  const read = async <T,>(action: InterventionAction, body: Record<string, unknown>): Promise<T | null> => {
    setFailure("");
    try { return await api.intervene(id, action, body, newIdempotencyKey()) as T; }
    catch (caught) { setFailure(`${iv.errors[caught instanceof ApiError ? caught.code : ""] ?? problem(caught)}${caught instanceof ApiError ? ` (${caught.code})` : ""}`); return null; }
  };
  const load = async () => { const r = await read<EditCatalog>("edit-catalog", {}); if (r) { setCatalog(r.catalog); setPlan([]); setPreview(null); } };
  const find = async () => { const r = await read<EditProduct>("edit-product", { sku: sku.trim() }); if (r) { setProduct(r.product); setVariation(r.product.variations[0]?.id ?? ""); setFields({}); } };
  const change = (op: EditOperation) => { setPlan((current) => [...current.filter((o) => !("lineId" in o) || !("lineId" in op) || o.lineId !== op.lineId), op]); setPreview(null); };
  const fieldInputs = (list: EditField[] | undefined) => (list ?? []).filter((f) => f.editable).map((f) => <Field key={f.name} label={f.title}>{(fid) => f.options?.length
    ? <select id={fid} value={fields[f.name] ?? f.value ?? ""} onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })}><option value="">—</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.title}</option>)}</select>
    : <input id={fid} value={fields[f.name] ?? f.value ?? ""} onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })} />}</Field>);
  return <Section title={iv.edit.title}>
    <button type="button" className="button button-secondary" disabled={busy} onClick={() => void load()}>{iv.edit.load}</button>
    {failure && <p className="form-error" role="alert">{failure}</p>}
    {catalog && !catalog.editable && <Notice tone="warning">{iv.edit.notEditable(catalog.reason ?? "—")}</Notice>}
    {catalog && catalog.editable && <>
      <ul className="plain-list">{catalog.lines.map((line) => <li key={line.id}>{line.name} · {iv.edit.quantity}:{" "}
        <input type="number" min={1} max={100} defaultValue={line.quantity} aria-label={iv.edit.quantity} onBlur={(e) => { const q = Number(e.target.value); if (q >= 1 && q <= 100 && q !== line.quantity) change({ op: "update_line", lineId: line.id, quantity: q }); }} />{" "}
        <button type="button" className="button button-ghost" onClick={() => change({ op: "remove_line", lineId: line.id })}>{iv.edit.remove}</button></li>)}</ul>
      <h3>{iv.edit.addTitle}</h3>
      <div className="row-actions"><input aria-label={iv.edit.sku} placeholder={iv.edit.sku} value={sku} maxLength={100} onChange={(e) => setSku(e.target.value)} /><button type="button" className="button button-secondary" disabled={!sku.trim()} onClick={() => void find()}>{iv.edit.find}</button></div>
      {product && <div className="field">
        <p><strong>{product.name}</strong> · {product.sku}</p>
        {product.variations.length > 0 && <Field label={iv.edit.variation}>{(fid) => <select id={fid} value={variation} onChange={(e) => setVariation(e.target.value)}>{product.variations.map((v) => <option key={v.id} value={v.id}>{v.name ?? Object.values(v.attributes ?? {}).join(" / ") ?? v.id}</option>)}</select>}</Field>}
        <Field label={iv.edit.quantity}>{(fid) => <input id={fid} type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
        {fieldInputs(product.calculator?.fields)}
        <button type="button" className="button button-secondary" onClick={() => { const q = Number(quantity); if (q >= 1 && q <= 100) { const f = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "")); change({ op: "add_line", productId: product.id, ...(variation ? { variationId: variation } : {}), quantity: q, ...(Object.keys(f).length ? { fields: f } : {}) }); setProduct(null); setSku(""); } }}>{iv.edit.add}</button>
      </div>}
      {plan.length > 0 && <>
        <h3>{iv.edit.planned}</h3>
        <ul className="plain-list">{plan.map((o, i) => <li key={i}><code>{JSON.stringify(o)}</code></li>)}</ul>
        <div className="row-actions">
          <button type="button" className="button button-ghost" onClick={() => { setPlan([]); setPreview(null); }}>{iv.edit.clear}</button>
          <button type="button" className="button button-secondary" onClick={() => void read<EditPreview>("edit-preview", { expectedVersion: catalog.version, operations: plan }).then((r) => r && setPreview(r.preview))}>{iv.edit.preview}</button>
        </div>
        {preview && <><p>{iv.edit.totals(preview.before.total, preview.after.total)}{preview.financial?.impact ? ` · ${preview.financial.impact}` : ""}</p>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void act("edit-apply", { expectedVersion: catalog.version, operations: plan, previewToken: preview.previewToken }).then(() => { setCatalog(null); setPlan([]); setPreview(null); })}>{iv.edit.apply}</button></>}
      </>}
    </>}
  </Section>;
}

function OperationsCard({ data, busy, act }: PartProps) {
  const { t } = useI18n();
  const iv = t.interventions;
  const [reason, setReason] = useState("customer_returned");
  const [entry, setEntry] = useState("");
  const [parcels, setParcels] = useState("1");
  const [weight, setWeight] = useState("1");
  const [cod, setCod] = useState("");
  if (!isAvailable(data.operations)) return <Section title={iv.operations.title}><p>{iv.unavailable(data.operations.reason)}</p></Section>;
  const allowed = data.operations.allowed;
  const any = allowed.reactivate || allowed.awb || allowed.cardRefund;
  return <Section title={iv.operations.title}>
    {!any && <p>{iv.operations.notAllowed}</p>}
    {allowed.reactivate && <div className="row-actions">
      <select aria-label={iv.operations.reactivate} value={reason} onChange={(e) => setReason(e.target.value)}>{Object.entries(iv.operations.reactivateReasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input aria-label={iv.operations.exceptionEntry} placeholder={iv.operations.exceptionEntry} value={entry} onChange={(e) => setEntry(e.target.value)} />
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void act("operation", { kind: "order_reactivate", fields: { reason, ...(entry.trim() ? { exceptionEntryId: entry.trim() } : {}) } })}>{iv.operations.reactivate}</button>
    </div>}
    {data.operations.awbStage ? allowed.awb && <div className="row-actions">
      <Field label={iv.operations.parcels}>{(fid) => <input id={fid} type="number" min={1} value={parcels} onChange={(e) => setParcels(e.target.value)} />}</Field>
      <Field label={iv.operations.weight}>{(fid) => <input id={fid} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />}</Field>
      <Field label={iv.operations.expectedCod}>{(fid) => <input id={fid} inputMode="decimal" value={cod} onChange={(e) => setCod(e.target.value)} />}</Field>
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void act("operation", { kind: "awb_create", fields: { parcels: Number(parcels), weightKg: weight.replace(",", "."), expectedCod: normalizeAmount(cod) ?? cod } })}>{iv.operations.awb}</button>
    </div> : <p>{iv.operations.awbStageOnly}</p>}
    {allowed.cardRefund && <button type="button" className="button button-danger" disabled={busy} onClick={() => void act("operation", { kind: "card_refund_full", fields: {} })}>{iv.operations.cardRefund}</button>}
  </Section>;
}

function InvoiceCard({ data, busy, act }: PartProps) {
  const { t } = useI18n();
  const iv = t.interventions;
  const [reasonCode, setReasonCode] = useState("order_changed");
  const [confirmed, setConfirmed] = useState(false);
  if (!isAvailable(data.invoice)) return <Section title={iv.invoice.title}><p>{iv.unavailable(data.invoice.reason)}</p></Section>;
  const revision = data.invoice.summary?.revision ?? "";
  const run = (invoiceAction: string, fields: Record<string, unknown>) => void act("invoice", { invoiceAction, fields: { expectedRevision: revision, ...fields } });
  return <Section title={iv.invoice.title}>
    <p>{iv.invoice.sameEmployee}</p>
    <div className="row-actions">
      <button type="button" className="button button-primary" disabled={busy} onClick={() => run("issue", {})}>{iv.invoice.issue}</button>
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => run("send_mail", { confirmResend: true })}>{iv.invoice.sendMail}</button>
    </div>
    <div className="row-actions">
      <select aria-label={iv.invoice.reasonCode} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>{Object.entries(iv.invoice.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {iv.invoice.confirm}</label>
      <button type="button" className="button button-secondary" disabled={busy || !confirmed} onClick={() => run("reissue", { reasonCode, previousCancelled: true })}>{iv.invoice.reissue}</button>
      <button type="button" className="button button-danger" disabled={busy || !confirmed} onClick={() => run("delete", { reasonCode, confirmDelete: true })}>{iv.invoice.delete}</button>
    </div>
  </Section>;
}

function EfacturaCard({ data, busy, act }: PartProps) {
  const { t, dateTime } = useI18n();
  const iv = t.interventions;
  const next: Record<string, string[]> = { open: ["sent", "accepted", "rejected"], sent: ["accepted", "rejected"], rejected: ["sent", "resolved"] };
  return <Section title={iv.efactura.title}>
    {data.efactura.length === 0 ? <p>{iv.efactura.none}</p> : <ul className="plain-list">{data.efactura.map((task) => <li key={task.id}>
      {iv.efactura.states[task.state] ?? task.state} · {iv.efactura.due}: {dateTime(task.dueAt)} · {task.issuer ?? "—"}{" "}
      {(next[task.state] ?? []).map((outcome) => <button key={outcome} type="button" className="button button-secondary" disabled={busy} onClick={() => void act("efactura", { taskId: task.id, expectedVersion: task.version, outcome })}>{iv.efactura.outcomes[outcome] ?? outcome}</button>)}
    </li>)}</ul>}
  </Section>;
}

function ProductionCard({ data }: { data: InterventionOrder }) {
  const { navigate } = useDashboard();
  const { t, dateTime, stage } = useI18n();
  const iv = t.interventions;
  const p = data.production;
  const sync = data.sync;
  return <>
    <Section title={iv.production.title}>
      <p>{iv.production.stage}: <strong>{p.stage ? stage(p.stage) : "—"}</strong> · {iv.production.document}: {p.documentStatus ?? "—"} · {iv.production.exceptions}: {p.openExceptions}</p>
      <button type="button" className="button button-secondary" onClick={() => navigate(orderPath(data.confirmare.globalOrderId))}>{iv.production.open}</button>
    </Section>
    <Section title={iv.sync.title}>
      <p>{iv.sync.freshness}: <strong>{sync.freshness ?? "—"}</strong> · {iv.sync.shopChanged}: {dateTime(sync.shopChangedAt)} · {iv.sync.received}: {dateTime(sync.receivedAt)} · {iv.sync.contact}: {dateTime(sync.shopContactAt)}</p>
      {sync.freshness !== null && sync.freshness !== "fresh" && <Notice tone="warning">{iv.sync.stale}</Notice>}
    </Section>
  </>;
}
