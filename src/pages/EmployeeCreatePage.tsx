import { useState, type FormEvent } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import type { EmployeeDetail } from "../api/types";
import { Card, ErrorBanner, Field, Loading, OneTimeSecret, PageHeader } from "../components/ui";
import { toProblem, ValidationProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";
import { toggle } from "./EmployeeDetailPage";

export function EmployeeCreatePage() {
  const { api, can, navigate, me } = useDashboard();
  const { t, applicationOption, stage: stageName } = useI18n();
  const c = t.employeeCreate;
  const departments = useLoader(() => api.departments());
  const roles = useLoader(() => can("roles.view") ? api.roles() : Promise.resolve({ items: [] }));
  const workflow = useLoader(() => api.workflow());
  const applicationList = useLoader(() => can("applications.view") ? api.applications() : Promise.resolve({ items: [] }));
  const managers = useLoader(() => can("employees.manage_hierarchy") ? api.employees({ status: "active", limit: "100" }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }));
  const [form, setForm] = useState({ displayName: "", username: "", departmentId: "", positionTitle: "", managerId: "", status: "active" as "active" | "inactive" });
  const [applications, setApplications] = useState<string[]>(["staff"]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const [created, setCreated] = useState<{ employee: EmployeeDetail; temporaryPassword: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!form.displayName.trim() || !form.username.trim() || !form.departmentId) { setError(new ValidationProblem("employeeMissing")); return; }
    setBusy(true); setError(null);
    try {
      setCreated(await api.createEmployee({
        displayName: form.displayName.trim(), username: form.username.trim(), departmentId: Number(form.departmentId),
        positionTitle: form.positionTitle.trim() || null, managerId: form.managerId || null,
        applications: can("employees.manage_applications") ? applications : [], roleIds: canAssignRoles ? roleIds : [],
        stageIds: can("employees.manage_stages") && applications.includes("staff") ? stageIds : [], status: form.status,
      }));
    } catch (caught) { setError(toProblem(caught)); }
    finally { setBusy(false); }
  }

  const canAssignRoles = can("employees.manage_roles") && can("roles.assign");
  const grantableApplications = (applicationList.data?.items.length ? applicationList.data.items.filter((item) => item.status === "active").map((item) => item.key) : ["staff", "dashboard"])
    .filter((key) => me.isRoot || me.applications.includes(key));
  if (!can("employees.create")) return <PageHeader title={c.title} description={c.noPermission} />;
  if (created) {
    return (
      <div className="page narrow">
        <PageHeader title={c.createdTitle} description={`${created.employee.displayName} (${created.employee.username})`} />
        <Card title={t.common.temporaryPassword}>
          <OneTimeSecret label={c.shareSecurely} value={created.temporaryPassword} />
        </Card>
        <div className="form-actions"><button type="button" className="button button-primary" onClick={() => navigate(`/angajati/${created.employee.id}`)}>{c.openEmployee}</button></div>
      </div>
    );
  }
  const loading = !departments.data || !workflow.data;
  return (
    <div className="page narrow">
      <PageHeader title={c.title} description={c.description} />
      {(departments.error || workflow.error) && <ErrorBanner error={departments.error ?? workflow.error} />}
      {loading ? <Loading /> : (
        <form className="stack" onSubmit={submit} noValidate>
          <Card title={c.profile}>
            <div className="form-grid">
              <Field label={c.fullName}>{(id) => <input id={id} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />}</Field>
              <Field label={c.username} hint={c.usernameHint}>{(id) => <input id={id} autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />}</Field>
              <Field label={c.department}>{(id) => <select id={id} value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}><option value="">{c.chooseDepartment}</option>{departments.data?.items.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}</Field>
              <Field label={c.position}>{(id) => <input id={id} value={form.positionTitle} onChange={(event) => setForm({ ...form, positionTitle: event.target.value })} />}</Field>
              {can("employees.manage_hierarchy") && <Field label={c.manager}>{(id) => <select id={id} value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })}><option value="">{c.noManager}</option>{managers.data?.items.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</select>}</Field>}
              <Field label={c.status}>{(id) => <select id={id} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "active" | "inactive" })}><option value="active">{t.status.active}</option><option value="inactive">{t.status.inactive}</option></select>}</Field>
            </div>
          </Card>
          {can("employees.manage_applications") && <Card title={c.applications} description={c.applicationsHint}>
            <div className="check-list">
              {grantableApplications.map((key) => (
                <label key={key} className="check"><input type="checkbox" checked={applications.includes(key)} onChange={() => setApplications(toggle(applications, key))} /> {applicationOption(key)}</label>
              ))}
            </div>
          </Card>}
          {canAssignRoles && <Card title={c.roles} description={c.rolesHint}>
            <div className="check-list">
              {roles.data?.items.filter((role) => role.status === "active").map((role) => (
                <label key={role.id} className={`check ${role.manageable ? "" : "disabled"}`}><input type="checkbox" disabled={!role.manageable} checked={roleIds.includes(role.id)} onChange={() => setRoleIds(toggle(roleIds, role.id))} /> {role.name} <small>{t.common.level(role.authorityRank)}</small></label>
              ))}
            </div>
          </Card>}
          {can("employees.manage_stages") && applications.includes("staff") && <Card title={c.stages} description={c.stagesHint}>
            <div className="stage-grid">
              {workflow.data?.stages.map((stage) => (
                <label key={stage.id} className="check"><input type="checkbox" checked={stageIds.includes(stage.id)} onChange={() => setStageIds(toggle(stageIds, stage.id))} /> <span className="ordinal">{stage.ordinal}</span> {stageName(stage.id, stage.label)}</label>
              ))}
            </div>
          </Card>}
          {error && <ErrorBanner error={error} />}
          <div className="form-actions">
            <button type="button" className="button button-ghost" onClick={() => navigate("/angajati")}>{c.discard}</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? c.submitting : c.submit}</button>
          </div>
        </form>
      )}
    </div>
  );
}
