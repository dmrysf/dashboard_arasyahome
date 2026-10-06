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
};

export type ExceptionStatus = "awaiting_acknowledgment" | "awaiting_approval" | "approved" | "rejected" | "cancelled";

export type ExceptionDecision = {
  attempt: number; status: "pending" | "approved" | "rejected" | "cancelled"; openedReason: "acknowledged" | "rereview"; openedBy: string; openedComment: string | null;
  openedAt: string; decidedAt: string | null; decidedBy: string | null; decidedById: string | null; decidedVia: string | null; comment: string | null; waitSeconds: number | null;
};

/** A cutting fault return request as managers see it. Meters are exact decimal strings ("17.000"). */
export type ExceptionSummary = {
  id: string; number: string; type: "cutting_fault"; status: ExceptionStatus; version: number;
  order: { id: string; orderNumber: string; source: string; sourceName: string };
  reason: { key: string; label: string }; lineCount: number; faultMeters: string; arrivalNumber: number; reworkCycle: number | null; repeatedError: boolean;
  detector: { displayName: string }; responsible: { displayName: string };
  reportedAt: string; acknowledgedAt: string | null; resolvedAt: string | null; pendingSince: string | null; attempts: number;
  myDecisions?: { attempt: number; status: string; decidedAt: string; comment: string | null }[];
  decisions?: ExceptionDecision[];
};

export type ExceptionDetail = ExceptionSummary & {
  detectorComment: string | null; acknowledgmentComment: string | null; qrVerifiedAt: string | null; cancelReason: string | null;
  lines: { itemId: string; lineNumber: number; name: string; code: string | null; variant: string | null; color: string | null; quantity: number; meters: string }[];
  decisions: ExceptionDecision[];
  timeline: { action: string; actor: string; at: string; version: number; details: Record<string, unknown> | null }[];
  orderHistory: ExceptionSummary[];
  actions: { canDecide: boolean; canCancel: boolean; involved: boolean };
};

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
  id: string; responsibility: "tailoring_intake_responsible" | "operations_backup_approver"; employee: { id: string; displayName: string };
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

export type EmployeeDetail = EmployeeSummary & { rolePermissions: string[]; secondaryDepartments?: { id: number; name: string }[] };

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
export type ProductionActivityAction = "claimed" | "stage_completed" | "production_completed" | "owner_released" | "owner_reassigned" | "production_submitted";
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
};

/** GET /management/orders and /management/orders/{globalOrderId} (Operations API 2.6.0). */
export type ProductionState = "active" | "completed" | "cancelled";
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
    control: { canManageOwner: boolean; blockedReason: "production_completed" | "order_unavailable" | null };
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
