"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";

export interface LiveQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
}

interface Entry<T> {
  /** Which dependency set produced this result. */
  key: string;
  data: T | undefined;
  error: Error | null;
}

/**
 * Subscribes a component to a Dexie query so it re-renders whenever the
 * underlying tables change.
 *
 * This is `dexie-react-hooks` in miniature — the package is one more dependency
 * for one hook, and we need the loading flag it does not expose.
 *
 * `deps` behaves like a `useEffect` dependency list: the query re-subscribes
 * when they change. Loading is *derived* by comparing the stored entry's key
 * against the current one, so no state is set during render or synchronously
 * inside the effect.
 */
export function useLiveQuery<T>(querier: () => T | Promise<T>, deps: unknown[] = []): LiveQueryResult<T> {
  const key = JSON.stringify(deps);
  const [entry, setEntry] = useState<Entry<T> | null>(null);

  useEffect(() => {
    let active = true;

    const subscription = liveQuery(querier).subscribe({
      next: (data) => {
        if (active) setEntry({ key, data, error: null });
      },
      error: (error: unknown) => {
        if (!active) return;
        setEntry({
          key,
          data: undefined,
          error: error instanceof Error ? error : new Error("The local library could not be read."),
        });
      },
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // The querier is recreated every render, so the serialised deps drive the
    // subscription instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A result from a previous dependency set still counts as loading.
  if (entry?.key !== key) return { data: undefined, isLoading: true, error: null };
  return { data: entry.data, isLoading: false, error: entry.error };
}
