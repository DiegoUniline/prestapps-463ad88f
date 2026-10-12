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

const logStep = (step: string, details?: unknown) => {
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

// Pre-"basil" top-level fields; the current Stripe typings no longer declare them.
type InvoiceLegacy = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
};
type ChargeLegacy = Stripe.Charge & { invoice?: string | Stripe.Invoice | null };

interface AdminProfile {
  id: string;
  telefono: string | null;
  nombre_completo: string;
}

// Same semantics as `e?.message`: Error instances and plain error objects alike.
function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") return e.message;
  return undefined;
}

// True when the subscription already has a paid invoice covering today.
async function hasPaidCurrentPeriod(supabase: SupabaseClient, suscripcionId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("facturas")
    .select("id")
    .eq("suscripcion_id", suscripcionId)
    .eq("estado", "pagada")
    .lte("periodo_inicio", today)
    .gte("periodo_fin", today)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

serve(withCors(async (req) => {
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

  // Dedupe: Stripe delivers at-least-once
  let eventRecorded = false;
  const { error: evErr } = await supabase.from("stripe_events").insert({ event_id: event.id, tipo: event.type });
  if (evErr) {
    if (evErr.code === "23505") {
      logStep("Duplicate event, skipping", { id: event.id });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("Could not record event (continuing)", { error: evErr.message });
  } else {
    eventRecorded = true;
  }

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
        const subscriptionId = (invoice as InvoiceLegacy).subscription as string;
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

        const periodoInicio = periodStart ? new Date(periodStart * 1000).toISOString().split("T")[0] : now.toISOString().split("T")[0];
        const piId = (invoice as InvoiceLegacy).payment_intent as string || null;
        let facturaNumero = facNum;

        // Idempotent on stripe_invoice_id: reuse the row billing-cycle/billing-fix-drafts may have created
        const { data: facExistente } = await supabase
          .from("facturas")
          .select("id, numero_factura")
          .eq("stripe_invoice_id", invoice.id)
          .limit(1)
          .maybeSingle();

        let facPendiente: { id: string; numero_factura: string | null } | null = null;
        if (!facExistente) {
          const { data } = await supabase
            .from("facturas")
            .select("id, numero_factura")
            .eq("suscripcion_id", sub.id)
            .eq("periodo_inicio", periodoInicio)
            .is("stripe_invoice_id", null)
            .in("estado", ["procesando", "pendiente"])
            .limit(1)
            .maybeSingle();
          facPendiente = data;
        }

        const facDestino = facExistente || facPendiente;
        if (facDestino) {
          facturaNumero = facDestino.numero_factura || facNum;
          await supabase.from("facturas").update({
            estado: "pagada",
            fecha_pago: now.toISOString(),
            stripe_invoice_id: invoice.id,
            stripe_payment_intent_id: piId,
          }).eq("id", facDestino.id);
        } else {
          const { error: facErr } = await supabase.from("facturas").insert({
            empresa_id: sub.empresa_id,
            suscripcion_id: sub.id,
            numero_factura: facNum,
            periodo_inicio: periodoInicio,
            periodo_fin: periodEnd ? new Date(periodEnd * 1000).toISOString().split("T")[0] : now.toISOString().split("T")[0],
            num_usuarios: sub.num_usuarios,
            precio_unitario: sub.precio_base,
            descuento_porcentaje: sub.descuento_porcentaje || 0,
            subtotal: (invoice.amount_paid || 0) / 100,
            total: (invoice.amount_paid || 0) / 100,
            estado: "pagada",
            fecha_pago: now.toISOString(),
            stripe_invoice_id: invoice.id,
            stripe_payment_intent_id: piId,
          });
          if (facErr && facErr.code !== "23505") logStep("Error recording factura", { error: facErr.message });
        }

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
            `🧾 *Factura:* ${facturaNumero}\n\n` +
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

        // Never downgrade an account that already paid the current period
        if (dbEstado === "gracia" || dbEstado === "suspendida") {
          const { data: dbSub } = await supabase
            .from("suscripciones")
            .select("id")
            .eq("stripe_subscription_id", subId)
            .maybeSingle();

          if (dbSub?.id && (await hasPaidCurrentPeriod(supabase, dbSub.id))) {
            logStep("Skip downgrade: current period already paid", { subId });
            break;
          }
        }

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
            .select("id, empresa_id, stripe_subscription_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();

          // Ignore charges coming from a duplicate / unlinked Stripe subscription
          let chargeSubId: string | null = null;
          try {
            const invoiceId = ((charge as ChargeLegacy).invoice as string) || null;
            if (invoiceId) {
              const inv = await stripe.invoices.retrieve(invoiceId);
              chargeSubId = ((inv as InvoiceLegacy).subscription as string) ||
                (inv.parent?.subscription_details?.subscription as string) || null;
            }
          } catch (e) {
            logStep("Could not resolve invoice for charge", { error: String(e) });
          }

          if (
            chargeSubId && suscripcionData?.stripe_subscription_id &&
            chargeSubId !== suscripcionData.stripe_subscription_id
          ) {
            logStep("Skip failed-charge alert: duplicate subscription", { chargeSubId });
            break;
          }

          if (suscripcionData?.id && (await hasPaidCurrentPeriod(supabase, suscripcionData.id))) {
            logStep("Skip failed-charge alert: current period already paid");
            break;
          }

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
    // Let Stripe's retry process the event again
    if (eventRecorded) await supabase.from("stripe_events").delete().eq("event_id", event.id);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}));

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
    logStep("WhatsApp attempt failed", { phone: candidate, error: r.error });
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

async function getSystemWaConfig(supabase: SupabaseClient) {
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

async function sendWhatsAppAlert(
  supabase: SupabaseClient,
  empresaId: string,
  opts: { tipo: string; mensaje: string }
) {
  try {
    // Use SYSTEM WA config (PrestApps central API)
    const waConfig = await getSystemWaConfig(supabase);

    if (!waConfig) {
      logStep("System WA config not set, skipping", { empresaId });
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
    const profiles = await getEmpresaAdmins(supabase, empresaId);
    if (!profiles.length) {
      logStep("No admin users found", { empresaId });
      return;
    }

    for (const profile of profiles) {
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
        error_detalle: result.success ? null : (result.error || "No se pudo entregar"),
      });
    }
  } catch (e) {
    logStep("sendWhatsAppAlert error", { error: errorMessage(e) });
  }
}
