/**
 * Production Intelligence V2 (Dashboard 0.19.0, Operations API 2.72.0): types of the management reports and the pure
 * helpers the screens use. Meters arrive as decimal strings with three decimals ("12.500"); they are summed here only as
 * integer millimetres, never as floating point.
 */

export const INTELLIGENCE_SOURCES = ["trendhome", "outletperdele", "trendyol", "b2b"] as const;
export type IntelligenceSource = (typeof INTELLIGENCE_SOURCES)[number];
export const INTELLIGENCE_SECTIONS = ["overview", "completions", "skus", "coverage", "summary", "products", "employees", "series"] as const;
/** The CEO reports of API 2.73.0 (Dashboard 0.20.0); `coverage` since API 2.76.0 (Dashboard 0.22.0). */
export const CEO_SECTIONS = ["overview", "completions", "skus", "coverage"] as const;
export type IntelligenceSection = (typeof INTELLIGENCE_SECTIONS)[number];
export const PAYMENT_CLASSES = ["paid", "advance_verified", "partial", "no_charge", "unverified", "reversed", "unknown"] as const;
export type PaymentClass = (typeof PAYMENT_CLASSES)[number];
/** Line contract statuses (MeterContract). Only `measured_source` carries meters; the others are named, never zero. */
export const COVERAGE_STATUSES = ["measured_source", "not_metered", "unknown_basis", "unknown", "unknown_marketplace", "conflict", "excluded"] as const;
/** The first day of Arasya production data (owner decision K3), Europe/Bucharest. Production figures start here. */
export const ANALYSIS_START = "2026-10-04";
/** API 2.76.0: sold meters reach back to the oldest verifiable shop order; no range may start before this day. */
export const HISTORY_FLOOR = "2024-01-01";
/** API 2.76.0 accepts multi-year history ranges (Production Intelligence only). */
export const MAX_RANGE_DAYS = 4000;

export type Meters = { fabricMeters: string; railMeters: string };
export type IntelligenceMeta = { range: { fromUtc: string; toUtcExclusive: string; timezone: string; analysisStart?: string }; source: IntelligenceSource | null; contractVersion: number | string };
export type OutsideArasya = Meters & {
  verifiedSaleOrders: number; meteredLines: number; unknownLines: number; notVerifiedOrders: number;
  openOrders?: number; openFabricMeters?: string; openRailMeters?: string; openUnknownLines?: number;
  ordersByShopStatus: Record<string, number> | []; saleRule: string; openRule?: string; productionEvidence: false;
};
export type ProductionMetric = { orders: number; fabricMeters: string; ordersWithUnknownLines: number; unknownLines: number };
export type IntelligenceSummary = IntelligenceMeta & {
  ordered: Meters & {
    entriesByReason: Record<string, number> | [];
    syncedThrough: string | null;
    byOrigin: { arasya: Meters; outside_arasya: OutsideArasya };
    byPayment: Record<PaymentClass, Meters & { orders: number }>;
  };
  verifiedSale: Meters & { byOrigin: { arasya: Meters; outside_arasya: Meters }; notVerified: Meters; rule: string };
  cut: ProductionMetric & { evidence: "source_line"; measuredCutMeters: null };
  recut: ProductionMetric & { evidence: "source_line" };
  processed: { stageCompletions: number };
  completed: ProductionMetric;
  shipped: { available: false; fabricMeters: null; reason: string; marketplaceOrders: number };
  delivered: { available: false; fabricMeters: null; reason: string; marketplaceOrders: number };
  coverage: { linesByStatus: Record<string, number> | [] };
};
export type ProductRow = {
  source: IntelligenceSource; productCode: string | null; variant: string | null;
  orderedFabricMeters: string; orderedRailMeters: string; verifiedSaleFabricMeters: string; verifiedSaleRailMeters: string;
  orderedOutsideArasyaFabricMeters: string; orderedOutsideArasyaRailMeters: string; cutFabricMeters: string; completedFabricMeters: string; unknownLines: number;
};
export type IntelligenceProducts = IntelligenceMeta & { items: ProductRow[]; total: number; truncated: boolean };
export type EmployeeRow = {
  employeeId: string; employeeName: string; stageId: string; completions: number; cuts: number; recuts: number; fabricMeters: string;
  completionsWithUnknownLines: number; completionsWithoutMeters: number; evidence: "source_line";
};
export type IntelligenceEmployees = IntelligenceMeta & { items: EmployeeRow[] };
export type SeriesPoint = {
  period: string; orderedFabricMeters: string; orderedRailMeters: string; verifiedSaleFabricMeters: string; verifiedSaleRailMeters: string;
  orderedOutsideArasyaFabricMeters: string; orderedOutsideArasyaRailMeters: string; cutFabricMeters: string; completedFabricMeters: string; cutOrders: number; completedOrders: number;
};
export type SeriesBucket = "day" | "week" | "month";
export type IntelligenceSeries = IntelligenceMeta & { bucket: SeriesBucket | "year"; items: SeriesPoint[] };

/** "12.500" -> 12500 (millimetres); anything malformed is null, never 0. */
export function meterUnits(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(-)?(\d{1,9})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const units = Number(match[2]) * 1000 + Number((match[3] ?? "").padEnd(3, "0"));
  return match[1] ? -units : units;
}

/** Share of `part` in `whole` as a whole percentage (0-100), or null when the whole is not positive. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/**
 * A report has meaningful ordered meters only after the ledger holds entries. An empty ledger (backfill not run) must
 * never read as "zero meters sold".
 */
export function ledgerState(summary: Pick<IntelligenceSummary, "ordered">): "empty" | "manual" | "automatic" {
  const reasons = Array.isArray(summary.ordered.entriesByReason) ? {} : summary.ordered.entriesByReason;
  const entries = Object.values(reasons).reduce((total, count) => total + count, 0);
  if (summary.ordered.syncedThrough) return "automatic";
  return entries > 0 ? "manual" : "empty";
}

/** The API answered with the 2.72.0 report shape (ordered / verifiedSale); an older API is reported as unavailable. */
export function isCurrentSummary(value: unknown): value is IntelligenceSummary {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  const ordered = raw.ordered as Record<string, unknown> | undefined;
  return Boolean(ordered && typeof ordered === "object" && ordered.byPayment && raw.verifiedSale && raw.coverage);
}

export const PERIODS = ["today", "yesterday", "week", "month", "previous_month", "total", "custom"] as const;
export type Period = (typeof PERIODS)[number];

/**
 * Query of one period. `total` is all time (API 2.76.0 `period=all`): from the oldest day any source holds data to
 * today, with no 366-day cap. The server decides the first day; days without data are never shown as zero sales.
 */
export function periodQuery(period: Period, custom: { from: string; to: string }, now = new Date()): Record<string, string> {
  void now;
  if (period === "custom") return { from: custom.from, to: custom.to };
  if (period !== "total") return { period };
  return { period: "all" };
}

/** A custom range the API will accept: both dates, in order, not before the history floor, at most MAX_RANGE_DAYS. */
export function validCustomRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || from < HISTORY_FLOOR) return false;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return days >= 1 && days <= MAX_RANGE_DAYS;
}
