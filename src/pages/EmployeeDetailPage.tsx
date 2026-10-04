import { useEffect, useState, type ReactNode } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { APPLICATION_LABELS, errorMessage, formatDateTime } from "../api/labels";
import type { EmployeeDetail } from "../api/types";
import { Badge, Card, ConfirmDialog, ErrorBanner, Field, Loading, Notice, OneTimeSecret, PageHeader, RootBadge, StatusBadge } from "../components/ui";
import { AuditList } from "./AuditList";

type Pending = { title: string; body: ReactNode; confirmLabel: string; tone?: "primary" | "danger"; run: () => Promise<EmployeeDetail | void> };

function sameSet<T>(a: T[], b: T[]) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

export function EmployeeDetailPage({ id }: { id: string }) {
  const { api, can, me, navigate } = useDashboard();
  const employee = useLoader(() => api.employee(id), [api, id]);
  const departments = useLoader(() => can("departments.view") ? api.departments() : Promise.resolve({ items: [] }), [api]);
  const roles = useLoader(() => can("roles.view") ? api.roles() : Promise.resolve({ items: [] }), [api]);
  const workflow = useLoader(() => api.workflow(), [api]);
  const managers = useLoader(() => can("employees.manage_hierarchy") ? api.employees({ status: "active", limit: "100" }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }), [api]);
  const audit = useLoader(() => can("iam.audit.view") ? api.audit({ targetId: id, limit: "20" }) : Promise.resolve(null), [api, id]);

  const [profile, setProfile] = useState({ displayName: "", positionTitle: "", departmentId: "" });
  const [applications, setApplications] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [managerId, setManagerId] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");

  const data = employee.data;
  useEffect(() => {
    if (!data) return;
    setProfile({ displayName: data.displayName, positionTitle: data.positionTitle ?? "", departmentId: String(data.department.id) });
    setApplications(data.applications);
    setRoleIds(data.roles.map((role) => role.id));
    setStageIds(data.stageIds);
    setManagerId(data.manager?.id ?? "");
  }, [data]);

  if (employee.error) return <div className="page"><ErrorBanner message={employee.error} onRetry={employee.reload} /></div>;
  if (!data || !workflow.data) return <div className="page"><Loading /></div>;

  const editable = data.manageable;
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const stageLabel = (stage: string) => workflow.data?.stages.find((item) => item.id === stage)?.label ?? stage;
  const roleName = (roleId: number) => roles.data?.items.find((role) => role.id === roleId)?.name ?? data.roles.find((role) => role.id === roleId)?.name ?? String(roleId);
  const list = (items: string[]) => items.length ? items.join(", ") : "nimic";

  async function confirm() {
    if (!pending) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await pending.run();
      if (result) employee.setData(result);
      setMessage("Modificarea a fost salvată și se aplică imediat.");
      audit.reload();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); setPending(null); }
  }

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => navigate("/angajati")}>← Angajați</button>
      <PageHeader title={data.displayName} description={`${data.username} · ${data.positionTitle ?? "fără funcție"} · ${data.department.name}`}
        actions={<div className="header-badges">{data.isRoot && <RootBadge />}<StatusBadge status={data.status} />{data.mustChangePassword && <Badge tone="warning">Parolă temporară</Badge>}</div>} />
      {data.isRoot && <Notice tone="warning"><strong>Cont de sistem protejat.</strong> Administratorul principal are acces la toate aplicațiile și toate drepturile. Nu poate fi dezactivat, șters sau modificat din Panoul de control; își poate schimba doar propria parolă.</Notice>}
      {!data.isRoot && !editable && <Notice>Acest cont este la nivelul tău de autoritate sau peste el (sau este propriul tău cont). Poți doar vizualiza informațiile.</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {error && <ErrorBanner message={error} />}

      <div className="grid-2">
        <Card title="Profil" actions={editable && can("employees.update") ? <button type="button" className="button button-secondary" disabled={busy || (profile.displayName === data.displayName && profile.positionTitle === (data.positionTitle ?? "") && profile.departmentId === String(data.department.id))}
          onClick={() => setPending({ title: "Salvezi profilul?", confirmLabel: "Salvează", body: <p>Numele, funcția și departamentul vor fi actualizate.</p>,
            run: () => api.updateEmployee(id, { displayName: profile.displayName.trim(), positionTitle: profile.positionTitle.trim() || null, departmentId: Number(profile.departmentId) }) })}>Salvează profilul</button> : undefined}>
          <div className="form-grid">
            <Field label="Nume complet">{(fid) => <input id={fid} disabled={!editable || !can("employees.update")} value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} />}</Field>
            <Field label="Funcție">{(fid) => <input id={fid} disabled={!editable || !can("employees.update")} value={profile.positionTitle} onChange={(event) => setProfile({ ...profile, positionTitle: event.target.value })} />}</Field>
            <Field label="Departament">{(fid) => <select id={fid} disabled={!editable || !can("employees.update")} value={profile.departmentId} onChange={(event) => setProfile({ ...profile, departmentId: event.target.value })}>
              {(departments.data?.items.length ? departments.data.items : [{ id: data.department.id, name: data.department.name, status: "active" }]).filter((d) => d.status === "active" || d.id === data.department.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>}</Field>
            <dl className="facts"><dt>Utilizator</dt><dd className="mono">{data.username}</dd><dt>Creat</dt><dd>{formatDateTime(data.createdAt)}</dd><dt>Ultima autentificare</dt><dd>{formatDateTime(data.lastLoginAt)}</dd><dt>Versiune autorizare</dt><dd>{data.authorizationVersion}</dd></dl>
          </div>
        </Card>

        <Card title="Acces aplicații" description="Accesul se verifică de server la fiecare cerere."
          actions={editable && can("employees.manage_applications") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(applications, data.applications)}
            onClick={() => setPending({ title: "Confirmi accesul la aplicații?", confirmLabel: "Aplică accesul", tone: "primary",
              body: <p>Înainte: <strong>{list(data.applications.map((key) => APPLICATION_LABELS[key] ?? key))}</strong><br />După: <strong>{list(applications.map((key) => APPLICATION_LABELS[key] ?? key))}</strong><br />Schimbarea se aplică la următoarea cerere a angajatului, fără re-autentificare.</p>,
              run: () => api.setApplications(id, applications) })}>Revizuiește</button> : undefined}>
          <div className="check-list">
            {["staff", "dashboard"].map((key) => (
              <label key={key} className={`check ${editable && (me.isRoot || me.applications.includes(key)) ? "" : "disabled"}`}>
                <input type="checkbox" disabled={!editable || !can("employees.manage_applications") || !(me.isRoot || me.applications.includes(key))} checked={applications.includes(key)} onChange={() => setApplications(toggle(applications, key))} />
                {key === "staff" ? "Staff (producție)" : "Dashboard (administrare)"}
              </label>
            ))}
          </div>
        </Card>

        <Card title="Roluri și permisiuni" description="Poți atribui doar roluri sub nivelul tău de autoritate."
          actions={editable && can("employees.manage_roles") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(roleIds, data.roles.map((role) => role.id))}
            onClick={() => setPending({ title: "Confirmi rolurile?", confirmLabel: "Aplică rolurile",
              body: <p>Înainte: <strong>{list(data.roles.map((role) => role.name))}</strong><br />După: <strong>{list(roleIds.map(roleName))}</strong></p>,
              run: () => api.setRoles(id, roleIds) })}>Revizuiește</button> : undefined}>
          {data.isRoot ? <p className="muted">Toate permisiunile (cont de sistem).</p> : <>
            <div className="check-list">
              {(roles.data?.items ?? []).filter((role) => role.status === "active" || roleIds.includes(role.id)).map((role) => (
                <label key={role.id} className={`check ${editable && role.manageable ? "" : "disabled"}`}>
                  <input type="checkbox" disabled={!editable || !can("employees.manage_roles") || !role.manageable} checked={roleIds.includes(role.id)} onChange={() => setRoleIds(toggle(roleIds, role.id))} />
                  {role.name} <small>nivel {role.authorityRank}</small>
                </label>
              ))}
            </div>
            <details className="permissions-detail"><summary>Permisiuni efective din roluri ({data.rolePermissions.length})</summary><p className="mono small">{data.rolePermissions.join(", ") || "—"}</p></details>
          </>}
        </Card>

        <Card title="Etape Staff" description="Etapele canonice ale fluxului de producție, citite din API."
          actions={editable && can("employees.manage_stages") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(stageIds, data.stageIds)}
            onClick={() => setPending({ title: "Confirmi etapele Staff?", confirmLabel: "Aplică etapele",
              body: <p>Înainte: <strong>{list(data.stageIds.map(stageLabel))}</strong><br />După: <strong>{list(stageIds.map(stageLabel))}</strong><br />Staff folosește noile etape de la următoarea cerere.</p>,
              run: () => api.setStages(id, stageIds) })}>Revizuiește</button> : undefined}>
          <div className="stage-grid">
            {workflow.data.stages.map((stage) => (
              <label key={stage.id} className={`check ${editable ? "" : "disabled"}`}>
                <input type="checkbox" disabled={!editable || !can("employees.manage_stages")} checked={stageIds.includes(stage.id)} onChange={() => setStageIds(toggle(stageIds, stage.id))} />
                <span className="ordinal">{stage.ordinal}</span> {stage.label}
              </label>
            ))}
          </div>
        </Card>

        <Card title="Ierarhie" description="Ierarhia descrie organizarea; nu acordă drepturi."
          actions={editable && can("employees.manage_hierarchy") ? <button type="button" className="button button-secondary" disabled={busy || managerId === (data.manager?.id ?? "")}
            onClick={() => setPending({ title: "Schimbi managerul direct?", confirmLabel: "Salvează", body: <p>Managerul direct nu primește drepturi suplimentare asupra angajatului.</p>,
              run: () => api.setManager(id, managerId || null) })}>Salvează</button> : undefined}>
          <Field label="Manager direct">{(fid) => <select id={fid} disabled={!editable || !can("employees.manage_hierarchy")} value={managerId} onChange={(event) => setManagerId(event.target.value)}>
            <option value="">Fără manager</option>
            {data.manager && !managers.data?.items.some((m) => m.id === data.manager?.id) && <option value={data.manager.id}>{data.manager.displayName}</option>}
            {managers.data?.items.filter((m) => m.id !== data.id).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>}</Field>
        </Card>

        <Card title="Securitate">
          {secret && <OneTimeSecret label="Parolă temporară nouă:" value={secret} />}
          <div className="button-row">
            {data.status === "active"
              ? <button type="button" className="button button-danger" disabled={!editable || !can("employees.deactivate") || busy}
                  onClick={() => setPending({ title: "Dezactivezi contul?", confirmLabel: "Dezactivează", tone: "danger", body: <p>{data.displayName} pierde imediat accesul la toate aplicațiile, iar sesiunile active sunt închise.</p>, run: () => api.setEmployeeStatus(id, false) })}>Dezactivează contul</button>
              : <button type="button" className="button button-primary" disabled={!editable || !can("employees.activate") || busy}
                  onClick={() => setPending({ title: "Activezi contul?", confirmLabel: "Activează", body: <p>Contul poate fi folosit din nou în aplicațiile la care are acces.</p>, run: () => api.setEmployeeStatus(id, true) })}>Activează contul</button>}
            <button type="button" className="button button-secondary" disabled={!editable || !can("employees.reset_password") || busy}
              onClick={() => setPending({ title: "Resetezi parola?", confirmLabel: "Generează parolă temporară", tone: "danger", body: <p>Toate sesiunile angajatului sunt închise, iar la următoarea autentificare va trebui să își aleagă o parolă nouă.</p>,
                run: async () => { const result = await api.resetPassword(id); setSecret(result.temporaryPassword); return api.employee(id); } })}>Resetează parola</button>
          </div>
        </Card>
      </div>

      {can("iam.audit.view") && <Card title="Activitate administrativă">{audit.data ? <AuditList items={audit.data.items} /> : <Loading />}</Card>}

      {pending && <ConfirmDialog title={pending.title} confirmLabel={pending.confirmLabel} tone={pending.tone} busy={busy} onConfirm={() => { void confirm(); }} onCancel={() => setPending(null)}>{pending.body}</ConfirmDialog>}
    </div>
  );
}
