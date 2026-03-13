import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) throw new Error("Unauthorized");

    const { empresa_id, prestamo_id, cuota_id, cliente_id, monto, moneda = "usd" } = await req.json();
    if (!empresa_id || !prestamo_id || !cliente_id || !monto) {
      throw new Error("empresa_id, prestamo_id, cliente_id, and monto are required");
    }

    // Get Connect account
    const { data: connectAccount } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("empresa_id", empresa_id)
      .single();

    if (!connectAccount?.charges_enabled) {
      throw new Error("Stripe Connect no está habilitado para esta empresa");
    }

    // Get payment method
    const { data: pm } = await supabase
      .from("stripe_payment_methods")
      .select("stripe_customer_id, stripe_payment_method_id")
      .eq("empresa_id", empresa_id)
      .eq("cliente_id", cliente_id)
      .eq("activo", true)
      .maybeSingle();

    if (!pm?.stripe_customer_id || !pm?.stripe_payment_method_id) {
      throw new Error("El cliente no tiene un método de pago registrado");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const stripeAccountId = connectAccount.stripe_account_id;

    // Create payment intent on connected account
    const amountCents = Math.round(monto * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: moneda,
      customer: pm.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { prestamo_id, cuota_id: cuota_id || "", cliente_id, empresa_id },
    }, { stripeAccount: stripeAccountId });

    // Log the charge
    await supabase.from("stripe_charges_log").insert({
      empresa_id,
      prestamo_id,
      cuota_id: cuota_id || null,
      cliente_id,
      stripe_payment_intent_id: paymentIntent.id,
      monto,
      moneda,
      status: paymentIntent.status,
    });

    return new Response(JSON.stringify({
      success: paymentIntent.status === "succeeded",
      status: paymentIntent.status,
      payment_intent_id: paymentIntent.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-charge-cuota error:", msg);

    // Try to log the failed charge
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.empresa_id && body.prestamo_id && body.cliente_id) {
        const supabase2 = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase2.from("stripe_charges_log").insert({
          empresa_id: body.empresa_id,
          prestamo_id: body.prestamo_id,
          cuota_id: body.cuota_id || null,
          cliente_id: body.cliente_id,
          monto: body.monto || 0,
          moneda: body.moneda || "usd",
          status: "failed",
          error_mensaje: msg,
        });
      }
    } catch { /* ignore logging errors */ }

    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
