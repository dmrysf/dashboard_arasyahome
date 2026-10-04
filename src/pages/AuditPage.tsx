import { useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { AUDIT_ACTION_LABELS, errorMessage } from "../api/labels";
import type { AuditEvent } from "../api/types";
import { ErrorBanner, Loading, PageHeader } from "../components/ui";
import { AuditList } from "./AuditList";

export function AuditPage() {
  const { api, can } = useDashboard();
  const actors = useLoader(() => can("employees.view") ? api.employees({ limit: "100" }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }));
  const workflow = useLoader(() => api.workflow());
  const stageLabel = (id: string) => workflow.data?.stages.find((stage) => stage.id === id)?.label ?? id;
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const [search, setSearch] = useState("");
  const [extra, setExtra] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const page = useLoader(() => api.audit(filters).then((result) => { setExtra([]); setCursor(result.nextCursor); return result; }), JSON.stringify(filters));
  const set = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined }));

  const [moreError, setMoreError] = useState("");
  async function more() {
    if (!cursor) return;
    setMoreError("");
    try {
      const next = await api.audit({ ...filters, cursor });
      setExtra((current) => [...current, ...next.items]);
      setCursor(next.nextCursor);
    } catch (caught) { setMoreError(errorMessage(caught)); }
  }

  return (
    <div className="page">
      <PageHeader title="Audit IAM" description="Jurnal permanent al modificărilor de identitate și acces. Nu conține parole sau secrete." />
      <form className="filters" role="search" onSubmit={(event) => { event.preventDefault(); set("search", search.trim()); }}>
        <input aria-label="Caută după actor sau țintă" placeholder="Caută după actor sau țintă" value={search} onChange={(event) => setSearch(event.target.value)} />
        {actors.data && actors.data.items.length > 0 && <select aria-label="Actor" value={filters.actorId ?? ""} onChange={(event) => set("actorId", event.target.value)}>
          <option value="">Toți actorii</option>
          {actors.data.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}
        </select>}
        <select aria-label="Acțiune" value={filters.action ?? ""} onChange={(event) => set("action", event.target.value)}>
          <option value="">Toate acțiunile</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select aria-label="Tip țintă" value={filters.targetType ?? ""} onChange={(event) => set("targetType", event.target.value)}>
          <option value="">Toate țintele</option><option value="employee">Angajați</option><option value="role">Roluri</option><option value="department">Departamente</option>
        </select>
        <label className="date-filter">De la<input type="date" value={filters.from ?? ""} onChange={(event) => set("from", event.target.value)} /></label>
        <label className="date-filter">Până la<input type="date" value={filters.to ?? ""} onChange={(event) => set("to", event.target.value)} /></label>
        <button type="submit" className="button button-secondary">Filtrează</button>
      </form>
      {page.error && <ErrorBanner message={page.error} onRetry={page.reload} />}
      {!page.data && !page.error && <Loading />}
      {page.data && <section className="card"><AuditList items={[...page.data.items, ...extra]} stageLabel={stageLabel} />{moreError && <ErrorBanner message={moreError} />}{cursor && <div className="pager"><button type="button" className="button button-secondary" onClick={() => { void more(); }}>Încarcă mai multe</button></div>}</section>}
    </div>
  );
}
