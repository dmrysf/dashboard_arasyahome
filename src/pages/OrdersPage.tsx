import { useCallback, useState, type FormEvent } from "react";
import type { OrderFacets, OrderPage, OrderSummary } from "../api/types";
import { useDashboard } from "../app/context";
import { orderPath } from "../app/router";
import { usePolling } from "../app/usePolling";
import { EmptyState, ErrorBanner, Loading, PageHeader, RefreshBar } from "../components/ui";
import { useI18n } from "../i18n/context";
import { CommerceChip, OwnerName, ProductionStateBadge, StageChip, TimeInStage } from "./orderParts";

export type OrderFilters = { search: string; source: string; stage: string; commerceStatus: string; ownerId: string; assignment: string; state: string; limit: string };
export const DEFAULT_ORDER_FILTERS: OrderFilters = { search: "", source: "", stage: "", commerceStatus: "", ownerId: "", assignment: "", state: "active", limit: "50" };
const EMPTY_FACETS: OrderFacets = { sources: [], stages: [], commerceStatuses: [], owners: [] };

/** Production Control order list. Filtering and pagination happen on the server; the list refreshes itself. */
export function OrdersPage() {
  const { can } = useDashboard();
  const { t } = useI18n();
  if (!can("orders.view_all")) return <PageHeader title={t.orders.title} description={t.orders.noPermission} />;
  return <OrdersWorkspace />;
}

function OrdersWorkspace() {
  const { api } = useDashboard();
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_ORDER_FILTERS);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [facets, setFacets] = useState<OrderFacets>(EMPTY_FACETS);
  const cursor = cursors[cursors.length - 1];
  const key = JSON.stringify({ filters, cursor });
  const load = useCallback((signal: AbortSignal) => {
    const query: Record<string, string | undefined> = { cursor };
    for (const [name, value] of Object.entries(filters)) query[name] = value || undefined;
    return api.orders(query, signal).then((page) => { setFacets(page.facets); return page; });
  }, [api, filters, cursor]);
  const polling = usePolling(load, key);
  return (
    <OrdersView {...polling} filters={filters} facets={facets} page={cursors.length}
      onFilters={(next) => { setFilters(next); setCursors([undefined]); }}
      onNext={(next) => setCursors((current) => [...current, next])}
      onPrevious={() => setCursors((current) => current.slice(0, -1))}
      onFirst={() => setCursors([undefined])} />
  );
}

export type OrdersViewProps = {
  data: OrderPage | null;
  error: unknown;
  updatedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
  filters: OrderFilters;
  facets: OrderFacets;
  page: number;
  onFilters: (filters: OrderFilters) => void;
  onNext: (cursor: string) => void;
  onPrevious: () => void;
  onFirst: () => void;
};

export function OrdersView({ data, error, updatedAt, refreshing, refresh, filters, facets, page, onFilters, onNext, onPrevious, onFirst }: OrdersViewProps) {
  const { t, number } = useI18n();
  const o = t.orders;
  return (
    <div className="page">
      <PageHeader title={o.title} description={o.description} actions={<RefreshBar updatedAt={updatedAt} refreshing={refreshing} hasData={data !== null} onRefresh={refresh} />} />
      <OrderFilterBar filters={filters} facets={facets} onChange={onFilters} />
      {error !== null && data && <div className="notice notice-warning" role="status">{o.refreshFailed}</div>}
      {error !== null && !data && <div className="stack"><p className="muted">{o.loadFailed}</p><ErrorBanner error={error} onRetry={refresh} /></div>}
      {!data && error === null && <Loading label={o.loading} />}
      {data && (data.items.length === 0 ? <EmptyState title={o.emptyTitle}>{o.emptyHint}</EmptyState> : <>
        <OrdersTable items={data.items} referenceTime={updatedAt ?? Date.parse(data.items[0].importedAt)} />
        <div className="pager">
          <span>{o.pageInfo(number(page), number(data.items.length))}</span>
          <div className="button-row">
            {page > 2 && <button type="button" className="button button-ghost" onClick={onFirst}>{o.firstPage}</button>}
            {page > 1 && <button type="button" className="button button-ghost" onClick={onPrevious}>{o.previousPage}</button>}
            {data.nextCursor && <button type="button" className="button button-secondary" onClick={() => onNext(data.nextCursor as string)}>{o.nextPage}</button>}
          </div>
        </div>
      </>)}
    </div>
  );
}

function OrderFilterBar({ filters, facets, onChange }: { filters: OrderFilters; facets: OrderFacets; onChange: (filters: OrderFilters) => void }) {
  const { t, stage: stageName } = useI18n();
  const o = t.orders;
  const [search, setSearch] = useState(filters.search);
  const set = (name: keyof OrderFilters, value: string) => onChange({ ...filters, [name]: value });
  const submit = (event: FormEvent) => { event.preventDefault(); onChange({ ...filters, search: search.trim() }); };
  return (
    <form className="order-filters" role="search" aria-label={o.filters} onSubmit={submit}>
      <div className="order-search">
        <input type="search" aria-label={o.search} placeholder={o.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="submit" className="button button-secondary">{o.search}</button>
      </div>
      <select aria-label={o.source} value={filters.source} onChange={(event) => set("source", event.target.value)}>
        <option value="">{o.allSources}</option>
        {facets.sources.map((source) => <option key={source.key} value={source.key}>{source.name}</option>)}
      </select>
      <select aria-label={o.stage} value={filters.stage} onChange={(event) => set("stage", event.target.value)}>
        <option value="">{o.allStages}</option>
        {facets.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.ordinal}. {stageName(stage.id, stage.label)}</option>)}
      </select>
      <select aria-label={o.commerceStatus} value={filters.commerceStatus} onChange={(event) => set("commerceStatus", event.target.value)}>
        <option value="">{o.allCommerceStatuses}</option>
        {facets.commerceStatuses.map((status) => <option key={status.code} value={status.code}>{status.label ?? status.code}</option>)}
      </select>
      <select aria-label={o.owner} value={filters.ownerId} onChange={(event) => set("ownerId", event.target.value)}>
        <option value="">{o.allOwners}</option>
        {facets.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}
      </select>
      <select aria-label={o.assignment} value={filters.assignment} onChange={(event) => set("assignment", event.target.value)}>
        <option value="">{o.anyAssignment}</option>
        <option value="assigned">{o.assigned}</option>
        <option value="unassigned">{o.unassigned}</option>
      </select>
      <select aria-label={o.state} value={filters.state} onChange={(event) => set("state", event.target.value)}>
        <option value="">{o.anyState}</option>
        {(["active", "completed", "cancelled"] as const).map((state) => <option key={state} value={state}>{o.states[state]}</option>)}
      </select>
      <select aria-label={o.pageSize} value={filters.limit} onChange={(event) => set("limit", event.target.value)}>
        {["25", "50", "100"].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      <button type="button" className="button button-ghost" onClick={() => { setSearch(""); onChange(DEFAULT_ORDER_FILTERS); }}>{o.reset}</button>
    </form>
  );
}

export function OrdersTable({ items, referenceTime }: { items: OrderSummary[]; referenceTime: number }) {
  const { navigate } = useDashboard();
  const { t, dateTime } = useI18n();
  const o = t.orders;
  return (
    <div className="table-wrap">
      <table className="data-table orders-table">
        <thead>
          <tr><th>{o.order}</th><th>{o.source}</th><th>{o.commerceStatus}</th><th>{o.stage}</th><th>{o.owner}</th><th>{o.timeInStage}</th><th>{o.importedAt}</th><th>{o.state}</th></tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.globalOrderId} data-order={order.globalOrderId} onClick={() => navigate(orderPath(order.globalOrderId))}>
              <td data-label={o.order}>
                <a className="mono order-link" href={orderPath(order.globalOrderId)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); navigate(orderPath(order.globalOrderId)); }}>{order.orderNumber}</a>
              </td>
              <td data-label={o.source}>{order.source.name}</td>
              <td data-label={o.commerceStatus}><CommerceChip status={order.commerce.status} /></td>
              <td data-label={o.stage}><StageChip stage={order.production.stage} /></td>
              <td data-label={o.owner}><OwnerName owner={order.production.owner} /></td>
              <td data-label={o.timeInStage}><TimeInStage order={order} referenceTime={referenceTime} /></td>
              <td data-label={o.importedAt}>{dateTime(order.importedAt)}</td>
              <td data-label={o.state}><ProductionStateBadge state={order.production.state} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
