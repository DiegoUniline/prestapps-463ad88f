import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[BILLING-CYCLE] ${step}${d}`);
};

const DIAS_GRACIA = 3;

// ── WhatsApp helpers ──────────────────────────────
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
      logStep("WA attempt failed", { phone: candidate, status: res.status });
    } catch (e: any) {
      logStep("WA attempt exception", { phone: candidate, error: e?.message });
    }
  }
  return { success: false, phoneUsed: candidates[0] || null };
}

async function notifyEmpresaAdmins(
  supabase: any,
  empresaId: string,
  mensaje: string,
  tipo: string,
) {
  try {
    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_url, api_token, activo")
      .eq("empresa_id", empresaId)
      .single();

    if (!waConfig?.activo) return;

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

// ── Format helpers ──
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
    { auth: { persistSession: false } }
  );

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const isFirstOfMonth = now.getUTCDate() === 1;

  const results: any[] = [];

  try {
    logStep("Function started", { today, isFirstOfMonth });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PART 1: On the 1st — Generate invoices for active suscripciones
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isFirstOfMonth) {
      logStep("First of month — generating invoices");

      const { data: activeSubs, error: subErr } = await supabase
        .from("suscripciones")
        .select("*, planes(*)")
        .eq("estado", "activa");

      if (subErr) throw subErr;
      logStep("Active suscripciones found", { count: activeSubs?.length || 0 });

      for (const sub of activeSubs || []) {
        try {
          const plan = sub.planes;
          const extraUsers = Math.max(0, sub.num_usuarios - (plan?.usuarios_incluidos || 1));
          const subtotal = sub.precio_base + (extraUsers * sub.precio_usuario_extra);
          const descuento = sub.descuento_porcentaje || 0;
          const total = subtotal * (1 - descuento / 100);

          // Check if invoice already exists for this period
          const periodoInicio = today;
          const periodoFin = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
            .toISOString().split("T")[0];

          const { data: existing } = await supabase
            .from("facturas")
            .select("id")
            .eq("empresa_id", sub.empresa_id)
            .eq("periodo_inicio", periodoInicio)
            .maybeSingle();

          if (existing) {
            logStep("Invoice already exists, skipping", { empresa_id: sub.empresa_id });
            continue;
          }

          const facNum = `FAC-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;

          // For Stripe subs — Stripe handles billing, invoice will be updated by webhook
          // For manual or non-Stripe — create pending invoice
          const isStripeBilled = !!sub.stripe_subscription_id;

          const fechaVencimiento = new Date(now.getFullYear(), now.getMonth(), 1 + DIAS_GRACIA);

          const { error: facErr } = await supabase.from("facturas").insert({
            empresa_id: sub.empresa_id,
            suscripcion_id: sub.id,
            numero_factura: facNum,
            periodo_inicio: periodoInicio,
            periodo_fin: periodoFin,
            num_usuarios: sub.num_usuarios,
            precio_unitario: sub.precio_base,
            descuento_porcentaje: descuento,
            subtotal,
            total,
            estado: isStripeBilled ? "procesando" : "pendiente",
            fecha_vencimiento: fechaVencimiento.toISOString(),
          });

          if (facErr) {
            logStep("Error creating invoice", { empresa_id: sub.empresa_id, error: facErr.message });
          } else {
            logStep("Invoice created", { empresa_id: sub.empresa_id, total, isStripeBilled });
          }

          // ── Get empresa name for WA messages ──
          const { data: empresaData } = await supabase
            .from("empresas")
            .select("nombre")
            .eq("id", sub.empresa_id)
            .single();
          const empresaNombre = empresaData?.nombre || "tu empresa";
          const planNombre = plan?.nombre || "tu plan";
          const mesNombre = now.toLocaleDateString("es-MX", { month: "long", year: "numeric" });

          // ── Send WhatsApp: Invoice generated notification ──
          if (isStripeBilled) {
            // Stripe will auto-charge — friendly heads-up
            await notifyEmpresaAdmins(supabase, sub.empresa_id,
              `Hola 👋 *${empresaNombre}*\n\n` +
              `Gracias por usar *PrestApps*. Hemos generado tu factura del mes de *${mesNombre}*.\n\n` +
              `🧾 *${facNum}*\n` +
              `💵 *${formatMXN(total)} MXN* · ${planNombre} (${sub.num_usuarios} usuario${sub.num_usuarios > 1 ? "s" : ""})\n\n` +
              `💳 Se cobrará automáticamente a tu tarjeta.\n` +
              `Si el cobro falla, cuentas con *${DIAS_GRACIA} días* antes de que se pause tu servicio.\n\n` +
              `¿Necesitas cambiar tu tarjeta? Entra a *Mi Suscripción* en la app. 📱`,
              "factura_generada",
            );
          } else {
            // Manual / no-stripe — let them know they need to pay
            await notifyEmpresaAdmins(supabase, sub.empresa_id,
              `Hola 👋 *${empresaNombre}*\n\n` +
              `Gracias por usar *PrestApps*. Tu factura de *${mesNombre}* ya está lista.\n\n` +
              `🧾 *${facNum}*\n` +
              `💵 *${formatMXN(total)} MXN* · ${planNombre} (${sub.num_usuarios} usuario${sub.num_usuarios > 1 ? "s" : ""})\n` +
              `📅 Fecha límite: *${formatDate(fechaVencimiento)}*\n\n` +
              `Tienes *${DIAS_GRACIA} días* para pagar sin que se interrumpa tu servicio.\n\n` +
              `👉 Entra a *Mi Suscripción* en la app para completar tu pago. 📱`,
              "factura_generada",
            );
          }

          // ── For manual subs with Stripe customer — attempt charge ──
          if (!isStripeBilled && stripe && sub.stripe_customer_id) {
            try {
              const customer = await stripe.customers.retrieve(sub.stripe_customer_id);
              const pmId = typeof customer !== "string" && !customer.deleted
                ? (customer.invoice_settings?.default_payment_method as string) || null
                : null;

              if (pmId && total > 0) {
                const amountCents = Math.round(total * 100);
                const pi = await stripe.paymentIntents.create({
                  amount: amountCents,
                  currency: "mxn",
                  customer: sub.stripe_customer_id,
                  payment_method: pmId,
                  off_session: true,
                  confirm: true,
                  metadata: {
                    empresa_id: sub.empresa_id,
                    suscripcion_id: sub.id,
                    billing_cycle: "monthly",
                  },
                });

                if (pi.status === "succeeded") {
                  await supabase.from("facturas")
                    .update({
                      estado: "pagada",
                      fecha_pago: now.toISOString(),
                      stripe_payment_intent_id: pi.id,
                    })
                    .eq("empresa_id", sub.empresa_id)
                    .eq("periodo_inicio", periodoInicio);

                  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
                  await supabase.from("suscripciones")
                    .update({
                      fecha_proximo_cobro: nextMonth.toISOString().split("T")[0],
                      actualizado_en: now.toISOString(),
                    })
                    .eq("id", sub.id);

                  logStep("Manual sub charged successfully", { empresa_id: sub.empresa_id, amount: total });
                  results.push({ empresa_id: sub.empresa_id, action: "charged", amount: total });

                  // WA: Payment successful
                  await notifyEmpresaAdmins(supabase, sub.empresa_id,
                    `✅ *${empresaNombre}* — Pago confirmado\n\n` +
                    `Tu pago de *${formatMXN(total)} MXN* del mes de *${mesNombre}* se procesó correctamente.\n\n` +
                    `🧾 ${facNum}\n` +
                    `📅 Próximo cobro: *${formatDate(nextMonth)}*\n\n` +
                    `¡Sigue creciendo tu negocio con *PrestApps*! 💪`,
                    "pago_exitoso",
                  );
                } else {
                  throw new Error(`PaymentIntent status: ${pi.status}`);
                }
              } else {
                await supabase.from("suscripciones")
                  .update({ estado: "gracia", actualizado_en: now.toISOString() })
                  .eq("id", sub.id);
                logStep("No payment method, set to gracia", { empresa_id: sub.empresa_id });
                results.push({ empresa_id: sub.empresa_id, action: "gracia", reason: "no_payment_method" });
              }
            } catch (chargeErr: any) {
              const msg = chargeErr instanceof Error ? chargeErr.message : String(chargeErr);
              logStep("Charge failed, set to gracia", { empresa_id: sub.empresa_id, error: msg });

              await supabase.from("suscripciones")
                .update({ estado: "gracia", actualizado_en: now.toISOString() })
                .eq("id", sub.id);

              results.push({ empresa_id: sub.empresa_id, action: "gracia", reason: "charge_failed", error: msg });
            }
          } else if (!isStripeBilled && !sub.stripe_customer_id) {
            await supabase.from("suscripciones")
              .update({ estado: "gracia", actualizado_en: now.toISOString() })
              .eq("id", sub.id);
            logStep("No Stripe customer, set to gracia", { empresa_id: sub.empresa_id });
            results.push({ empresa_id: sub.empresa_id, action: "gracia", reason: "no_stripe_customer" });
          }
        } catch (subErr: any) {
          logStep("Error processing sub", { empresa_id: sub.empresa_id, error: String(subErr) });
          results.push({ empresa_id: sub.empresa_id, action: "error", error: String(subErr) });
        }
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PART 2: Daily — Enforce grace period (3 days → suspendida)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logStep("Checking grace period enforcement");

    const { data: graciaSubs } = await supabase
      .from("suscripciones")
      .select("id, empresa_id, actualizado_en")
      .eq("estado", "gracia");

    for (const sub of graciaSubs || []) {
      const graciaStart = sub.actualizado_en ? new Date(sub.actualizado_en) : now;
      const daysSinceGracia = Math.floor((now.getTime() - graciaStart.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceGracia >= DIAS_GRACIA) {
        await supabase.from("suscripciones")
          .update({ estado: "suspendida", actualizado_en: now.toISOString() })
          .eq("id", sub.id);

        logStep("Grace expired → suspendida", { empresa_id: sub.empresa_id, daysSinceGracia });
        results.push({ empresa_id: sub.empresa_id, action: "suspendida", daysSinceGracia });

        // ── WA: Subscription suspended ──
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
      } else {
        const daysLeft = DIAS_GRACIA - daysSinceGracia;
        logStep("Still in grace", { empresa_id: sub.empresa_id, daysLeft });

        // ── WA: Daily grace reminder (only if >0 days passed) ──
        if (daysSinceGracia > 0) {
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
        }
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PART 3: Daily — Notify 1 day before expiration with Stripe payment link
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logStep("Checking subscriptions expiring tomorrow");

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: expiringSubs } = await supabase
      .from("suscripciones")
      .select("*, planes(*)")
      .in("estado", ["trial", "activa"])
      .eq("fecha_vencimiento", tomorrowStr);

    logStep("Expiring tomorrow", { count: expiringSubs?.length || 0 });

    for (const sub of expiringSubs || []) {
      try {
        const { data: empData } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();
        const empresaNombre = empData?.nombre || "tu empresa";

        // Get admin email and info for Stripe customer
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
        if (!adminProfile) {
          logStep("No admin found for empresa, skipping", { empresa_id: sub.empresa_id });
          continue;
        }

        // Get admin email from auth
        const { data: authData } = await supabase.auth.admin.getUserById(adminProfile.id);
        const adminEmail = authData?.user?.email;

        let checkoutUrl = "";

        if (stripe && sub.plan_id && sub.planes?.stripe_price_id) {
          try {
            // Find or create Stripe customer
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

            // Anchor billing to 1st of month after expiration
            const postExpiry = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);
            const nextFirst = new Date(Date.UTC(postExpiry.getUTCFullYear(), postExpiry.getUTCMonth() + 1, 1));
            const anchorTs = Math.floor(nextFirst.getTime() / 1000);

            const sessionParams: any = {
              line_items: lineItems,
              mode: "subscription",
              success_url: `https://prestapps.lovable.app/mi-suscripcion?checkout=success`,
              cancel_url: `https://prestapps.lovable.app/mi-suscripcion?checkout=cancel`,
              metadata: {
                empresa_id: sub.empresa_id,
                plan_id: sub.plan_id,
                num_usuarios: String(sub.num_usuarios),
                renewal: "true",
              },
              subscription_data: {
                billing_cycle_anchor: anchorTs,
                proration_behavior: "create_prorations",
                metadata: {
                  empresa_id: sub.empresa_id,
                  plan_id: sub.plan_id,
                  num_usuarios: String(sub.num_usuarios),
                },
              },
            };

            if (customerId) {
              sessionParams.customer = customerId;
            } else if (adminEmail) {
              sessionParams.customer_email = adminEmail;
            }

            const session = await stripe.checkout.sessions.create(sessionParams);
            checkoutUrl = session.url || "";
            logStep("Checkout session created for renewal", { empresa_id: sub.empresa_id, sessionId: session.id });
          } catch (stripeErr: any) {
            logStep("Error creating checkout for renewal", { empresa_id: sub.empresa_id, error: stripeErr?.message });
          }
        }

        // Build the WhatsApp message
        const planNombre = sub.planes?.nombre || "tu plan";
        const precio = sub.planes?.precio_base_mes
          ? formatMXN(sub.planes.precio_base_mes)
          : "";
        const esTrial = sub.estado === "trial";
        const fechaVenc = formatDate(tomorrow);

        let mensaje = "";

        if (esTrial) {
          mensaje =
            `¡Hola! 👋\n\n` +
            `Tu periodo de prueba gratuito de *PrestApps* para *${empresaNombre}* vence *mañana ${fechaVenc}*. ⏰\n\n` +
            `🎯 ¡No pierdas todo lo que has avanzado!\n\n` +
            `Para seguir usando la plataforma sin interrupción, activa tu plan ahora:\n\n` +
            `📦 *Plan:* ${planNombre}\n` +
            (precio ? `💰 *Desde:* ${precio} MXN/mes\n\n` : "\n") +
            (checkoutUrl
              ? `👉 *Paga aquí y renueva al instante:*\n${checkoutUrl}\n\n`
              : `👉 Ingresa a *Mi Suscripción* en la app para elegir tu plan.\n\n`) +
            `Tu información está segura 🔐 y lista para que sigas creciendo tu negocio.\n\n` +
            `¡Gracias por probar *PrestApps*! 🚀`;
        } else {
          mensaje =
            `¡Hola! 👋\n\n` +
            `Te recordamos que tu suscripción de *${empresaNombre}* vence *mañana ${fechaVenc}*. ⏰\n\n` +
            `📦 *Plan:* ${planNombre}\n` +
            (precio ? `💰 *Monto:* ${precio} MXN/mes\n\n` : "\n") +
            `Para que no se interrumpa tu servicio, renueva ahora:\n\n` +
            (checkoutUrl
              ? `👉 *Paga aquí con un clic:*\n${checkoutUrl}\n\n`
              : `👉 Ingresa a *Mi Suscripción* en la app para renovar.\n\n`) +
            `Al pagar, tu plan se renueva automáticamente a partir del día siguiente. ✅\n\n` +
            `Tus datos están seguros y listos para seguir trabajando. 🔐\n\n` +
            `¡Gracias por confiar en *PrestApps*! 🚀`;
        }

        await notifyEmpresaAdmins(supabase, sub.empresa_id, mensaje, "recordatorio_vencimiento");

        logStep("Expiration reminder sent", { empresa_id: sub.empresa_id, esTrial, hasCheckoutUrl: !!checkoutUrl });
        results.push({ empresa_id: sub.empresa_id, action: "expiration_reminder", esTrial });
      } catch (err: any) {
        logStep("Error processing expiration reminder", { empresa_id: sub.empresa_id, error: err?.message });
        results.push({ empresa_id: sub.empresa_id, action: "reminder_error", error: err?.message });
      }
    }

    logStep("Billing cycle complete", { resultsCount: results.length });

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