import { toast } from "sonner";

interface QueryResult<T> {
  data: T | null;
  error: string | null;
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
