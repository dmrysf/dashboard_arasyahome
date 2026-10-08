import { useState, type ReactNode } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import type { Department, DocumentScopes, EmployeeDetail, EmployeeSummary, Permission, Role, WorkflowStage } from "../api/types";
import { Badge, Card, ConfirmDialog, ErrorBanner, Field, Loading, Notice, OneTimeSecret, PageHeader, RootBadge, StatusBadge } from "../components/ui";
import { toProblem, type Messages, type NoticeKey, type Problem, type Translator } from "../i18n";
import { useI18n } from "../i18n/context";
import { AuditList } from "./AuditList";
import { loadAllEmployees, readiness, readinessTone, type ReadinessCheck } from "./readiness";

/** A reviewed change. Its dialog text is rendered from the active language, so it follows a language switch. */
export type Pending = {
  view: (i18n: Translator) => { title: string; body: ReactNode; confirmLabel: string; tone?: "primary" | "danger" };
  run: () => Promise<EmployeeDetail>;
};

export function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const NO_ITEMS = { items: [] };

export function EmployeeDetailPage({ id }: { id: string }) {
  const { api, can } = useDashboard();
  const { t } = useI18n();
  const employee = useLoader(() => api.employee(id), id);
  const departments = useLoader(() => can("departments.view") ? api.departments() : Promise.resolve(NO_ITEMS));
  const roles = useLoader(() => can("roles.view") ? api.roles() : Promise.resolve(NO_ITEMS));
  const catalog = useLoader(() => can("roles.view") ? api.permissions() : Promise.resolve(NO_ITEMS));
  const applications = useLoader(() => can("applications.view") ? api.applications() : Promise.resolve(NO_ITEMS));
  const workflow = useLoader(() => api.workflow());
  // The whole directory (a small organisation): manager choices and direct reports, beyond one page of 100.
  const directory = useLoader(() => loadAllEmployees(api, {}), id);
  const audit = useLoader(() => can("iam.audit.view") ? api.audit({ targetType: "employee", targetId: id, limit: "20" }) : Promise.resolve(null), id);

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<NoticeKey | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [secret, setSecret] = useState("");

  if (employee.error && !employee.data) return <div className="page"><ErrorBanner error={employee.error} onRetry={employee.reload} /></div>;
  if (!employee.data || !workflow.data) return <div className="page">{workflow.error ? <ErrorBanner error={workflow.error} onRetry={workflow.reload} /> : <Loading />}</div>;

  async function confirm() {
    if (!pending) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      employee.setData(await pending.run());
      setMessage("employeeSaved");
      audit.reload();
    } catch (caught) {
      setError(toProblem(caught));
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
        managers={directory.data?.items.filter((item) => item.status === "active") ?? []}
        reports={directory.data?.items.filter((item) => item.manager?.id === id) ?? []}
        busy={busy}
        message={message}
        error={error}
        secret={secret}
        onPending={setPending}
        onSecret={setSecret}
      />
      {can("iam.audit.view") && <Card title={t.employee.activity} className="section-gap employee-activity">{audit.error ? <ErrorBanner error={audit.error} onRetry={audit.reload} /> : audit.data ? <AuditList items={audit.data.items} stageLabel={(stage) => workflow.data?.stages.find((item) => item.id === stage)?.label} /> : <Loading />}</Card>}
      {pending && <PendingDialog pending={pending} busy={busy} onConfirm={() => { void confirm(); }} onCancel={() => setPending(null)} />}
    </>
  );
}

function PendingDialog({ pending, busy, onConfirm, onCancel }: { pending: Pending; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const i18n = useI18n();
  const view = pending.view(i18n);
  return <ConfirmDialog title={view.title} confirmLabel={view.confirmLabel} tone={view.tone} busy={busy} onConfirm={onConfirm} onCancel={onCancel}>{view.body}</ConfirmDialog>;
}

export type EditorProps = {
  data: EmployeeDetail;
  departments: Department[];
  roles: Role[];
  catalog: Permission[];
  applicationKeys: string[];
  stages: WorkflowStage[];
  managers: EmployeeSummary[];
  reports?: EmployeeSummary[];
  busy: boolean;
  message: NoticeKey | null;
  error: Problem | null;
  secret: string;
  onPending: (pending: Pending) => void;
  onSecret: (secret: string) => void;
};

/** Form state starts from the latest server copy; every accepted change remounts it from the server. */
export function EmployeeEditor({ data, departments, roles, catalog, applicationKeys, stages, managers, reports = [], busy, message, error, secret, onPending, onSecret }: EditorProps) {
  const { api, can, me, navigate } = useDashboard();
  const { t, dateTime, application, stage: stageName, permission } = useI18n();
  const m = t.employee;
  const id = data.id;
  const [profile, setProfile] = useState({ displayName: data.displayName, positionTitle: data.positionTitle ?? "", departmentId: String(data.department.id) });
  const [applications, setApplications] = useState<string[]>(data.applications);
  const [roleIds, setRoleIds] = useState<number[]>(data.roles.map((role) => role.id));
  const [stageIds, setStageIds] = useState<string[]>(data.stageIds);
  const [managerId, setManagerId] = useState(data.manager?.id ?? "");
  const savedSecondary = (data.secondaryDepartments ?? []).map((department) => department.id);
  const [secondaryIds, setSecondaryIds] = useState<number[]>(savedSecondary);
  const [scopes, setScopes] = useState<DocumentScopes>(data.documentScopes ?? { operate: [], approve: [] });

  // Root and identities at or above the actor's authority are read-only. The API enforces this anyway.
  const editable = data.manageable && !data.isRoot;
  const allowed = (permission: string) => editable && can(permission);
  const knownApplications = [...new Set([...(applicationKeys.length ? applicationKeys : ["staff", "dashboard"]), ...data.applications])];
  const canGrantApplication = (key: string) => me.isRoot || me.applications.includes(key);
  const stageLabel = (stage: string) => stageName(stage, stages.find((item) => item.id === stage)?.label);
  const applicationLabel = (key: string) => application(key);
  const roleName = (roleId: number) => roles.find((role) => role.id === roleId)?.name ?? data.roles.find((role) => role.id === roleId)?.name ?? `#${roleId}`;
  const permissionLabel = (key: string) => permission(key, catalog.find((item) => item.key === key)?.label);
  const list = (tr: Messages, items: string[]) => items.length ? items.join(", ") : tr.common.nothing;
  const change = (tr: Messages, before: string[], after: string[], applies: string) => (
    <p>{tr.common.before}: <strong>{list(tr, before)}</strong><br />{tr.common.after}: <strong>{list(tr, after)}</strong><br />{applies}</p>
  );
  const profileChanged = profile.displayName.trim() !== data.displayName || profile.positionTitle.trim() !== (data.positionTitle ?? "") || profile.departmentId !== String(data.department.id);
  const departmentOptions = (departments.length ? departments : [{ id: data.department.id, name: data.department.name, status: "active" as const }])
    .filter((department) => department.status === "active" || department.id === data.department.id);
  // Additional functions: any active department except the saved primary one, plus every one still held.
  const secondaryOptions = [
    ...departments.filter((department) => department.status === "active" && department.id !== data.department.id),
    ...(data.secondaryDepartments ?? []).filter((held) => !departments.some((department) => department.id === held.id && department.status === "active")),
  ];
  const departmentName = (departmentId: number) => departments.find((department) => department.id === departmentId)?.name ?? data.secondaryDepartments?.find((department) => department.id === departmentId)?.name ?? `#${departmentId}`;

  return (
    <div className="page employee-page">
      <button type="button" className="back-link" onClick={() => navigate("/angajati")}>{m.back}</button>
      <PageHeader title={data.displayName} description={`${data.username} · ${data.positionTitle ?? m.noPosition} · ${data.department.name}`}
        actions={<div className="header-badges">{data.isRoot && <RootBadge />}<StatusBadge status={data.status} />{data.mustChangePassword && <Badge tone="warning">{t.common.temporaryPassword}</Badge>}</div>} />
      {data.isRoot && <Notice tone="warning"><strong>{t.root.noticeTitle}</strong> {t.root.noticeBody}</Notice>}
      {!data.isRoot && !data.manageable && <Notice>{data.id === me.employee.id ? m.ownAccount : m.aboveAuthority}</Notice>}
      {message && <Notice tone="success">{t.notices[message]}</Notice>}
      {error && <ErrorBanner error={error} />}
      {!data.isRoot && <PilotReadiness data={data} />}

      <div className="grid-2">
        <Card title={m.profile} actions={allowed("employees.update") ? <button type="button" className="button button-secondary" disabled={busy || !profileChanged || profile.displayName.trim().length < 2}
          onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.saveProfileTitle, confirmLabel: tr.common.save, body: <p>{tr.employee.saveProfileBody}</p> }),
            run: () => api.updateEmployee(id, { displayName: profile.displayName.trim(), positionTitle: profile.positionTitle.trim() || null, departmentId: Number(profile.departmentId) }) })}>{m.saveProfile}</button> : undefined}>
          <div className="form-grid">
            <Field label={m.fullName}>{(fid) => <input id={fid} disabled={!allowed("employees.update")} value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} />}</Field>
            <Field label={m.position}>{(fid) => <input id={fid} disabled={!allowed("employees.update")} value={profile.positionTitle} onChange={(event) => setProfile({ ...profile, positionTitle: event.target.value })} />}</Field>
            <Field label={m.department}>{(fid) => <select id={fid} disabled={!allowed("employees.update")} value={profile.departmentId} onChange={(event) => setProfile({ ...profile, departmentId: event.target.value })}>
              {departmentOptions.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>}</Field>
          </div>
          <dl className="facts">
            <dt>{m.username}</dt><dd className="mono">{data.username}</dd>
            <dt>{m.created}</dt><dd>{dateTime(data.createdAt)}</dd>
            <dt>{m.lastLogin}</dt><dd>{dateTime(data.lastLoginAt)}</dd>
            <dt>{m.authorizationVersion}</dt><dd>{data.authorizationVersion}</dd>
          </dl>
          {data.secondaryDepartments && <section className="secondary-list" data-secondary-departments>
            <h3 className="small">{m.secondaryDepartments}</h3>
            <p className="muted small">{m.secondaryHint}</p>
            {allowed("employees.update") && departments.length > 0 ? <>
              <div className="check-list">
                {secondaryOptions.map((department) => (
                  <label key={department.id} className="check">
                    <input type="checkbox" checked={secondaryIds.includes(department.id)} onChange={() => setSecondaryIds(toggle(secondaryIds, department.id))} />
                    {department.name}
                  </label>
                ))}
              </div>
              <button type="button" className="button button-secondary" disabled={busy || sameSet(secondaryIds, savedSecondary)}
                onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.secondaryTitle, confirmLabel: tr.common.save,
                  body: change(tr, savedSecondary.map(departmentName), secondaryIds.map(departmentName), tr.employee.secondaryApply) }),
                  run: () => api.setSecondaryDepartments(id, [...secondaryIds].sort((a, b) => a - b)) })}>{m.reviewSecondary}</button>
            </> : <p>{data.secondaryDepartments.length ? data.secondaryDepartments.map((department) => department.name).join(", ") : <span className="muted">{m.noSecondaryDepartments}</span>}</p>}
          </section>}
        </Card>

        <Card title={m.access} description={m.accessHint}
          actions={allowed("employees.manage_applications") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(applications, data.applications)}
            onClick={() => onPending({ view: ({ t: tr, application: name }) => ({ title: tr.employee.accessTitle, confirmLabel: tr.employee.applyAccess,
              body: change(tr, data.applications.map((key) => name(key)), applications.map((key) => name(key)), tr.employee.accessApplies) }),
              run: () => api.setApplications(id, applications) })}>{m.reviewAccess}</button> : undefined}>
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

        <Card title={m.roles} description={data.isRoot ? undefined : m.rolesHint}
          actions={allowed("employees.manage_roles") && can("roles.assign") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(roleIds, data.roles.map((role) => role.id))}
            onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.rolesTitle, confirmLabel: tr.employee.applyRoles,
              body: change(tr, data.roles.map((role) => role.name), roleIds.map(roleName), tr.employee.rolesApply) }),
              run: () => api.setRoles(id, roleIds) })}>{m.reviewRoles}</button> : undefined}>
          {data.isRoot ? <p className="muted">{t.root.allPermissions}</p> : <>
            {roles.length > 0 ? (
              <div className="check-list">
                {roles.filter((role) => role.status === "active" || roleIds.includes(role.id)).map((role) => {
                  const enabled = allowed("employees.manage_roles") && can("roles.assign") && role.manageable;
                  return (
                    <label key={role.id} className={`check ${enabled ? "" : "disabled"}`}>
                      <input type="checkbox" disabled={!enabled} checked={roleIds.includes(role.id)} onChange={() => setRoleIds(toggle(roleIds, role.id))} />
                      {role.name} <small>{t.common.level(role.authorityRank)}</small>
                    </label>
                  );
                })}
              </div>
            ) : <p>{list(t, data.roles.map((role) => role.name))}</p>}
            <details className="permissions-detail">
              <summary>{m.rolePermissions(data.rolePermissions.length)}</summary>
              <ul className="permission-list">{data.rolePermissions.map((key) => <li key={key}>{permissionLabel(key)} <small className="mono">{key}</small></li>)}</ul>
            </details>
          </>}
        </Card>

        <Card title={m.stages} description={m.stagesHint}
          actions={allowed("employees.manage_stages") ? <button type="button" className="button button-secondary" disabled={busy || sameSet(stageIds, data.stageIds)}
            onClick={() => onPending({ view: ({ t: tr, stage: name }) => {
              const label = (stage: string) => name(stage, stages.find((item) => item.id === stage)?.label);
              return { title: tr.employee.stagesTitle, confirmLabel: tr.employee.applyStages, body: change(tr, data.stageIds.map(label), stageIds.map(label), tr.employee.stagesApply) };
            },
              run: () => api.setStages(id, stageIds) })}>{m.reviewStages}</button> : undefined}>
          {!data.applications.includes("staff") && !data.isRoot && <p className="muted small">{m.stagesNeedStaff}</p>}
          <div className="stage-grid">
            {stages.map((stage) => (
              <label key={stage.id} className={`check ${allowed("employees.manage_stages") ? "" : "disabled"}`}>
                <input type="checkbox" disabled={!allowed("employees.manage_stages")} checked={stageIds.includes(stage.id)} onChange={() => setStageIds(toggle(stageIds, stage.id))} />
                <span className="ordinal">{stage.ordinal}</span> {stageLabel(stage.id)}
              </label>
            ))}
          </div>
        </Card>

        {data.documentScopes && <DocumentScopesCard data={data} scopes={scopes} editable={editable && me.isRoot && Array.isArray(data.documentScopeSources)}
          busy={busy} onChange={setScopes} onPending={onPending} />}

        <Card title={m.hierarchy} description={m.hierarchyHint}
          actions={allowed("employees.manage_hierarchy") ? <button type="button" className="button button-secondary" disabled={busy || managerId === (data.manager?.id ?? "")}
            onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.managerTitle, confirmLabel: tr.common.save, body: <p>{tr.employee.managerBody}</p> }),
              run: () => api.setManager(id, managerId || null) })}>{m.saveManager}</button> : undefined}>
          {allowed("employees.manage_hierarchy") ? (
            <Field label={m.manager}>{(fid) => <select id={fid} value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              <option value="">{m.noManager}</option>
              {data.manager && !managers.some((manager) => manager.id === data.manager?.id) && <option value={data.manager.id}>{data.manager.displayName}</option>}
              {managers.filter((manager) => manager.id !== data.id).map((manager) => <option key={manager.id} value={manager.id}>{manager.displayName}</option>)}
            </select>}</Field>
          ) : <dl className="facts"><dt>{m.manager}</dt><dd>{data.manager?.displayName ?? "—"}</dd></dl>}
          <h3 className="small">{m.directReports(reports.length)}</h3>
          {reports.length ? <span className="name-list" data-direct-reports>{reports.map((report) => (
            <a key={report.id} href={`/angajati/${report.id}`} onClick={(event) => { event.preventDefault(); navigate(`/angajati/${report.id}`); }}>{report.displayName}</a>
          ))}</span> : <p className="muted small">{m.noDirectReports}</p>}
        </Card>

        <Card title={m.security}>
          {secret && <OneTimeSecret label={m.newTemporaryPassword} value={secret} />}
          {data.isRoot ? <p className="muted">{t.root.passwordNote}</p> : (
            <div className="button-row">
              {data.status === "active"
                ? allowed("employees.deactivate") && <button type="button" className="button button-danger" disabled={busy}
                    onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.deactivateTitle, confirmLabel: tr.common.deactivate, tone: "danger", body: <p>{tr.employee.deactivateBody(data.displayName)}</p> }), run: () => api.setEmployeeStatus(id, false) })}>{m.deactivateAccount}</button>
                : allowed("employees.activate") && <button type="button" className="button button-primary" disabled={busy}
                    onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.activateTitle, confirmLabel: tr.common.activate, body: <p>{tr.employee.activateBody}</p> }), run: () => api.setEmployeeStatus(id, true) })}>{m.activateAccount}</button>}
              {allowed("employees.reset_password") && <button type="button" className="button button-secondary" disabled={busy}
                onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.resetTitle, confirmLabel: tr.employee.resetConfirm, tone: "danger", body: <p>{tr.employee.resetBody}</p> }),
                  run: async () => { const result = await api.resetPassword(id); onSecret(result.temporaryPassword); return api.employee(id); } })}>{m.resetPassword}</button>}
              {!allowed("employees.deactivate") && !allowed("employees.activate") && !allowed("employees.reset_password") && <p className="muted">{m.noSecurityActions}</p>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Order sources this identity's document permissions reach (API 2.22). Shown when the API reports scopes
 * (never for root, which reaches every source). Only root edits them; the API refuses everybody else with
 * ROOT_ONLY, so the editor is read-only for every other viewer.
 */
export function DocumentScopesCard({ data, scopes, editable, busy, onChange, onPending }: {
  data: EmployeeDetail; scopes: DocumentScopes; editable: boolean; busy: boolean;
  onChange: (scopes: DocumentScopes) => void; onPending: (pending: Pending) => void;
}) {
  const { api } = useDashboard();
  const { t } = useI18n();
  const m = t.employee;
  const saved = data.documentScopes ?? { operate: [], approve: [] };
  // A source that is no longer active stays listed while a scope still names it, so it can be removed.
  const offered = data.documentScopeSources ?? [];
  const keys = [...new Set([...offered.map((source) => source.key), ...saved.operate, ...saved.approve])];
  const sourceName = (key: string) => offered.find((source) => source.key === key)?.name ?? key;
  const changed = !sameSet(scopes.operate, saved.operate) || !sameSet(scopes.approve, saved.approve);
  const flip = (capability: keyof DocumentScopes, key: string) => onChange({ ...scopes, [capability]: toggle(scopes[capability], key) });
  const line = (tr: Messages, label: string, before: string[], after: string[]) => {
    const names = (items: string[]) => items.length ? items.map(sourceName).join(", ") : tr.common.nothing;
    return <p>{label}: {tr.common.before}: <strong>{names(before)}</strong> · {tr.common.after}: <strong>{names(after)}</strong></p>;
  };
  return (
    <Card title={m.documentScopes} description={m.documentScopesHint}
      actions={editable ? <button type="button" className="button button-secondary" disabled={busy || !changed}
        onClick={() => onPending({ view: ({ t: tr }) => ({ title: tr.employee.scopesTitle, confirmLabel: tr.employee.applyScopes,
          body: <>{line(tr, tr.employee.scopesOperateList, saved.operate, scopes.operate)}{line(tr, tr.employee.scopesApproveList, saved.approve, scopes.approve)}<p>{tr.employee.scopesApply}</p></> }),
          run: () => api.setDocumentScopes(data.id, { operate: [...scopes.operate].sort(), approve: [...scopes.approve].sort() }) })}>{m.reviewScopes}</button> : undefined}>
      <div className="document-scopes">
        {keys.length === 0 ? <p className="muted">{t.common.nothing}</p> : (
          <table className="data-table compact-table">
            <thead><tr><th>{m.scopeSource}</th><th>{m.scopeOperate}</th><th>{m.scopeApprove}</th></tr></thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key} data-source={key}>
                  <td>{sourceName(key)} <small className="mono">{key}</small></td>
                  {(["operate", "approve"] as const).map((capability) => (
                    <td key={capability}>
                      <label className={`check ${editable ? "" : "disabled"}`}>
                        <input type="checkbox" data-capability={capability} aria-label={`${sourceName(key)}: ${capability === "operate" ? m.scopeOperate : m.scopeApprove}`}
                          disabled={!editable} checked={scopes[capability].includes(key)} onChange={() => flip(capability, key)} />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small">{editable ? m.scopesNeedPermission : m.scopesRootOnly}</p>
    </Card>
  );
}

/**
 * Account-side readiness checklist (docs/pilot-readiness.md), contextual to the applications this identity was
 * granted (see readiness.ts). It exposes only booleans and counts: never a password, hash or session. Phone
 * login, claim and stage completion are verified in Staff afterwards.
 */
export function PilotReadiness({ data }: { data: EmployeeDetail }) {
  const { t, application } = useI18n();
  const p = t.employee.pilot;
  const result = readiness(data);
  const names = data.applications.map((key) => application(key)).join(", ");
  const capability = (key: "operate" | "approve") => key === "operate" ? t.employee.scopeOperate : t.employee.scopeApprove;
  const label = (check: ReadinessCheck): string => {
    switch (check.key) {
      case "active": return check.ok ? p.active : p.inactive;
      case "applications": return check.ok ? p.applications(names) : p.noApplications;
      case "staff-stages": return check.ok ? p.stages(check.count) : p.noStages;
      case "stages-without-staff": return p.stagesWithoutStaff(check.count);
      case "dashboard-roles": return p.roles(application("dashboard"), check.count);
      case "b2b-roles": return p.roles(application("b2b"), check.count);
      case "document-scopes": return p.documentScopes(check.capabilities.map(capability).join(", "));
      case "password": return check.ok ? p.passwordChanged : p.passwordTemporary;
      case "login": return check.ok ? p.firstLogin : p.noLogin;
    }
  };
  const summary = result.verdict === "ready" ? p.readyFor(names) : result.verdict === "password_pending" ? p.pendingFor(names) : null;
  return (
    <Card title={p.title} description={p.hint} className="pilot-card section-gap"
      actions={<span data-pilot={result.verdict}><Badge tone={readinessTone(result.verdict)}>{p.verdict[result.verdict]}</Badge></span>}>
      {summary && <p className="small">{summary}</p>}
      <ul className="pilot-list">
        {result.checks.map((check) => {
          const soft = "soft" in check && check.soft;
          return (
            <li key={check.key} data-check={check.key} data-ok={check.ok ? "true" : "false"} className={check.ok ? "is-ok" : soft ? "is-pending" : "is-missing"}>
              <span aria-hidden="true">{check.ok ? "✓" : soft ? "…" : "✕"}</span> {label(check)}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
