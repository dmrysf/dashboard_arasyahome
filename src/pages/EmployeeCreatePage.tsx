import { useState, type FormEvent } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { errorMessage } from "../api/labels";
import type { EmployeeDetail } from "../api/types";
import { Card, ErrorBanner, Field, Loading, OneTimeSecret, PageHeader } from "../components/ui";

export function EmployeeCreatePage() {
  const { api, can, navigate, me } = useDashboard();
  const departments = useLoader(() => api.departments(), [api]);
  const roles = useLoader(() => can("roles.view") ? api.roles() : Promise.resolve({ items: [] }), [api]);
  const workflow = useLoader(() => api.workflow(), [api]);
  const managers = useLoader(() => can("employees.manage_hierarchy") ? api.employees({ status: "active", limit: "100" }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }), [api]);
  const [form, setForm] = useState({ displayName: "", username: "", departmentId: "", positionTitle: "", managerId: "", status: "active" as "active" | "inactive" });
  const [applications, setApplications] = useState<string[]>(["staff"]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ employee: EmployeeDetail; temporaryPassword: string } | null>(null);
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!form.displayName.trim() || !form.username.trim() || !form.departmentId) { setError("Completează numele, utilizatorul și departamentul."); return; }
    setBusy(true); setError("");
    try {
      setCreated(await api.createEmployee({
        displayName: form.displayName.trim(), username: form.username.trim(), departmentId: Number(form.departmentId),
        positionTitle: form.positionTitle.trim() || null, managerId: form.managerId || null,
        applications: can("employees.manage_applications") ? applications : [], roleIds: can("employees.manage_roles") ? roleIds : [],
        stageIds: can("employees.manage_stages") && applications.includes("staff") ? stageIds : [], status: form.status,
      }));
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  if (!can("employees.create")) return <PageHeader title="Angajat nou" description="Nu ai permisiunea de a crea angajați." />;
  if (created) {
    return (
      <div className="page narrow">
        <PageHeader title="Angajat creat" description={`${created.employee.displayName} (${created.employee.username})`} />
        <Card title="Parolă temporară">
          <OneTimeSecret label="Comunică parola angajatului pe un canal sigur:" value={created.temporaryPassword} />
        </Card>
        <div className="form-actions"><button type="button" className="button button-primary" onClick={() => navigate(`/angajati/${created.employee.id}`)}>Deschide fișa angajatului</button></div>
      </div>
    );
  }
  const loading = !departments.data || !workflow.data;
  return (
    <div className="page narrow">
      <PageHeader title="Angajat nou" description="Parola temporară este generată de server și afișată o singură dată." />
      {(departments.error || workflow.error) && <ErrorBanner message={departments.error || workflow.error} />}
      {loading ? <Loading /> : (
        <form className="stack" onSubmit={submit} noValidate>
          <Card title="Profil">
            <div className="form-grid">
              <Field label="Nume complet">{(id) => <input id={id} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />}</Field>
              <Field label="Nume utilizator" hint="Litere, cifre, punct, cratimă. Exemplu: ion.popescu">{(id) => <input id={id} autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />}</Field>
              <Field label="Departament">{(id) => <select id={id} value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}><option value="">Alege departamentul</option>{departments.data?.items.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}</Field>
              <Field label="Funcție">{(id) => <input id={id} value={form.positionTitle} onChange={(event) => setForm({ ...form, positionTitle: event.target.value })} />}</Field>
              {can("employees.manage_hierarchy") && <Field label="Manager direct">{(id) => <select id={id} value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })}><option value="">Fără manager</option>{managers.data?.items.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</select>}</Field>}
              <Field label="Status">{(id) => <select id={id} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "active" | "inactive" })}><option value="active">Activ</option><option value="inactive">Inactiv</option></select>}</Field>
            </div>
          </Card>
          {can("employees.manage_applications") && <Card title="Aplicații" description="Accesul la Dashboard oferă acces la panoul de administrare; permisiunile vin din roluri.">
            <div className="check-list">
              {["staff", "dashboard"].filter((key) => me.isRoot || me.applications.includes(key)).map((key) => (
                <label key={key} className="check"><input type="checkbox" checked={applications.includes(key)} onChange={() => setApplications(toggle(applications, key))} /> {key === "staff" ? "Staff (producție)" : "Dashboard (administrare)"}</label>
              ))}
            </div>
          </Card>}
          {can("employees.manage_roles") && <Card title="Roluri" description="Poți atribui doar roluri aflate sub nivelul tău de autoritate.">
            <div className="check-list">
              {roles.data?.items.filter((role) => role.status === "active").map((role) => (
                <label key={role.id} className={`check ${role.manageable ? "" : "disabled"}`}><input type="checkbox" disabled={!role.manageable} checked={roleIds.includes(role.id)} onChange={() => setRoleIds(toggle(roleIds, role.id))} /> {role.name} <small>nivel {role.authorityRank}</small></label>
              ))}
            </div>
          </Card>}
          {can("employees.manage_stages") && applications.includes("staff") && <Card title="Etape Staff" description="Etapele vin din fluxul canonic de producție al API-ului.">
            <div className="stage-grid">
              {workflow.data?.stages.map((stage) => (
                <label key={stage.id} className="check"><input type="checkbox" checked={stageIds.includes(stage.id)} onChange={() => setStageIds(toggle(stageIds, stage.id))} /> <span className="ordinal">{stage.ordinal}</span> {stage.label}</label>
              ))}
            </div>
          </Card>}
          {error && <ErrorBanner message={error} />}
          <div className="form-actions">
            <button type="button" className="button button-ghost" onClick={() => navigate("/angajati")}>Renunță</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Se creează…" : "Creează angajatul"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
