import { useCallback, useState } from "react";

export const PAGE_SIZE = 100;

/**
 * Página actual (base 0) que vuelve a 0 cuando cambia `resetKey` (filtros, búsqueda, empresa…),
 * sin efectos: la página guardada solo aplica mientras la clave sea la misma.
 */
export function usePaginacion(resetKey: string) {
  const [state, setState] = useState<{ key: string; page: number }>({ key: resetKey, page: 0 });
  const page = state.key === resetKey ? state.page : 0;
  const setPage = useCallback(
    (next: number | ((prev: number) => number)) =>
      setState((s) => {
        const prev = s.key === resetKey ? s.page : 0;
        const value = typeof next === "function" ? next(prev) : next;
        return { key: resetKey, page: Math.max(0, value) };
      }),
    [resetKey]
  );
  return [page, setPage] as const;
}

/** Rango [from, to] inclusivo para `.range()` de PostgREST. */
export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  return [page * size, page * size + size - 1];
}
