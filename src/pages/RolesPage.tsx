import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Badge, EmptyState, ErrorBanner, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

export function RolesPage() {
  const { api, can, navigate } = useDashboard();
  const roles = useLoader(() => api.roles(), [api]);
  return (
    <div className="page">
      <PageHeader title="Roluri și permisiuni" description="Rolurile combină permisiuni din catalogul fix al serverului. Nivelul de autoritate limitează cine poate atribui sau modifica un rol."
        actions={can("roles.create") ? <button type="button" className="button button-primary" onClick={() => navigate("/roluri/nou")}>Rol nou</button> : undefined} />
      <Notice>Administratorul principal nu este un rol: este un cont de sistem protejat, deasupra tuturor rolurilor.</Notice>
      {roles.error && <ErrorBanner message={roles.error} onRetry={roles.reload} />}
      {!roles.data && !roles.error && <Loading />}
      {roles.data && (roles.data.items.length === 0 ? <EmptyState title="Niciun rol." /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Rol</th><th>Descriere</th><th>Nivel autoritate</th><th>Utilizatori</th><th>Permisiuni</th><th>Status</th></tr></thead>
            <tbody>
              {roles.data.items.map((role) => (
                <tr key={role.id} onClick={() => navigate(`/roluri/${role.id}`)}>
                  <td data-label="Rol"><a href={`/roluri/${role.id}`} onClick={(event) => { event.preventDefault(); navigate(`/roluri/${role.id}`); }}>{role.name}</a> {role.isTemplate && <Badge>Șablon</Badge>} {!role.manageable && <Badge tone="warning">Peste autoritatea ta</Badge>}</td>
                  <td data-label="Descriere">{role.description ?? "—"}</td>
                  <td data-label="Nivel">{role.authorityRank}</td>
                  <td data-label="Utilizatori">{role.userCount}</td>
                  <td data-label="Permisiuni">{role.permissionCount}</td>
                  <td data-label="Status"><StatusBadge status={role.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
