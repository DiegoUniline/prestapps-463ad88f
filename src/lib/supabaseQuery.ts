import { toast } from "sonner";

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Fetches ALL rows from a Supabase query by paginating in chunks of `pageSize`.
 * Supabase has a default limit of 1000 rows — this function loops until all rows are retrieved.
 * Pass a query builder (before calling .then or awaiting) — the function will add .range() automatically.
 */
export async function fetchAllRows<T = any>(
  queryBuilder: any,
  pageSize = 1000
): Promise<T[]> {
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
