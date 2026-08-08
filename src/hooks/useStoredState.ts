import { useCallback, useState } from "react";

export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed = JSON.parse(raw);
      return typeof initial === "object" && initial !== null && !Array.isArray(initial)
        ? { ...initial, ...parsed }
        : parsed;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* private browsing */
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, update] as const;
}
