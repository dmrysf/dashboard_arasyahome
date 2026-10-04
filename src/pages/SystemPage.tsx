import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { applicationLabel, formatDateTime } from "../api/labels";
import { Badge, Card, ErrorBanner, Loading, PageHeader, RootBadge, StatusBadge } from "../components/ui";

/** Read-only and limited to safe facts: no secrets, credentials, cookies, CSRF values or server paths. */
export function SystemPage() {
  const { api, can, session, me } = useDashboard();
  const system = useLoader(() => api.system());
  const health = useLoader(() => api.health());
  const applications = useLoader(() => can("applications.view") ? api.applications() : Promise.resolve({ items: [] }));
  return (
    <div className="page">
      <PageHeader title="Sistem" description="Stare generală, fără secrete sau detalii de infrastructură." />
      {system.error && <ErrorBanner message={system.error} onRetry={system.reload} />}
      {!system.data && !system.error && <Loading />}
      {system.data && (
        <div className="grid-2">
          <Card title="Versiuni și disponibilitate">
            <dl className="facts">
              <dt>Operations API</dt><dd>{system.data.apiVersion}</dd>
              <dt>Panou de control</dt><dd>{__DASHBOARD_VERSION__}</dd>
              <dt>Stare API</dt><dd>{health.data?.status === "ok" ? <Badge tone="success">Disponibil</Badge> : health.error ? <Badge tone="danger">Indisponibil</Badge> : "—"}</dd>
              <dt>Bază de date</dt><dd>{system.data.database === "ok" ? <Badge tone="success">Disponibilă</Badge> : <Badge tone="danger">Indisponibilă</Badge>}</dd>
              <dt>Migrații aplicate</dt><dd>{system.data.migrations.applied} (ultima: <span className="mono">{system.data.migrations.latest ?? "—"}</span>)</dd>
              <dt>Administrator principal</dt><dd>{system.data.rootConfigured ? <Badge tone="success">Configurat</Badge> : <Badge tone="danger">Lipsă</Badge>}</dd>
            </dl>
          </Card>
          <Card title="Identitatea ta">
            <dl className="facts">
              <dt>Nume</dt><dd>{me.employee.displayName} {me.isRoot && <RootBadge />}</dd>
              <dt>Utilizator</dt><dd className="mono">{session.employee.username}</dd>
              <dt>Departament</dt><dd>{me.employee.department}</dd>
              <dt>Aplicații</dt><dd>{me.applications.map(applicationLabel).join(", ") || "—"}</dd>
              <dt>Versiune autorizare</dt><dd>{me.authorizationVersion}</dd>
              <dt>Sesiunea expiră</dt><dd>{formatDateTime(session.expiresAt)}</dd>
            </dl>
          </Card>
          <Card title={`Aplicații înregistrate (${system.data.applications} active)`}>
            {applications.data?.items.length ? (
              <ul className="app-health">
                {applications.data.items.map((application) => <li key={application.key}><strong>{application.name}</strong><span className="muted small">{application.userCount} utilizatori activi</span><StatusBadge status={application.status} /></li>)}
              </ul>
            ) : <p className="muted">{can("applications.view") ? "Se încarcă…" : "Lista aplicațiilor necesită permisiunea de vizualizare a aplicațiilor."}</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
