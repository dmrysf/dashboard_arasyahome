export type ClockKind = "wallSeconds" | "businessSeconds";
export type Duration = Record<ClockKind, number | null>;
export type Distribution = { sampleCount: number; mean: number | null; median: number | null; p25: number | null; p75: number | null; p90: number | null; p95: number | null; totalSeconds?: number };
export type AnalyticsMeta = { range: { fromUtc: string; toUtcExclusive: string; timezone: string }; asOf: string; formulaVersion: number; approvalGraceMinutes: number; coverage?: { totalOrders: number; projectedOrders: number; rebuildRequired: boolean } };
export type AnalyticsPolicy = { approvalGraceMinutes: number; version: number; canEdit: boolean; timezone: string; days: { weekday: number; is_open: number; opens_at: string | null; closes_at: string | null }[] };
export type Trend = { completedOrders: number; meters: string; wallSeconds: number; businessSeconds: number; faultCycles: number; detectedCycles: number; faultMeters: string; detectedMeters: string };
export type Rate = { numerator: string | number; denominator: string | number | null; percent: string | number | null };
export type EmployeeAnalytics = {
  id: string; name: string; positionTitle: string | null; status: string; department: { id: number; key: string; name: string };
  completedOrders: number; completedLines: number; completedMeters: string; averageMetersPerOrder: string | null; missingMeterSamples: number; missingLineSamples: number;
  faultOrders: number; faultLines: number; faultMeters: string; detectedOrders: number; detectedLines: number; detectedMeters: string; reworkCycles: number; repeatedCycles: number;
  initiatedTransfers: number; outgoingTransfers: number; incomingTransfers: number; activeHandling: Duration; completedHandling: Record<ClockKind, Distribution>;
  cuttingActiveHandling: Duration; stageHandling: Record<string, Duration>; repeatedOrders: number; repeatedMeters: string; onlineSubmissions: number;
  faultMeterRate: Rate; faultOrderRate: Rate; faultLineRate: Rate; stageCompletions: Record<string, number>; daily: Record<string, Trend> | []; weekly: Record<string, Trend> | [];
};
export type Interval = { employeeId: string; stageId: string; start: string; end: string | null; duration: Duration; orderId?: string; orderNumber?: string };
export type Lifecycle = { isComplete: boolean; closedByCancellation: boolean; measuredUntil: string; qrToCompletion: Duration | null; claimToCompletion: Duration | null; elapsedFromQr: Duration | null; firstClaimDelay: Duration | null; cuttingWaiting: Duration | null; cuttingActive: Duration | null; activeHandling: Duration; completedCuttingHandling: Duration | null; managerWaiting: Duration; transferWaiting: Duration; exceptionBlocked: Duration; blockedUnion: Duration; nonWorker: Duration | null; intervals?: Interval[] };
export type AnalyticsOrder = { id: string; globalOrderId: string; number: string; source: string; companyId: string | null; stageId: string | null; operationalStatus: string; qrCreatedAt: string | null; firstClaimAt: string | null; completedAt: string | null; cuttingMeters: string | null; cuttingLines: number | null; createdAt: string; orderMeters: string | null; orderLines: number | null; lifecycle: Lifecycle };
export type OrderPage = { items: AnalyticsOrder[]; total: number; nextCursor: string | null };
export type EmployeeReport = AnalyticsMeta & { items: EmployeeAnalytics[]; total: number; nextCursor: string | null };
export type EmployeeDetailReport = AnalyticsMeta & { employee: EmployeeAnalytics; orders: OrderPage; longestIntervals: Interval[] };
export type DepartmentReport = AnalyticsMeta & { items: { department: EmployeeAnalytics["department"]; metricSet: string; employees: number; completedOrders: number; completedLines: number; completedMeters: string; faultLines: number; faultMeters: string; detectedLines: number; detectedMeters: string; activeHandling: Duration; stageCompletions: Record<string, number>; reworkCycles: number; repeatedCycles: number; onlineSubmissions: number; managerWaitingForRelatedOrders: Duration }[] };
export type ManagerReport = AnalyticsMeta & {
  items: { id: string; name: string | null; received: number | null; knownEligibleReceived: number; approved: number; rejected: number; decisions: number; backupDecisions: number; rereviewsAfterRejection: number; pendingEligible: number; pendingElapsed: Duration; byType: Record<"exception" | "transfer", { approved: number; rejected: number }>; wallResponse: Distribution; businessResponse: Distribution }[];
  requests: { id: string; type: "exception" | "transfer"; orderId: string; status: string; attempt: number; previousDecisionId: string | null; openedAt: string; decidedAt: string | null; decidedBy: string | null; via: string | null; response: Duration; isPending: boolean; eligibilityCaptured: boolean }[];
  historicalRequestsWithoutEligibility: number; requestTotal: number; nextRequestCursor: string | null;
};
export type GroupAnalytics = { id: string; name: string | null; orders: number; completedOrders: number; meters: string; knownLineCount: number; missingLineSamples: number; missingMeterSamples: number; qrToCompletion: Record<ClockKind, Distribution>; claimToCompletion: Record<ClockKind, Distribution>; firstClaimDelay: Record<ClockKind, Distribution>; cuttingWaiting: Record<ClockKind, Distribution>; cuttingActive: Record<ClockKind, Distribution>; managerWaiting: Record<ClockKind, Distribution>; exceptionBlocked: Record<ClockKind, Distribution>; cancelledBeforeWork: number; cancelledAfterWork: number; customerType: string | null };
export type GroupReport = AnalyticsMeta & { items: GroupAnalytics[]; total: number; nextGroupCursor: string | null };
export type CompanyReport = AnalyticsMeta & { company: Partial<GroupAnalytics> & { id: string; name: string | null; orders: number }; orders: OrderPage };
export type OrderDetailReport = AnalyticsMeta & {
  order: Omit<AnalyticsOrder, "lifecycle" | "cuttingMeters" | "cuttingLines" | "createdAt" | "orderMeters" | "orderLines"> & { sourceImportedAt: string; sourceChangedAt: string; documentCreatedAt: null; companyName: string | null; cancelledAt: string | null; cancellationPhase: "after_work" | "before_work" | null };
  lifecycle: Lifecycle; timeline: { event_id: string; employee_uuid: string; employee_name?: string; action: string; from_stage_label_snapshot: string; to_stage_label_snapshot: string | null; production_version_after: number; meters_snapshot: string | null; occurred_at: string }[];
  nextVersion: number | null; transfers: { transfer_uuid: string; status: string; requested_at: string; decided_at: string | null; resolved_at: string | null; decided_via: string | null }[];
  poolFacts: { fact_uuid: string; fact_type: "pool_entered" | "first_claim" | "source_cancelled"; production_version: number; occurred_at: string }[];
  exceptions: { exception_uuid: string; status: string; reported_at: string; acknowledged_at: string | null; resolved_at: string | null; line_count: number; fault_meters: string; rework_cycle: number | null }[];
  decisions: { decision_uuid: string; previous_decision_uuid: string | null; attempt_number: number; opened_at: string; status: string; decided_at: string | null; decided_via: string | null }[];
  comparableLines: { line_number: number; meters: string | null; quantity: number }[]; moreComparableLines: boolean;
};
