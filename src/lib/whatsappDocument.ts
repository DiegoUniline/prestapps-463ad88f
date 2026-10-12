import { supabase } from "@/integrations/supabase/client";
import { encolarWhatsApp } from "@/lib/whatsappCola";

/**
 * Uploads a PDF blob to temporary storage and queues it for WhatsApp (whatsapp_cola).
 */
export async function sendDocumentViaWhatsApp(
  empresaId: string,
  phone: string,
  pdfBlob: Blob,
  fileName: string,
  caption: string,
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  const uid = crypto.randomUUID();
  const storagePath = `temp-receipts/${empresaId}/${uid}.pdf`;

  try {
    // 1. Check WhatsApp config
    const { data: waConfig } = await (supabase.from as any)("whatsapp_config")
      .select("activo")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (!waConfig?.activo) {
      return { success: false, error: "WhatsApp no está activo para esta empresa" };
    }

    // 2. Upload PDF to storage
    const { error: uploadErr } = await supabase.storage
      .from("empresa-assets")
      .upload(storagePath, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // 3. Get public URL
    const { data: urlData } = supabase.storage
      .from("empresa-assets")
      .getPublicUrl(storagePath);

    // 4. Encolar: whatsapp-sender lo envía con reintentos y borra el archivo temporal al terminar
    const result = await encolarWhatsApp({
      empresaId,
      telefono: phone,
      tipo: "documento",
      mensaje: caption,
      mediaUrl: urlData.publicUrl,
      mediaTipo: "file",
      mediaNombre: fileName,
    });
    if (!result.success) throw new Error(result.error);
    return result;
  } catch (e: any) {
    // Cleanup on error
    try {
      await supabase.storage.from("empresa-assets").remove([storagePath]);
    } catch { /* silent */ }
    console.error("sendDocumentViaWhatsApp error:", e);
    return { success: false, error: e.message || "Error al enviar documento" };
  }
}
