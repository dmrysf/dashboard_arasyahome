/**
 * The root intervention desk (API 2.57.0): the Trend Home and Outlet Perdele orders that wait for someone, and the
 * actions the principal administrator takes on them. The server decides everything; these types only read what it
 * sends. Money and proforma figures come from the shop at read time and are never stored here.
 */

export const INTERVENTION_BLOCKERS = ["unassigned", "waiting_call", "stale_approval", "payment_waiting", "request_needs_clarification", "request_exception", "request_requested", "unanswered_action", "no_supervisor",
  "handoff_waiting", "efactura_due", "production_exception", "sync_stale"] as const;
export type InterventionBlocker = (typeof INTERVENTION_BLOCKERS)[number];

export type InterventionItem = {
  globalOrderId: string; orderNumber: string; source: string; paymentMethod: string | null; status: string; version: number;
  assignee: string | null; submittedAt: string | null; updatedAt: string | null; requestState: string | null; blockers: string[]; stage?: string;
};
export type InterventionStaffing = { source: string; operators: number; supervisors: number; lastContactAt?: string | null };
export type InterventionOtherFlow = { flow: "trendyol" | "b2b" | "shop_legacy" | string; open: number };
export type InterventionOverview = { view: "stuck" | "all"; sources: InterventionStaffing[]; items: InterventionItem[]; limit: number; otherFlows?: InterventionOtherFlow[] };

export type InterventionEvent = { action: string; actor: string | null; status: string; previousStatus: string | null; assignee: string | null; reasonCode: string | null; at: string };
export type InterventionHistory = { action: string; reason: string | null; outcome: string | null; code: string | null; at: string | null };
export type Unavailable = { available: false; reason: string };

/** The parts of the shop's money summary the desk shows (SourceFinance, read as root). */
export type InterventionFinance = {
  available: true;
  summary: {
    revision: string; currency: string;
    totals: { current: string | null };
    advance: { percentage: number | null; required: string | null; collected: string | null; outstanding: string | null; paymentReference: string | null; proforma: { series: string | null; number: string | null; amount: string | null } | null; proformaCancelled: boolean } | null;
    financial: { state: string; basis: string | null };
    entries: { id: string; kind: string; amount: string; reference: string; valueDate: string; state: string; flags?: string[] }[];
    capabilities: { verification: string } | null;
  };
  allowedActions: string[];
};

/** The parts of the shop's invoice summary the desk shows (SourceInvoice, read as root). */
export type InterventionInvoice = {
  available?: true;
  summary: { revision: string; proforma: { document: { series: string | null; number: string | null } | null; advance?: { percentage?: number | null } | null } | null } | null;
  proforma?: Record<string, boolean>;
};

export type InterventionRequest = { request: { id: string; state: string; version: number; reasonCode: string | null; proforma: { series: string | null; number: string } | null; assignee: string | null } | null; canResubmit?: boolean; canCancel?: boolean };

export type InterventionOrder = {
  confirmare: {
    globalOrderId: string; orderNumber: string; sourceKey: string; status: string; version: number;
    assignment?: { employeeId: string; displayName: string } | null;
    events: InterventionEvent[];
  };
  missing: string[];
  blockers: string[];
  finance: InterventionFinance | Unavailable;
  invoice: InterventionInvoice | Unavailable;
  request: InterventionRequest | Unavailable;
  operators: { id: string; displayName: string; capability: string }[];
  interventions: InterventionHistory[];
  operations: { available: boolean; stage: string; awbStage: boolean; allowed: Record<string, boolean>; shop: Record<string, unknown> | null } | Unavailable;
  shop: { employee: string | null; employeeId: string | null; assignedAt: string | null; candidates: { id: string; name: string }[] };
  unanswered: { kind: "finance" | "invoice" | "edit" | "operation"; action: string; state: string; idempotencyKey: string; employee: string | null; requestedAt: string | null }[];
  efactura: { id: string; state: string; version: number; dueAt: string | null; issuer: string | null }[];
  production: { stage: string | null; documentStatus: string | null; operationalStatus: string | null; changedAt: string | null; openExceptions: number };
  sync: { freshness: string | null; shopChangedAt: string | null; receivedAt: string | null; shopContactAt: string | null };
};

/** The shop's editable view of a pending order (Confirmare source edits, read as root). */
export type EditField = { name: string; title: string; type: string; editable: boolean; required: boolean; options?: { value: string; title: string }[]; value?: string | null };
export type EditLine = { id: string; productId: string; variationId: string; name: string; quantity: number; calculator?: { fields: EditField[] } | null };
export type EditCatalog = { catalog: { version: string; editable: boolean; reason: string | null; lines: EditLine[] } };
export type EditProduct = { product: { id: string; name: string; sku: string; type: string; variations: { id: string; name?: string; attributes?: Record<string, string> }[]; calculator?: { fields: EditField[] } | null } };
export type EditOperation = { op: "update_line"; lineId: string; quantity?: number; fields?: Record<string, string> } | { op: "add_line"; productId: string; variationId?: string; quantity: number; fields?: Record<string, string> } | { op: "remove_line"; lineId: string };
export type EditPreview = { preview: { previewToken: string; before: { total: string }; after: { total: string }; financial?: { impact: string } | null } };

/** The reconciliation action of each kind of unanswered shop action. */
export const RECONCILE_ACTION = { finance: "finance-reconcile", invoice: "invoice-reconcile", edit: "edit-reconcile", operation: "operation-reconcile" } as const;

export const INTERVENTION_ACTIONS = ["reopen", "assign", "approve", "reject", "proforma", "advance", "request-cancel", "request-resubmit",
  "shop-assign", "invoice", "invoice-reconcile", "efactura", "operation", "operation-reconcile", "finance", "finance-reconcile",
  "edit-catalog", "edit-product", "edit-preview", "edit-apply", "edit-reconcile"] as const;
export type InterventionAction = (typeof INTERVENTION_ACTIONS)[number];

export const isAvailable = <T extends object>(part: T | Unavailable): part is T => !("available" in part && part.available === false);

/** Amounts as the shop writes them ("149.71"); a typed amount accepts a comma ("149,71"). */
export function normalizeAmount(value: string): string | null {
  const text = value.trim().replace(",", ".");
  return /^\d{1,7}(\.\d{1,2})?$/.test(text) ? Number(text).toFixed(2) : null;
}

/** Whether a typed amount is above what the shop says is still owed (the over-payment confirmation is then required). */
export function exceedsOutstanding(amount: string | null, outstanding: string | null | undefined): boolean {
  if (amount === null || outstanding === null || outstanding === undefined) return false;
  return Math.round(Number(amount) * 100) > Math.round(Number(outstanding) * 100);
}
