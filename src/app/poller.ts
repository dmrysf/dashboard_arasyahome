export type PollerEnvironment = {
  now: () => number;
  visible: () => boolean;
  setTimer: (callback: () => void, milliseconds: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export const browserEnvironment: PollerEnvironment = {
  now: () => Date.now(),
  visible: () => typeof document === "undefined" || document.visibilityState === "visible",
  setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type PollerCallbacks<T> = {
  onStart: () => void;
  onData: (data: T, at: number) => void;
  onError: (error: unknown) => void;
};

/**
 * Refresh scheduler for operational data.
 *
 * - At most one request is in flight; `refresh()` during a request is ignored.
 * - The next automatic refresh is scheduled only after the previous request settled, so requests never overlap.
 * - Nothing is scheduled while the page is hidden; becoming visible refreshes at once if the data is older
 *   than the interval, otherwise it waits for the remainder.
 * - `dispose()` aborts the request in flight and drops any late result.
 */
export function createPoller<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs: number, callbacks: PollerCallbacks<T>, environment: PollerEnvironment = browserEnvironment) {
  let disposed = false;
  let inFlight: AbortController | null = null;
  let timer: unknown = null;
  let lastSettled = Number.NEGATIVE_INFINITY;

  const clear = () => { if (timer !== null) { environment.clearTimer(timer); timer = null; } };
  const schedule = (delay = intervalMs) => {
    clear();
    if (!disposed && environment.visible()) timer = environment.setTimer(() => { timer = null; refresh(); }, Math.max(0, delay));
  };

  function refresh() {
    if (disposed || inFlight) return;
    clear();
    const controller = new AbortController();
    inFlight = controller;
    callbacks.onStart();
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) callbacks.onData(data, environment.now()); },
      (error: unknown) => { if (!controller.signal.aborted) callbacks.onError(error); },
    ).finally(() => {
      if (inFlight === controller) inFlight = null;
      if (!controller.signal.aborted) { lastSettled = environment.now(); schedule(); }
    });
  }

  return {
    refresh,
    visibilityChanged() {
      if (disposed) return;
      if (!environment.visible()) { clear(); return; }
      if (inFlight) return;
      const age = environment.now() - lastSettled;
      if (age >= intervalMs) refresh(); else schedule(intervalMs - age);
    },
    dispose() {
      disposed = true;
      clear();
      inFlight?.abort();
      inFlight = null;
    },
    get busy() { return inFlight !== null; },
  };
}
