import { createContext, useContext } from "react";
import type { DashboardApi } from "../api/client";
import type { ManagementMe, Session } from "../api/types";

export type DashboardContextValue = {
  api: DashboardApi;
  session: Session;
  me: ManagementMe;
  navigate: (path: string) => void;
  can: (permission: string) => boolean;
  refreshMe: () => Promise<void>;
};

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("Dashboard context is missing.");
  return value;
}
