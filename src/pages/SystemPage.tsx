import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { formatDateTime } from "../api/labels";
import { Badge, Card, ErrorBanner, Loading, PageHeader } from "../components/ui";

export function SystemPage() {
  const { api, session, me } = useDashboard();
  const system = useLoader(() => api.system(), [api]);
  return (
    <div className="page">
      <PageHeader title="Sistem" description="Stare generală, fără secrete sau detalii de infrastructură." />
      {system.error && <ErrorBanner message={system.error} onRetry={system.reload} />}
      {!system.data && !system.error && <Loading />}
      {system.data && (
        <div className="grid-2">
          <Card title="Versiuni">
            <dl className="facts">
              <dt>Operations API</dt><dd>{system.data.apiVersion}</dd>
              <dt>Panou de control</dt><dd>{__DASHBOARD_VERSION__}</dd>
              <dt>Bază de date</dt><dd><Badge tone="success">Disponibilă</Badge></dd>
              <dt>Migrații aplicate</dt><dd>{system.data.migrations.applied} (ultima: <span className="mono">{system.data.migrations.latest ?? "—"}</span>)</dd>
              <dt>Aplicații active</dt><dd>{system.data.applications}</dd>
              <dt>Administrator principal</dt><dd>{system.data.rootConfigured ? <Badge tone="success">Configurat</Badge> : <Badge tone="danger">Lipsă</Badge>}</dd>
            </dl>
          </Card>
          <Card title="Sesiunea ta">
            <dl className="facts">
              <dt>Utilizator</dt><dd className="mono">{session.employee.username}</dd>
              <dt>Expiră</dt><dd>{formatDateTime(session.expiresAt)}</dd>
              <dt>Aplicații</dt><dd>{me.applications.join(", ")}</dd>
              <dt>Versiune autorizare</dt><dd>{me.authorizationVersion}</dd>
              <dt>Stocare sesiune</dt><dd>Cookie securizat HttpOnly pe api.arasyahome.ro</dd>
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}
