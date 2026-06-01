import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  let body: { suscripcion_id?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const results: any[] = [];

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
        } catch (payErr: any) {
          const msg = payErr?.message || String(payErr);
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
          await supabase.from("intentos_cobro").insert({
            factura_id: null,
            stripe_charge_id: typeof paid.charge === "string" ? paid.charge : null,
            monto: (paid.total || 0) / 100,
            estado: "exitoso",
          });
          results.push({ suscripcion_id: sub.id, invoice: paid.id, action: "charged", amount: (paid.total || 0) / 100 });
        } else {
          results.push({ suscripcion_id: sub.id, invoice: paid.id, action: "unexpected_status", status: paid.status });
        }
      } catch (e: any) {
        log("Sub error", { sub: sub.id, error: e?.message });
        results.push({ suscripcion_id: sub.id, action: "error", error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    log("FATAL", { error: e?.message });
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncLocalPaid(supabase: any, sub: any, inv: Stripe.Invoice) {
  // Find local factura matching this period (most recent procesando/pendiente)
  const { data: facs } = await supabase
    .from("facturas")
    .select("id, periodo_inicio")
    .eq("suscripcion_id", sub.id)
    .in("estado", ["procesando", "pendiente"])
    .order("periodo_inicio", { ascending: false })
    .limit(1);

  const now = new Date();
  const charge = typeof inv.charge === "string" ? inv.charge : null;
  const pi = typeof inv.payment_intent === "string" ? inv.payment_intent : null;

  if (facs && facs.length > 0) {
    await supabase.from("facturas").update({
      estado: "pagada",
      stripe_invoice_id: inv.id,
      stripe_payment_intent_id: pi,
      fecha_pago: now.toISOString(),
    }).eq("id", facs[0].id);
  }

  // Advance next billing date to the 1st of the following month (relative to now)
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await supabase.from("suscripciones").update({
    estado: "activa",
    fecha_proximo_cobro: nextMonth.toISOString().split("T")[0],
    actualizado_en: now.toISOString(),
  }).eq("id", sub.id);
}