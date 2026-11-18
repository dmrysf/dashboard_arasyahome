/**
 * CEO production reports (Dashboard 0.20.0, Operations API 2.73.0): `overview`, `completions` and `skus`. Types and the pure
 * helpers the screens use. Meters arrive as decimal strings with three decimals; they are summed only as integer millimetres.
 *
 * Trendhome / Outlet Perdele / B2B meters are the priced line meters (`fabricMeters`, `railMeters`). Trendyol carries only
 * `panelWidthMeters` (panel width x quantity of verified lines). The two are never added together.
 */
import { meterUnits } from "./intelligence";

/** One accumulated group of lines (API CeoProductionReport::bagOut). */
export type Bag = {
  orders: number; lines: number; units: number;
  fabricMeters: string; railMeters: string; measuredLines: number; notMeteredLines: number; unknownLines: number; unknownUnits: number;
  panelWidthMeters: string; panelLines: number; panelUnknownLines: number; panelUnknownUnits: number;
};
export type ReportRange = { range: { fromUtc: string; toUtcExclusive: string; timezone: string; analysisStart?: string }; source: string | null; contractVersion: number | string };
export type Quality = {
  meterLinesByStatus: Record<string, number> | []; panelLinesByStatus: Record<string, number> | [];
  categoryKnownLines: number; categoryUnknownLines: number; linesByEvidence: Record<string, number> | [];
};
export type LedgerFigures =
  | { state: "empty"; available: false; syncedThrough: null; ordered: null; verifiedSale: null }
  | { state: "manual" | "automatic"; available: true; syncedThrough: string | null; ordered: { fabricMeters: string; railMeters: string }; verifiedSale: { fabricMeters: string; railMeters: string } };
export type CurrentState = {
  inProduction: number; waiting: number; delayed: number; delayedWaiting: number; delayedInProduction: number; stopped: number; legacyActive: number;
  bySource: Record<string, { inProduction: number; waiting: number; delayed: number }> | [];
  byStage: Record<string, number> | []; delayedByStage: Record<string, number> | []; asOf: string; delayHours: number;
  /** API 2.76.0: meters of the active Arasya-flow orders (absent before). */
  meters?: { inProduction: Bag; waiting: Bag };
};
/** One metric of the sales block (API 2.76.0): every value a decimal string of meters. */
export type SalesFigure = { ordered: string; cancelled: string; adjusted: string; net: string; verified: string };
export type PaymentBreakdown = Record<string, { fabricMeters: string; railMeters: string; orders: number }>;
export type SalesSource = {
  fabric: SalesFigure; rail: SalesFigure; arasya: { fabricMeters: string; railMeters: string };
  outsideArasya: { fabricMeters: string; railMeters: string; verifiedFabricMeters: string; openFabricMeters: string } | null;
  orders: number; byPayment: PaymentBreakdown;
};
export type Sales = {
  bySource: Record<string, SalesSource>;
  total: { fabric: SalesFigure; rail: SalesFigure; orders: number; byPayment: PaymentBreakdown; sources: string[] };
  rules: Record<string, string>;
  state: "empty" | "manual" | "automatic"; syncedThrough: string | null; lastRun: { at: string; orders: number; entries: number } | null;
  trendyolPanel: { widthMeters: string; verifiedLines: number; unknownLines: number; orders: number; rule: string } | null;
  unknown: { linesBySource: Record<string, number>; lines: number; orders: number; outsideArasyaLines: number; rule: string };
};
export type SourceCount = { orders: number; units: number; cancelled: number };
export type CeoOverview = ReportRange & {
  generatedAt: string; lastActivityAt: string | null; refresh: { suggestedSeconds: number };
  received: { orders: number; units: number; cancelled: number; bySource: Record<string, SourceCount> };
  worked: { orders: number; bySource: Record<string, number>; byArea: Record<string, number> };
  completed: Bag & { recompletions: { orders: number; events: number }; cancelledAfterCompletion: number; afterCompletion: { cancelled: Bag; returned: Bag }; bySource: Record<string, Bag> | [] };
  current: CurrentState; quality: Quality; ledger: LedgerFigures;
  /** API 2.76.0; absent from an older API. */
  sales?: Sales;
  definitions: { delayHours: number; categoryCatalog: boolean; panelRule: string };
};
export type CoverageMonth = { month: string; orders: number };
export type ShopCoverage = {
  firstOrderAt: string | null; lastOrderAt: string | null; orders: number; meteredLines: number; notMeteredLines: number; unknownLines: number; coveragePercent: string | null;
  arasya: { orders: number; firstOrderAt: string | null; lastOrderAt: string | null; cancelled: number; excluded: number; enteredProduction: number; notInProduction: number; completed: number; linesByStatus: Record<string, number> };
  outsideArasya: { orders: number; lines: number; firstOrderAt: string | null; lastOrderAt: string | null; lastImportAt: string | null; verifiedSaleOrders: number; noSaleOrders: number;
    refundedLines: number; meteredLines: number; notMeteredLines: number; unknownLines: number };
  months: CoverageMonth[]; gapMonths: string[];
};
export type TrendyolCoverage = {
  firstOrderAt: string | null; lastOrderAt: string | null; orders: number; cancelled: number; excluded: number; enteredProduction: number; notInProduction: number; completed: number;
  fabricMeters: null; fabricRule: string; panelLinesByStatus: Record<string, number> | []; panelVerifiedLines: number; panelCoveragePercent: string | null; months: CoverageMonth[]; gapMonths: string[];
};
export type B2bCoverage = {
  firstOrderAt: string | null; lastOrderAt: string | null; orders: number; testOrders: number; realOrders: number; realFinalized: number; realCancelled: number; realDraft: number; handedOff: number;
  realLinesByStatus: Record<string, number>; coveragePercent: string | null; saleRule: string; months: CoverageMonth[]; gapMonths: string[];
};
export type CohortItem = { cohort: string; orderCode: string; statusAtDecision: string; statusNow: string; enteredMeters: string; canonicalOrder: string | null; canonicalExcluded: boolean; soldMetersBooked: string; decidedBy: string; decidedAt: string | null };
export type CeoCoverage = ReportRange & { coverage: {
  generatedAt: string; productionStart: string; historyFloor: string;
  sources: { trendhome: ShopCoverage; outletperdele: ShopCoverage; trendyol: TrendyolCoverage; b2b: B2bCoverage };
  b2bTestCohort: { available: boolean; orders: number; enteredMeters?: string; canonicalOrders?: number; canonicalExcluded?: number; items: CohortItem[]; rule?: string };
  ledger: { canonicalEntries: number; b2bEntries: number | null; exclusions: number; automatic: boolean; syncedThrough: string | null; lastRunAt: string | null; lastRunOrders: number | null; lastRunEntries: number | null };
  categories: { source_key: string; products: number | string; last_change: string | null }[];
} };

export function isCeoCoverage(raw: unknown): raw is CeoCoverage {
  const value = raw as Partial<CeoCoverage> | null;
  return Boolean(value && value.coverage && value.coverage.sources && value.coverage.b2bTestCohort);
}
export type SeriesBag = Bag & { period: string; bySource: Record<string, Bag> | [] };
export type CategoryRow = Bag & { category: string; source: string; categorySources: string[] };
export type SkuCompletionRow = Bag & { source: string; productCode: string | null; name: string; category: string; categorySource: string; evidence: Record<string, number> | [] };
export type StageWorkRow = { employeeId: string; employeeName: string; stageId: string; completions: number; orders: number };
export type CeoCompletions = ReportRange & {
  bucket: "day" | "week" | "month";
  totals: Bag & { recompletions: { orders: number; events: number }; cancelledAfterCompletion: number };
  afterCompletion: { cancelled: Bag; returned: Bag; net: Bag; rule: string };
  bySource: Record<string, Bag> | []; byCategory: CategoryRow[];
  bySku: { items: SkuCompletionRow[]; total: number; truncated: boolean };
  completionCredits: (Bag & { employeeId: string; employeeName: string })[]; stageWork: StageWorkRow[];
  series: SeriesBag[]; quality: Quality; definitions: { categoryCatalog: boolean; panelRule: string };
};
export type SkuRow = {
  source: string; productCode: string | null; name: string; category: string; categorySource: string; variants: number;
  orders: number; units: number; lines: number;
  processedOrders: number; processedFabricMeters: string; processedRailMeters: string; processedPanelWidthMeters: string;
  completedOrders: number; completedUnits: number; completedFabricMeters: string; completedRailMeters: string; completedPanelWidthMeters: string;
  unknownLines: number; unknownUnits: number; unknownByPopulation: { received: number; processed: number; completed: number };
  evidence: Record<string, number> | [];
};
export type SkuDetailPoint = { period: string; received: Bag; processed: Bag; completed: Bag };
export const SKU_STATUSES = ["all", "in_progress", "completed", "cancelled"] as const;
export type SkuStatus = (typeof SKU_STATUSES)[number];
export type SkuFilters = { category: string; code: string; variant: string; status: SkuStatus };
export type CeoSkus = ReportRange & {
  filters: { category: string | null; code: string | null; variant: string | null; status: SkuStatus; sku: string | null };
  items: SkuRow[]; total: number; truncated: boolean; categories: string[];
  detail?: { day: SkuDetailPoint[]; month: SkuDetailPoint[] };
  definitions: { categoryCatalog: boolean };
};

/** Fixed categorical slot per source (validated palette; color follows the source, never its rank). */
export const SOURCE_COLORS: Record<string, string> = { trendhome: "#2a78d6", outletperdele: "#eb6834", trendyol: "#1baf7a", b2b: "#eda100" };
export const SOURCE_ORDER = ["trendhome", "outletperdele", "trendyol", "b2b"] as const;

/** Arrays the PHP encoder sends for an empty map are read as empty objects. */
export function record<T>(value: Record<string, T> | [] | undefined | null): Record<string, T> {
  return value && !Array.isArray(value) ? value : {};
}

/** Sum of a meter field over rows, in millimetres. Malformed values make the sum unknown (null), never 0. */
export function sumMeters<T>(rows: T[], pick: (row: T) => string | null | undefined): number | null {
  let total = 0;
  for (const row of rows) {
    const units = meterUnits(pick(row));
    if (units === null) return null;
    total += units;
  }
  return total;
}

/** Does a breakdown add up to its totals (orders, units, fabric, rail, panel)? Used to prove a chart against its table. */
export function reconciles(total: Bag, rows: Bag[], fields: ("orders" | "units" | "fabricMeters" | "railMeters" | "panelWidthMeters")[] = ["units", "fabricMeters", "railMeters", "panelWidthMeters"]): boolean {
  return fields.every((field) => {
    if (field === "orders" || field === "units") return rows.reduce((sum, row) => sum + row[field], 0) === total[field];
    return sumMeters(rows, (row) => row[field]) === meterUnits(total[field]);
  });
}

/** The metric a SKU chart ranks by: priced fabric meters for web shops, panel width for Trendyol (each in its own unit). */
export type SkuMetric = "processed" | "completed" | "units" | "orders";
export function skuValue(row: SkuRow, metric: SkuMetric): number {
  if (metric === "units") return row.units;
  if (metric === "orders") return row.orders;
  const field = row.source === "trendyol" ? (metric === "processed" ? row.processedPanelWidthMeters : row.completedPanelWidthMeters) : (metric === "processed" ? row.processedFabricMeters : row.completedFabricMeters);
  return Math.max(0, meterUnits(field) ?? 0);
}

/**
 * The top N SKUs by a metric. Meter metrics never mix units: with no source filter, the meter ranking keeps web shop rows
 * (fabric) and Trendyol rows (panel width) in separate lists.
 */
export function topSkus(rows: SkuRow[], metric: SkuMetric, n: number, unit: "fabric" | "panel" | "any"): SkuRow[] {
  return rows
    .filter((row) => unit === "any" || (unit === "panel" ? row.source === "trendyol" : row.source !== "trendyol"))
    .filter((row) => skuValue(row, metric) > 0)
    .sort((a, b) => skuValue(b, metric) - skuValue(a, metric) || `${a.source}${a.productCode ?? ""}`.localeCompare(`${b.source}${b.productCode ?? ""}`))
    .slice(0, n);
}

/** Share of known lines (0-100) or null when there are no lines. */
export function knownShare(known: number, unknown: number): number | null {
  const total = known + unknown;
  return total > 0 ? Math.round((known / total) * 1000) / 10 : null;
}

/** The overview answered with the API 2.73.0 shape; an older API is reported as unavailable. */
export function isCeoOverview(value: unknown): value is CeoOverview {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return Boolean(raw.received && raw.worked && raw.completed && raw.current && raw.ledger && raw.generatedAt);
}

/** Seconds until the next automatic refresh: the server's suggestion, never faster than 2 minutes, never slower than 15. */
export function refreshSeconds(suggested: number | undefined): number {
  const value = Number.isFinite(suggested) ? Number(suggested) : 300;
  return Math.min(900, Math.max(120, Math.round(value)));
}
