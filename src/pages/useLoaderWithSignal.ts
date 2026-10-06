import { useEffect, useState } from "react";
import { useLive } from "../app/liveContext";
import { toProblem, type Problem } from "../i18n";

/** Loads one resource and re-reads it on every live event; aborted requests never overwrite newer data. */
export function useLoaderWithSignal<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const { revision } = useLive();
  const [state, setState] = useState<{ key: string; data: T | null; error: Problem | null }>({ key, data: null, error: null });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ key, data, error: null }); },
      (caught: unknown) => { if (!controller.signal.aborted) setState((current) => ({ key, data: current.key === key ? current.data : null, error: toProblem(caught) })); },
    );
    return () => controller.abort();
  }, [load, key, revision, reload]);
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null, reload: () => setReload((value) => value + 1) };
}
