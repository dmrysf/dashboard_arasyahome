/**
 * The order resolver (API 2.75.0, Dashboard 0.21.0): one order number in, one answer out. Where the order is, whether it
 * is blocked, in which system and waiting for whom, and the ONE step that unblocks it. The server decides everything;
 * these types only read what it sends. Every step goes through the root intervention desk and is audited.
 */

/** The problems the server names (`problem.code`). */
export const RESOLVER_PROBLEMS = [
  "other_flow", "task_on_closed_order", "unanswered_action", "unassigned", "no_operator", "waiting_call", "stale_approval", "online_payment_waiting",
  "shop_unreadable", "transfer_unconfirmed", "money_attention", "proforma_missing", "finance_not_sent", "finance_clarification", "finance_waiting",
  "handoff_waiting", "no_shop_employee", "production_exception", "efactura_due", "document_waiting", "cutting_waiting", "sync_stale",
] as const;
export type ResolverProblemCode = (typeof RESOLVER_PROBLEMS)[number];

/** The systems an order can wait in (`problem.system`). */
export const RESOLVER_SYSTEMS = ["confirmare", "finance", "shop", "customer", "production", "sync", "trendyol", "b2b", "shop_legacy"] as const;

/** The steps the server can offer (`fix.action`). */
export const RESOLVER_FIXES = ["reconcile", "assign", "approve", "reopen", "proforma", "send-finance", "resubmit", "verify-advance", "confirm-transfer", "shop-assign", "close-task"] as const;
export type ResolverFixAction = (typeof RESOLVER_FIXES)[number];

/** The path of an order on the timeline (`steps[].key`). */
export const RESOLVER_STEPS = ["confirmation", "payment", "handoff", "production", "delivery", "intake"] as const;
export type StepState = "done" | "current" | "blocked" | "todo";

export type ResolverFix = {
  action: ResolverFixAction;
  /** Who the step hands the order to (an operator or a shop employee), when it names someone. */
  target?: string;
  /** What only a person can know (the bank statement line of an advance). */
  needs?: ("amount" | "reference" | "valueDate")[];
  defaults?: { amount?: string | null; valueDate?: string | null };
  /** A declaration the person ticks before the step (approve: the customer confirmed). */
  confirm?: "customer_confirmed";
  kind?: string;
  amount?: string | null;
  reference?: string | null;
};

export type ResolverProblem = { code: ResolverProblemCode | string; system: string; owner: string | null; since: string | null; detail?: string };

export type ResolverOrder = {
  globalOrderId: string;
  orderNumber: string;
  source: string;
  flow: "confirmare" | "trendyol" | "b2b" | "shop_legacy" | string;
  submittedAt: string | null;
  paymentMethod: string | null;
  stage: { id: string; name: string | null; ordinal: number | null };
  steps: { key: string; state: StepState }[];
  /** null: nothing blocks the order. */
  problem: ResolverProblem | null;
  fix: ResolverFix | null;
  alternative: ResolverFix | null;
  facts: {
    confirmation?: string; assignee?: string | null; money?: string; attention?: string | null; outstanding?: string | null; currency?: string | null;
    proforma?: { series: string | null; number: string | null; amount: string | null } | null; paymentReference?: string | null;
    financeTask?: { state: string; assignee: string | null; since: string | null; open: boolean } | null;
    shopEmployee?: string | null; shopStatus?: string | null; operationalStatus?: string | null; document?: string; unanswered?: number; shopReadable?: boolean;
  };
  fingerprint: string;
};

export type ResolverLookup = { number: string; orders: ResolverOrder[] };
export type ResolverStuckItem = { globalOrderId: string; orderNumber: string; source: string; status: string; assignee: string | null; submittedAt: string | null; updatedAt: string | null; blockers: string[] };
export type ResolverStuck = { items: ResolverStuckItem[]; limit: number };
export type ResolverResult = { action: ResolverFixAction; outcome: string; order: ResolverOrder };

export type AdvanceFields = { amount: string; reference: string; valueDate: string; overpayment: boolean; statementChecked: boolean };

/** Whether a step needs the bank statement line before it can be pressed. */
export const needsStatement = (fix: ResolverFix | null): boolean => Boolean(fix?.needs && fix.needs.length > 0);

/** A bank reference as the statement writes it (letters, digits, spaces and . / -). */
export function validReference(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 ./-]{2,63}$/.test(value.trim());
}

/** A value date: a real calendar day, not in the future. */
export function validValueDate(value: string, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= today;
}

/** The order's tone on the screen: blocked (danger), waiting for someone without a step (warning), or fine. */
export function orderTone(order: ResolverOrder): "danger" | "warning" | "success" {
  if (order.problem === null) return "success";
  return order.fix !== null ? "danger" : "warning";
}

/** Dashboard path of the resolver, with or without an order number. */
export const resolverPath = (number?: string) => (number ? `/rezolvare/${encodeURIComponent(number)}` : "/rezolvare");
