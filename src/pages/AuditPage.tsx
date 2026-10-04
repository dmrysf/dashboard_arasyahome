import { useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import type { AuditEvent } from "../api/types";
import { ErrorBanner, Loading, PageHeader } from "../components/ui";
import { toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";
import { AuditList } from "./AuditList";

export function AuditPage() {
  const { api, can } = useDashboard();
  const { t } = useI18n();
  const actors = useLoader(() => can("employees.view") ? api.employees({ limit: "100" }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }));
  const workflow = useLoader(() => api.workflow());
  const stageLabel = (id: string) => workflow.data?.stages.find((stage) => stage.id === id)?.label;
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const [search, setSearch] = useState("");
  const [extra, setExtra] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const page = useLoader(() => api.audit(filters).then((result) => { setExtra([]); setCursor(result.nextCursor); return result; }), JSON.stringify(filters));
  const set = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined }));

  const [moreError, setMoreError] = useState<Problem | null>(null);
  async function more() {
    if (!cursor) return;
    setMoreError(null);
    try {
      const next = await api.audit({ ...filters, cursor });
      setExtra((current) => [...current, ...next.items]);
      setCursor(next.nextCursor);
    } catch (caught) { setMoreError(toProblem(caught)); }
  }

  return (
    <div className="page">
      <PageHeader title={t.audit.title} description={t.audit.description} />
      <form className="filters" role="search" onSubmit={(event) => { event.preventDefault(); set("search", search.trim()); }}>
        <input aria-label={t.audit.searchPlaceholder} placeholder={t.audit.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} />
        {actors.data && actors.data.items.length > 0 && <select aria-label={t.audit.actor} value={filters.actorId ?? ""} onChange={(event) => set("actorId", event.target.value)}>
          <option value="">{t.audit.allActors}</option>
          {actors.data.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}
        </select>}
        <select aria-label={t.audit.action} value={filters.action ?? ""} onChange={(event) => set("action", event.target.value)}>
          <option value="">{t.audit.allActions}</option>
          {Object.entries(t.auditActions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select aria-label={t.audit.targetType} value={filters.targetType ?? ""} onChange={(event) => set("targetType", event.target.value)}>
          <option value="">{t.audit.allTargets}</option><option value="employee">{t.audit.targetEmployees}</option><option value="role">{t.audit.targetRoles}</option><option value="department">{t.audit.targetDepartments}</option><option value="order">{t.audit.targetOrders}</option>
        </select>
        <label className="date-filter">{t.audit.from}<input type="date" value={filters.from ?? ""} onChange={(event) => set("from", event.target.value)} /></label>
        <label className="date-filter">{t.audit.to}<input type="date" value={filters.to ?? ""} onChange={(event) => set("to", event.target.value)} /></label>
        <button type="submit" className="button button-secondary">{t.audit.filter}</button>
      </form>
      {page.error && <ErrorBanner error={page.error} onRetry={page.reload} />}
      {!page.data && !page.error && <Loading />}
      {page.data && <section className="card"><AuditList items={[...page.data.items, ...extra]} stageLabel={stageLabel} />{moreError && <ErrorBanner error={moreError} />}{cursor && <div className="pager"><button type="button" className="button button-secondary" onClick={() => { void more(); }}>{t.audit.loadMore}</button></div>}</section>}
    </div>
  );
}
