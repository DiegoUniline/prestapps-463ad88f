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

function getReadableError(code: string, message: string): string {
  const map: Record<string, string> = {
    card_declined: "Tu tarjeta fue rechazada por el banco",
    insufficient_funds: "Fondos insuficientes en la tarjeta",
    expired_card: "Tu tarjeta está vencida",
    incorrect_cvc: "El código de seguridad (CVC) es incorrecto",
    processing_error: "Error temporal al procesar el pago",
    lost_card: "La tarjeta fue reportada como perdida",
    stolen_card: "La tarjeta fue reportada como robada",
    generic_decline: "El banco rechazó la transacción",
    authentication_required: "Se requiere autenticación adicional (3D Secure)",
    payment_intent_payment_attempt_failed: "No se pudo completar el cobro",
  };
  return map[code] || message || "Error al procesar el pago";
}

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

        // Send WhatsApp success notification
        const invoiceAmount = ((invoice.amount_paid || 0) / 100).toFixed(2);
        const { data: empresaInfo } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();
        const empNombre = empresaInfo?.nombre || "tu empresa";
        const proxCobro = fechaProximoCobro
          ? new Date(fechaProximoCobro + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
          : "próximo mes";

        await sendWhatsAppAlert(supabase, sub.empresa_id, {
          tipo: "pago_exitoso",
          mensaje: `¡Hola! 🎉\n\n` +
            `Tu pago de suscripción de *${empNombre}* se procesó correctamente.\n\n` +
            `✅ *Monto cobrado:* $${invoiceAmount} MXN\n` +
            `📅 *Próximo cobro:* ${proxCobro}\n` +
            `🧾 *Factura:* ${facNum}\n\n` +
            `Gracias por confiar en *PrestApps*. ¡Sigue creciendo tu negocio! 🚀\n\n` +
            `Si tienes dudas sobre tu factura, responde a este mensaje. 💬`,
        });

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

      // ── Charge failed — notify admin via WhatsApp ──
      case "charge.failed": {
        const charge = event.data.object as Stripe.Charge;
        const customerEmail = charge.billing_details?.email || charge.receipt_email || "desconocido";
        const amount = ((charge.amount || 0) / 100).toFixed(2);
        const currency = (charge.currency || "mxn").toUpperCase();
        const failureMessage = charge.failure_message || "Error desconocido";
        const failureCode = charge.failure_code || "N/A";

        logStep("Charge failed", { customerEmail, amount, failureCode, failureMessage });

        // Find empresa by stripe customer
        const customerId = charge.customer as string;
        if (customerId) {
          const { data: suscripcionData } = await supabase
            .from("suscripciones")
            .select("empresa_id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (suscripcionData?.empresa_id) {
            // Get empresa name for personalized message
            const { data: empresaData } = await supabase
              .from("empresas")
              .select("nombre")
              .eq("id", suscripcionData.empresa_id)
              .single();
            const empresaNombre = empresaData?.nombre || "tu empresa";

            const friendlyError = getReadableError(failureCode, failureMessage);

            await sendWhatsAppAlert(supabase, suscripcionData.empresa_id, {
              tipo: "pago_fallido",
              mensaje: `¡Hola! 👋\n\n` +
                `Te escribimos de *PrestApps* porque no pudimos procesar tu pago de suscripción para *${empresaNombre}*.\n\n` +
                `💰 *Monto:* $${amount} ${currency}\n` +
                `❌ *Motivo:* ${friendlyError}\n\n` +
                `🔄 *¿Qué puedes hacer?*\n` +
                `1️⃣ Verifica que tu tarjeta tenga fondos suficientes\n` +
                `2️⃣ Actualiza tu método de pago desde la app en *Mi Suscripción*\n` +
                `3️⃣ Si el problema persiste, contacta a tu banco\n\n` +
                `Tu acceso no se verá afectado de inmediato, pero te recomendamos regularizar tu pago lo antes posible para evitar interrupciones. 🙏\n\n` +
                `¿Necesitas ayuda? Responde a este mensaje y con gusto te asistimos. 💬`,
            });
          }
        }
        break;
      }

      // ── Payment intent failed ──
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        logStep("Payment intent failed", { id: pi.id, status: pi.status });
        // Already handled by charge.failed above
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

// ── WhatsApp alert helper ──────────────────────────
function normalizePhone(phone: string): string {
  return String(phone || "").replace(/\D/g, "");
}

function getPhoneCandidates(phone: string, ladaPais: string = "52"): string[] {
  const raw = String(phone || "").trim();
  const digits = normalizePhone(raw);
  const lada = normalizePhone(ladaPais);
  const candidates = new Set<string>();

  if (raw) candidates.add(raw);
  if (digits) candidates.add(digits);

  // If phone looks like a local number (no country code), prepend lada
  // Common local lengths: 10 (MX, CO), 9 (PE, CL), 8, 11 (BR)
  if (digits.length >= 8 && digits.length <= 11 && !digits.startsWith(lada)) {
    candidates.add(`${lada}${digits}`);
    // MX special: also try with 1 after country code
    if (lada === "52") {
      candidates.add(`521${digits}`);
    }
  }

  // If already has lada + local, also try MX variant with 1
  if (lada === "52" && digits.startsWith("52") && !digits.startsWith("521")) {
    candidates.add(`521${digits.slice(2)}`);
  }
  if (lada === "52" && digits.startsWith("521")) {
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
  let lastError: any = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "x-api-token": apiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "send-text",
          phone: candidate,
          message: mensaje,
        }),
      });

      const raw = await res.text();
      let response: any = raw;
      try {
        response = raw ? JSON.parse(raw) : null;
      } catch {
        // keep raw text
      }

      if (res.ok) {
        return { success: true, phoneUsed: candidate, response };
      }

      lastError = { status: res.status, response, phoneTried: candidate };
      logStep("WhatsApp attempt failed", { phone: candidate, status: res.status });
    } catch (e: any) {
      lastError = { message: e?.message || "Unknown error", phoneTried: candidate };
      logStep("WhatsApp attempt exception", { phone: candidate, error: e?.message });
    }
  }

  return { success: false, phoneUsed: candidates[0] || null, error: lastError };
}

async function sendWhatsAppAlert(
  supabase: any,
  empresaId: string,
  opts: { tipo: string; mensaje: string }
) {
  try {
    // Get WhatsApp config
    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_url, api_token, activo")
      .eq("empresa_id", empresaId)
      .single();

    if (!waConfig?.activo) {
      logStep("WhatsApp not active for empresa", { empresaId });
      return;
    }

    // Get empresa lada_pais
    const { data: empresaData } = await supabase
      .from("empresas")
      .select("lada_pais")
      .eq("id", empresaId)
      .single();
    const ladaPais = empresaData?.lada_pais || "52";

    // Get admin profiles for this empresa
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!admins?.length) {
      logStep("No admin users found");
      return;
    }

    const adminIds = admins.map((a: any) => a.user_id);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("telefono, nombre_completo")
      .eq("empresa_id", empresaId)
      .in("id", adminIds);

    for (const profile of (profiles || [])) {
      if (!profile.telefono) continue;

      const phoneCandidates = getPhoneCandidates(profile.telefono, ladaPais);
      if (!phoneCandidates.length) continue;

      const result = await sendWhatsAppWithFallback(
        waConfig.api_url,
        waConfig.api_token,
        opts.mensaje,
        phoneCandidates,
      );

      logStep("WhatsApp alert sent", {
        originalPhone: profile.telefono,
        phoneUsed: result.phoneUsed,
        success: result.success,
        ladaPais,
      });

      await supabase.from("whatsapp_log").insert({
        empresa_id: empresaId,
        telefono: result.phoneUsed || profile.telefono,
        tipo: "alerta_pago",
        mensaje: opts.mensaje,
        status: result.success ? "enviado" : "error",
        error_detalle: result.success ? null : JSON.stringify(result.error || null),
      });
    }
  } catch (e: any) {
    logStep("sendWhatsAppAlert error", { error: e.message });
  }
}
