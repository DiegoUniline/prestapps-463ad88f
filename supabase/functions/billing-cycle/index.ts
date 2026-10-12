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

// Pre-"basil" top-level invoice fields; the current Stripe typings no longer declare them.
type InvoiceLegacy = Stripe.Invoice & { charge?: unknown; payment_intent?: unknown };

interface AdminProfile {
  id: string;
  telefono: string | null;
  nombre_completo: string;
}

interface BillingResult {
  empresa_id: string;
  action: string;
  reason?: string;
  error?: string;
  amount?: number;
  total?: number;
  daysSinceGracia?: number;
}

// Same semantics as `e?.message`: Error instances and plain error objects alike.
function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") return e.message;
  return undefined;
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

async function notifyEmpresaAdmins(
  supabase: SupabaseClient,
  empresaId: string,
  mensaje: string,
  tipo: string,
) {
  try {
    // Use SYSTEM WA config (PrestApps central API)
    const waConfig = await getSystemWaConfig(supabase);
    if (!waConfig) return;

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

// ── Format helpers ──
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
    { auth: { persistSession: false } }
  );

  const gate = await cronGate(req, supabase, "billing-cycle");
  if (gate) return gate;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const isFirstOfMonth = now.getUTCDate() === 1;

  const results: BillingResult[] = [];

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

          const { data: facRow, error: facErr } = await supabase.from("facturas").insert({
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
          }).select("id").maybeSingle();

          if (facErr) {
            logStep("Error creating invoice", { empresa_id: sub.empresa_id, error: facErr.message });
          } else {
            logStep("Invoice created", { empresa_id: sub.empresa_id, total, isStripeBilled });
          }

          // (WA notifications are sent by billing-notifications at 9AM)

          // ── If total is $0 (100% discount), auto-mark as paid ──
          if (total <= 0) {
            await supabase.from("facturas")
              .update({ estado: "pagada", fecha_pago: now.toISOString() })
              .eq("empresa_id", sub.empresa_id)
              .eq("periodo_inicio", periodoInicio);

            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
            await supabase.from("suscripciones")
              .update({
                fecha_proximo_cobro: nextMonth.toISOString().split("T")[0],
                actualizado_en: now.toISOString(),
              })
              .eq("id", sub.id);

            logStep("Zero-total invoice auto-paid (100% discount)", { empresa_id: sub.empresa_id });
            results.push({ empresa_id: sub.empresa_id, action: "auto_paid_zero", total });
            continue;
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
                }, { idempotencyKey: `billing-${sub.id}-${periodoInicio}` });

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
            } catch (chargeErr) {
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

          // ── For Stripe-billed subs — DO NOT trust Stripe to cobrar solo.
          // Finalize + pay the latest open/draft invoice ourselves.
          if (isStripeBilled && stripe) {
            try {
              // Small delay so Stripe's auto-generated invoice for this cycle exists
              await new Promise((r) => setTimeout(r, 2000));
              const invs = await stripe.invoices.list({
                subscription: sub.stripe_subscription_id!,
                limit: 1,
              });
              let inv = invs.data[0];

              if (!inv) {
                logStep("No invoice yet for Stripe sub", { empresa_id: sub.empresa_id });
              } else {
                if (inv.status === "draft") {
                  inv = await stripe.invoices.finalizeInvoice(inv.id!, { auto_advance: true });
                }
                if (inv.status === "open" || inv.status === "draft") {
                  inv = await stripe.invoices.pay(inv.id!, { off_session: true }, { idempotencyKey: `billing-pay-${sub.id}-${periodoInicio}-${inv.id}` });
                }

                if (inv.status === "paid") {
                  const invLegacy: InvoiceLegacy = inv;
                  const pi = typeof invLegacy.payment_intent === "string" ? invLegacy.payment_intent : null;
                  const facPagada = { estado: "pagada", stripe_payment_intent_id: pi, fecha_pago: now.toISOString() };
                  const { error: facUpErr } = await supabase.from("facturas")
                    .update({ ...facPagada, stripe_invoice_id: inv.id })
                    .eq("empresa_id", sub.empresa_id).eq("periodo_inicio", periodoInicio);
                  if (facUpErr?.code === "23505") {
                    // The webhook already recorded this Stripe invoice on another row
                    await supabase.from("facturas").update(facPagada)
                      .eq("empresa_id", sub.empresa_id).eq("periodo_inicio", periodoInicio);
                  }

                  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
                  await supabase.from("suscripciones").update({
                    estado: "activa",
                    fecha_proximo_cobro: nextMonth.toISOString().split("T")[0],
                    actualizado_en: now.toISOString(),
                  }).eq("id", sub.id);

                  await supabase.from("intentos_cobro").insert({
                    factura_id: facRow?.id ?? null,
                    stripe_charge_id: typeof invLegacy.charge === "string" ? invLegacy.charge : null,
                    monto: (inv.total || 0) / 100,
                    estado: "exitoso",
                  });

                  logStep("Stripe sub charged via invoice.pay", { empresa_id: sub.empresa_id, invoice: inv.id });
                  results.push({ empresa_id: sub.empresa_id, action: "charged_stripe_sub", amount: (inv.total || 0) / 100 });
                } else {
                  logStep("Stripe invoice unexpected status", { empresa_id: sub.empresa_id, status: inv.status });
                }
              }
            } catch (sErr) {
              const msg = errorMessage(sErr) || String(sErr);
              logStep("Stripe sub charge failed", { empresa_id: sub.empresa_id, error: msg });
              await supabase.from("suscripciones").update({
                estado: "gracia",
                actualizado_en: now.toISOString(),
              }).eq("id", sub.id);
              await supabase.from("intentos_cobro").insert({
                factura_id: facRow?.id ?? null,
                monto: total,
                estado: "fallido",
                error_mensaje: msg,
              });
              results.push({ empresa_id: sub.empresa_id, action: "gracia", reason: "stripe_sub_charge_failed", error: msg });
            }
          }
        } catch (subErr) {
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
}));