import { useCallback, useEffect, useRef, useState } from "react";
import { toProblem, type Problem } from "../i18n";
import { createPoller } from "./poller";

export const PRODUCTION_REFRESH_MS = 45_000;

type PollingState<T> = { key: string; data: T | null; error: Problem | null; updatedAt: number | null; refreshing: boolean };

/**
 * Keeps operational data fresh (see createPoller for the scheduling rules). A failed refresh keeps the last
 * good data on screen and only reports the error. `key` identifies the query (for example the source
 * filter); changing it aborts the request in flight and drops the previous data.
 */
export function usePolling<T>(load: (signal: AbortSignal) => Promise<T>, key: string, intervalMs = PRODUCTION_REFRESH_MS) {
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  const [state, setState] = useState<PollingState<T>>({ key, data: null, error: null, updatedAt: null, refreshing: true });
  const poller = useRef<ReturnType<typeof createPoller<T>> | null>(null);

  useEffect(() => {
    const instance = createPoller<T>((signal) => loadRef.current(signal), intervalMs, {
      onStart: () => setState((current) => (current.key === key ? { ...current, refreshing: true } : { key, data: null, error: null, updatedAt: null, refreshing: true })),
      onData: (data, at) => setState({ key, data, error: null, updatedAt: at, refreshing: false }),
      onError: (caught) => setState((current) => ({ ...(current.key === key ? current : { key, data: null, updatedAt: null }), error: toProblem(caught), refreshing: false })),
    });
    poller.current = instance;
    const onVisibility = () => instance.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibility);
    instance.refresh();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      instance.dispose();
      if (poller.current === instance) poller.current = null;
    };
  }, [key, intervalMs]);

  const refresh = useCallback(() => poller.current?.refresh(), []);
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    updatedAt: current ? state.updatedAt : null,
    refreshing: current ? state.refreshing : true,
    refresh,
  };
}
