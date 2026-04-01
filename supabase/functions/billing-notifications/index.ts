import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[BILLING-NOTIF] ${step}${d}`);
};

const DIAS_GRACIA = 3;
const SUPERADMIN_PHONE = "523171035768";

// ── Notify Super Admin directly ──
async function notifySuperAdmin(
  apiUrl: string,
  apiToken: string,
  mensaje: string,
) {
  const candidates = getPhoneCandidates(SUPERADMIN_PHONE);
  const result = await sendWhatsAppWithFallback(apiUrl, apiToken, mensaje, candidates);
  logStep("SuperAdmin WA", { success: result.success });
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

async function sendWhatsAppWithFallback(
  apiUrl: string,
  apiToken: string,
  mensaje: string,
  candidates: string[],
) {
  for (const candidate of candidates) {
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "x-api-token": apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-text", phone: candidate, message: mensaje }),
      });
      const raw = await res.text();
      let response: any = raw;
      try { response = JSON.parse(raw); } catch { /* keep raw */ }
      if (res.ok) return { success: true, phoneUsed: candidate, response };
    } catch (e: any) {
      logStep("WA attempt exception", { phone: candidate, error: e?.message });
    }
  }
  return { success: false, phoneUsed: candidates[0] || null };
}

async function getSystemWaConfig(supabase: any) {
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
  supabase: any,
  empresaId: string,
  mensaje: string,
  tipo: string,
) {
  try {
    const waConfig = await getSystemWaConfig(supabase);
    if (!waConfig) { logStep("No WA config found"); return; }

    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!admins?.length) return;

    const adminIds = admins.map((a: any) => a.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("telefono, nombre_completo")
      .eq("empresa_id", empresaId)
      .in("id", adminIds);

    for (const profile of (profiles || [])) {
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
        error_detalle: result.success ? null : "No se pudo entregar",
      });
    }
  } catch (e: any) {
    logStep("notifyEmpresaAdmins error", { error: e.message });
  }
}

const formatMXN = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const results: any[] = [];

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
      const { data: alreadyNotified } = await supabase
        .from("whatsapp_log")
        .select("id")
        .eq("empresa_id", factura.empresa_id)
        .eq("tipo", "factura_generada")
        .gte("created_at", today)
        .limit(1);

      if (alreadyNotified?.length) continue;

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
      const { data: alreadyNotified } = await supabase
        .from("whatsapp_log")
        .select("id")
        .eq("empresa_id", factura.empresa_id)
        .eq("tipo", "pago_exitoso")
        .gte("created_at", today)
        .limit(1);

      if (alreadyNotified?.length) continue;

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
        const adminEmails = (adminMap[factura.empresa_id] || []).map((a: any) => a.email).join(", ") || "—";
        await notifySuperAdmin(waConfig.api_url, waConfig.api_token,
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
      const { data: alreadyNotified } = await supabase
        .from("whatsapp_log")
        .select("id")
        .eq("empresa_id", sub.empresa_id)
        .eq("tipo", "suscripcion_suspendida")
        .gte("created_at", today)
        .limit(1);

      if (alreadyNotified?.length) continue;

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
        await notifySuperAdmin(waConfig3.api_url, waConfig3.api_token,
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
        const { data: empData } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();
        const empresaNombre = empData?.nombre || "tu empresa";

        // Get admin for Stripe checkout
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = (adminRoles || []).map((a: any) => a.user_id);
        const { data: adminProfiles } = await supabase
          .from("profiles")
          .select("id, nombre_completo, telefono")
          .eq("empresa_id", sub.empresa_id)
          .in("id", adminIds);
        const adminProfile = (adminProfiles || [])[0];
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
            const lineItems: any[] = [{ price: sub.planes.stripe_price_id, quantity: 1 }];
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

            const sessionParams: any = {
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
          } catch (stripeErr: any) {
            logStep("Error creating checkout", { empresa_id: sub.empresa_id, error: stripeErr?.message });
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
      } catch (err: any) {
        logStep("Error expiration reminder", { empresa_id: sub.empresa_id, error: err?.message });
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
    const failedByEmpresa = new Map<string, any[]>();
    for (const charge of (failedCharges || [])) {
      const arr = failedByEmpresa.get(charge.empresa_id) || [];
      arr.push(charge);
      failedByEmpresa.set(charge.empresa_id, arr);
    }

    for (const [empresaId, charges] of failedByEmpresa) {
      // Check if already notified
      const { data: alreadyNotified } = await supabase
        .from("whatsapp_log")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("tipo", "alerta_cobro_fallido")
        .gte("created_at", today)
        .limit(1);
      if (alreadyNotified?.length) continue;

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
        await notifySuperAdmin(waConfig2.api_url, waConfig2.api_token,
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
});
