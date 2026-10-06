import { useEffect, useState } from "react";
import { newIdempotencyKey } from "../api/client";
import type { EmployeeSummary, Organization, WorkingDay } from "../api/types";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Badge, Card, ConfirmDialog, ErrorBanner, ErrorText, Field, Loading, Notice, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

/** Converts a datetime-local value (Romania wall clock in the browser) to an ISO instant with offset. */
function toInstant(local: string): string | null {
  if (!local) return null;
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function EmployeePicker({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  const { api, can } = useDashboard();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<EmployeeSummary[]>([]);
  useEffect(() => {
    if (!can("employees.view") || search.trim().length < 2) return undefined;
    let active = true;
    const timer = window.setTimeout(() => { api.employees({ search: search.trim(), status: "active", limit: "25" }).then((page) => { if (active) setItems(page.items.filter((item) => !item.isRoot)); }, () => undefined); }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, can, search]);
  return (
    <div className="employee-picker">
      <Field label={t.organization.employeeSearch}>{(id) => <input id={id} value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" />}</Field>
      <Field label={label}>{(id) => <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t.organization.choose}</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.department.name}</option>)}
      </select>}</Field>
    </div>
  );
}

/** Organisation controls for root and the CEO principal only: CEO, responsibilities, working hours. */
export function OrganizationPage() {
  const { api, me } = useDashboard();
  const { t, dateTime } = useI18n();
  const o = t.organization;
  const allowed = Boolean(me.capabilities?.manageOrganization);
  const { data, error, reload, setData } = useLoader<Organization | null>(() => (allowed ? api.organization() : Promise.resolve(null)), String(allowed));
  const [failure, setFailure] = useState<Problem | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ceoId, setCeoId] = useState("");
  const [assign, setAssign] = useState({ responsibility: "tailoring_intake_responsible", employeeId: "", startsAt: "", endsAt: "", note: "" });
  const [revoking, setRevoking] = useState<{ id: string; reason: string } | null>(null);
  const [hours, setHours] = useState<WorkingDay[] | null>(null);
  if (!allowed) return <PageHeader title={o.title} description={o.noAccess} />;
  if (error && !data) return <div className="page"><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const days = hours ?? data.workingHours;

  async function run(action: (key: string) => Promise<Organization>) {
    if (busy) return;
    setBusy(true); setFailure(null); setSaved(false);
    try { setData(await action(newIdempotencyKey())); setSaved(true); return true; }
    catch (caught) { setFailure(toProblem(caught)); return false; }
    finally { setBusy(false); }
  }

  return (
    <div className="page organization-page">
      <PageHeader title={o.title} description={o.hint} />
      {saved && <Notice tone="success">{o.saved}</Notice>}
      {failure && <ErrorBanner error={failure} />}
      <Card title={o.ceo}>
        <p>{data.ceo ? <><strong>{data.ceo.displayName}</strong>{data.ceo.positionTitle ? ` · ${data.ceo.positionTitle}` : ""} · {dateTime(data.ceo.since)}</> : <span className="muted">{o.ceoNone}</span>}</p>
        {data.canDesignateCeo && <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (ceoId) void run((key) => api.designateCeo(ceoId, key)); }}>
          <EmployeePicker value={ceoId} onChange={setCeoId} label={o.employee} />
          <button type="submit" className="button button-primary" disabled={busy || !ceoId}>{o.ceoDesignate}</button>
        </form>}
      </Card>
      <Card title={o.responsibilities}>
        <form className="responsibility-form" onSubmit={(event) => {
          event.preventDefault();
          if (!assign.employeeId) return;
          void run((key) => api.assignResponsibility({ responsibility: assign.responsibility, employeeId: assign.employeeId, startsAt: toInstant(assign.startsAt), endsAt: toInstant(assign.endsAt), note: assign.note.trim() || null }, key))
            .then((ok) => { if (ok) setAssign({ ...assign, employeeId: "", note: "" }); });
        }}>
          <Field label={o.responsibility}>{(id) => <select id={id} value={assign.responsibility} onChange={(event) => setAssign({ ...assign, responsibility: event.target.value })}>
            {Object.entries(o.kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}</Field>
          <EmployeePicker value={assign.employeeId} onChange={(employeeId) => setAssign({ ...assign, employeeId })} label={o.employee} />
          <div className="grid-2">
            <Field label={o.startsAt}>{(id) => <input id={id} type="datetime-local" value={assign.startsAt} onChange={(event) => setAssign({ ...assign, startsAt: event.target.value })} />}</Field>
            <Field label={o.endsAt} hint={o.endsAtHint}>{(id) => <input id={id} type="datetime-local" value={assign.endsAt} onChange={(event) => setAssign({ ...assign, endsAt: event.target.value })} />}</Field>
          </div>
          <Field label={o.note}>{(id) => <input id={id} maxLength={500} value={assign.note} onChange={(event) => setAssign({ ...assign, note: event.target.value })} />}</Field>
          <button type="submit" className="button button-primary" disabled={busy || !assign.employeeId}>{o.assign}</button>
        </form>
        {data.responsibilities.length === 0 ? <p className="muted">{o.none}</p> : <table className="table"><tbody>
          {data.responsibilities.map((item) => <tr key={item.id}>
            <td><strong>{o.kinds[item.responsibility]}</strong><br /><small className="muted">{item.employee.displayName}{item.note ? ` · ${item.note}` : ""}</small></td>
            <td><small>{dateTime(item.startsAt)} → {item.endsAt ? dateTime(item.endsAt) : "—"}</small><br /><small className="muted">{item.createdBy}{item.revokedBy ? ` · ${item.revokedBy}` : ""}</small></td>
            <td><Badge tone={item.state === "active" ? "success" : item.state === "scheduled" ? "accent" : "neutral"}>{o.states[item.state]}</Badge></td>
            <td>{(item.state === "active" || item.state === "scheduled") && <button type="button" className="button button-ghost" onClick={() => setRevoking({ id: item.id, reason: "" })}>{o.revoke}</button>}</td>
          </tr>)}
        </tbody></table>}
      </Card>
      <Card title={o.workingHours} description={o.timezone(data.timezone)}>
        <div className="hours-grid">{days.map((day, index) => <div key={day.weekday} className="hours-row">
          <label className="checkbox"><input type="checkbox" checked={day.isOpen} onChange={(event) => { const next = [...days]; next[index] = event.target.checked ? { ...day, isOpen: true, opensAt: day.opensAt ?? "05:00", closesAt: day.closesAt ?? "20:00" } : { ...day, isOpen: false, opensAt: null, closesAt: null }; setHours(next); }} /> <span>{o.weekdays[day.weekday - 1]}</span></label>
          {day.isOpen && <><input type="time" aria-label={`${o.weekdays[day.weekday - 1]} ${o.opensAt}`} value={day.opensAt ?? ""} onChange={(event) => { const next = [...days]; next[index] = { ...day, opensAt: event.target.value }; setHours(next); }} />
            <input type="time" aria-label={`${o.weekdays[day.weekday - 1]} ${o.closesAt}`} value={day.closesAt ?? ""} onChange={(event) => { const next = [...days]; next[index] = { ...day, closesAt: event.target.value }; setHours(next); }} /></>}
        </div>)}</div>
        <button type="button" className="button button-primary" disabled={busy || !hours} onClick={() => { if (hours) void run((key) => api.setWorkingHours(hours, key)).then((ok) => { if (ok) setHours(null); }); }}>{o.save}</button>
      </Card>
      {revoking && <ConfirmDialog title={o.revokeTitle} confirmLabel={o.revoke} tone="danger" busy={busy} onCancel={() => setRevoking(null)}
        onConfirm={() => { void run((key) => api.revokeResponsibility(revoking.id, revoking.reason.trim() || null, key)).then((ok) => { if (ok) setRevoking(null); }); }}>
        <Field label={o.revokeReason}>{(id) => <input id={id} maxLength={500} value={revoking.reason} onChange={(event) => setRevoking({ ...revoking, reason: event.target.value })} />}</Field>
        {failure && <ErrorText error={failure} />}
      </ConfirmDialog>}
    </div>
  );
}
