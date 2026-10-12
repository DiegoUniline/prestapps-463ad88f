import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Fetches ALL rows from a Supabase query by paginating in chunks of `pageSize`.
 * Supabase has a default limit of 1000 rows — this function loops until all rows are retrieved.
 * Pass a query builder (before calling .then or awaiting) — the function will add .range() automatically.
 *
 * Offset pagination is only correct with a total, stable order: without it Postgres may return
 * overlapping/missing rows between pages. If the builder is not already ordered by `tiebreaker`
 * (default "id"), it is appended as the LAST order column, so the caller's order is preserved.
 * Pass `{ tiebreaker: null }` only for builders whose result has no unique column.
 */
export async function fetchAllRows<T = any>(
  queryBuilder: any,
  pageSize = 1000,
  opts: { tiebreaker?: string | null } = {}
): Promise<T[]> {
  const tiebreaker = opts.tiebreaker === undefined ? "id" : opts.tiebreaker;
  if (tiebreaker && typeof queryBuilder?.order === "function") {
    const current: string = queryBuilder.url?.searchParams?.get("order") || "";
    const ordered = current.split(",").some((part) => part.split(".")[0] === tiebreaker);
    if (!ordered) queryBuilder = queryBuilder.order(tiebreaker, { ascending: true });
  }

  const all: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  return all;
}

/**
 * Calls a Postgres RPC that is not (yet) in the generated Database types.
 */
export function rpc<T = any>(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> {
  return (supabase as any).rpc(fn, args);
}

/**
 * Splits `items` into chunks and runs `fn` per chunk with limited concurrency,
 * concatenating results in input order. Use it to keep `.in()` lists / RPC arrays bounded.
 */
export async function mapChunks<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<R[]>,
  concurrency = 4
): Promise<R[]> {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  const results: R[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const idx = next++;
      results[idx] = await fn(chunks[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return results.flat();
}

/**
 * Typed wrapper for Supabase queries with centralized error handling.
 * Logs technical errors in dev, shows generic toast to user.
 */
export async function supabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: { message: string } | null }>
): Promise<QueryResult<T>> {
  try {
    const { data, error } = await queryFn();
    if (error) {
      if (import.meta.env.DEV) {
        console.error("[supabaseQuery]", error.message);
      }
      toast.error("Ocurrió un error al procesar la solicitud");
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (import.meta.env.DEV) {
      console.error("[supabaseQuery] Unexpected:", message);
    }
    toast.error("Error de conexión. Verifica tu red e intenta de nuevo.");
    return { data: null, error: message };
  }
}
