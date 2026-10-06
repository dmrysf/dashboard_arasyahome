import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DashboardApi } from "../api/client";
import { startLive, type LiveEvent } from "./live";

export type LiveState = { revision: number; last: LiveEvent | null; connection: "connected" | "reconnecting" };
const LiveContext = createContext<LiveState>({ revision: 0, last: null, connection: "connected" });

/** One live subscription per signed-in Dashboard identity; pages re-read on every revision. */
export function LiveProvider({ api, enabled, children }: { api: DashboardApi; enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<LiveState>({ revision: 0, last: null, connection: "connected" });
  useEffect(() => {
    if (!enabled) return undefined;
    return startLive({
      fetchBatch: (after, signal) => api.liveEvents(after, signal),
      onEvent: (event) => setState((current) => ({ ...current, revision: current.revision + 1, last: event })),
      onState: (connection) => setState((current) => ({ ...current, connection, revision: connection === "connected" ? current.revision + 1 : current.revision })),
    });
  }, [api, enabled]);
  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
