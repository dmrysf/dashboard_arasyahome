import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { ErrorBanner, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/context";

export function ApplicationsPage() {
  const { api } = useDashboard();
  const { t, number, application, applicationDescription } = useI18n();
  const applications = useLoader(() => api.applications());
  return (
    <div className="page">
      <PageHeader title={t.applications.title} description={t.applications.description} />
      <Notice>{t.applications.notice}</Notice>
      {applications.error && <ErrorBanner error={applications.error} onRetry={applications.reload} />}
      {!applications.data && !applications.error && <Loading />}
      {applications.data && (
        <div className="app-cards">
          {applications.data.items.map((item) => (
            <article key={item.key} className="card app-card">
              <header><h2>{application(item.key, item.name)}</h2><StatusBadge status={item.status} /></header>
              <p>{applicationDescription(item.key, item.description)}</p>
              <dl className="facts"><dt>{t.applications.key}</dt><dd className="mono">{item.key}</dd><dt>{t.applications.accessPermission}</dt><dd className="mono">{item.accessPermission}</dd><dt>{t.applications.activeUsers}</dt><dd>{number(item.userCount)}</dd></dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
