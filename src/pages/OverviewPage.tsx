import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Card, ErrorBanner, Loading, PageHeader, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/context";
import { AuditList } from "./AuditList";

export function OverviewPage() {
  const { api, me, can, navigate } = useDashboard();
  const { t, number, application } = useI18n();
  const { data, error, reload } = useLoader(() => api.overview());
  if (!can("dashboard.overview.view")) return <PageHeader title={t.overview.title} description={t.overview.noPermission} />;
  return (
    <div className="page">
      <PageHeader title={t.overview.greeting(me.employee.displayName.split(" ")[0])} description={t.overview.description} />
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <>
        <div className="metric-grid">
          {([
            ["activeEmployees", t.overview.activeEmployees, data.counts.activeEmployees, "/angajati"],
            ["dashboardUsers", t.overview.dashboardUsers, data.counts.dashboardUsers, "/angajati"],
            ["staffUsers", t.overview.staffUsers, data.counts.staffUsers, "/angajati"],
            ["departments", t.overview.departments, data.counts.departments, "/departamente"],
            ["roles", t.overview.roles, data.counts.roles, "/roluri"],
          ] as const).map(([key, label, value, path]) => (
            <button type="button" className="metric" key={key} onClick={() => navigate(path)}><span>{label}</span><strong>{number(value)}</strong></button>
          ))}
        </div>
        <div className="grid-2">
          <Card title={t.overview.recentActivity} actions={can("iam.audit.view") ? <button type="button" className="button button-ghost" onClick={() => navigate("/audit")}>{t.overview.seeAll}</button> : undefined}>
            {data.recentAudit ? <AuditList items={data.recentAudit} compact /> : <p className="muted">{t.overview.auditNeedsPermission}</p>}
          </Card>
          <Card title={t.overview.applications}>
            <ul className="app-health">
              {data.applications.map((item) => <li key={item.key}><strong>{application(item.key, item.name)}</strong><StatusBadge status={item.status} /></li>)}
            </ul>
            <p className="muted small">{t.overview.futureNote}</p>
          </Card>
        </div>
      </>}
    </div>
  );
}
