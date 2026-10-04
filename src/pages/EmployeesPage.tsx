import { useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { applicationLabel } from "../api/labels";
import { Badge, EmptyState, ErrorBanner, Loading, PageHeader, RootBadge, StatusBadge } from "../components/ui";

export function EmployeesPage() {
  const { api, can, navigate } = useDashboard();
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
      <PageHeader title="Angajați" description="O singură identitate per persoană, cu acces la aplicații acordat central."
        actions={can("employees.create") ? <button type="button" className="button button-primary" onClick={() => navigate("/angajati/nou")}>Angajat nou</button> : undefined} />
      <form className="filters" role="search" onSubmit={(event) => { event.preventDefault(); update("search", search.trim()); }}>
        <input aria-label="Caută după nume, utilizator sau funcție" placeholder="Caută după nume, utilizator sau funcție" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Status" value={query.status ?? ""} onChange={(event) => update("status", event.target.value)}>
          <option value="">Toate statusurile</option><option value="active">Activi</option><option value="inactive">Inactivi</option>
        </select>
        <select aria-label="Departament" value={query.departmentId ?? ""} onChange={(event) => update("departmentId", event.target.value)}>
          <option value="">Toate departamentele</option>
          {departments.data?.items.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <select aria-label="Aplicație" value={query.application ?? ""} onChange={(event) => update("application", event.target.value)}>
          <option value="">Toate aplicațiile</option>
          {(applications.data?.items.length ? applications.data.items.map((item) => item.key) : ["staff", "dashboard"]).map((key) => <option key={key} value={key}>{applicationLabel(key)}</option>)}
        </select>
        <select aria-label="Rol" value={query.roleId ?? ""} onChange={(event) => update("roleId", event.target.value)}>
          <option value="">Toate rolurile</option>
          {roles.data?.items.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        <button type="submit" className="button button-secondary">Caută</button>
      </form>
      {page.error && <ErrorBanner message={page.error} onRetry={page.reload} />}
      {!page.data && !page.error && <Loading />}
      {page.data && (page.data.items.length === 0 ? <EmptyState title="Niciun angajat găsit.">Modifică filtrele sau creează un angajat nou.</EmptyState> : <>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Nume</th><th>Utilizator</th><th>Departament</th><th>Funcție</th><th>Manager</th><th>Aplicații</th><th>Roluri</th><th>Status</th></tr></thead>
            <tbody>
              {page.data.items.map((employee) => (
                <tr key={employee.id} className={employee.isRoot ? "row-root" : ""} onClick={() => navigate(`/angajati/${employee.id}`)}>
                  <td data-label="Nume"><a href={`/angajati/${employee.id}`} onClick={(event) => { event.preventDefault(); navigate(`/angajati/${employee.id}`); }}>{employee.displayName}</a>{employee.isRoot && <div><RootBadge /></div>}{employee.mustChangePassword && <div><Badge tone="warning">Parolă temporară</Badge></div>}</td>
                  <td data-label="Utilizator" className="mono">{employee.username}</td>
                  <td data-label="Departament">{employee.department.name}</td>
                  <td data-label="Funcție">{employee.positionTitle ?? "—"}</td>
                  <td data-label="Manager">{employee.manager?.displayName ?? "—"}</td>
                  <td data-label="Aplicații">{employee.applications.length ? employee.applications.map((key) => <Badge key={key} tone="accent">{applicationLabel(key)}</Badge>) : "—"}</td>
                  <td data-label="Roluri">{employee.isRoot ? "Toate drepturile" : employee.roles.map((role) => role.name).join(", ") || "—"}</td>
                  <td data-label="Status"><StatusBadge status={employee.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{page.data.total} angajați</span>
          <div>
            {cursor && <button type="button" className="button button-ghost" onClick={() => setCursor(undefined)}>Prima pagină</button>}
            {page.data.nextCursor && <button type="button" className="button button-secondary" onClick={() => setCursor(page.data?.nextCursor ?? undefined)}>Pagina următoare</button>}
          </div>
        </div>
      </>)}
    </div>
  );
}
