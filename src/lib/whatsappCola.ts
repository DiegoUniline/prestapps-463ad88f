import { supabase } from "@/integrations/supabase/client";

export interface MensajeCola {
  empresaId: string;
  telefono: string;
  tipo: string;
  mensaje?: string | null;
  mediaUrl?: string | null;
  mediaTipo?: "image" | "file" | null;
  mediaNombre?: string | null;
  referenciaId?: string | null;
}

/** whatsapp_cola aún no está en los tipos generados. */
interface ColaClient {
  from(table: "whatsapp_cola"): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Encola un mensaje de WhatsApp (tabla whatsapp_cola). El envío, los reintentos y el
 * registro en whatsapp_log los hace la Edge Function whatsapp-sender ("process-queue"),
 * que también corre periódicamente; aquí solo se le avisa sin esperar respuesta.
 */
export async function encolarWhatsApp(m: MensajeCola): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  const { error } = await (supabase as unknown as ColaClient).from("whatsapp_cola").insert({
    empresa_id: m.empresaId,
    telefono: m.telefono,
    tipo: m.tipo,
    mensaje: m.mensaje ?? null,
    media_url: m.mediaUrl ?? null,
    media_tipo: m.mediaUrl ? m.mediaTipo ?? "image" : null,
    media_nombre: m.mediaNombre ?? null,
    referencia_id: m.referenciaId ?? null,
  });
  if (error) {
    console.error("encolarWhatsApp error:", error);
    return { success: false, error: error.message || "No se pudo encolar el mensaje" };
  }

  procesarColaWhatsApp();
  return { success: true, queued: true };
}

/** Dispara el procesamiento de la cola sin bloquear (los errores solo se registran). */
export function procesarColaWhatsApp() {
  supabase.functions
    .invoke("whatsapp-sender", { body: { action: "process-queue" } })
    .then(({ error }) => {
      if (error) console.warn("process-queue:", error.message);
    })
    .catch((e) => console.warn("process-queue:", e));
}
