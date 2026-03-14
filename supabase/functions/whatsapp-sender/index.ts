import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, empresa_id } = body;

    // Get WhatsApp config for the empresa
    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("*")
      .eq("empresa_id", empresa_id)
      .single();

    const isTest = body.test === true;

    if (!config) {
      return new Response(JSON.stringify({ error: "WhatsApp no configurado para esta empresa" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!config.activo && !isTest) {
      return new Response(JSON.stringify({ error: "WhatsApp está inactivo para esta empresa. Actívalo en configuración." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── send-text ────────────────────────────────
    if (action === "send-text") {
      const { phone, message, tipo, referencia_id } = body;
      
      const result = await sendWhatsApp(config.api_url, config.api_token, {
        action: "send-text",
        phone,
        message,
      });

      // Log the message
      await supabase.from("whatsapp_log").insert({
        empresa_id,
        telefono: phone,
        tipo: tipo || "manual",
        mensaje: message,
        status: result.success ? "enviado" : "error",
        error_detalle: result.error || null,
        referencia_id: referencia_id || null,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── send-image ────────────────────────────────
    if (action === "send-image") {
      const { phone, url, caption, tipo, referencia_id } = body;

      const result = await sendWhatsApp(config.api_url, config.api_token, {
        action: "send-image",
        phone,
        url,
        caption: caption || "",
      });

      await supabase.from("whatsapp_log").insert({
        empresa_id,
        telefono: phone,
        tipo: tipo || "recibo",
        mensaje: caption || "",
        imagen_url: url,
        status: result.success ? "enviado" : "error",
        error_detalle: result.error || null,
        referencia_id: referencia_id || null,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── send-receipt (generates ticket image and sends) ────────────────────
    if (action === "send-receipt") {
      const { phone, pago_data, empresa_data, cliente_data, prestamo_data } = body;

      // Get template for receipt message
      const { data: template } = await supabase
        .from("whatsapp_templates")
        .select("mensaje")
        .eq("empresa_id", empresa_id)
        .eq("tipo", "recibo_pago")
        .single();

      let caption = template?.mensaje || "✅ Recibo de pago {folio} por ${monto_recibido}. Gracias por su pago.";
      caption = replaceVariables(caption, { ...pago_data, ...cliente_data, ...empresa_data, ...prestamo_data });

      // Build receipt HTML, screenshot to PNG, upload to storage
      const receiptHtml = buildReceiptHtml(pago_data, empresa_data, cliente_data, prestamo_data);
      const { imageUrl, cleanupPaths } = await generateReceiptImage(supabase, receiptHtml, empresa_id);

      let result;
      let mensajeLog = caption;

      if (imageUrl) {
        // Send image with caption
        result = await sendWhatsApp(config.api_url, config.api_token, {
          action: "send-image",
          phone,
          url: imageUrl,
          caption,
        });
        // Cleanup after WhatsApp downloads the image
        setTimeout(() => cleanupStorage(supabase, cleanupPaths), 30000);
      } else {
        // Fallback to formatted text
        const fallbackText = `${caption}\n\n📋 Desglose:\n• Mora: $${(pago_data?.aplicado_mora || 0).toFixed(2)}\n• Interés: $${(pago_data?.aplicado_interes || 0).toFixed(2)}\n• Capital: $${(pago_data?.aplicado_capital || 0).toFixed(2)}\n• Total pagado: $${(pago_data?.monto_recibido || 0).toFixed(2)}\n• Saldo restante: $${(pago_data?.saldo_restante || 0).toFixed(2)}`;
        result = await sendWhatsApp(config.api_url, config.api_token, {
          action: "send-text",
          phone,
          message: fallbackText,
        });
        mensajeLog = fallbackText;
        // Cleanup any partial uploads
        await cleanupStorage(supabase, cleanupPaths);
      }

      await supabase.from("whatsapp_log").insert({
        empresa_id,
        telefono: phone,
        tipo: "recibo",
        mensaje: mensajeLog,
        status: result.success ? "enviado" : "error",
        error_detalle: result.error || null,
        referencia_id: pago_data.pago_id || null,
      });

      return new Response(JSON.stringify({ ...result, image_sent: !!imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── send-reminder (batch reminders) ────────────────────
    if (action === "send-reminder") {
      const { reminder_type } = body; // 'dia_antes' or 'vencido'
      
      // Get template
      const templateTipo = reminder_type === "dia_antes" ? "aviso_dia_antes" : "aviso_vencido";
      const { data: template } = await supabase
        .from("whatsapp_templates")
        .select("mensaje")
        .eq("empresa_id", empresa_id)
        .eq("tipo", templateTipo)
        .single();

      if (!template) {
        return new Response(JSON.stringify({ error: "No hay plantilla configurada" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get cuotas to notify
      let query = supabase
        .from("amortizacion")
        .select(`
          id, num_cuota, fecha_vencimiento, saldo_total, capital_interes,
          prestamo_id, empresa_id,
          prestamos!inner(id, cliente_id, num_cuotas, monto_solicitado,
            clientes!inner(nombre_completo, telefono)
          )
        `)
        .eq("empresa_id", empresa_id)
        .in("status", ["Pendiente", "Parcial"]);

      if (reminder_type === "dia_antes") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        query = query.eq("fecha_vencimiento", tomorrowStr);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        query = query.lt("fecha_vencimiento", today);
      }

      const { data: cuotas } = await query;
      let sent = 0, errors = 0;

      for (const cuota of (cuotas || [])) {
        const prestamo = (cuota as any).prestamos;
        const cliente = prestamo?.clientes;
        if (!cliente?.telefono) continue;

        const vars = {
          cliente: cliente.nombre_completo,
          telefono: cliente.telefono,
          cuota: String(cuota.num_cuota),
          total_cuotas: String(prestamo.num_cuotas),
          monto_cuota: cuota.saldo_total?.toFixed(2) || "0.00",
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto_prestamo: prestamo.monto_solicitado?.toFixed(2) || "0.00",
        };

        const message = replaceVariables(template.mensaje, vars);

        try {
          const result = await sendWhatsApp(config.api_url, config.api_token, {
            action: "send-text",
            phone: cliente.telefono,
            message,
          });

          await supabase.from("whatsapp_log").insert({
            empresa_id,
            telefono: cliente.telefono,
            tipo: "aviso",
            mensaje: message,
            status: result.success ? "enviado" : "error",
            error_detalle: result.error || null,
            referencia_id: cuota.prestamo_id,
          });

          if (result.success) sent++;
          else errors++;

          // Mark as notified
          if (result.success) {
            await supabase.from("amortizacion").update({ avisado: true }).eq("id", cuota.id);
          }
        } catch {
          errors++;
        }
      }

      return new Response(JSON.stringify({ success: true, sent, errors, total: (cuotas || []).length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ────────────────────────────────────────
async function sendWhatsApp(apiUrl: string, apiToken: string, payload: Record<string, any>) {
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "x-api-token": apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { success: res.ok, data, error: res.ok ? null : JSON.stringify(data) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

function replaceVariables(template: string, vars: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{${key}}`;
  });
}

function buildReceiptHtml(pago: any, empresa: any, cliente: any, prestamo: any): string {
  const fecha = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const $$ = (n: number) => `$${(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; background: #fff; width: 380px; padding: 20px; }
  .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 12px; margin-bottom: 12px; }
  .header h1 { font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
  .header p { font-size: 11px; color: #555; margin-top: 4px; }
  .section { margin: 10px 0; }
  .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .row .label { color: #555; }
  .row .value { font-weight: bold; text-align: right; }
  .divider { border-top: 1px dashed #ccc; margin: 10px 0; }
  .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; padding: 8px 0; border-top: 2px solid #333; border-bottom: 2px solid #333; margin: 10px 0; }
  .footer { text-align: center; font-size: 10px; color: #888; margin-top: 12px; padding-top: 12px; border-top: 2px dashed #333; }
  .badge { display: inline-block; background: #22c55e; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
</style></head>
<body>
  <div class="header">
    <h1>${empresa?.nombre || "Empresa"}</h1>
    ${empresa?.telefono ? `<p>Tel: ${empresa.telefono}</p>` : ""}
    ${empresa?.direccion ? `<p>${empresa.direccion}</p>` : ""}
    <p style="margin-top:8px"><span class="badge">✓ PAGO RECIBIDO</span></p>
  </div>

  <div class="section">
    <div class="section-title">Datos del Recibo</div>
    <div class="row"><span class="label">Folio:</span><span class="value">${pago?.folio || "---"}</span></div>
    <div class="row"><span class="label">Fecha:</span><span class="value">${fecha}</span></div>
    <div class="row"><span class="label">Método:</span><span class="value">${pago?.metodo_pago || "Efectivo"}</span></div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="row"><span class="label">Nombre:</span><span class="value">${cliente?.nombre || "---"}</span></div>
    <div class="row"><span class="label">Préstamo:</span><span class="value">${prestamo?.folio || "---"}</span></div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">Desglose del Pago</div>
    <div class="row"><span class="label">A Mora:</span><span class="value">${$$(pago?.aplicado_mora)}</span></div>
    <div class="row"><span class="label">A Interés:</span><span class="value">${$$(pago?.aplicado_interes)}</span></div>
    <div class="row"><span class="label">A Capital:</span><span class="value">${$$(pago?.aplicado_capital)}</span></div>
    ${pago?.descuento > 0 ? `<div class="row"><span class="label">Descuento:</span><span class="value">-${$$(pago.descuento)}</span></div>` : ""}
  </div>

  <div class="total-row">
    <span>TOTAL PAGADO</span>
    <span>${$$(pago?.monto_recibido)}</span>
  </div>

  <div class="section">
    <div class="section-title">Saldo</div>
    <div class="row"><span class="label">Cuota:</span><span class="value">${pago?.cuota_num || "---"} de ${prestamo?.num_cuotas || "---"}</span></div>
    <div class="row"><span class="label">Saldo Restante:</span><span class="value">${$$(pago?.saldo_restante)}</span></div>
    ${pago?.proxima_cuota ? `<div class="row"><span class="label">Próx. Vencimiento:</span><span class="value">${pago.proxima_cuota}</span></div>` : ""}
    ${pago?.monto_proxima ? `<div class="row"><span class="label">Próx. Monto:</span><span class="value">${$$(pago.monto_proxima)}</span></div>` : ""}
  </div>

  <div class="footer">
    <p>Gracias por su pago</p>
    <p>${empresa?.nombre || ""} © ${new Date().getFullYear()}</p>
  </div>
</body></html>`;
}

async function generateReceiptUrl(
  supabase: any,
  html: string,
  empresaId: string
): Promise<{ fileUrl: string | null; cleanupPath: string | null }> {
  try {
    const uid = crypto.randomUUID();
    const filePath = `temp-receipts/${empresaId}/${uid}.html`;

    const encoder = new TextEncoder();
    const htmlBytes = encoder.encode(html);
    const { error } = await supabase.storage
      .from("empresa-assets")
      .upload(filePath, htmlBytes, { contentType: "text/html", upsert: true });
    if (error) throw error;

    const { data } = supabase.storage
      .from("empresa-assets")
      .getPublicUrl(filePath);

    return { fileUrl: data.publicUrl, cleanupPath: filePath };
  } catch (e) {
    console.error("generateReceiptUrl error:", e);
    return { fileUrl: null, cleanupPath: null };
  }
}

async function cleanupStorage(supabase: any, paths: string[]) {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from("empresa-assets").remove(paths);
  } catch (e) {
    console.error("Storage cleanup error:", e);
  }
}
