import { ApiError, type DashboardApi } from "../api/client";
import { errorMessage } from "../api/labels";
import type { ManagementMe, Session } from "../api/types";

export type AppState =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string }
  | { kind: "anonymous"; notice?: string }
  | { kind: "password"; session: Session }
  | { kind: "no-access"; session: Session }
  | { kind: "ready"; session: Session; me: ManagementMe };

export const DASHBOARD_APPLICATION = "dashboard";

/**
 * Decides what the Dashboard may show for a central session. The API session is authoritative: a pending
 * password change blocks everything, and only an identity with Dashboard application access gets past the
 * gate. There is no frontend-only admin flag.
 */
export function classifySession(session: Session | null, notice?: string): Exclude<AppState, { kind: "ready" | "loading" | "unavailable" }> | { kind: "needs-profile"; session: Session } {
  if (!session) return { kind: "anonymous", notice };
  if (session.employee.mustChangePassword) return { kind: "password", session };
  if (!session.employee.applications.includes(DASHBOARD_APPLICATION)) return { kind: "no-access", session };
  return { kind: "needs-profile", session };
}

/** Turns a central session into the next screen, reading the management profile only when access exists. */
export async function resolveSession(api: DashboardApi, session: Session | null, notice?: string): Promise<AppState> {
  const decision = classifySession(session, notice);
  if (decision.kind !== "needs-profile") return decision;
  try {
    return { kind: "ready", session: decision.session, me: await api.me() };
  } catch (error) {
    // Access may be removed between the session read and the profile read.
    if (error instanceof ApiError && error.code === "APPLICATION_ACCESS_DENIED") return { kind: "no-access", session: decision.session };
    if (error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED") return { kind: "password", session: decision.session };
    throw error;
  }
}

/** Restores the session from the API cookie; transport or server failures become a retryable screen. */
export async function restoreSession(api: DashboardApi, notice?: string): Promise<AppState> {
  try {
    return await resolveSession(api, await api.getSession(), notice);
  } catch (error) {
    if (error instanceof ApiError && (error.code === "ACCOUNT_INACTIVE" || error.code === "SESSION_EXPIRED" || error.code === "NO_SESSION")) {
      return { kind: "anonymous", notice: errorMessage(error) };
    }
    return { kind: "unavailable", message: errorMessage(error) };
  }
}
