import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// After a setup session completes, sync the payment method details back to our DB
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

    const { empresa_id, cliente_id } = await req.json();
    if (!empresa_id || !cliente_id) throw new Error("empresa_id and cliente_id required");

    // Get connect account
    const { data: connectAccount } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("empresa_id", empresa_id)
      .single();
    if (!connectAccount) throw new Error("No Stripe Connect account");

    // Get stored customer
    const { data: pmRecord } = await supabase
      .from("stripe_payment_methods")
      .select("id, stripe_customer_id")
      .eq("empresa_id", empresa_id)
      .eq("cliente_id", cliente_id)
      .maybeSingle();
    if (!pmRecord?.stripe_customer_id) throw new Error("No customer found");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const stripeAccountId = connectAccount.stripe_account_id;

    // Get payment methods for customer
    const methods = await stripe.paymentMethods.list({
      customer: pmRecord.stripe_customer_id,
      type: "card",
    }, { stripeAccount: stripeAccountId });

    if (methods.data.length === 0) {
      return new Response(JSON.stringify({ synced: false, message: "No payment methods found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const card = methods.data[0];
    const cardDetails = card.card;

    await supabase.from("stripe_payment_methods").update({
      stripe_payment_method_id: card.id,
      brand: cardDetails?.brand || null,
      last4: cardDetails?.last4 || null,
      exp_month: cardDetails?.exp_month || null,
      exp_year: cardDetails?.exp_year || null,
      activo: true,
    }).eq("id", pmRecord.id);

    return new Response(JSON.stringify({
      synced: true,
      brand: cardDetails?.brand,
      last4: cardDetails?.last4,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-sync-payment-method error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
