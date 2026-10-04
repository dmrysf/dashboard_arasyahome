import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Badge, Card, ErrorBanner, Loading, PageHeader, RootBadge, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/context";

/** Read-only and limited to safe facts: no secrets, credentials, cookies, CSRF values or server paths. */
export function SystemPage() {
  const { api, can, session, me } = useDashboard();
  const { t, number, dateTime, application } = useI18n();
  const system = useLoader(() => api.system());
  const health = useLoader(() => api.health());
  const applications = useLoader(() => can("applications.view") ? api.applications() : Promise.resolve({ items: [] }));
  return (
    <div className="page">
      <PageHeader title={t.system.title} description={t.system.description} />
      {system.error && <ErrorBanner error={system.error} onRetry={system.reload} />}
      {!system.data && !system.error && <Loading />}
      {system.data && (
        <div className="grid-2">
          <Card title={t.system.versions}>
            <dl className="facts">
              <dt>{t.system.apiVersion}</dt><dd>{system.data.apiVersion}</dd>
              <dt>{t.system.dashboardVersion}</dt><dd>{__DASHBOARD_VERSION__}</dd>
              <dt>{t.system.apiState}</dt><dd>{health.data?.status === "ok" ? <Badge tone="success">{t.status.available}</Badge> : health.error ? <Badge tone="danger">{t.status.unavailable}</Badge> : "—"}</dd>
              <dt>{t.system.database}</dt><dd>{system.data.database === "ok" ? <Badge tone="success">{t.status.databaseAvailable}</Badge> : <Badge tone="danger">{t.status.databaseUnavailable}</Badge>}</dd>
              <dt>{t.system.migrations}</dt><dd>{number(system.data.migrations.applied)} ({t.system.latestMigration} <span className="mono">{system.data.migrations.latest ?? "—"}</span>)</dd>
              <dt>{t.system.root}</dt><dd>{system.data.rootConfigured ? <Badge tone="success">{t.status.configured}</Badge> : <Badge tone="danger">{t.status.missing}</Badge>}</dd>
            </dl>
          </Card>
          <Card title={t.system.identity}>
            <dl className="facts">
              <dt>{t.system.name}</dt><dd>{me.employee.displayName} {me.isRoot && <RootBadge />}</dd>
              <dt>{t.system.username}</dt><dd className="mono">{session.employee.username}</dd>
              <dt>{t.system.department}</dt><dd>{me.employee.department}</dd>
              <dt>{t.system.applications}</dt><dd>{me.applications.map((key) => application(key)).join(", ") || "—"}</dd>
              <dt>{t.system.authorizationVersion}</dt><dd>{me.authorizationVersion}</dd>
              <dt>{t.system.sessionExpires}</dt><dd>{dateTime(session.expiresAt)}</dd>
            </dl>
          </Card>
          <Card title={t.system.registered(number(system.data.applications))}>
            {applications.data?.items.length ? (
              <ul className="app-health">
                {applications.data.items.map((item) => <li key={item.key}><strong>{application(item.key, item.name)}</strong><span className="muted small">{t.system.activeUsers(number(item.userCount))}</span><StatusBadge status={item.status} /></li>)}
              </ul>
            ) : <p className="muted">{can("applications.view") ? t.common.loading : t.system.applicationsNeedPermission}</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
