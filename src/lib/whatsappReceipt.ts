import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";

interface ReceiptData {
  pago: {
    folio: string;
    monto_recibido: number;
    aplicado_mora: number;
    aplicado_interes: number;
    aplicado_capital: number;
    metodo_pago: string;
    descuento?: number;
    cuota_num?: string | number;
    saldo_restante: number;
    proxima_cuota?: string;
    monto_proxima?: number;
  };
  empresa: { nombre: string; telefono?: string; direccion?: string; logo_url?: string | null };
  cliente: { nombre: string };
  prestamo: { folio: string; num_cuotas: number };
}

const $$ = (n: number) =>
  `$${(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildReceiptElement(data: ReceiptData): HTMLDivElement {
  const { pago, empresa, cliente, prestamo } = data;
  const fecha = new Date().toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const el = document.createElement("div");
  el.style.cssText = `
    position: absolute; left: 0; top: 0; z-index: 99999; opacity: 0; pointer-events: none;
    font-family: 'Courier New', monospace; background: #fff; width: 380px; padding: 20px;
    color: #000;
  `;
  el.innerHTML = `
    <div style="text-align:center;border-bottom:2px dashed #333;padding-bottom:12px;margin-bottom:12px">
      ${empresa.logo_url ? `<img src="${empresa.logo_url}" style="max-height:120px;max-width:280px;margin:0 auto 10px;display:block" crossorigin="anonymous" />` : ""}
      <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0;color:#444">${empresa.nombre}</p>
      ${empresa.telefono ? `<p style="font-size:10px;color:#777;margin:3px 0 0">Tel: ${empresa.telefono}</p>` : ""}
      ${empresa.direccion ? `<p style="font-size:10px;color:#777;margin:2px 0 0">${empresa.direccion}</p>` : ""}
      <p style="margin-top:8px"><span style="display:inline-block;background:#22c55e;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;text-transform:uppercase">✓ PAGO RECIBIDO</span></p>
    </div>

    <div style="margin:10px 0">
      <p style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#888;margin:0 0 6px">Datos del Recibo</p>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Folio:</span><span style="font-weight:bold">${pago.folio}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Fecha:</span><span style="font-weight:bold">${fecha}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Método:</span><span style="font-weight:bold">${pago.metodo_pago || "Efectivo"}</span></div>
    </div>

    <div style="border-top:1px dashed #ccc;margin:10px 0"></div>

    <div style="margin:10px 0">
      <p style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#888;margin:0 0 6px">Cliente</p>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Nombre:</span><span style="font-weight:bold">${cliente.nombre}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Préstamo:</span><span style="font-weight:bold">${prestamo.folio}</span></div>
    </div>

    <div style="border-top:1px dashed #ccc;margin:10px 0"></div>

    <div style="margin:10px 0">
      <p style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#888;margin:0 0 6px">Desglose del Pago</p>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">A Mora:</span><span style="font-weight:bold">${$$(pago.aplicado_mora)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">A Interés:</span><span style="font-weight:bold">${$$(pago.aplicado_interes)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">A Capital:</span><span style="font-weight:bold">${$$(pago.aplicado_capital)}</span></div>
      ${(pago.descuento || 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Descuento:</span><span style="font-weight:bold">-${$$(pago.descuento!)}</span></div>` : ""}
    </div>

    <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold;padding:8px 0;border-top:2px solid #333;border-bottom:2px solid #333;margin:10px 0">
      <span>TOTAL PAGADO</span><span>${$$(pago.monto_recibido)}</span>
    </div>

    <div style="margin:10px 0">
      <p style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#888;margin:0 0 6px">Saldo</p>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Cuota:</span><span style="font-weight:bold">${pago.cuota_num || "---"} de ${prestamo.num_cuotas}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Saldo Restante:</span><span style="font-weight:bold">${$$(pago.saldo_restante)}</span></div>
      ${pago.proxima_cuota ? `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Próx. Vencimiento:</span><span style="font-weight:bold">${pago.proxima_cuota}</span></div>` : ""}
      ${pago.monto_proxima ? `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#555">Próx. Monto:</span><span style="font-weight:bold">${$$(pago.monto_proxima)}</span></div>` : ""}
    </div>

    <div style="text-align:center;font-size:10px;color:#888;margin-top:12px;padding-top:12px;border-top:2px dashed #333">
      <p style="margin:0">Gracias por su pago</p>
      <p style="margin:2px 0 0">${empresa.nombre} © ${new Date().getFullYear()}</p>
    </div>
  `;
  return el;
}

/**
 * Generates a receipt PNG on the client, uploads to storage, sends via WhatsApp, then cleans up.
 */
export async function sendReceiptAsImage(
  empresaId: string,
  phone: string,
  data: ReceiptData,
  caption: string,
  isTest = false,
): Promise<{ success: boolean; error?: string }> {
  const storagePath = `temp-receipts/${empresaId}/${crypto.randomUUID()}.png`;
  let el: HTMLDivElement | null = null;

  try {
    // 1. Render element and wait for layout + images
    el = buildReceiptElement(data);
    document.body.appendChild(el);

    // Wait for images (logo) to load
    const images = el.querySelectorAll("img");
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      );
    }

    // Wait for browser to layout the element
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const dataUrl = await toPng(el, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: "#ffffff",
      style: { opacity: "1" },
    });

    document.body.removeChild(el);
    el = null;

    // 2. Convert to blob and upload to storage
    const blob = await fetch(dataUrl).then((r) => r.blob());

    const { error: uploadErr } = await supabase.storage
      .from("empresa-assets")
      .upload(storagePath, blob, { contentType: "image/png", upsert: true });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // 3. Get public URL
    const { data: urlData } = supabase.storage
      .from("empresa-assets")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // 4. Send via WhatsApp using send-image action
    const { data: result, error: invokeErr } = await supabase.functions.invoke("whatsapp-sender", {
      body: {
        action: "send-image",
        empresa_id: empresaId,
        phone,
        url: publicUrl,
        caption,
        tipo: "recibo",
        test: isTest,
      },
    });

    if (invokeErr) {
      // Try to extract meaningful error from edge function response
      let errMsg = invokeErr.message || "Error al enviar por WhatsApp";
      try {
        const ctx = (invokeErr as any).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) errMsg = body.error;
        }
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }

    // 5. Cleanup storage after a delay (give WhatsApp time to download)
    setTimeout(async () => {
      try {
        await supabase.storage.from("empresa-assets").remove([storagePath]);
      } catch {
        // silent
      }
    }, 30000);

    return result || { success: true };
  } catch (e: any) {
    // Cleanup element if still attached
    if (el && el.parentNode) document.body.removeChild(el);

    // Cleanup storage on error
    try {
      await supabase.storage.from("empresa-assets").remove([storagePath]);
    } catch {
      // silent
    }

    console.error("sendReceiptAsImage error:", e);
    return { success: false, error: e.message || "Error generating receipt image" };
  }
}
