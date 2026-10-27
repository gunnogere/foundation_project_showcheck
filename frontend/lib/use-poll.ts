"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

// Fetches a path now and again every `ms` (the "real-time" updates). Pass ms=0 to fetch once.
export function usePoll<T>(path: string, ms = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = ms > 0 ? setInterval(load, ms) : undefined;
    return () => {
      alive.current = false;
      if (t) clearInterval(t);
    };
  }, [load, ms]);

  return { data, error, reload: load };
}
