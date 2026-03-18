import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    logStep("ERROR", { message: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET" });
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    logStep("ERROR", { message: "No stripe-signature header" });
    return new Response("No signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("Signature verification failed", { message: msg });
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      // ── Checkout completed: activate subscription ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const empresaId = session.metadata?.empresa_id;
        const planId = session.metadata?.plan_id;
        const numUsuarios = parseInt(session.metadata?.num_usuarios || "1");
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        if (!empresaId) {
          logStep("No empresa_id in metadata, skipping");
          break;
        }

        logStep("Checkout completed", { empresaId, planId, subscriptionId, customerId });

        // Retrieve subscription to get payment method details
        let cardBrand: string | null = null;
        let cardLast4: string | null = null;
        let paymentMethodId: string | null = null;

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId, {
              expand: ["default_payment_method"],
            });
            const pm = sub.default_payment_method as Stripe.PaymentMethod | null;
            if (pm?.card) {
              cardBrand = pm.card.brand;
              cardLast4 = pm.card.last4;
              paymentMethodId = pm.id;
            }
          } catch (e) {
            logStep("Could not retrieve payment method", { error: String(e) });
          }
        }

        // Update suscripciones record
        const { error: updateError } = await supabase
          .from("suscripciones")
          .update({
            estado: "activa",
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            stripe_payment_method_id: paymentMethodId,
            card_brand: cardBrand,
            card_last4: cardLast4,
            num_usuarios: numUsuarios,
            actualizado_en: new Date().toISOString(),
          })
          .eq("empresa_id", empresaId)
          .eq("estado", "pendiente_pago");

        if (updateError) {
          logStep("Error updating subscription", { error: updateError.message });
        } else {
          logStep("Subscription activated", { empresaId });
        }
        break;
      }

      // ── Invoice paid: keep subscription active, log factura ──
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        logStep("Invoice paid", { subscriptionId, amount: invoice.amount_paid });

        // Find suscripcion by stripe_subscription_id
        const { data: sub } = await supabase
          .from("suscripciones")
          .select("id, empresa_id, plan_id, num_usuarios, precio_base, descuento_porcentaje")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (!sub) {
          logStep("No matching subscription found for invoice");
          break;
        }

        // Update estado to activa and next billing date
        const nextBilling = invoice.lines?.data?.[0]?.period?.end;
        const fechaProximoCobro = nextBilling
          ? new Date(nextBilling * 1000).toISOString().split("T")[0]
          : undefined;

        await supabase
          .from("suscripciones")
          .update({
            estado: "activa",
            ...(fechaProximoCobro && { fecha_proximo_cobro: fechaProximoCobro }),
            actualizado_en: new Date().toISOString(),
          })
          .eq("id", sub.id);

        // Record factura
        const periodStart = invoice.lines?.data?.[0]?.period?.start;
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        const now = new Date();
        const facNum = `FAC-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;

        await supabase.from("facturas").insert({
          empresa_id: sub.empresa_id,
          suscripcion_id: sub.id,
          numero_factura: facNum,
          periodo_inicio: periodStart ? new Date(periodStart * 1000).toISOString().split("T")[0] : now.toISOString().split("T")[0],
          periodo_fin: periodEnd ? new Date(periodEnd * 1000).toISOString().split("T")[0] : now.toISOString().split("T")[0],
          num_usuarios: sub.num_usuarios,
          precio_unitario: sub.precio_base,
          descuento_porcentaje: sub.descuento_porcentaje || 0,
          subtotal: (invoice.amount_paid || 0) / 100,
          total: (invoice.amount_paid || 0) / 100,
          estado: "pagada",
          fecha_pago: now.toISOString(),
          stripe_invoice_id: invoice.id,
          stripe_payment_intent_id: invoice.payment_intent as string || null,
        });

        logStep("Invoice recorded", { empresaId: sub.empresa_id });
        break;
      }

      // ── Subscription updated (e.g. past_due) ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const subId = sub.id;

        let dbEstado: string;
        if (sub.status === "active") dbEstado = "activa";
        else if (sub.status === "past_due") dbEstado = "gracia";
        else if (sub.status === "unpaid") dbEstado = "suspendida";
        else dbEstado = sub.status;

        logStep("Subscription updated", { subId, stripeStatus: sub.status, dbEstado });

        await supabase
          .from("suscripciones")
          .update({ estado: dbEstado, actualizado_en: new Date().toISOString() })
          .eq("stripe_subscription_id", subId);

        break;
      }

      // ── Subscription deleted/cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted", { subId: sub.id });

        await supabase
          .from("suscripciones")
          .update({ estado: "cancelada", actualizado_en: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);

        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR processing event", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
