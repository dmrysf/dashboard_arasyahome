import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Badge, EmptyState, ErrorBanner, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/context";

export function RolesPage() {
  const { api, can, navigate } = useDashboard();
  const { t, number } = useI18n();
  const roles = useLoader(() => api.roles());
  return (
    <div className="page">
      <PageHeader title={t.roles.title} description={t.roles.description}
        actions={can("roles.create") ? <button type="button" className="button button-primary" onClick={() => navigate("/roluri/nou")}>{t.roles.create}</button> : undefined} />
      <Notice>{t.root.notARole}</Notice>
      {roles.error && <ErrorBanner error={roles.error} onRetry={roles.reload} />}
      {!roles.data && !roles.error && <Loading />}
      {roles.data && (roles.data.items.length === 0 ? <EmptyState title={t.roles.empty} /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{t.roles.role}</th><th>{t.roles.descriptionColumn}</th><th>{t.roles.rank}</th><th>{t.roles.users}</th><th>{t.roles.permissions}</th><th>{t.roles.status}</th></tr></thead>
            <tbody>
              {roles.data.items.map((role) => (
                <tr key={role.id} onClick={() => navigate(`/roluri/${role.id}`)}>
                  <td data-label={t.roles.role}><a href={`/roluri/${role.id}`} onClick={(event) => { event.preventDefault(); navigate(`/roluri/${role.id}`); }}>{role.name}</a> {role.isTemplate && <Badge>{t.roles.template}</Badge>} {!role.manageable && <Badge tone="warning">{t.roles.aboveYou}</Badge>}</td>
                  <td data-label={t.roles.descriptionColumn}>{role.description ?? "—"}</td>
                  <td data-label={t.roles.rankShort}>{role.authorityRank}</td>
                  <td data-label={t.roles.users}>{number(role.userCount)}</td>
                  <td data-label={t.roles.permissions}>{number(role.permissionCount)}</td>
                  <td data-label={t.roles.status}><StatusBadge status={role.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
