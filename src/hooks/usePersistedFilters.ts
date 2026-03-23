import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

const PREFIX = "filters";

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | Date;

interface FilterDefs {
  [key: string]: "string" | "set" | "date" | "sort";
}

/**
 * Persist page filters per user in localStorage.
 *
 * Usage:
 *   const f = usePersistedFilters("prestamos", {
 *     search: "string",
 *     selEstado: "set",
 *     regDesde: "date",
 *     sortKey: "string",
 *     sortDir: "string",
 *   });
 *   f.search / f.setSearch / f.selEstado (Set) / f.setSelEstado etc.
 *
 * Returns getter + setter for every key, plus clearAll().
 */
export function usePersistedFilters<K extends string>(
  pageKey: string,
  defs: Record<K, "string" | "set" | "date">
) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const storageKey = `${PREFIX}:${userId || "anon"}:${pageKey}`;

  // Load once from localStorage
  const saved = useRef<Record<string, any> | null>(null);
  if (saved.current === null) {
    try {
      const raw = localStorage.getItem(storageKey);
      saved.current = raw ? JSON.parse(raw) : {};
    } catch {
      saved.current = {};
    }
  }

  function initVal(key: K): any {
    const type = defs[key];
    const s = saved.current?.[key];
    if (type === "set") {
      return s && Array.isArray(s) ? new Set<string>(s) : new Set<string>();
    }
    if (type === "date") {
      return s ? new Date(s) : undefined;
    }
    // string
    return s ?? "";
  }

  // Create state for each key
  const states: Record<string, any> = {};
  const setters: Record<string, any> = {};
  const keys = Object.keys(defs) as K[];

  // We need to call useState for each key — this is fine because
  // the keys are static (same defs object every render).
  for (const key of keys) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [val, setVal] = useState(() => initVal(key));
    states[key] = val;
    setters[key] = setVal;
  }

  const persist = useCallback(
    (overrides: Record<string, any>) => {
      if (!userId) return;
      try {
        const current: Record<string, any> = {};
        for (const key of keys) {
          const v = key in overrides ? overrides[key] : states[key];
          const type = defs[key];
          if (type === "set") {
            const arr = Array.from(v instanceof Set ? v : new Set());
            if (arr.length > 0) current[key] = arr;
          } else if (type === "date") {
            if (v) current[key] = (v as Date).toISOString();
          } else {
            if (v) current[key] = v;
          }
        }
        if (Object.keys(current).length > 0) {
          localStorage.setItem(storageKey, JSON.stringify(current));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {}
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, storageKey, ...keys.map((k) => states[k])]
  );

  // Build result object with getters/setters
  const result: any = {};

  for (const key of keys) {
    result[key] = states[key];

    const capitalised = key.charAt(0).toUpperCase() + key.slice(1);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    result[`set${capitalised}`] = useCallback(
      (val: any) => {
        setters[key](val);
        // Persist after state update
        setTimeout(() => {
          const overrides: Record<string, any> = {};
          for (const k of keys) {
            overrides[k] = k === key ? val : states[k];
          }
          // Need to rebuild the persist inline since state hasn't updated yet
          if (!userId) return;
          try {
            const current: Record<string, any> = {};
            for (const k of keys) {
              const v = overrides[k];
              const type = defs[k];
              if (type === "set") {
                const arr = Array.from(v instanceof Set ? v : new Set());
                if (arr.length > 0) current[k] = arr;
              } else if (type === "date") {
                if (v) current[k] = (v as Date).toISOString();
              } else {
                if (v) current[k] = v;
              }
            }
            if (Object.keys(current).length > 0) {
              localStorage.setItem(storageKey, JSON.stringify(current));
            } else {
              localStorage.removeItem(storageKey);
            }
          } catch {}
        }, 0);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [userId, storageKey, ...keys.map((k) => states[k])]
    );
  }

  result.clearAll = useCallback(() => {
    for (const key of keys) {
      const type = defs[key];
      if (type === "set") setters[key](new Set<string>());
      else if (type === "date") setters[key](undefined);
      else setters[key]("");
    }
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return result;
}
