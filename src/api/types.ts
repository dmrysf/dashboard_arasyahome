export type SessionEmployee = {
  employeeUuid: string;
  displayName: string;
  username: string;
  department: string;
  positionTitle: string | null;
  permissions: string[];
  applications: string[];
  allowedStageIds: string[];
  isRoot: boolean;
  mustChangePassword: boolean;
  authorizationVersion: number;
};

export type Session = { employee: SessionEmployee; expiresAt: string };

export type ManagementMe = {
  employee: { id: string; username: string; displayName: string; positionTitle: string | null; department: string };
  isRoot: boolean;
  authorityRank: number | null;
  permissions: string[];
  grantablePermissions: string[];
  applications: string[];
  authorizationVersion: number;
  /** Server-computed navigation capabilities; every route still authorizes on its own. */
  capabilities?: Capabilities;
};

export type Capabilities = {
  approveExceptions: boolean;
  approvalViaBackup: boolean;
  lookupOrders: boolean;
  manageOrganization: boolean;
  manageProductionSettings: boolean;
  cancelExceptions: boolean;
  viewAnalytics?: boolean;
  manageAnalyticsPolicy?: boolean;
  /** Production document revisions: primary approver or the CEO's scoped temporary backup. */
  approveDocumentRevisions?: boolean;
  documentRevisionViaBackup?: boolean;
  viewDocumentHistory?: boolean;
  revokeDocuments?: boolean;
  /** API 2.35.0: production.cancellation.manage / production.cancellation.release (granted to no role by default). */
  manageCancellations?: boolean;
  releaseCancellations?: boolean;
  /** API 2.36.0: production.cancellation.sync (send a stop's cancellation to its sales channel; granted to no role by default). */
  syncCancellations?: boolean;
};

export type DocumentChange = { field: string; line: number | null; before: string | null; after: string | null };
export type RevisionRequestStatus = "pending" | "approved" | "rejected" | "superseded" | "generated" | "cancelled";
/** A production document revision request with its exact, money-free production diff. */
export type RevisionRequest = {
  id: string; status: RevisionRequestStatus; version: number;
  order: { id: string; number: string; source: string; stageId: string; stageLabel: string | null; ownerName: string | null; documentStatus: string; completed: boolean };
  baseRevision: { number: number; status: "active" | "superseded" | "revoked" }; targetRevision: number; productionStarted: boolean; stageAtRequest: string;
  requestedBy: string; requestedById: string; requestedAt: string; comment: string | null; changes: DocumentChange[]; changeCount?: number;
  decidedBy: string | null; decidedVia: string | null; decisionComment: string | null; decidedAt: string | null; resolvedAt: string | null; resolvedBy: string | null; resolutionNote: string | null;
  previousRequest: { id: string; status: RevisionRequestStatus; decisionComment: string | null; decidedAt: string | null } | null;
};
export type DocumentRevision = { id: string; number: number; status: "active" | "superseded" | "revoked"; qrHint: string; generatedAt: string; generatedBy: string; approvedBy: string | null; approvedAt: string | null;
  staleAt: string | null; supersededAt: string | null; revokedAt: string | null; revokedBy: string | null; revokeReason: string | null; prints: number; lastPrintedAt: string | null };
export type DocumentEvent = { seq: number; type: string; revisionNumber: number | null; requestId: string | null; actorName: string | null; occurredAt: string; details: Record<string, unknown> | null };
export type OrderDocuments = {
  order: { id: string; number: string; source: string; stageId: string; stageLabel: string | null; ownerName: string | null; completed: boolean; unavailable: boolean };
  status: "none" | "active" | "stale" | "revoked"; version: number; activeRevision: DocumentRevision | null; latestRevisionNumber: number | null;
  request: RevisionRequest | null; revisions: DocumentRevision[]; history?: DocumentEvent[]; nextHistoryCursor?: number | null;
};
export type DocumentLookupItem = { orderId: string; orderNumber: string; source: string; documentStatus: string; revisionNumber: number | null };

export type ExceptionStatus = "awaiting_acknowledgment" | "awaiting_approval" | "approved" | "rejected" | "cancelled"
  | "awaiting_supervisor_review" | "dismissed" | "in_supervisor_custody" | "return_rejected" | "restored" | "awaiting_restore_receipt";

export type ExceptionDecision = {
  attempt: number; status: "pending" | "approved" | "rejected" | "cancelled"; openedReason: "acknowledged" | "rereview"; openedBy: string; openedComment: string | null;
  openedAt: string; decidedAt: string | null; decidedBy: string | null; decidedById: string | null; decidedVia: string | null; comment: string | null; waitSeconds: number | null;
};

/**
 * A production exception as managers see it: the original cutting fault, or a tailoring defect verified by the
 * tailoring quality supervisor (managers decide only its final return to cutting). Meters are exact decimals of the
 * measured lines only: `faultMeters` is null when no line was measured and `unmeasuredLineCount` counts the lines
 * whose meters the source never sent (API 2.28). Unknown meters are never a measured zero.
 */
export type ExceptionSummary = {
  id: string; number: string; type: "cutting_fault" | "tailoring_defect"; status: ExceptionStatus; version: number;
  order: { id: string; orderNumber: string; source: string; sourceName: string };
  reason: { key: string; label: string }; lineCount: number; faultMeters: string | null; unmeasuredLineCount?: number; arrivalNumber: number; reworkCycle: number | null; repeatedError: boolean;
  detector: { displayName: string }; responsible: { displayName: string };
  reportedAt: string; acknowledgedAt: string | null; resolvedAt: string | null; pendingSince: string | null; attempts: number;
  detectedStage?: { id: string; label: string | null };
  confirmedReason?: { key: string; label: string; cuttingAttributable: boolean } | null;
  supervisor?: { displayName: string } | null; receiver?: { displayName: string } | null; physicalCustodian?: { displayName: string } | null;
  responsibilityPosition?: "accepted" | "disputed" | "not_stated" | null; attribution?: "cutter" | "none" | null;
  restoreRecipient?: { displayName: string } | null; restoreRequestedAt?: string | null; restoreReceivedAt?: string | null; cancelledByRoot?: boolean;
  myDecisions?: { attempt: number; status: string; decidedAt: string; comment: string | null }[];
  decisions?: ExceptionDecision[];
  /** What an approval moves (API 2.30.2+; the piece fields from API 2.31.0). */
  orderScope?: ExceptionScope;
};

export type ExceptionScope = {
  orderLineCount: number; orderQuantity: number; affectedLineCount: number; affectedQuantity: number; wholeOrderMoves: boolean;
  movingQuantity?: number; unaffectedQuantity?: number; partial?: boolean; piecesRecorded?: boolean; carrier?: "order" | "track"; trackId?: string | null;
};

export type AffectedPiece = { unitId: string; itemId: string; piece: string; index: number; count: number; lineNumber: number | null; name: string | null; code: string | null; color: string | null; reworkCycleAtReport: number };

export type ExceptionDetail = ExceptionSummary & {
  detectorComment: string | null; acknowledgmentComment: string | null; qrVerifiedAt: string | null; cancelReason: string | null;
  lines: { itemId: string; lineNumber: number; name: string; code: string | null; variant: string | null; color: string | null; quantity: number; meters: string | null; affectedQuantity?: number }[];
  /** The exact pieces the report named (API 2.31.0); absent for line reports. */
  affectedPieces?: AffectedPiece[];
  decisions: ExceptionDecision[];
  timeline: { action: string; actor: string; at: string; version: number; details: Record<string, unknown> | null }[];
  orderHistory: ExceptionSummary[];
  /** cancelNeedsRecipient: the product left the reporting worker, so root cancel is a recovery that names who receives it back. */
  actions: { canDecide: boolean; canCancel: boolean; involved: boolean; requiresAttribution?: boolean; canAttributeToCutter?: boolean; cancelNeedsRecipient?: boolean };
};

export type RestoreRecipient = { id: string; displayName: string; original: boolean };

export type LookupMatch = { id: string; orderNumber: string; source: string; sourceName: string; stage: { id: string; label: string }; completed: boolean; unavailable: boolean; blockedByException: boolean };

export type LookupDetail = {
  order: {
    id: string; orderNumber: string; source: string; sourceName: string; stage: { id: string; label: string; ordinal: number }; completed: boolean; unavailable: boolean;
    productionVersion: number; owner: { displayName: string; department: string | null; since: string | null } | null; openExceptionId: string | null;
    arrivalNumber: number; reworkCycles: number; repeatedErrors: boolean;
    items: { id: string; lineNumber: number; name: string; code: string | null; variant: string | null; color: string | null; meters: string | null; quantity: number }[];
  };
  exceptions: ExceptionSummary[];
};

export type WorkingDay = { weekday: number; isOpen: boolean; opensAt: string | null; closesAt: string | null };

export type Responsibility = {
  id: string; responsibility: "tailoring_intake_responsible" | "operations_backup_approver" | "document_revision_backup_approver" | "tailoring_quality_supervisor"; employee: { id: string; displayName: string };
  startsAt: string; endsAt: string | null; note: string | null; createdAt: string; createdBy: string; revokedAt: string | null; revokedBy: string | null; revokeReason: string | null;
  state: "active" | "scheduled" | "ended" | "revoked";
};

export type Organization = {
  ceo: { id: string; displayName: string; positionTitle: string | null; since: string } | null;
  canDesignateCeo: boolean; timezone: string; workingHours: WorkingDay[]; responsibilities: Responsibility[];
};

export type FaultReason = { key: string; label: string; requiresComment: boolean; status: "active" | "inactive"; sortOrder: number };

export type ProductionSettings = {
  policy: { approvalMode: string; availableModes: string[] };
  reasons: FaultReason[];
  stages: { id: string; ordinal: number; label: string }[];
};

export type RoleRef = { id: number; key: string; name: string; authorityRank: number; status: string };

export type EmployeeSummary = {
  id: string;
  username: string;
  displayName: string;
  positionTitle: string | null;
  status: "active" | "inactive" | "suspended";
  isRoot: boolean;
  department: { id: number; name: string };
  manager: { id: string; displayName: string } | null;
  applications: string[];
  roles: RoleRef[];
  stageIds: string[];
  mustChangePassword: boolean;
  authorizationVersion: number;
  lastLoginAt: string | null;
  createdAt: string;
  manageable: boolean;
};

/** Order sources a document permission reaches (API 2.22+). Root reaches every source and has none stored. */
export type DocumentScopes = { operate: string[]; approve: string[] };
export type EmployeeDetail = EmployeeSummary & {
  rolePermissions: string[];
  secondaryDepartments?: { id: number; name: string }[];
  /** Absent on an API older than 2.22; null for root. */
  documentScopes?: DocumentScopes | null;
  /** Active sources the root-only scope editor offers; null for every other viewer and for root itself. */
  documentScopeSources?: Array<{ key: string; name: string }> | null;
};

export type EmployeePage = { items: EmployeeSummary[]; nextCursor: string | null; total: number };

export type Role = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  authorityRank: number;
  isTemplate: boolean;
  status: "active" | "inactive";
  userCount: number;
  permissionCount: number;
  permissions: string[];
  manageable: boolean;
};

export type Permission = { key: string; category: string; label: string; description: string; roleGrantable: boolean; grantableByMe: boolean };

export type Department = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  parentId: number | null;
  employeeCount: number;
  activeEmployeeCount: number;
};

export type Application = { key: string; name: string; description: string | null; status: string; accessPermission: string; userCount: number };

export type AuditEvent = {
  id: string;
  actorId: string | null;
  actorLabel: string;
  actorType: "employee" | "root" | "cli";
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditPage = { items: AuditEvent[]; nextCursor: string | null };

export type Overview = {
  /** Null for identities without employees.view: company-wide counts are organisation analytics. */
  counts: null | { activeEmployees: number; dashboardUsers: number; staffUsers: number; departments: number; roles: number };
  applications: Array<{ key: string; name: string; status: string }>;
  recentAudit: AuditEvent[] | null;
};

/** GET /management/production-overview. Definitions live with the API (docs/production-overview.md). */
export type SourceHealth = "healthy" | "stale" | "offline" | "no_contact" | "not_configured" | "disabled";
export type ProductionActivityAction = "claimed" | "stage_completed" | "production_completed" | "owner_released" | "owner_reassigned" | "production_submitted" | "authority_taken_over" | "authority_released";
/** Owner interventions record whose ownership ended and who received it; Staff actions carry null. */
export type OwnerRef = { id: string; displayName: string };

export type ProductionOverview = {
  generatedAt: string;
  timezone: string;
  filters: { source: string | null };
  summary: { active: number; waiting: number; inWork: number; unassigned: number; completedToday: number };
  stages: Array<{ id: string; label: string; ordinal: number; active: number; unassigned: number; oldestEnteredAt: string | null }>;
  oldestOrders: Array<{
    globalOrderId: string;
    orderNumber: string;
    source: { key: string; name: string };
    stage: { id: string; label: string };
    stageEnteredAt: string;
    owner: { id: string; displayName: string } | null;
    claimedAt: string | null;
    commerceStatus: { code: string; label: string | null } | null;
  }> | null;
  activity: Array<{
    id: string;
    action: string;
    occurredAt: string;
    employee: { id: string; displayName: string };
    order: { globalOrderId: string; orderNumber: string; source: string };
    fromStage: { id: string; label: string };
    toStage: { id: string; label: string } | null;
    previousOwner?: OwnerRef | null;
    newOwner?: OwnerRef | null;
  }> | null;
  sources: Array<{ key: string; name: string; type: string; health: SourceHealth; lastContactAt: string | null; lastEventAt: string | null; activeOrders: number }> | null;
  /** API 2.34.0: genuine server-defined blockers and who must act. Absent on older APIs, null without orders.view_all. */
  blockers?: {
    counts: Record<BlockerAction, number>;
    items: Array<{ globalOrderId: string; orderNumber: string; source: { key: string; name: string }; stage: { id: string; label: string }; reason: string; action: BlockerAction; exception: { number: string; status: string } | null; since: string }>;
    more: boolean;
  } | null;
  /** API 2.34.0: informational PERDEA auxiliary-work status at stages 6/7. Never a blocker. */
  perdeaInformation?: {
    informational: true;
    counts: { performed: number; notPerformed: number; unmarked: number };
    items: Array<{ orderId: string; orderNumber: string; unitId: string; lineNumber: number | null; name: string | null; code: string | null; piece: number; reworkCycle: number; stageId: string; status: "performed" | "not_performed" | "unmarked"; markedBy: string | null; markedAt: string | null }>;
  } | null;
  /** API 2.35.0: stopped orders and recent releases. Absent on older APIs, null without orders.view_all. */
  cancellations?: OverviewCancellations | null;
};
export type BlockerAction = "manager_decision" | "physical_receipt" | "supervisor_review" | "employee_work" | "plan_review";
export type OverviewCancellations = {
  counts: Record<CancellationCategory, number>;
  stopped: number;
  physicalPending: number;
  nextActions: Record<Exclude<CancellationNextAction, "none">, number>;
  items: Array<{ globalOrderId: string; orderNumber: string; source: { key: string; name: string }; stage: { id: string; label: string }; category: CancellationCategory; nextAction: CancellationNextAction;
    origin: "source" | "local"; reason: string; physical: PhysicalStatus; physicalOutcome: PhysicalOutcome | null; productionCompleted: boolean; heldAt: string; releasedAt: string | null }>;
  more: boolean;
  releasedWindowDays: number;
};

/** GET /management/orders and /management/orders/{globalOrderId} (Operations API 2.6.0). */
export type ProductionState = "active" | "completed" | "cancelled" | "stopped";

/** API 2.35.0 cancellation control: one category per order, so nothing is counted twice. */
export type CancellationCategory = "completed_then_cancelled" | "source_cancelled" | "pending_source_confirmation" | "reactivated_awaiting_release" | "stopped" | "released";
export type CancellationNextAction = "physical_reconciliation" | "source_confirmation" | "release_decision" | "none";
export type PhysicalStatus = "not_required" | "pending" | "verified";
export type PhysicalOutcome = "secured" | "nothing_produced" | "left_factory";
export type OrderStopSummary = { state: "stopped" | "released"; category: CancellationCategory; nextAction: CancellationNextAction; physical: PhysicalStatus; version: number; heldAt: string; releasedAt: string | null };
export type CancellationControlView = {
  state: "stopped" | "released";
  category: CancellationCategory;
  nextAction: CancellationNextAction;
  origin: "source" | "local";
  reason: "source_cancelled" | "marketplace_cancelled" | "manager_stop" | "legacy_source_cancellation";
  reasonNote: string | null;
  source: { status: "cancelled" | "reactivated" | "not_reported"; statusCode: string | null; statusLabel: string | null; changedAt: string | null; cancellationReceivedAt: string | null; evidenceAt: string | null;
    request: "not_requested" | "pending" | "confirmed" | "withdrawn"; requestedAt: string | null;
    /** "not_sent" without an outbound operation (always before API 2.36.0), otherwise the operation state. */
    outbound: "not_sent" | SyncState };
  atStop: { phase: "not_started" | "in_progress" | "completed"; stageId: string; owner: OwnerRef | null; exceptionId: string | null; productionVersion: number; completedAt: string | null; cuttingStartedAt: string | null;
    tracks: Array<{ trackId: string; number: number; stageId: string; ownerId: string | null; exceptionId: string | null }> };
  physical: { status: PhysicalStatus; outcome: PhysicalOutcome | null; note: string | null; scan: "order_qr" | "unit_label" | null; verifiedBy: OwnerRef | null; verifiedAt: string | null };
  heldAt: string;
  heldBy: OwnerRef | null;
  releasedAt: string | null;
  releasedBy: OwnerRef | null;
  releaseReason: string | null;
  release: { possible: boolean; refusal: string | null };
  version: number;
  /** API 2.36.0: the outbound cancellation of the current stop; absent before it. */
  sync?: CancellationSyncView;
};
/** API 2.36.0 outbound cancellation synchronization (one operation per stop generation). */
export type SyncState = "queued" | "processing" | "awaiting_pickup" | "awaiting_confirmation" | "retry_scheduled" | "uncertain" | "confirmed" | "rejected" | "failed" | "manual_review" | "withdrawn" | "closed";
export type SyncMechanism = "api" | "source_pull" | "manual";
export type SyncAttempt = {
  sequence: number; kind: string; from: SyncState; to: SyncState; outcome: string; httpStatus: number | null; error: string | null; providerStatus: string | null;
  actor: { id: string; displayName: string } | { system: string } | null; occurredAt: string;
};
export type SyncOperationView = {
  id: string; state: SyncState; staffState: "awaiting_confirmation" | "attention" | "confirmed" | null; mechanism: SyncMechanism; generation: number; reasonCode: string | null;
  attempts: number; nextAttemptAt: string | null; dispatchedAt: string | null; lastPulledAt: string | null; providerResult: string | null; providerStatus: string | null;
  confirmedAt: string | null; confirmedBy: "inbound_event" | "status_read" | null; lastError: string | null; lastErrorAt: string | null; createdAt: string; version: number; history: SyncAttempt[];
};
export type SyncProviderView = {
  source: string; mechanism: SyncMechanism; serverEnabled: boolean; flagEnabled: boolean; active: boolean; configured: boolean;
  inbound: string; outbound: string; confirmation: string; retry: string; reconciliation: string; unsupported: string[];
  endpoint?: string; reasons?: Record<string, string>; reason?: string;
};
export type CancellationSyncView = {
  provider: SyncProviderView; operation: SyncOperationView | null; openOperationId: string | null; required: boolean;
  actions: { send: boolean; retry: boolean; withdraw: boolean; close: boolean };
};
export type SyncDiscrepancy = {
  id?: string; kind: string; severity: "high" | "medium" | "low"; orderId: string | null; orderNumber: string | null; operationId: string | null; source: string;
  remediation: string; retryEligible: boolean; beforeBaseline?: boolean; state?: "open" | "resolved"; details: Record<string, unknown>; detectedAt?: string; lastSeenAt?: string; resolvedAt?: string | null;
};
/** GET /management/cancellation-sync (orders.view_all). */
export type CancellationSyncOverview = {
  ready: boolean; providers: SyncProviderView[]; operations: Record<string, Partial<Record<SyncState, number>>>; discrepancies: SyncDiscrepancy[]; capabilities: { sync: boolean };
};
/** POST /management/cancellation-sync/reconcile: a dry run, nothing is changed or recorded. */
export type CancellationSyncDryRun = { dryRun: true; checkedAt: string; counts: Record<string, number>; findings: SyncDiscrepancy[] };
export type CancellationEvent = { id: string; sequence: number; type: string; controlVersion: number | null; actor: OwnerRef | null; sourceEventRef: string | null; stageId: string; productionVersion: number; details: Record<string, unknown> | null; occurredAt: string };
/** GET /management/orders/{id}/cancellation and the result of every cancellation command. */
export type OrderCancellation = {
  orderId: string; orderNumber: string; source: string; stage: { id: string }; productionVersion: number; productionCompleted: boolean; sourceAvailability: "active" | "cancelled";
  cancellation: CancellationControlView | null; events: CancellationEvent[]; eventsTruncated: boolean;
  capabilities: { stop: boolean; recordPhysical: boolean; release: boolean; sync?: boolean };
};
/** Neutral, objective attention for active production. There is no SLA, so time never produces attention. */
export type OrderAttention = "unassigned" | "owner_inactive" | "owner_no_staff_access" | "owner_stage_not_allowed";
export type OrderSummary = {
  globalOrderId: string;
  orderNumber: string;
  source: { key: string; name: string };
  /** Commerce: the source's own state, received inbound only. */
  commerce: { status: { code: string; label: string | null } | null; availability: "active" | "cancelled" };
  /** Production: the Arasya curtain-production@1 state. Independent of commerce. */
  production: {
    state: ProductionState;
    stage: { id: string; label: string; ordinal: number };
    owner: { id: string; displayName: string } | null;
    claimedAt: string | null;
    stageEnteredAt: string;
    completedAt: string | null;
    attention: OrderAttention | null;
    /** API 2.35.0: the cancellation control of the order; null or absent when it never had one. */
    stop?: OrderStopSummary | null;
  };
  importedAt: string;
  acceptedAt: string | null;
};
export type OrderFacets = {
  sources: Array<{ key: string; name: string }>;
  stages: Array<{ id: string; label: string; ordinal: number }>;
  commerceStatuses: Array<{ code: string; label: string | null }>;
  owners: Array<{ id: string; displayName: string }>;
};
export type OrderPage = { items: OrderSummary[]; nextCursor: string | null; facets: OrderFacets; counts: { unassignedActive: number; ownerAttention: number } };
export type OrderItem = { line: number; name: string; sku: string | null; variant: string | null; color: string | null; width: number | null; height: number | null; unit: string | null; meters: number | null; quantity: number };
export type OrderActivity = {
  id: string;
  action: string;
  occurredAt: string;
  employee: { id: string; displayName: string };
  fromStage: { id: string; label: string };
  toStage: { id: string; label: string } | null;
  previousOwner: OwnerRef | null;
  newOwner: OwnerRef | null;
  productionVersion: number;
};
export type OrderDetail = Omit<OrderSummary, "commerce" | "production"> & {
  commerce: OrderSummary["commerce"] & { sourceChangedAt: string; lastSourceSeenAt: string };
  production: OrderSummary["production"] & {
    changedAt: string | null;
    version: number;
    notes: string | null;
    /** Whether the viewer holds production.manage_owner, and why this order cannot take an owner intervention. */
    control: { canManageOwner: boolean; blockedReason: "production_completed" | "order_unavailable" | "production_stopped" | "exception_pending" | "document_revision_pending" | null };
  };
  items: OrderItem[];
  activity: OrderActivity[] | null;
  activityTruncated: boolean;
};

/** GET /management/orders/{id}/eligible-owners: Staff employees allowed on the current stage, within the viewer's authority. */
export type EligibleOwners = {
  stage: { id: string; label: string };
  productionVersion: number;
  blockedReason: "production_completed" | "order_unavailable" | null;
  items: Array<{ id: string; displayName: string; department: string; positionTitle: string | null; stage: { id: string; label: string } }>;
};
/** Result of POST …/release-owner and PUT …/owner. The stage is reported unchanged by design. */
export type OwnerChange = {
  globalOrderId: string;
  action: "owner_released" | "owner_reassigned";
  production: { version: number; stage: { id: string; label: string }; owner: OwnerRef | null; previousOwner: OwnerRef | null };
};

export type SystemStatus = {
  apiVersion: string;
  database: string;
  migrations: { applied: number; latest: string | null };
  applications: number;
  rootConfigured: boolean;
};

export type WorkflowStage = { id: string; ordinal: number; label: string };
export type Workflow = { workflow: { id: string; name: string; version: number }; stages: WorkflowStage[] };
