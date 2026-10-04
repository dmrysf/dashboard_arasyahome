import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Card, ErrorBanner, Loading, PageHeader, StatusBadge } from "../components/ui";
import { AuditList } from "./AuditList";

export function OverviewPage() {
  const { api, me, can, navigate } = useDashboard();
  const { data, error, reload } = useLoader(() => api.overview());
  if (!can("dashboard.overview.view")) return <PageHeader title="Panou de control" description="Nu ai permisiunea de a vedea sumarul." />;
  return (
    <div className="page">
      <PageHeader title={`Bună, ${me.employee.displayName.split(" ")[0]}.`} description="Situația identităților și a accesului în ecosistemul Arasya." />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <>
        <div className="metric-grid">
          {[
            ["Angajați activi", data.counts.activeEmployees, "/angajati"],
            ["Utilizatori Dashboard", data.counts.dashboardUsers, "/angajati"],
            ["Utilizatori Staff", data.counts.staffUsers, "/angajati"],
            ["Departamente", data.counts.departments, "/departamente"],
            ["Roluri", data.counts.roles, "/roluri"],
          ].map(([label, value, path]) => (
            <button type="button" className="metric" key={String(label)} onClick={() => navigate(String(path))}><span>{label}</span><strong>{value}</strong></button>
          ))}
        </div>
        <div className="grid-2">
          <Card title="Activitate administrativă recentă" actions={can("iam.audit.view") ? <button type="button" className="button button-ghost" onClick={() => navigate("/audit")}>Vezi tot</button> : undefined}>
            {data.recentAudit ? <AuditList items={data.recentAudit} compact /> : <p className="muted">Auditul IAM necesită permisiunea „Vizualizare audit IAM”.</p>}
          </Card>
          <Card title="Aplicații">
            <ul className="app-health">
              {data.applications.map((application) => <li key={application.key}><strong>{application.name}</strong><StatusBadge status={application.status} /></li>)}
            </ul>
            <p className="muted small">Operațiunile de producție detaliate vor apărea într-o versiune viitoare a panoului.</p>
          </Card>
        </div>
      </>}
    </div>
  );
}
