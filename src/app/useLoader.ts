import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../api/labels";

/** Loads server data for a page; the server stays the only source of truth. */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>("");
  const [version, setVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableLoad = useCallback(load, deps);
  useEffect(() => {
    let active = true;
    setError("");
    stableLoad().then((value) => { if (active) setData(value); }, (caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [stableLoad, version]);
  return { data, error, reload: () => setVersion((value) => value + 1), setData };
}
