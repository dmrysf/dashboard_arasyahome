import { useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Badge, EmptyState, ErrorBanner, Loading, PageHeader, RootBadge, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/context";

export function EmployeesPage() {
  const { api, can, navigate } = useDashboard();
  const { t, number, application } = useI18n();
  const e = t.employees;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<Record<string, string | undefined>>({ status: "active" });
  const [cursor, setCursor] = useState<string | undefined>();
  const departments = useLoader(() => can("departments.view") ? api.departments() : Promise.resolve({ items: [] }));
  const roles = useLoader(() => can("roles.view") ? api.roles() : Promise.resolve({ items: [] }));
  const applications = useLoader(() => can("applications.view") ? api.applications() : Promise.resolve({ items: [] }));
  const page = useLoader(() => api.employees({ ...query, cursor }), JSON.stringify({ ...query, cursor }));
  const update = (key: string, value: string) => { setCursor(undefined); setQuery((current) => ({ ...current, [key]: value || undefined })); };

  return (
    <div className="page">
      <PageHeader title={e.title} description={e.description}
        actions={can("employees.create") ? <button type="button" className="button button-primary" onClick={() => navigate("/angajati/nou")}>{e.create}</button> : undefined} />
      <form className="filters" role="search" onSubmit={(event) => { event.preventDefault(); update("search", search.trim()); }}>
        <input aria-label={e.searchPlaceholder} placeholder={e.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label={e.status} value={query.status ?? ""} onChange={(event) => update("status", event.target.value)}>
          <option value="">{e.allStatuses}</option><option value="active">{e.activePlural}</option><option value="inactive">{e.inactivePlural}</option>
        </select>
        <select aria-label={e.department} value={query.departmentId ?? ""} onChange={(event) => update("departmentId", event.target.value)}>
          <option value="">{e.allDepartments}</option>
          {departments.data?.items.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <select aria-label={e.application} value={query.application ?? ""} onChange={(event) => update("application", event.target.value)}>
          <option value="">{e.allApplications}</option>
          {(applications.data?.items.length ? applications.data.items.map((item) => item.key) : ["staff", "dashboard"]).map((key) => <option key={key} value={key}>{application(key)}</option>)}
        </select>
        <select aria-label={e.role} value={query.roleId ?? ""} onChange={(event) => update("roleId", event.target.value)}>
          <option value="">{e.allRoles}</option>
          {roles.data?.items.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        <button type="submit" className="button button-secondary">{e.search}</button>
      </form>
      {page.error && <ErrorBanner error={page.error} onRetry={page.reload} />}
      {!page.data && !page.error && <Loading />}
      {page.data && (page.data.items.length === 0 ? <EmptyState title={e.emptyTitle}>{e.emptyHint}</EmptyState> : <>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{e.name}</th><th>{e.username}</th><th>{e.department}</th><th>{e.position}</th><th>{e.manager}</th><th>{e.applications}</th><th>{e.roles}</th><th>{e.status}</th></tr></thead>
            <tbody>
              {page.data.items.map((employee) => (
                <tr key={employee.id} className={employee.isRoot ? "row-root" : ""} onClick={() => navigate(`/angajati/${employee.id}`)}>
                  <td data-label={e.name}><a href={`/angajati/${employee.id}`} onClick={(event) => { event.preventDefault(); navigate(`/angajati/${employee.id}`); }}>{employee.displayName}</a>{employee.isRoot && <div><RootBadge /></div>}{employee.mustChangePassword && <div><Badge tone="warning">{t.common.temporaryPassword}</Badge></div>}</td>
                  <td data-label={e.username} className="mono">{employee.username}</td>
                  <td data-label={e.department}>{employee.department.name}</td>
                  <td data-label={e.position}>{employee.positionTitle ?? "—"}</td>
                  <td data-label={e.manager}>{employee.manager?.displayName ?? "—"}</td>
                  <td data-label={e.applications}>{employee.applications.length ? employee.applications.map((key) => <Badge key={key} tone="accent">{application(key)}</Badge>) : "—"}</td>
                  <td data-label={e.roles}>{employee.isRoot ? t.root.allRights : employee.roles.map((role) => role.name).join(", ") || "—"}</td>
                  <td data-label={e.status}><StatusBadge status={employee.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{e.total(number(page.data.total))}</span>
          <div>
            {cursor && <button type="button" className="button button-ghost" onClick={() => setCursor(undefined)}>{e.firstPage}</button>}
            {page.data.nextCursor && <button type="button" className="button button-secondary" onClick={() => setCursor(page.data?.nextCursor ?? undefined)}>{e.nextPage}</button>}
          </div>
        </div>
      </>)}
    </div>
  );
}
