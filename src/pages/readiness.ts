import type { EmployeeDetail, EmployeePage, EmployeeSummary } from "../api/types";

/**
 * Operational readiness of one identity, derived only from fields the API already returns (status,
 * applications, roles, stages, mustChangePassword, document scopes). It never looks at job titles or
 * departments: readiness is contextual to the applications the identity was actually granted, so a
 * Dashboard-only manager or a B2B finance user is not "missing" Staff stages.
 *
 * Verdicts, most blocking first:
 * - inactive: the account cannot sign in;
 * - no_application: active, but no application is granted;
 * - incomplete: a granted application cannot be used yet (Staff without a stage, Dashboard or B2B
 *   without a role, or stages without Staff access);
 * - password_pending: everything is configured, the first password change is still outstanding;
 * - ready: every granted application is usable.
 */
export type ReadinessVerdict = "inactive" | "no_application" | "incomplete" | "password_pending" | "ready";

export type ReadinessCheck =
  | { key: "active"; ok: boolean }
  | { key: "applications"; ok: boolean }
  | { key: "staff-stages"; ok: boolean; count: number }
  | { key: "stages-without-staff"; ok: false; count: number }
  | { key: "dashboard-roles" | "b2b-roles"; ok: boolean; count: number }
  | { key: "password"; ok: boolean; soft: true }
  | { key: "login"; ok: boolean; soft: true }
  | { key: "document-scopes"; ok: false; soft: true; capabilities: Array<"operate" | "approve"> };

export type Readiness = { verdict: ReadinessVerdict; checks: ReadinessCheck[]; ready: string[] };

const OPERATE_PERMISSIONS = ["production.documents.generate", "production.documents.reprint", "production.documents.request_revision"];
const APPROVE_PERMISSIONS = ["production.documents.approve_revision"];

/** Applications that do nothing useful without a role. Staff works through stages instead. */
const ROLE_APPLICATIONS = ["dashboard", "b2b"] as const;

export function readiness(employee: EmployeeSummary & Partial<Pick<EmployeeDetail, "rolePermissions" | "documentScopes">>): Readiness {
  const active = employee.status === "active";
  const applications = employee.applications;
  const staff = applications.includes("staff");
  const checks: ReadinessCheck[] = [{ key: "active", ok: active }, { key: "applications", ok: applications.length > 0 }];
  let complete = true;
  if (staff) {
    checks.push({ key: "staff-stages", ok: employee.stageIds.length > 0, count: employee.stageIds.length });
    complete &&= employee.stageIds.length > 0;
  } else if (employee.stageIds.length > 0) {
    checks.push({ key: "stages-without-staff", ok: false, count: employee.stageIds.length });
    complete = false;
  }
  for (const application of ROLE_APPLICATIONS) {
    if (!applications.includes(application)) continue;
    checks.push({ key: `${application}-roles`, ok: employee.roles.length > 0, count: employee.roles.length });
    complete &&= employee.roles.length > 0;
  }
  // Informational only: a document permission without a source reaches no order (API default deny).
  // It never blocks readiness, because holding a role does not prove a document responsibility.
  if (employee.rolePermissions && employee.documentScopes) {
    const missing: Array<"operate" | "approve"> = [];
    if (employee.rolePermissions.some((key) => OPERATE_PERMISSIONS.includes(key)) && employee.documentScopes.operate.length === 0) missing.push("operate");
    if (employee.rolePermissions.some((key) => APPROVE_PERMISSIONS.includes(key)) && employee.documentScopes.approve.length === 0) missing.push("approve");
    if (missing.length) checks.push({ key: "document-scopes", ok: false, soft: true, capabilities: missing });
  }
  checks.push({ key: "password", ok: !employee.mustChangePassword, soft: true });
  checks.push({ key: "login", ok: employee.lastLoginAt !== null, soft: true });
  const verdict: ReadinessVerdict = !active ? "inactive"
    : applications.length === 0 ? "no_application"
      : !complete ? "incomplete"
        : employee.mustChangePassword ? "password_pending" : "ready";
  return { verdict, checks, ready: verdict === "ready" || verdict === "password_pending" ? applications : [] };
}

/** Badge tone of a verdict. */
export function readinessTone(verdict: ReadinessVerdict): "success" | "warning" | "neutral" | "danger" {
  return verdict === "ready" ? "success" : verdict === "password_pending" ? "warning" : verdict === "incomplete" ? "danger" : "neutral";
}

/**
 * Every identity matching a filter, following the server's cursor (100 per page, at most `maxPages` pages).
 * The organisation is small, so this replaces a server-side aggregate; `truncated` says when it was not.
 */
export async function loadAllEmployees(api: { employees: (query: Record<string, string | undefined>) => Promise<EmployeePage> }, query: Record<string, string | undefined>, maxPages = 10): Promise<{ items: EmployeeSummary[]; truncated: boolean }> {
  const items: EmployeeSummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await api.employees({ ...query, limit: "100", cursor });
    items.push(...result.items);
    if (!result.nextCursor) return { items, truncated: false };
    cursor = result.nextCursor;
  }
  return { items, truncated: true };
}
