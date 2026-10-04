import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { ErrorBanner, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

export function ApplicationsPage() {
  const { api } = useDashboard();
  const applications = useLoader(() => api.applications(), [api]);
  return (
    <div className="page">
      <PageHeader title="Aplicații" description="Aplicațiile înregistrate în identitatea centrală Arasya. Accesul se acordă per angajat." />
      <Notice>Registrul aplicațiilor este gestionat de administratorul principal. Aplicațiile viitoare (B2B, Financiar) vor folosi aceeași identitate centrală.</Notice>
      {applications.error && <ErrorBanner message={applications.error} onRetry={applications.reload} />}
      {!applications.data && !applications.error && <Loading />}
      {applications.data && (
        <div className="app-cards">
          {applications.data.items.map((application) => (
            <article key={application.key} className="card app-card">
              <header><h2>{application.name}</h2><StatusBadge status={application.status} /></header>
              <p>{application.description ?? "—"}</p>
              <dl className="facts"><dt>Cheie</dt><dd className="mono">{application.key}</dd><dt>Permisiune de acces</dt><dd className="mono">{application.accessPermission}</dd><dt>Utilizatori activi</dt><dd>{application.userCount}</dd></dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
