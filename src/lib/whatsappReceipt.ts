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
    fecha?: string;
    cobrador_nombre?: string;
  };
  empresa: { nombre: string; telefono?: string; direccion?: string; logo_url?: string | null };
  cliente: { nombre: string; dni?: string; telefono?: string };
  prestamo: { folio: string; num_cuotas: number };
}

interface TicketCampos {
  cliente_nombre: boolean;
  cliente_dni: boolean;
  cliente_telefono: boolean;
  prestamo_id: boolean;
  fecha_pago: boolean;
  monto_recibido: boolean;
  aplicado_mora: boolean;
  aplicado_interes: boolean;
  aplicado_capital: boolean;
  saldo_pendiente: boolean;
  metodo_pago: boolean;
  cobrador: boolean;
  firma_cliente: boolean;
  firma_cobrador: boolean;
}

interface TicketConfig {
  ticket_mostrar_logo: boolean;
  ticket_encabezado: string;
  ticket_pie: string;
  ticket_campos: TicketCampos;
}

const DEFAULT_CONFIG: TicketConfig = {
  ticket_mostrar_logo: true,
  ticket_encabezado: "",
  ticket_pie: "Gracias por su pago",
  ticket_campos: {
    cliente_nombre: true, cliente_dni: true, cliente_telefono: true,
    prestamo_id: true, fecha_pago: true, monto_recibido: true,
    aplicado_mora: true, aplicado_interes: true, aplicado_capital: true,
    saldo_pendiente: true, metodo_pago: true, cobrador: true,
    firma_cliente: false, firma_cobrador: false,
  },
};

import { getCurrencySymbol } from "@/lib/utils";

const $$ = (n: number) =>
  `${getCurrencySymbol()}${(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function fetchTicketConfig(empresaId: string): Promise<TicketConfig> {
  try {
    const { data } = await supabase
      .from("empresa_config" as any)
      .select("ticket_mostrar_logo, ticket_encabezado, ticket_pie, ticket_campos")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (data) {
      const d = data as any;
      return {
        ticket_mostrar_logo: d.ticket_mostrar_logo ?? true,
        ticket_encabezado: d.ticket_encabezado || "",
        ticket_pie: d.ticket_pie || "Gracias por su pago",
        ticket_campos: { ...DEFAULT_CONFIG.ticket_campos, ...(d.ticket_campos || {}) },
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_CONFIG;
}

function row(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#666">${label}</span><span style="font-weight:bold">${value}</span></div>`;
}

function sectionTitle(title: string): string {
  return `<p style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#999;margin:0 0 6px">${title}</p>`;
}

function separator(): string {
  return `<div style="border-top:1px dashed #ddd;margin:0"></div>`;
}

function buildReceiptElement(data: ReceiptData, config: TicketConfig): HTMLDivElement {
  const { pago, empresa, cliente, prestamo } = data;
  const c = config.ticket_campos;
  const fecha = pago.fecha || new Date().toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const sections: string[] = [];

  // ── Header ──
  let header = "";
  if (config.ticket_mostrar_logo && empresa.logo_url) {
    header += `<img src="${empresa.logo_url}" style="max-height:60px;max-width:200px;margin:0 auto 8px;display:block" crossorigin="anonymous" />`;
  }
  if (config.ticket_encabezado) {
    header += `<p style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;color:#333;margin:0">${config.ticket_encabezado}</p>`;
  }
  header += `<div style="margin-top:8px"><span style="display:inline-block;background:#22c55e;color:#fff;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px">✓ Pago Recibido</span></div>`;
  sections.push(`<div style="background:#f8f9fa;padding:16px 20px;text-align:center;border-bottom:1px dashed #ddd">${header}</div>`);

  // ── Datos del Recibo ──
  let reciboRows = "";
  if (c.prestamo_id) reciboRows += row("Folio:", pago.folio);
  if (c.fecha_pago) reciboRows += row("Fecha:", fecha);
  if (c.metodo_pago) reciboRows += row("Método:", pago.metodo_pago || "Efectivo");
  if (reciboRows) {
    sections.push(`<div style="padding:12px 20px">${sectionTitle("Datos del Recibo")}${reciboRows}</div>`);
    sections.push(`<div style="padding:0 20px">${separator()}</div>`);
  }

  // ── Cliente ──
  let clienteRows = "";
  if (c.cliente_nombre) clienteRows += row("Nombre:", cliente.nombre);
  if (c.cliente_dni && cliente.dni) clienteRows += row("Documento:", cliente.dni);
  if (c.cliente_telefono && cliente.telefono) clienteRows += row("Teléfono:", cliente.telefono);
  if (clienteRows) {
    sections.push(`<div style="padding:12px 20px">${sectionTitle("Cliente")}${clienteRows}</div>`);
    sections.push(`<div style="padding:0 20px">${separator()}</div>`);
  }

  // ── Desglose ──
  let desgloseRows = "";
  if (c.aplicado_mora) desgloseRows += row("A Mora:", $$(pago.aplicado_mora));
  if (c.aplicado_interes) desgloseRows += row("A Interés:", $$(pago.aplicado_interes));
  if (c.aplicado_capital) desgloseRows += row("A Capital:", $$(pago.aplicado_capital));
  if ((pago.descuento || 0) > 0) desgloseRows += row("Descuento:", `-${$$(pago.descuento!)}`);
  if (desgloseRows) {
    sections.push(`<div style="padding:12px 20px">${sectionTitle("Desglose del Pago")}${desgloseRows}</div>`);
  }

  // ── Total ──
  if (c.monto_recibido) {
    sections.push(`<div style="margin:0 20px;border-top:2px solid #333;border-bottom:2px solid #333;padding:8px 0;display:flex;justify-content:space-between;font-size:14px;font-weight:bold"><span>TOTAL PAGADO</span><span>${$$(pago.monto_recibido)}</span></div>`);
  }

  // ── Saldo ──
  let saldoRows = "";
  saldoRows += row("Cuota:", `${pago.cuota_num || "---"} de ${prestamo.num_cuotas}`);
  if (c.saldo_pendiente) saldoRows += row("Saldo Restante:", $$(pago.saldo_restante));
  if (pago.proxima_cuota) saldoRows += row("Próx. Venc.:", pago.proxima_cuota);
  if (pago.monto_proxima) saldoRows += row("Próx. Monto:", $$(pago.monto_proxima));
  sections.push(`<div style="padding:12px 20px">${sectionTitle("Saldo")}${saldoRows}</div>`);

  // ── Cobrador ──
  if (c.cobrador && pago.cobrador_nombre) {
    sections.push(`<div style="padding:0 20px 12px">${row("Cobrador:", pago.cobrador_nombre)}</div>`);
  }

  // ── Firmas ──
  if (c.firma_cliente || c.firma_cobrador) {
    let firmas = '<div style="display:flex;gap:16px;padding-top:16px">';
    if (c.firma_cliente) {
      firmas += '<div style="flex:1;text-align:center"><div style="border-top:1px solid #333;margin-top:24px;padding-top:4px;font-size:9px;color:#666">Firma Cliente</div></div>';
    }
    if (c.firma_cobrador) {
      firmas += '<div style="flex:1;text-align:center"><div style="border-top:1px solid #333;margin-top:24px;padding-top:4px;font-size:9px;color:#666">Firma Cobrador</div></div>';
    }
    firmas += '</div>';
    sections.push(`<div style="padding:0 20px 12px;border-top:1px dashed #ddd">${firmas}</div>`);
  }

  // ── Footer ──
  if (config.ticket_pie) {
    sections.push(`<div style="background:#f8f9fa;padding:12px 20px;text-align:center;border-top:1px dashed #ddd"><p style="font-size:10px;color:#999;font-style:italic;margin:0">${config.ticket_pie}</p><p style="font-size:9px;color:#bbb;margin:2px 0 0">© ${new Date().getFullYear()}</p></div>`);
  }

  const el = document.createElement("div");
  el.style.cssText = `
    position: absolute; left: 0; top: 0; z-index: 99999; opacity: 0; pointer-events: none;
    font-family: 'Courier New', monospace; background: #fff; width: 380px;
    color: #000;
  `;
  el.innerHTML = sections.join("");
  return el;
}

/**
 * Generates a receipt PNG on the client using ticket config, uploads to storage, sends via WhatsApp, then cleans up.
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
    // 0. Fetch ticket config
    const config = await fetchTicketConfig(empresaId);

    // 1. Render element and wait for layout + images
    el = buildReceiptElement(data, config);
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

    // 5. Cleanup storage after a delay
    setTimeout(async () => {
      try {
        await supabase.storage.from("empresa-assets").remove([storagePath]);
      } catch {
        // silent
      }
    }, 30000);

    return result || { success: true };
  } catch (e: any) {
    if (el && el.parentNode) document.body.removeChild(el);

    try {
      await supabase.storage.from("empresa-assets").remove([storagePath]);
    } catch {
      // silent
    }

    console.error("sendReceiptAsImage error:", e);
    return { success: false, error: e.message || "Error generating receipt image" };
  }
}
