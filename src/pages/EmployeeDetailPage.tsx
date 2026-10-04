import { useState, type ReactNode } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { applicationLabel, errorMessage, formatDateTime } from "../api/labels";
import type { Department, EmployeeDetail, EmployeeSummary, Permission, Role, WorkflowStage } from "../api/types";
import { Badge, Card, ConfirmDialog, ErrorBanner, Field, Loading, Notice, OneTimeSecret, PageHeader, RootBadge, StatusBadge } from "../components/ui";
import { AuditList } from "./AuditList";

type Pending = { title: string; body: ReactNode; confirmLabel: string; tone?: "primary" | "danger"; run: () => Promise<EmployeeDetail> };

export function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const NO_ITEMS = { items: [] };

export function EmployeeDetailPage({ id }: { id: string }) {
  const { api, can } = useDashboard();
  const employee = useLoader(() => api.employee(id), id);
  const departments = useLoader(() => can("departments.view") ? api.departments() : Promise.resolve(NO_ITEMS));
  const roles = useLoader(() => can("roles.view") ? api.roles() : Promise.resolve(NO_ITEMS));
  const catalog = useLoader(() => can("roles.view") ? api.permissions() : Promise.resolve(NO_ITEMS));
  const applications = useLoader(() => can("applications.view") ? api.applications() : Promise.resolve(NO_ITEMS));
  const workflow = useLoader(() => api.workflow());
  const managers = useLoader(() => can("employees.manage_hierarchy") ? api.employees({ status: "active", limit: "100" }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }));
  const audit = useLoader(() => can("iam.audit.view") ? api.audit({ targetType: "employee", targetId: id, limit: "20" }) : Promise.resolve(null), id);

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");

  if (employee.error && !employee.data) return <div className="page"><ErrorBanner message={employee.error} onRetry={employee.reload} /></div>;
  if (!employee.data || !workflow.data) return <div className="page">{workflow.error ? <ErrorBanner message={workflow.error} onRetry={workflow.reload} /> : <Loading />}</div>;

  async function confirm() {
    if (!pending) return;
    setBusy(true); setError(""); setMessage("");
    try {
      employee.setData(await pending.run());
      setMessage("Modificarea a fost salvată și se aplică imediat, la următoarea cerere a angajatului.");
      audit.reload();
    } catch (caught) {
      setError(errorMessage(caught));
      // The server may have changed in the meantime; show its current state again.
      employee.reload();
    } finally { setBusy(false); setPending(null); }
  }

  return (
    <>
      <EmployeeEditor
        key={employee.revision}
        data={employee.data}
        departments={departments.data?.items ?? []}
        roles={roles.data?.items ?? []}
        catalog={catalog.data?.items ?? []}
        applicationKeys={applications.data?.items.filter((item) => item.status === "active").map((item) => item.key) ?? []}
        stages={workflow.data.stages}
        managers={managers.data?.items ?? []}
        busy={busy}
        message={message}
        error={error}
        secret={secret}
        onPending={setPending}
        onSecret={setSecret}
      />
      {can("iam.audit.view") && <Card title="Activitate administrativă" className="section-gap">{audit.error ? <ErrorBanner message={audit.error} onRetry={audit.reload} /> : audit.data ? <AuditList items={audit.data.items} /> : <Loading />}</Card>}
      {pending && <ConfirmDialog title={pending.title} confirmLabel={pending.confirmLabel} tone={pending.tone} busy={busy} onConfirm={() => { void confirm(); }} onCancel={() => setPending(null)}>{pending.body}</ConfirmDialog>}
    </>
  );
}

type EditorProps = {
  data: EmployeeDetail;
  departments: Department[];
  roles: Role[];
  catalog: Permission[];
  applicationKeys: string[];
  stages: WorkflowStage[];
  managers: EmployeeSummary[];
  busy: boolean;
  message: string;
  error: string;
  secret: string;
  onPending: (pending: Pending) => void;
  onSecret: (secret: string) => void;
};

/** Form state starts from the latest server copy; every accepted change remounts it from the server. */
function EmployeeEditor({ data, departments, roles, catalog, applicationKeys, stages, managers, busy, message, error, secret, onPending, onSecret }: EditorProps) {
  const { api, can, me, navigate } = useDashboard();
  const id = data.id;
  const [profile, setProfile] = useState({ displayName: data.displayName, positionTitle: data.positionTitle ?? "", departmentId: String(data.department.id) });
  const [applications, setApplications] = useState<string[]>(data.applications);
  const [roleIds, setRoleIds] = useState<number[]>(data.roles.map((role) => role.id));
  const [stageIds, setStageIds] = useState<string[]>(data.stageIds);
  const [managerId, setManagerId] = useState(data.manager?.id ?? "");

  // Root and identities at or above the actor's authority are read-only. The API enforces this anyway.
  const editable = data.manageable && !data.isRoot;
  const allowed = (permission: string) => editable && can(permission);
  const knownApplications = [...new Set([...(applicationKeys.length ? applicationKeys : ["staff", "dashboard"]), ...data.applications])];
  const canGrantApplication = (key: string) => me.isRoot || me.applications.includes(key);
  const stageLabel = (stage: string) => stages.find((item) => item.id === stage)?.label ?? stage;
  const roleName = (roleId: number) => roles.find((role) => role.id === roleId)?.name ?? data.roles.find((role) => role.id === roleId)?.name ?? `#${roleId}`;
  const permissionLabel = (key: string) => catalog.find((item) => item.key === key)?.label ?? key;
  const list = (items: string[]) => items.length ? items.join(", ") : "nimic";
  const profileChanged = profile.displayName.trim() !== data.displayName || profile.positionTitle.trim() !== (data.positionTitle ?? "") || profile.departmentId !== String(data.department.id);
  const departmentOptions = (departments.length ? departments : [{ id: data.department.id, name: data.department.name, status: "active" as const }])
    .filter((department) => department.status === "active" || department.id === data.department.id);

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => navigate("/angajati")}>← Angajați</button>
      <PageHeader title={data.displayName} description={`${data.username} · ${data.positionTitle ?? "fără funcție"} · ${data.department.name}`}
        actions={<div className="header-badges">{data.isRoot && <RootBadge />}<StatusBadge status={data.status} />{data.mustChangePassword && <Badge tone="warning">Parolă temporară</Badge>}</div>} />
      {data.isRoot && <Notice tone="warning"><strong>Cont de sistem protejat.</strong> Administratorul principal are acces la toate aplicațiile și toate drepturile. Nu poate fi dezactivat, șters sau modificat din Panoul de control; își poate schimba doar propria parolă.</Notice>}
      {!data.isRoot && !data.manageable && <Notice>{data.id === me.employee.id ? "Acesta este propriul tău cont. Nu îți poți modifica singur drepturile." : "Acest cont este la nivelul tău de autoritate sau peste el. Poți doar vizualiza informațiile."}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {error && <ErrorBanner message={error} />}

      <div className="grid-2">
        <Card title="Profil" actions={allowed("employees.update") ? <button type="button" className="button button-secondary" disabled={busy || !profileChanged || profile.displayName.trim().length < 2}
          onClick={() => onPending({ title: "Salvezi profilul?", confirmLabel: "Salvează", body: <p>Numele, funcția și departamentul vor fi actualizate. Departamentul nu acordă drepturi.</p>,
            run: () => api.updateEmployee(id, { displayName: profile.displayName.trim(), positionTitle: profile.positionTitle.trim() || null, departmentId: Number(profile.departmentId) }) })}>Salvează profilul</button> : undefined}>
          <div className="form-grid">
            <Field label="Nume complet">{(fid) => <input id={fid} disabled={!allowed("employees.update")} value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} />}</Field>
            <Field label="Funcție">{(fid) => <input id={fid} disabled={!allowed("employees.update")} value={profile.positionTitle} onChange={(event) => setProfile({ ...profile, positionTitle: event.target.value })} />}</Field>
            <Field label="Departament">{(fid) => <select id={fid} disabled={!allowed("employees.update")} value={profile.departmentId} onChange={(event) => setProfile({ ...profile, departmentId: event.target.value })}>
              {departmentOptions.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>}</Field>
          </div>
          <dl className="facts">
            <dt>Utilizator</dt><dd className="mono">{data.username}</dd>
            <dt>Creat</dt><dd>{formatDateTime(data.createdAt)}</dd>
            <dt>Ultima autentificare</dt><dd>{formatDateTime(data.lastLoginAt)}</dd>
            <dt>Versiune autorizare</dt><dd>{data.authorizationVersion}</dd>
          </dl>
        </Card>

        <Card title="Acces aplicații" description="Accesul este verificat de server la fiecare cerere."
          actions={allowed("employees.manage_applications") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(applications, data.applications)}
            onClick={() => onPending({ title: "Confirmi accesul la aplicații?", confirmLabel: "Aplică accesul",
              body: <p>Înainte: <strong>{list(data.applications.map(applicationLabel))}</strong><br />După: <strong>{list(applications.map(applicationLabel))}</strong><br />Schimbarea se aplică la următoarea cerere a angajatului, fără re-autentificare.</p>,
              run: () => api.setApplications(id, applications) })}>Revizuiește accesul</button> : undefined}>
          <div className="check-list">
            {knownApplications.map((key) => {
              const enabled = allowed("employees.manage_applications") && canGrantApplication(key);
              return (
                <label key={key} className={`check ${enabled ? "" : "disabled"}`}>
                  <input type="checkbox" disabled={!enabled} checked={applications.includes(key)} onChange={() => setApplications(toggle(applications, key))} />
                  {applicationLabel(key)}
                </label>
              );
            })}
          </div>
        </Card>

        <Card title="Roluri și permisiuni" description={data.isRoot ? undefined : "Poți atribui doar roluri aflate sub nivelul tău de autoritate."}
          actions={allowed("employees.manage_roles") && can("roles.assign") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(roleIds, data.roles.map((role) => role.id))}
            onClick={() => onPending({ title: "Confirmi rolurile?", confirmLabel: "Aplică rolurile",
              body: <p>Înainte: <strong>{list(data.roles.map((role) => role.name))}</strong><br />După: <strong>{list(roleIds.map(roleName))}</strong><br />Permisiunile noi se aplică la următoarea cerere.</p>,
              run: () => api.setRoles(id, roleIds) })}>Revizuiește rolurile</button> : undefined}>
          {data.isRoot ? <p className="muted">Toate permisiunile (cont de sistem, nu un rol).</p> : <>
            {roles.length > 0 ? (
              <div className="check-list">
                {roles.filter((role) => role.status === "active" || roleIds.includes(role.id)).map((role) => {
                  const enabled = allowed("employees.manage_roles") && can("roles.assign") && role.manageable;
                  return (
                    <label key={role.id} className={`check ${enabled ? "" : "disabled"}`}>
                      <input type="checkbox" disabled={!enabled} checked={roleIds.includes(role.id)} onChange={() => setRoleIds(toggle(roleIds, role.id))} />
                      {role.name} <small>nivel {role.authorityRank}</small>
                    </label>
                  );
                })}
              </div>
            ) : <p>{list(data.roles.map((role) => role.name))}</p>}
            <details className="permissions-detail">
              <summary>Permisiuni din roluri ({data.rolePermissions.length})</summary>
              <ul className="permission-list">{data.rolePermissions.map((key) => <li key={key}>{permissionLabel(key)} <small className="mono">{key}</small></li>)}</ul>
            </details>
          </>}
        </Card>

        <Card title="Etape Staff" description="Etapele canonice ale fluxului de producție, citite din API."
          actions={allowed("employees.manage_stages") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(stageIds, data.stageIds)}
            onClick={() => onPending({ title: "Confirmi etapele Staff?", confirmLabel: "Aplică etapele",
              body: <p>Înainte: <strong>{list(data.stageIds.map(stageLabel))}</strong><br />După: <strong>{list(stageIds.map(stageLabel))}</strong><br />Staff folosește noile etape de la următoarea cerere.</p>,
              run: () => api.setStages(id, stageIds) })}>Revizuiește etapele</button> : undefined}>
          {!data.applications.includes("staff") && !data.isRoot && <p className="muted small">Etapele se aplică doar când angajatul are acces la Staff.</p>}
          <div className="stage-grid">
            {stages.map((stage) => (
              <label key={stage.id} className={`check ${allowed("employees.manage_stages") ? "" : "disabled"}`}>
                <input type="checkbox" disabled={!allowed("employees.manage_stages")} checked={stageIds.includes(stage.id)} onChange={() => setStageIds(toggle(stageIds, stage.id))} />
                <span className="ordinal">{stage.ordinal}</span> {stage.label}
              </label>
            ))}
          </div>
        </Card>

        <Card title="Ierarhie" description="Ierarhia descrie organizarea; nu acordă drepturi."
          actions={allowed("employees.manage_hierarchy") ? <button type="button" className="button button-secondary" disabled={busy || managerId === (data.manager?.id ?? "")}
            onClick={() => onPending({ title: "Schimbi managerul direct?", confirmLabel: "Salvează", body: <p>Managerul direct nu primește drepturi suplimentare asupra angajatului.</p>,
              run: () => api.setManager(id, managerId || null) })}>Salvează managerul</button> : undefined}>
          {allowed("employees.manage_hierarchy") ? (
            <Field label="Manager direct">{(fid) => <select id={fid} value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              <option value="">Fără manager</option>
              {data.manager && !managers.some((manager) => manager.id === data.manager?.id) && <option value={data.manager.id}>{data.manager.displayName}</option>}
              {managers.filter((manager) => manager.id !== data.id).map((manager) => <option key={manager.id} value={manager.id}>{manager.displayName}</option>)}
            </select>}</Field>
          ) : <dl className="facts"><dt>Manager direct</dt><dd>{data.manager?.displayName ?? "—"}</dd></dl>}
        </Card>

        <Card title="Securitate">
          {secret && <OneTimeSecret label="Parolă temporară nouă:" value={secret} />}
          {data.isRoot ? <p className="muted">Parola administratorului principal se schimbă doar de titular, la autentificare, sau prin procedura de recuperare de pe server.</p> : (
            <div className="button-row">
              {data.status === "active"
                ? allowed("employees.deactivate") && <button type="button" className="button button-danger" disabled={busy}
                    onClick={() => onPending({ title: "Dezactivezi contul?", confirmLabel: "Dezactivează", tone: "danger", body: <p>{data.displayName} pierde imediat accesul la toate aplicațiile, iar sesiunile active sunt închise.</p>, run: () => api.setEmployeeStatus(id, false) })}>Dezactivează contul</button>
                : allowed("employees.activate") && <button type="button" className="button button-primary" disabled={busy}
                    onClick={() => onPending({ title: "Activezi contul?", confirmLabel: "Activează", body: <p>Contul poate fi folosit din nou în aplicațiile la care are acces.</p>, run: () => api.setEmployeeStatus(id, true) })}>Activează contul</button>}
              {allowed("employees.reset_password") && <button type="button" className="button button-secondary" disabled={busy}
                onClick={() => onPending({ title: "Resetezi parola?", confirmLabel: "Generează parolă temporară", tone: "danger", body: <p>Toate sesiunile angajatului sunt închise, iar la următoarea autentificare va trebui să își aleagă o parolă nouă.</p>,
                  run: async () => { const result = await api.resetPassword(id); onSecret(result.temporaryPassword); return api.employee(id); } })}>Resetează parola</button>}
              {!allowed("employees.deactivate") && !allowed("employees.activate") && !allowed("employees.reset_password") && <p className="muted">Nu ai acțiuni de securitate disponibile pentru acest cont.</p>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
