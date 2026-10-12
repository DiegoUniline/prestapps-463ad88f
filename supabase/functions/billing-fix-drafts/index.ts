import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

// Pre-"basil" top-level invoice fields; the current Stripe typings no longer declare them.
type InvoiceLegacy = Stripe.Invoice & { charge?: unknown; payment_intent?: unknown };

interface FixDraftResult {
  suscripcion_id: string;
  action: string;
  invoice?: string;
  status?: Stripe.Invoice.Status | null;
  error?: string;
  amount?: number;
}

// Same semantics as `e?.message`: Error instances and plain error objects (e.g. PostgrestError) alike.
function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") return e.message;
  return undefined;
}

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[BILLING-FIX-DRAFTS] ${step}${d}`);
};

/**
 * One-shot reconciliation:
 * For every active SaaS subscription with a stripe_subscription_id, look at the
 * most recent invoice in Stripe. If it's `draft` or `open`, finalize + pay it,
 * then sync the local `facturas` row and advance `fecha_proximo_cobro`.
 *
 * Safe to run multiple times: skips invoices already `paid` / `void` /
 * `uncollectible`, and `pay` is idempotent for already-paid invoices.
 *
 * Optional body: { "suscripcion_id": "<uuid>" } to target a single sub.
 * Optional body: { "dry_run": true } to only report without charging.
 */
serve(withCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const caller = await getCaller(req, supabase);
  if (!caller?.service && !caller?.superAdmin) {
    return new Response(
      JSON.stringify({ error: "No autorizado" }),
      { status: caller ? 403 : 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  let body: { suscripcion_id?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const results: FixDraftResult[] = [];

  try {
    let q = supabase
      .from("suscripciones")
      .select("id, empresa_id, stripe_subscription_id, stripe_customer_id, estado, precio_base, num_usuarios, descuento_porcentaje")
      .not("stripe_subscription_id", "is", null)
      .in("estado", ["activa", "gracia"]);
    if (body.suscripcion_id) q = q.eq("id", body.suscripcion_id);

    const { data: subs, error } = await q;
    if (error) throw error;
    log("Subs to reconcile", { count: subs?.length || 0 });

    for (const sub of subs || []) {
      try {
        // Get latest invoice for this Stripe subscription
        const invs = await stripe.invoices.list({
          subscription: sub.stripe_subscription_id!,
          limit: 1,
        });
        const inv = invs.data[0];
        if (!inv) {
          results.push({ suscripcion_id: sub.id, action: "no_invoice" });
          continue;
        }

        log("Latest invoice", { sub: sub.id, invoice: inv.id, status: inv.status, total: inv.total });

        if (["paid", "void", "uncollectible"].includes(inv.status || "")) {
          // Just sync local record if needed
          if (inv.status === "paid") {
            await syncLocalPaid(supabase, sub, inv);
          }
          results.push({ suscripcion_id: sub.id, invoice: inv.id, action: "already_" + inv.status });
          continue;
        }

        if (body.dry_run) {
          results.push({ suscripcion_id: sub.id, invoice: inv.id, status: inv.status, action: "dry_run" });
          continue;
        }

        // Finalize if draft, then pay
        let finalInv = inv;
        if (inv.status === "draft") {
          finalInv = await stripe.invoices.finalizeInvoice(inv.id!, { auto_advance: true });
          log("Finalized", { invoice: finalInv.id, status: finalInv.status });
        }

        // Attempt charge (off-session) using default PM on subscription/customer
        let paid: Stripe.Invoice;
        try {
          paid = await stripe.invoices.pay(finalInv.id!, { off_session: true });
        } catch (payErr) {
          const msg = errorMessage(payErr) || String(payErr);
          log("Pay failed", { invoice: finalInv.id, error: msg });

          await supabase.from("intentos_cobro").insert({
            factura_id: null,
            monto: (finalInv.total || 0) / 100,
            estado: "fallido",
            error_mensaje: `Stripe invoice ${finalInv.id}: ${msg}`,
          });

          await supabase.from("suscripciones")
            .update({ estado: "gracia", actualizado_en: new Date().toISOString() })
            .eq("id", sub.id);

          results.push({ suscripcion_id: sub.id, invoice: finalInv.id, action: "pay_failed", error: msg });
          continue;
        }

        log("Paid", { invoice: paid.id, status: paid.status });

        if (paid.status === "paid") {
          await syncLocalPaid(supabase, sub, paid);
          const paidLegacy: InvoiceLegacy = paid;
          await supabase.from("intentos_cobro").insert({
            factura_id: null,
            stripe_charge_id: typeof paidLegacy.charge === "string" ? paidLegacy.charge : null,
            monto: (paid.total || 0) / 100,
            estado: "exitoso",
          });
          results.push({ suscripcion_id: sub.id, invoice: paid.id, action: "charged", amount: (paid.total || 0) / 100 });
        } else {
          results.push({ suscripcion_id: sub.id, invoice: paid.id, action: "unexpected_status", status: paid.status });
        }
      } catch (e) {
        log("Sub error", { sub: sub.id, error: errorMessage(e) });
        results.push({ suscripcion_id: sub.id, action: "error", error: errorMessage(e) || String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log("FATAL", { error: errorMessage(e) });
    return new Response(JSON.stringify({ error: errorMessage(e) || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));

async function syncLocalPaid(supabase: SupabaseClient, sub: { id: string }, inv: Stripe.Invoice) {
  // Find local factura matching this period (most recent procesando/pendiente)
  const { data: facs } = await supabase
    .from("facturas")
    .select("id, periodo_inicio")
    .eq("suscripcion_id", sub.id)
    .in("estado", ["procesando", "pendiente"])
    .order("periodo_inicio", { ascending: false })
    .limit(1);

  const now = new Date();
  const legacy: InvoiceLegacy = inv;
  const charge = typeof legacy.charge === "string" ? legacy.charge : null;
  const pi = typeof legacy.payment_intent === "string" ? legacy.payment_intent : null;

  if (facs && facs.length > 0) {
    const facPagada = { estado: "pagada", stripe_payment_intent_id: pi, fecha_pago: now.toISOString() };
    const { error: upErr } = await supabase.from("facturas")
      .update({ ...facPagada, stripe_invoice_id: inv.id }).eq("id", facs[0].id);
    if (upErr?.code === "23505") {
      await supabase.from("facturas").update(facPagada).eq("id", facs[0].id);
    }
  }

  // Advance next billing date to the 1st of the following month (relative to now)
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await supabase.from("suscripciones").update({
    estado: "activa",
    fecha_proximo_cobro: nextMonth.toISOString().split("T")[0],
    actualizado_en: now.toISOString(),
  }).eq("id", sub.id);
}