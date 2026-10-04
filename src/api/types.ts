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

export type EmployeeDetail = EmployeeSummary & { rolePermissions: string[] };

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
  counts: { activeEmployees: number; dashboardUsers: number; staffUsers: number; departments: number; roles: number };
  applications: Array<{ key: string; name: string; status: string }>;
  recentAudit: AuditEvent[] | null;
};

/** GET /management/production-overview. Definitions live with the API (docs/production-overview.md). */
export type SourceHealth = "healthy" | "stale" | "offline" | "no_contact" | "not_configured" | "disabled";
export type ProductionActivityAction = "claimed" | "stage_completed" | "production_completed";

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
  }> | null;
  sources: Array<{ key: string; name: string; type: string; health: SourceHealth; lastContactAt: string | null; lastEventAt: string | null; activeOrders: number }> | null;
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
