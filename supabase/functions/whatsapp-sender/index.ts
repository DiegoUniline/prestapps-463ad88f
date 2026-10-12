import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o) => o.trim()).filter(Boolean);

const withCors = (handler: (req: Request) => Response | Promise<Response>) => async (req: Request) => {
  const res = await handler(req);
  const origin = req.headers.get("Origin") || "";
  const headers = new Headers(res.headers);
  if (!ALLOWED_ORIGINS.length) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else {
    if (ALLOWED_ORIGINS.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
    else headers.delete("Access-Control-Allow-Origin");
    headers.append("Vary", "Origin");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

const SUPER_ADMIN_EMAIL = (Deno.env.get("SUPER_ADMIN_EMAIL") || "diego.leon@uniline.mx").trim().toLowerCase();

type Caller = {
  service: boolean;
  userId: string | null;
  email: string | null;
  empresaId: string | null;
  roles: string[];
  superAdmin: boolean;
};

async function getCaller(req: Request, admin: any): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) {
    return { service: true, userId: null, email: null, empresaId: null, roles: [], superAdmin: false };
  }
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    admin.from("profiles").select("empresa_id").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const email = String(user.email || "").toLowerCase();
  return {
    service: false,
    userId: user.id,
    email,
    empresaId: profile?.empresa_id ?? null,
    roles: (roleRows || []).map((r: any) => r.role),
    superAdmin: !!email && email === SUPER_ADMIN_EMAIL,
  };
}

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json().catch(() => null)) || {};
    const { action } = body;
    const caller = await getCaller(req, supabase);

    // ── process-queue (whatsapp_cola) ──────────────────
    // Usuarios: solo su empresa. Service role / super admin: todas (o body.empresa_id).
    // Sin sesión (pg_cron con la clave publicable): todas, como máximo una vez por minuto.
    // Solo envía filas ya encoladas, así que es seguro e idempotente.
    if (action === "process-queue") {
      let empresaFiltro: string | null = null;
      if (caller?.service || caller?.superAdmin) {
        empresaFiltro = body.empresa_id || null;
      } else if (caller) {
        if (!caller.empresaId) {
          return new Response(JSON.stringify({ error: "Sin empresa asociada" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        empresaFiltro = caller.empresaId;
      } else {
        const { data: claimed, error: claimErr } = await supabase.rpc("cron_claim", { p_nombre: "whatsapp-queue", p_min_minutes: 1 });
        if (claimErr) console.error("[whatsapp-queue] cron_claim error:", claimErr.message);
        if (claimErr || claimed !== true) {
          return new Response(JSON.stringify({ skipped: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      const resumen = await processQueue(supabase, supabaseUrl, empresaFiltro);
      return new Response(JSON.stringify({ success: true, ...resumen }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!caller) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isPrivileged = caller.service || caller.superAdmin;
    const canManage = isPrivileged || caller.roles.includes("admin") || caller.roles.includes("supervisor");
    const empresa_id: string | null = isPrivileged ? (body.empresa_id || caller.empresaId) : caller.empresaId;

    if (!empresa_id) {
      return new Response(JSON.stringify({ error: "Sin empresa asociada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((action === "send-reminder" || body.override_api_token) && !canManage) {
      return new Response(JSON.stringify({ error: "Solo administradores o supervisores pueden realizar esta acción" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      const todayStr = new Date().toISOString().slice(0, 10);
      const buildQuery = () => {
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
          query = query.lt("fecha_vencimiento", todayStr);
        }
        return query.order("id", { ascending: true });
      };

      const PAGE = 1000;
      const cuotas: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data: page, error: pageErr } = await buildQuery().range(from, from + PAGE - 1);
        if (pageErr) throw pageErr;
        cuotas.push(...(page || []));
        if (!page || page.length < PAGE) break;
      }

      // Phones already reminded today with this template (re-runs must not re-send)
      const yaAvisados = new Set<string>();
      for (let from = 0; ; from += PAGE) {
        const { data: logs, error: logErr } = await supabase
          .from("whatsapp_log")
          .select("telefono")
          .eq("empresa_id", empresa_id)
          .eq("tipo", templateTipo)
          .eq("status", "enviado")
          .gte("created_at", todayStr)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (logErr) throw logErr;
        for (const l of (logs || [])) yaAvisados.add(l.telefono);
        if (!logs || logs.length < PAGE) break;
      }

      let sent = 0, errors = 0, skipped = 0;
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

        if (yaAvisados.has(normalizedPhone)) {
          skipped++;
          detalles.push({ cliente: cliente.nombre_completo, telefono: normalizedPhone, cuotas_detalle: cuotasNums, monto_total: montoTotal.toFixed(2), num_cuotas: cuotasList.length, status: "omitido", error: "Ya se envió este aviso hoy" });
          continue;
        }

        try {
          const result = await sendWhatsApp(config.api_url, config.api_token, {
            action: "send-text",
            phone: normalizedPhone,
            message,
          });

          await supabase.from("whatsapp_log").insert({
            empresa_id,
            telefono: normalizedPhone,
            tipo: templateTipo,
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

      return new Response(JSON.stringify({ success: true, sent, errors, skipped, total: clienteMap.size, detalles }), {
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
}));

// ── Cola (whatsapp_cola) ───────────────────────────
const QUEUE_BATCH = 50;
// Límite de Edge Functions ~150 s; un envío puede tardar ~65 s (3 intentos × 20 s + backoff).
const QUEUE_BUDGET_MS = 60_000;

async function processQueue(supabase: any, supabaseUrl: string, empresaId: string | null) {
  const started = Date.now();
  const { data: rows, error } = await supabase.rpc("whatsapp_cola_claim", { p_limit: QUEUE_BATCH, p_empresa: empresaId });
  if (error) throw error;

  const configs = new Map<string, { config: any; lada: string }>();
  const getConfig = async (empresa: string) => {
    if (!configs.has(empresa)) {
      const [{ data: config }, { data: emp }] = await Promise.all([
        supabase.from("whatsapp_config").select("*").eq("empresa_id", empresa).maybeSingle(),
        supabase.from("empresas").select("lada_pais").eq("id", empresa).maybeSingle(),
      ]);
      configs.set(empresa, { config, lada: emp?.lada_pais || "52" });
    }
    return configs.get(empresa)!;
  };

  let sent = 0, retry = 0, failed = 0;
  const pendientes: string[] = [];

  for (const row of (rows || []) as any[]) {
    if (Date.now() - started > QUEUE_BUDGET_MS) {
      pendientes.push(row.id);
      continue;
    }
    try {
      const { config, lada } = await getConfig(row.empresa_id);
      if (!config || !config.activo) {
        const msg = !config ? "WhatsApp no configurado para esta empresa" : "WhatsApp está inactivo para esta empresa";
        await finishRow(supabase, supabaseUrl, row, { success: false, error: msg }, "", true);
        failed++;
        continue;
      }

      const phone = normalizePhone(row.telefono || "", lada);
      const payload: Record<string, any> = row.media_tipo === "image"
        ? { action: "send-image", phone, url: row.media_url, caption: row.mensaje || "" }
        : row.media_tipo === "file"
          ? { action: "send-file", phone, url: row.media_url, fileName: row.media_nombre || "documento.pdf" }
          : { action: "send-text", phone, message: row.mensaje || "" };

      const result = await sendWhatsApp(config.api_url, config.api_token, payload);
      const estado = await finishRow(supabase, supabaseUrl, row, result, phone, false);
      if (estado === "enviado") sent++;
      else if (estado === "error") failed++;
      else retry++;
    } catch (e: any) {
      console.error("[whatsapp-queue] row error:", row.id, e?.message || e);
      try {
        await finishRow(supabase, supabaseUrl, row, { success: false, error: e?.message || "Error inesperado" }, "", false);
      } catch { /* el lease de 10 min lo devolverá a la cola */ }
      retry++;
    }
  }

  if (pendientes.length) {
    await supabase.rpc("whatsapp_cola_liberar", { p_ids: pendientes });
  }

  return { claimed: (rows || []).length, sent, retry, failed, released: pendientes.length };
}

async function finishRow(
  supabase: any,
  supabaseUrl: string,
  row: any,
  result: { success: boolean; error?: string | null },
  phone: string,
  permanente: boolean,
): Promise<string | null> {
  const { data: estado, error } = await supabase.rpc("whatsapp_cola_resultado", {
    p_id: row.id,
    p_ok: result.success,
    p_error: result.error || null,
    p_permanente: permanente,
  });
  if (error) throw error;

  if (estado === "enviado" || estado === "error") {
    const { error: logErr } = await supabase.from("whatsapp_log").insert({
      empresa_id: row.empresa_id,
      telefono: phone || row.telefono,
      tipo: row.tipo || "manual",
      mensaje: row.media_tipo === "file" ? (row.media_nombre || "") : (row.mensaje || ""),
      imagen_url: row.media_tipo === "image" ? row.media_url : null,
      status: estado,
      error_detalle: estado === "error" ? (result.error || null) : null,
      referencia_id: row.referencia_id || null,
    });
    if (logErr) console.error("[whatsapp-queue] log error:", logErr.message);
    await cleanupStorage(supabase, tempPaths(supabaseUrl, row));
  }
  return estado ?? null;
}

// Solo archivos temporales de la propia empresa en empresa-assets/temp-receipts/<empresa_id>/
function tempPaths(supabaseUrl: string, row: any): string[] {
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/empresa-assets/`;
  const url: string = row.media_url || "";
  if (!url.startsWith(prefix)) return [];
  const path = decodeURIComponent(url.slice(prefix.length).split("?")[0]);
  if (!path.startsWith(`temp-receipts/${row.empresa_id}/`) || path.includes("..")) return [];
  return [path];
}

// ── Helpers ────────────────────────────────────────
async function sendWhatsApp(apiUrl: string, apiToken: string, payload: Record<string, any>) {
  // Retry with exponential backoff. Retries on:
  //  - Network/fetch errors (transient)
  //  - HTTP 5xx
  //  - HTTP 429 (rate limit)
  //  - "Connection Closed" (WA instance momentary disconnect)
  const MAX_ATTEMPTS = 3;
  const BACKOFFS_MS = [0, 1500, 4000]; // attempt 1: immediate, 2: 1.5s, 3: 4s
  let lastError: string | null = null;
  let lastData: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (BACKOFFS_MS[attempt] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]));
    }
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "x-api-token": apiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return { success: true, data, error: null, attempts: attempt + 1 };
      }
      lastData = data;
      lastError = JSON.stringify(data);
      const errStr = (lastError || "").toLowerCase();
      const isTransient =
        res.status >= 500 ||
        res.status === 429 ||
        errStr.includes("connection closed") ||
        errStr.includes("timeout") ||
        errStr.includes("econn");
      if (!isTransient) break; // permanent error (auth, bad number, etc.) — don't retry
    } catch (e: any) {
      lastError = e.message || "Network error";
      // Network errors are always transient — keep retrying
    }
  }

  return { success: false, data: lastData, error: lastError, attempts: MAX_ATTEMPTS };
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
