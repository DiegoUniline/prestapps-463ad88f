import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads a PDF blob to temporary storage, sends it via WhatsApp as a file, then cleans up.
 */
export async function sendDocumentViaWhatsApp(
  empresaId: string,
  phone: string,
  pdfBlob: Blob,
  fileName: string,
  caption: string,
): Promise<{ success: boolean; error?: string }> {
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

    // 4. Send the file with caption
    const { data: result, error: invokeErr } = await supabase.functions.invoke("whatsapp-sender", {
      body: {
        action: "send-file",
        empresa_id: empresaId,
        phone,
        url: urlData.publicUrl,
        fileName,
        caption,
        tipo: "documento",
      },
    });

    if (invokeErr) throw invokeErr;

    // 5. Cleanup after 30s
    setTimeout(async () => {
      try {
        await supabase.storage.from("empresa-assets").remove([storagePath]);
      } catch { /* silent */ }
    }, 30000);

    return result || { success: true };
  } catch (e: any) {
    // Cleanup on error
    try {
      await supabase.storage.from("empresa-assets").remove([storagePath]);
    } catch { /* silent */ }
    console.error("sendDocumentViaWhatsApp error:", e);
    return { success: false, error: e.message || "Error al enviar documento" };
  }
}
