import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/labels";

type LoaderState<T> = { key: string; request: string; data: T | null; error: string; revision: number };

/**
 * Loads server data for a page; the server stays the only source of truth.
 *
 * `key` identifies what is loaded (for example the query string): when it changes the previous data is
 * dropped, while `reload()` keeps showing the current data until the fresh copy arrives. `revision` grows
 * on every accepted server copy so dependent forms can re-initialise from it.
 */
export function useLoader<T>(load: () => Promise<T>, key = "") {
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<LoaderState<T>>({ key: "", request: "", data: null, error: "", revision: 0 });
  const request = `${key}\u0000${version}`;

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (data) => { if (active) setState((current) => ({ key, request, data, error: "", revision: current.revision + 1 })); },
      (caught: unknown) => {
        if (active) setState((current) => ({ key, request, data: current.key === key ? current.data : null, error: errorMessage(caught), revision: current.revision }));
      },
    );
    return () => { active = false; };
  }, [key, request]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback((data: T) => setState((current) => ({ ...current, data, error: "", revision: current.revision + 1 })), []);
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: state.request === request ? state.error : "",
    revision: state.revision,
    reload,
    setData,
  };
}
