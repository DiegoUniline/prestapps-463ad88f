import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

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

async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
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
    roles: (roleRows || []).map((r: { role: string }) => r.role),
    superAdmin: !!email && email === SUPER_ADMIN_EMAIL,
  };
}

// Service role and super admin run freely; any other caller (e.g. pg_cron with the anon key) is throttled.
async function cronGate(req: Request, admin: SupabaseClient, nombre: string): Promise<Response | null> {
  const caller = await getCaller(req, admin);
  if (caller?.service || caller?.superAdmin) return null;
  const { data: claimed, error } = await admin.rpc("cron_claim", { p_nombre: nombre, p_min_minutes: 50 });
  if (error) console.error(`[${nombre}] cron_claim error:`, error.message);
  if (error || claimed !== true) {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[BILLING-NOTIF] ${step}${d}`);
};

const DIAS_GRACIA = 3;
const SUPERADMIN_PHONE = "523171035768";

interface AdminProfile {
  id: string;
  telefono: string | null;
  nombre_completo: string;
}

interface FailedCharge {
  empresa_id: string;
  prestamo_id: string;
  monto: number;
  error_mensaje: string | null;
  cliente_id: string;
}

interface NotificationResult {
  empresa_id: string;
  action: string;
  daysLeft?: number;
  esTrial?: boolean;
  count?: number;
}

// Same semantics as `e?.message`: Error instances and plain error objects alike.
function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") return e.message;
  return undefined;
}

// ── Notify Super Admin directly ──
async function notifySuperAdmin(
  supabase: SupabaseClient,
  apiUrl: string,
  apiToken: string,
  mensaje: string,
) {
  try {
    const candidates = getPhoneCandidates(SUPERADMIN_PHONE);
    const result = await sendWhatsAppWithFallback(apiUrl, apiToken, mensaje, candidates);
    logStep("SuperAdmin WA", { success: result.success });
    await supabase.from("whatsapp_log").insert({
      empresa_id: null,
      telefono: result.phoneUsed || SUPERADMIN_PHONE,
      tipo: "alerta_superadmin",
      mensaje,
      status: result.success ? "enviado" : "error",
      error_detalle: result.success ? null : (result.error || "No se pudo entregar"),
    });
  } catch (e) {
    logStep("notifySuperAdmin error", { error: errorMessage(e) });
  }
}

function getPhoneCandidates(phone: string): string[] {
  const digits = String(phone || "").replace(/\D/g, "");
  const candidates = new Set<string>();
  if (digits) candidates.add(digits);
  if (digits.length === 10) {
    candidates.add(`52${digits}`);
    candidates.add(`521${digits}`);
  }
  if (digits.length === 12 && digits.startsWith("52")) {
    candidates.add(`521${digits.slice(2)}`);
  }
  if (digits.length === 13 && digits.startsWith("521")) {
    candidates.add(`52${digits.slice(3)}`);
  }
  return Array.from(candidates);
}

const WA_BACKOFFS_MS = [0, 1500, 4000];

// Retries transient failures (network, 5xx, 429, connection closed) with backoff; never throws.
async function postWhatsApp(apiUrl: string, apiToken: string, phone: string, message: string) {
  let lastError: string | null = null;
  let transient = false;
  for (let attempt = 0; attempt < WA_BACKOFFS_MS.length; attempt++) {
    if (WA_BACKOFFS_MS[attempt] > 0) await new Promise((r) => setTimeout(r, WA_BACKOFFS_MS[attempt]));
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "x-api-token": apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-text", phone, message }),
      });
      const raw = await res.text().catch(() => "");
      if (res.ok) return { success: true, error: null, transient: false };
      lastError = `HTTP ${res.status}: ${raw.slice(0, 300)}`;
      const errStr = raw.toLowerCase();
      transient = res.status >= 500 || res.status === 429 ||
        errStr.includes("connection closed") || errStr.includes("timeout") || errStr.includes("econn");
      if (!transient) break;
    } catch (e) {
      lastError = errorMessage(e) || "Network error";
      transient = true;
    }
  }
  return { success: false, error: lastError, transient };
}

async function sendWhatsAppWithFallback(
  apiUrl: string,
  apiToken: string,
  mensaje: string,
  candidates: string[],
) {
  let lastError: string | null = null;
  for (const candidate of candidates) {
    const r = await postWhatsApp(apiUrl, apiToken, candidate, mensaje);
    if (r.success) return { success: true, phoneUsed: candidate, error: null };
    lastError = r.error;
    logStep("WA attempt failed", { phone: candidate, error: r.error });
    if (r.transient) break;
  }
  return { success: false, phoneUsed: candidates[0] || null, error: lastError };
}

async function getEmpresaAdmins(supabase: SupabaseClient, empresaId: string): Promise<AdminProfile[]> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, telefono, nombre_completo")
    .eq("empresa_id", empresaId);
  const ids = (profiles || []).map((p: AdminProfile) => p.id);
  if (!ids.length) return [];
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .in("user_id", ids);
  const adminSet = new Set((admins || []).map((a: { user_id: string }) => a.user_id));
  return (profiles || []).filter((p: AdminProfile) => adminSet.has(p.id));
}

async function alreadyNotifiedToday(supabase: SupabaseClient, empresaId: string, tipo: string, today: string) {
  const { data } = await supabase
    .from("whatsapp_log")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("tipo", tipo)
    .eq("status", "enviado")
    .gte("created_at", today)
    .limit(1);
  return !!data?.length;
}

async function getSystemWaConfig(supabase: SupabaseClient) {
  try {
    const { data } = await supabase
      .from("system_notification_templates")
      .select("message_template")
      .eq("template_key", "__system_wa_config")
      .maybeSingle();
    if (!data?.message_template) return null;
    const cfg = JSON.parse(data.message_template);
    if (!cfg.api_token || !cfg.api_url) return null;
    return { api_url: cfg.api_url, api_token: cfg.api_token };
  } catch {}
  return null;
}

async function notifyEmpresaAdmins(
  supabase: SupabaseClient,
  empresaId: string,
  mensaje: string,
  tipo: string,
) {
  try {
    const waConfig = await getSystemWaConfig(supabase);
    if (!waConfig) { logStep("No WA config found"); return; }

    const profiles = await getEmpresaAdmins(supabase, empresaId);

    for (const profile of profiles) {
      if (!profile.telefono) continue;
      const candidates = getPhoneCandidates(profile.telefono);
      const result = await sendWhatsAppWithFallback(waConfig.api_url, waConfig.api_token, mensaje, candidates);
      logStep("WA notification", { phone: result.phoneUsed, success: result.success, tipo });
      await supabase.from("whatsapp_log").insert({
        empresa_id: empresaId,
        telefono: result.phoneUsed || profile.telefono,
        tipo,
        mensaje,
        status: result.success ? "enviado" : "error",
        error_detalle: result.success ? null : (result.error || "No se pudo entregar"),
      });
    }
  } catch (e) {
    logStep("notifyEmpresaAdmins error", { error: errorMessage(e) });
  }
}

const formatMXN = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

serve(withCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const gate = await cronGate(req, supabase, "billing-notifications");
  if (gate) return gate;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const results: NotificationResult[] = [];

  try {
    logStep("Function started", { today });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. Notify about invoices generated today (day 1 of month)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: todayInvoices } = await supabase
      .from("facturas")
      .select("*, suscripciones!suscripcion_id(*, planes(*))")
      .eq("periodo_inicio", today)
      .is("fecha_pago", null);

    for (const factura of (todayInvoices || [])) {
      const sub = factura.suscripciones;
      if (!sub) continue;

      const { data: empData } = await supabase
        .from("empresas")
        .select("nombre")
        .eq("id", factura.empresa_id)
        .single();
      const empresaNombre = empData?.nombre || "tu empresa";
      const planNombre = sub.planes?.nombre || "tu plan";
      const mesNombre = now.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
      const isStripeBilled = !!sub.stripe_subscription_id;

      // Check if we already notified for this invoice today
      if (await alreadyNotifiedToday(supabase, factura.empresa_id, "factura_generada", today)) continue;

      if (isStripeBilled) {
        await notifyEmpresaAdmins(supabase, factura.empresa_id,
          `Hola 👋 *${empresaNombre}*\n\n` +
          `Gracias por usar *PrestApps*. Hemos generado tu factura del mes de *${mesNombre}*.\n\n` +
          `🧾 *${factura.numero_factura}*\n` +
          `💵 *${formatMXN(factura.total)} MXN* · ${planNombre} (${factura.num_usuarios} usuario${factura.num_usuarios > 1 ? "s" : ""})\n\n` +
          `💳 Se cobrará automáticamente a tu tarjeta.\n` +
          `Si el cobro falla, cuentas con *${DIAS_GRACIA} días* antes de que se pause tu servicio.\n\n` +
          `¿Necesitas cambiar tu tarjeta? Entra a *Mi Suscripción* en la app. 📱`,
          "factura_generada",
        );
      } else {
        const fechaVenc = factura.fecha_vencimiento
          ? formatDate(new Date(factura.fecha_vencimiento))
          : `${DIAS_GRACIA} días`;

        await notifyEmpresaAdmins(supabase, factura.empresa_id,
          `Hola 👋 *${empresaNombre}*\n\n` +
          `Gracias por usar *PrestApps*. Tu factura de *${mesNombre}* ya está lista.\n\n` +
          `🧾 *${factura.numero_factura}*\n` +
          `💵 *${formatMXN(factura.total)} MXN* · ${planNombre} (${factura.num_usuarios} usuario${factura.num_usuarios > 1 ? "s" : ""})\n` +
          `📅 Fecha límite: *${fechaVenc}*\n\n` +
          `Tienes *${DIAS_GRACIA} días* para pagar sin que se interrumpa tu servicio.\n\n` +
          `👉 Entra a *Mi Suscripción* en la app para completar tu pago. 📱`,
          "factura_generada",
        );
      }

      results.push({ empresa_id: factura.empresa_id, action: "factura_notificada" });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. Notify about successful payments today
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: paidToday } = await supabase
      .from("facturas")
      .select("*, suscripciones!suscripcion_id(*, planes(*))")
      .eq("estado", "pagada")
      .gte("fecha_pago", today);

    for (const factura of (paidToday || [])) {
      const sub = factura.suscripciones;
      if (!sub) continue;

      // Check if we already sent pago_exitoso today for this empresa
      if (await alreadyNotifiedToday(supabase, factura.empresa_id, "pago_exitoso", today)) continue;

      const { data: empData } = await supabase
        .from("empresas")
        .select("nombre")
        .eq("id", factura.empresa_id)
        .single();
      const empresaNombre = empData?.nombre || "tu empresa";
      const planNombre = sub.planes?.nombre || "tu plan";
      const mesNombre = now.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
      const nextCobro = sub.fecha_proximo_cobro
        ? formatDate(new Date(sub.fecha_proximo_cobro))
        : "";

      await notifyEmpresaAdmins(supabase, factura.empresa_id,
        `✅ *${empresaNombre}* — Pago confirmado\n\n` +
        `Tu pago de *${formatMXN(factura.total)} MXN* del mes de *${mesNombre}* se procesó correctamente.\n\n` +
        `🧾 ${factura.numero_factura}\n` +
        (nextCobro ? `📅 Próximo cobro: *${nextCobro}*\n\n` : "\n") +
        `¡Sigue creciendo tu negocio con *PrestApps*! 💪`,
        "pago_exitoso",
      );

      // Notify Super Admin about this payment
      const waConfig = await getSystemWaConfig(supabase);
      if (waConfig) {
        await notifySuperAdmin(supabase, waConfig.api_url, waConfig.api_token,
          `💰 *Cobro exitoso*\n\n` +
          `🏢 *${empresaNombre}*\n` +
          `🧾 ${factura.numero_factura}\n` +
          `💵 *${formatMXN(factura.total)} MXN*\n` +
          `📦 ${planNombre} (${factura.num_usuarios} usuario${factura.num_usuarios > 1 ? "s" : ""})\n` +
          (nextCobro ? `📅 Próximo cobro: ${nextCobro}\n` : "") +
          `\n✅ Pago procesado correctamente.`
        );
      }

      results.push({ empresa_id: factura.empresa_id, action: "pago_notificado" });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. Grace period reminders
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: graciaSubs } = await supabase
      .from("suscripciones")
      .select("id, empresa_id, actualizado_en")
      .eq("estado", "gracia");

    for (const sub of (graciaSubs || [])) {
      const graciaStart = sub.actualizado_en ? new Date(sub.actualizado_en) : now;
      const daysSinceGracia = Math.floor((now.getTime() - graciaStart.getTime()) / (1000 * 60 * 60 * 24));
      const daysLeft = DIAS_GRACIA - daysSinceGracia;

      if (daysLeft > 0) {
        if (await alreadyNotifiedToday(supabase, sub.empresa_id, "recordatorio_gracia", today)) continue;
        const { data: empData } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();

        await notifyEmpresaAdmins(supabase, sub.empresa_id,
          `⏳ *${empData?.nombre || "tu empresa"}* — Pago pendiente\n\n` +
          `Tu suscripción sigue sin pagarse. Te ${daysLeft === 1 ? "queda *1 día*" : `quedan *${daysLeft} días*`} antes de que pausemos tu servicio.\n\n` +
          `👉 Entra a *Mi Suscripción* en la app y resuelve tu pago hoy.\n\n` +
          `¡Estamos para ayudarte! 🙏`,
          "recordatorio_gracia",
        );
        results.push({ empresa_id: sub.empresa_id, action: "gracia_reminder", daysLeft });
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. Recently suspended — notify once
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: suspendedSubs } = await supabase
      .from("suscripciones")
      .select("id, empresa_id, actualizado_en")
      .eq("estado", "suspendida")
      .gte("actualizado_en", today);

    for (const sub of (suspendedSubs || [])) {
      // Check if we already notified suspension today
      if (await alreadyNotifiedToday(supabase, sub.empresa_id, "suscripcion_suspendida", today)) continue;

      const { data: empData } = await supabase
        .from("empresas")
        .select("nombre")
        .eq("id", sub.empresa_id)
        .single();

      await notifyEmpresaAdmins(supabase, sub.empresa_id,
        `⚠️ *${empData?.nombre || "tu empresa"}* — Servicio pausado\n\n` +
        `No recibimos tu pago a tiempo y tu cuenta ha sido suspendida temporalmente.\n\n` +
        `🔒 Los módulos operativos están restringidos hasta que regularices tu pago.\n\n` +
        `Para reactivar al instante:\n` +
        `1️⃣ Abre la app → *Mi Suscripción*\n` +
        `2️⃣ Registra o actualiza tu método de pago\n` +
        `3️⃣ Tu acceso se restaura de inmediato ✅\n\n` +
        `Tus datos están seguros, no se perderá nada. 🔐\n\n` +
        `¿Necesitas ayuda? Responde aquí y te apoyamos. 💬`,
        "suscripcion_suspendida",
      );
      // Notify Super Admin about suspension
      const waConfig3 = await getSystemWaConfig(supabase);
      if (waConfig3) {
        await notifySuperAdmin(supabase, waConfig3.api_url, waConfig3.api_token,
          `🚫 *Empresa suspendida*\n\n` +
          `🏢 *${empData?.nombre || "—"}*\n` +
          `No pagó a tiempo y su servicio fue pausado.\n\n` +
          `Requiere seguimiento.`
        );
      }

      results.push({ empresa_id: sub.empresa_id, action: "suspension_notificada" });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. Expiring tomorrow — renewal reminder with Stripe link
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: expiringSubs } = await supabase
      .from("suscripciones")
      .select("*, planes(*)")
      .in("estado", ["trial", "activa"])
      .eq("fecha_vencimiento", tomorrowStr);

    for (const sub of (expiringSubs || [])) {
      try {
        if (await alreadyNotifiedToday(supabase, sub.empresa_id, "recordatorio_vencimiento", today)) continue;
        const { data: empData } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();
        const empresaNombre = empData?.nombre || "tu empresa";

        // Get admin for Stripe checkout
        const adminProfile = (await getEmpresaAdmins(supabase, sub.empresa_id))[0];
        if (!adminProfile) continue;

        const { data: authData } = await supabase.auth.admin.getUserById(adminProfile.id);
        const adminEmail = authData?.user?.email;

        let checkoutUrl = "";

        if (stripe && sub.plan_id && sub.planes?.stripe_price_id) {
          try {
            let customerId = sub.stripe_customer_id;
            if (!customerId && adminEmail) {
              const customers = await stripe.customers.list({ email: adminEmail, limit: 1 });
              if (customers.data.length > 0) {
                customerId = customers.data[0].id;
              } else {
                const customer = await stripe.customers.create({
                  email: adminEmail,
                  name: adminProfile.nombre_completo || empresaNombre,
                  metadata: { empresa_id: sub.empresa_id },
                });
                customerId = customer.id;
              }
            }

            const extraUsers = Math.max(0, sub.num_usuarios - (sub.planes?.usuarios_incluidos || 1));
            const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: sub.planes.stripe_price_id, quantity: 1 }];
            if (extraUsers > 0 && sub.planes.stripe_product_id) {
              lineItems.push({
                price_data: {
                  currency: "mxn",
                  product: sub.planes.stripe_product_id,
                  unit_amount: Math.round(sub.precio_usuario_extra * 100),
                  recurring: { interval: "month" as const },
                },
                quantity: extraUsers,
              });
            }

            const postExpiry = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);
            const nextFirst = new Date(Date.UTC(postExpiry.getUTCFullYear(), postExpiry.getUTCMonth() + 1, 1));
            const anchorTs = Math.floor(nextFirst.getTime() / 1000);

            const sessionParams: Stripe.Checkout.SessionCreateParams = {
              line_items: lineItems,
              mode: "subscription",
              success_url: `https://prestapps.lovable.app/mi-suscripcion?checkout=success`,
              cancel_url: `https://prestapps.lovable.app/mi-suscripcion?checkout=cancel`,
              metadata: { empresa_id: sub.empresa_id, plan_id: sub.plan_id, num_usuarios: String(sub.num_usuarios), renewal: "true" },
              subscription_data: {
                billing_cycle_anchor: anchorTs,
                proration_behavior: "create_prorations",
                metadata: { empresa_id: sub.empresa_id, plan_id: sub.plan_id, num_usuarios: String(sub.num_usuarios) },
              },
            };
            if (customerId) sessionParams.customer = customerId;
            else if (adminEmail) sessionParams.customer_email = adminEmail;

            const session = await stripe.checkout.sessions.create(sessionParams);
            checkoutUrl = session.url || "";
          } catch (stripeErr) {
            logStep("Error creating checkout", { empresa_id: sub.empresa_id, error: errorMessage(stripeErr) });
          }
        }

        const planNombre = sub.planes?.nombre || "tu plan";
        const precio = sub.planes?.precio_base_mes ? formatMXN(sub.planes.precio_base_mes) : "";
        const esTrial = sub.estado === "trial";
        const fechaVenc = formatDate(tomorrow);

        let mensaje = "";
        if (esTrial) {
          mensaje =
            `👋 *${empresaNombre}*\n\n` +
            `Tu prueba gratuita de *PrestApps* termina *mañana ${fechaVenc}*. ⏰\n\n` +
            `🎯 No pierdas el avance que llevas — activa tu plan y sigue operando sin pausa.\n\n` +
            `📦 ${planNombre}\n` +
            (precio ? `💵 Desde *${precio} MXN/mes*\n\n` : "\n") +
            (checkoutUrl
              ? `👉 Paga aquí y renueva al instante:\n${checkoutUrl}\n\n`
              : `👉 Entra a *Mi Suscripción* en la app para activar tu plan.\n\n`) +
            `Tu información está segura 🔐 y lista para seguir trabajando.`;
        } else {
          mensaje =
            `👋 *${empresaNombre}*\n\n` +
            `Tu suscripción de *PrestApps* vence *mañana ${fechaVenc}*. ⏰\n\n` +
            `📦 ${planNombre}\n` +
            (precio ? `💵 *${precio} MXN/mes*\n\n` : "\n") +
            `Renueva hoy para que tu servicio no se interrumpa:\n\n` +
            (checkoutUrl
              ? `👉 Paga con un clic:\n${checkoutUrl}\n\n`
              : `👉 Entra a *Mi Suscripción* en la app para renovar.\n\n`) +
            `Al pagar, tu plan se activa de inmediato. ✅\n` +
            `Tus datos están seguros. 🔐`;
        }

        await notifyEmpresaAdmins(supabase, sub.empresa_id, mensaje, "recordatorio_vencimiento");
        results.push({ empresa_id: sub.empresa_id, action: "expiration_reminder", esTrial });
      } catch (err) {
        logStep("Error expiration reminder", { empresa_id: sub.empresa_id, error: errorMessage(err) });
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. Failed auto-charges (from stripe-auto-charge at 2AM)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: failedCharges } = await supabase
      .from("stripe_charges_log")
      .select("empresa_id, prestamo_id, monto, error_mensaje, cliente_id")
      .eq("status", "failed")
      .gte("created_at", today);

    // Group by empresa
    const failedByEmpresa = new Map<string, FailedCharge[]>();
    for (const charge of (failedCharges || []) as FailedCharge[]) {
      const arr = failedByEmpresa.get(charge.empresa_id) || [];
      arr.push(charge);
      failedByEmpresa.set(charge.empresa_id, arr);
    }

    for (const [empresaId, charges] of failedByEmpresa) {
      // Check if already notified
      if (await alreadyNotifiedToday(supabase, empresaId, "alerta_cobro_fallido", today)) continue;

      const { data: empData } = await supabase
        .from("empresas")
        .select("nombre")
        .eq("id", empresaId)
        .single();

      const detalle = charges.map(c =>
        `• Préstamo ${c.prestamo_id.slice(0, 8)} — $${c.monto.toFixed(2)} — ${c.error_mensaje || "Error"}`
      ).join("\n");

      await notifyEmpresaAdmins(supabase, empresaId,
        `⚠️ *${empData?.nombre || "tu empresa"}* — Cobros automáticos fallidos\n\n` +
        `Los siguientes cobros automáticos de hoy no se pudieron procesar:\n\n` +
        `${detalle}\n\n` +
        `Verifica los métodos de pago de tus clientes en la app. 📱`,
        "alerta_cobro_fallido",
      );
      // Notify Super Admin about failed charges
      const waConfig2 = await getSystemWaConfig(supabase);
      if (waConfig2) {
        await notifySuperAdmin(supabase, waConfig2.api_url, waConfig2.api_token,
          `❌ *Cobros fallidos*\n\n` +
          `🏢 *${empData?.nombre || empresaId}*\n` +
          `📊 ${charges.length} cobro${charges.length > 1 ? "s" : ""} fallido${charges.length > 1 ? "s" : ""}\n\n` +
          `${detalle}\n\n` +
          `⚠️ Requiere seguimiento.`
        );
      }

      results.push({ empresa_id: empresaId, action: "cobro_fallido_notificado", count: charges.length });
    }

    logStep("Billing notifications complete", { resultsCount: results.length });

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}));
