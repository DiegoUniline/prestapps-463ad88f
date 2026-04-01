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

async function getSystemWaConfig(supabase: any) {
  try {
    // Get system token
    const { data } = await supabase
      .from("system_notification_templates")
      .select("message_template")
      .eq("template_key", "__system_wa_config")
      .maybeSingle();
    if (!data?.message_template) return null;
    const cfg = JSON.parse(data.message_template);
    if (!cfg.api_token) return null;

    // Get shared API URL from any empresa's whatsapp_config
    const { data: anyWa } = await supabase
      .from("whatsapp_config")
      .select("api_url")
      .limit(1)
      .maybeSingle();

    const api_url = cfg.api_url || anyWa?.api_url;
    if (!api_url) return null;

    return { api_url, api_token: cfg.api_token };
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
    // Use SYSTEM WA config (PrestApps central API)
    const waConfig = await getSystemWaConfig(supabase);
    if (!waConfig) return;

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

          // (WA notifications are sent by billing-notifications at 9AM)

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

                  // (WA notification sent by billing-notifications at 9AM)
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

        // (WA notification sent by billing-notifications at 9AM)
      } else {
        const daysLeft = DIAS_GRACIA - daysSinceGracia;
        logStep("Still in grace", { empresa_id: sub.empresa_id, daysLeft });
        // (WA notification sent by billing-notifications at 9AM)
      }
    }

    // PART 3: Expiration reminders are now handled by billing-notifications at 9AM

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