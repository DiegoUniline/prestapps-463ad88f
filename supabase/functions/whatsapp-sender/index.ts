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

    // Get empresa lada_pais for phone normalization
    const { data: empresaData } = await supabase
      .from("empresas")
      .select("lada_pais")
      .eq("id", empresa_id)
      .single();
    const ladaPais = empresaData?.lada_pais || "52";

    if (!config.activo && !isTest) {
      return new Response(JSON.stringify({ error: "WhatsApp está inactivo para esta empresa. Actívalo en configuración." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── send-text ────────────────────────────────
    if (action === "send-text") {
      const { message, tipo, referencia_id } = body;
      const phone = normalizePhone(body.phone || "", ladaPais);
      const tokenToUse = body.override_api_token || config.api_token;

      const result = await sendWhatsApp(config.api_url, tokenToUse, {
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
      const { url, caption, tipo, referencia_id } = body;
      const phone = normalizePhone(body.phone || "", ladaPais);

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

    // ── send-file ────────────────────────────────
    if (action === "send-file") {
      const { url, fileName, tipo, referencia_id } = body;
      const phone = normalizePhone(body.phone || "", ladaPais);

      const result = await sendWhatsApp(config.api_url, config.api_token, {
        action: "send-file",
        phone,
        url,
        fileName: fileName || "documento.pdf",
      });

      await supabase.from("whatsapp_log").insert({
        empresa_id,
        telefono: phone,
        tipo: tipo || "documento",
        mensaje: fileName || "",
        status: result.success ? "enviado" : "error",
        error_detalle: result.error || null,
        referencia_id: referencia_id || null,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── send-receipt is now handled client-side (html-to-image → storage → send-image) ──

    // ── send-reminder (batch reminders) ────────────────────
    if (action === "send-reminder") {
      const { reminder_type } = body; // 'dia_antes' or 'vencido'

      // Recalculate mora before querying so saldo_total includes current late fees
      await supabase.rpc("recalcular_mora_empresa", { p_empresa_id: empresa_id });

      // Get template
      const templateTipo = reminder_type === "dia_antes" ? "aviso_dia_antes" : "aviso_vencido";
      const { data: template } = await supabase
        .from("whatsapp_templates")
        .select("mensaje")
        .eq("empresa_id", empresa_id)
        .eq("tipo", templateTipo)
        .single();

      if (!template) {
        return new Response(JSON.stringify({ success: false, error: `No hay plantilla configurada para "${templateTipo}". Configúrala en la pestaña Plantillas.` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get cuotas to notify
      let query = supabase
        .from("amortizacion")
        .select(`
          id, num_cuota, fecha_vencimiento, saldo_total, saldo_mora, saldo_capital, saldo_interes, capital_interes,
          prestamo_id, empresa_id,
          prestamos!inner(id, cliente_id, num_cuotas, monto_solicitado,
        clientes!inner(nombre_completo, telefono),
            id_prestamo
          )
        `)
        .eq("empresa_id", empresa_id)
        .in("status", ["Pendiente", "Parcial", "Vencida"]);

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
      const detalles: { cliente: string; telefono: string; cuotas_detalle: string; monto_total: string; num_cuotas: number; status: string; error?: string }[] = [];

      // Group cuotas by client (using cliente_id from prestamo)
      const clienteMap = new Map<string, { cliente: any; cuotasList: any[] }>();
      for (const cuota of (cuotas || [])) {
        const prestamo = (cuota as any).prestamos;
        const cliente = prestamo?.clientes;
        const clienteKey = prestamo?.cliente_id || cuota.prestamo_id;
        if (!clienteMap.has(clienteKey)) {
          clienteMap.set(clienteKey, { cliente, cuotasList: [] });
        }
        clienteMap.get(clienteKey)!.cuotasList.push({ ...cuota, prestamo });
      }

      for (const [, { cliente, cuotasList }] of clienteMap) {
        if (!cliente?.telefono) {
          const cuotasResumen = cuotasList.map(c => `#${c.num_cuota}`).join(", ");
          const montoTotal = cuotasList.reduce((sum: number, c: any) => sum + (c.saldo_total || 0), 0);
          detalles.push({ cliente: cliente?.nombre_completo || "Sin nombre", telefono: "Sin teléfono", cuotas_detalle: cuotasResumen, monto_total: montoTotal.toFixed(2), num_cuotas: cuotasList.length, status: "omitido", error: "Sin teléfono registrado" });
          continue;
        }

        // Build cuotas detail lines for the message
        const montoTotal = cuotasList.reduce((sum: number, c: any) => sum + (c.saldo_total || 0), 0);
        const moraTotal = cuotasList.reduce((sum: number, c: any) => sum + (c.saldo_mora || 0), 0);
        const saldoSinMora = montoTotal - moraTotal;
        const cuotasNums = cuotasList.map(c => `#${c.num_cuota}`).join(", ");
        const cuotasDetalle = cuotasList.map(c => {
          const fecha = c.fecha_vencimiento ? c.fecha_vencimiento.split("-").reverse().join("/") : "";
          return `• Cuota #${c.num_cuota} — ${fecha} — $${(c.saldo_total || 0).toFixed(2)}`;
        }).join("\n");

        const firstPrestamo = cuotasList[0]?.prestamo;
        const vars = {
          cliente: cliente.nombre_completo,
          telefono: cliente.telefono,
          cuota: cuotasNums,
          num_cuotas_vencidas: String(cuotasList.length),
          total_cuotas: String(firstPrestamo?.num_cuotas || ""),
          monto_cuota: montoTotal.toFixed(2),
          monto_total: montoTotal.toFixed(2),
          saldo_atrasado: saldoSinMora.toFixed(2),
          mora_total: moraTotal.toFixed(2),
          fecha_vencimiento: cuotasList[0]?.fecha_vencimiento ? cuotasList[0].fecha_vencimiento.split("-").reverse().join("/") : "",
          monto_prestamo: firstPrestamo?.monto_solicitado?.toFixed(2) || "0.00",
          detalle_cuotas: cuotasDetalle,
        };

        const message = replaceVariables(template.mensaje, vars);
        const normalizedPhone = normalizePhone(cliente.telefono, ladaPais);

        try {
          const result = await sendWhatsApp(config.api_url, config.api_token, {
            action: "send-text",
            phone: normalizedPhone,
            message,
          });

          await supabase.from("whatsapp_log").insert({
            empresa_id,
            telefono: normalizedPhone,
            tipo: "aviso",
            mensaje: message,
            status: result.success ? "enviado" : "error",
            error_detalle: result.error || null,
            referencia_id: cuotasList[0]?.prestamo_id || null,
          });

          if (result.success) {
            sent++;
            const cuotaIds = cuotasList.map((c: any) => c.id);
            await supabase.from("amortizacion").update({ avisado: true }).in("id", cuotaIds);
          } else {
            errors++;
          }
          detalles.push({ cliente: cliente.nombre_completo, telefono: normalizedPhone, cuotas_detalle: cuotasNums, monto_total: montoTotal.toFixed(2), num_cuotas: cuotasList.length, status: result.success ? "enviado" : "error", error: result.error || undefined });
        } catch (e: any) {
          errors++;
          detalles.push({ cliente: cliente.nombre_completo, telefono: normalizedPhone, cuotas_detalle: cuotasNums, monto_total: montoTotal.toFixed(2), num_cuotas: cuotasList.length, status: "error", error: e.message });
        }
      }

      return new Response(JSON.stringify({ success: true, sent, errors, total: clienteMap.size, detalles }), {
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

/**
 * Normalizes a phone number by stripping non-digits and prepending the country code if missing.
 * Handles Mexican numbers with 521 prefix (converts to 52).
 */
function normalizePhone(raw: string, ladaPais: string): string {
  // Strip everything except digits
  let digits = raw.replace(/\D/g, "");
  
  // If it already starts with the lada, return as-is
  if (digits.startsWith(ladaPais)) {
    // Special case: Mexico 521 → 52 (remove extra 1 after 52 for 13-digit numbers)
    if (ladaPais === "52" && digits.startsWith("521") && digits.length === 13) {
      digits = "52" + digits.slice(3);
    }
    return digits;
  }
  
  // If it starts with a + but different code, return digits as-is
  if (raw.trim().startsWith("+")) {
    return digits;
  }
  
  // Prepend lada
  return ladaPais + digits;
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

async function generateReceiptImage(
  supabase: any,
  html: string,
  empresaId: string
): Promise<{ imageUrl: string | null; cleanupPaths: string[] }> {
  const cleanupPaths: string[] = [];
  try {
    const uid = crypto.randomUUID();

    // 1. Upload HTML to storage so thum.io can access it
    const htmlPath = `temp-receipts/${empresaId}/${uid}.html`;
    const { error: htmlErr } = await supabase.storage
      .from("empresa-assets")
      .upload(htmlPath, new TextEncoder().encode(html), { contentType: "text/html" });
    if (htmlErr) throw htmlErr;
    cleanupPaths.push(htmlPath);

    const { data: htmlUrlData } = supabase.storage
      .from("empresa-assets")
      .getPublicUrl(htmlPath);

    // 2. Screenshot the HTML page as PNG using thum.io (15s timeout)
    const screenshotUrl = `https://image.thum.io/get/width/400/crop/900/png/${htmlUrlData.publicUrl}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const imgRes = await fetch(screenshotUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!imgRes.ok) throw new Error(`Screenshot service: ${imgRes.status}`);

    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
    if (imgBytes.length < 500) throw new Error("Image too small");

    // 3. Upload the PNG image to storage
    const imgPath = `temp-receipts/${empresaId}/${uid}.png`;
    const { error: imgErr } = await supabase.storage
      .from("empresa-assets")
      .upload(imgPath, imgBytes, { contentType: "image/png" });
    if (imgErr) throw imgErr;
    cleanupPaths.push(imgPath);

    const { data: imgUrlData } = supabase.storage
      .from("empresa-assets")
      .getPublicUrl(imgPath);

    return { imageUrl: imgUrlData.publicUrl, cleanupPaths };
  } catch (e) {
    console.error("generateReceiptImage error:", e);
    return { imageUrl: null, cleanupPaths };
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
