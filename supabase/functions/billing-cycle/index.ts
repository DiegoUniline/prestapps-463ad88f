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
            fecha_vencimiento: new Date(now.getFullYear(), now.getMonth(), 1 + DIAS_GRACIA).toISOString(),
          });

          if (facErr) {
            logStep("Error creating invoice", { empresa_id: sub.empresa_id, error: facErr.message });
          } else {
            logStep("Invoice created", { empresa_id: sub.empresa_id, total, isStripeBilled });
          }

          // ── For manual subs with Stripe customer — attempt charge ──
          if (!isStripeBilled && stripe && sub.stripe_customer_id) {
            try {
              // Get default payment method from Stripe
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
                  // Update invoice to paid
                  await supabase.from("facturas")
                    .update({
                      estado: "pagada",
                      fecha_pago: now.toISOString(),
                      stripe_payment_intent_id: pi.id,
                    })
                    .eq("empresa_id", sub.empresa_id)
                    .eq("periodo_inicio", periodoInicio);

                  // Update next billing date
                  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
                  await supabase.from("suscripciones")
                    .update({
                      fecha_proximo_cobro: nextMonth.toISOString().split("T")[0],
                      actualizado_en: now.toISOString(),
                    })
                    .eq("id", sub.id);

                  logStep("Manual sub charged successfully", { empresa_id: sub.empresa_id, amount: total });
                  results.push({ empresa_id: sub.empresa_id, action: "charged", amount: total });
                } else {
                  throw new Error(`PaymentIntent status: ${pi.status}`);
                }
              } else {
                // No payment method — set to gracia
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
            // No Stripe at all — set to gracia
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
      } else {
        logStep("Still in grace", { empresa_id: sub.empresa_id, daysLeft: DIAS_GRACIA - daysSinceGracia });
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
