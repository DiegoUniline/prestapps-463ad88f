import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const PREFIX = "filters";

function getKey(userId: string | undefined, page: string, name: string) {
  return `${PREFIX}:${userId || "anon"}:${page}:${name}`;
}

/* ── Persisted string (search, sortKey, sortDir, tab) ───────────── */
export function usePersistedString(page: string, name: string, fallback = "") {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const key = getKey(uid, page, name);

  const [val, setValRaw] = useState<string>(() => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  });

  const setVal = useCallback((v: string) => {
    setValRaw(v);
    try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key); } catch {}
  }, [key]);

  return [val, setVal] as const;
}

/* ── Persisted Set<string> (selEstado, selCaja, selRuta, etc.) ──── */
export function usePersistedSet(page: string, name: string) {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const key = getKey(uid, page, name);

  const [val, setValRaw] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const setVal = useCallback((v: Set<string>) => {
    setValRaw(v);
    try {
      const arr = Array.from(v);
      arr.length > 0 ? localStorage.setItem(key, JSON.stringify(arr)) : localStorage.removeItem(key);
    } catch {}
  }, [key]);

  return [val, setVal] as const;
}

/* ── Persisted Date | undefined (regDesde, regHasta) ────────────── */
export function usePersistedDate(page: string, name: string) {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const key = getKey(uid, page, name);

  const [val, setValRaw] = useState<Date | undefined>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? new Date(raw) : undefined;
    } catch { return undefined; }
  });

  const setVal = useCallback((v: Date | undefined) => {
    setValRaw(v);
    try { v ? localStorage.setItem(key, v.toISOString()) : localStorage.removeItem(key); } catch {}
  }, [key]);

  return [val, setVal] as const;
}

/* ── Clear all filters for a page ───────────────────────────────── */
export function clearPersistedFilters(uid: string | undefined, page: string, names: string[]) {
  names.forEach((n) => {
    try { localStorage.removeItem(getKey(uid, page, n)); } catch {}
  });
}
