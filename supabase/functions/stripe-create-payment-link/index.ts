import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
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

    const { empresa_id, cliente_id, cliente_nombre, cliente_email } = await req.json();
    if (!empresa_id || !cliente_id) throw new Error("empresa_id and cliente_id required");

    // Get empresa's Stripe Connect account
    const { data: connectAccount } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("empresa_id", empresa_id)
      .single();

    if (!connectAccount?.stripe_account_id || !connectAccount.charges_enabled) {
      throw new Error("La empresa no tiene Stripe Connect configurado o habilitado");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const stripeAccountId = connectAccount.stripe_account_id;

    // Check if customer already exists for this client in this connected account
    const { data: existingPM } = await supabase
      .from("stripe_payment_methods")
      .select("stripe_customer_id")
      .eq("empresa_id", empresa_id)
      .eq("cliente_id", cliente_id)
      .maybeSingle();

    let customerId: string;

    if (existingPM?.stripe_customer_id) {
      customerId = existingPM.stripe_customer_id;
    } else {
      // Create customer on connected account
      const customer = await stripe.customers.create({
        name: cliente_nombre || "Cliente",
        email: cliente_email || undefined,
        metadata: { cliente_id, empresa_id },
      }, { stripeAccount: stripeAccountId });

      customerId = customer.id;

      // Save to DB
      await supabase.from("stripe_payment_methods").insert({
        empresa_id,
        cliente_id,
        stripe_customer_id: customerId,
      });
    }

    // Create Setup Session to collect card details
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "setup",
      payment_method_types: ["card"],
      success_url: `${req.headers.get("origin")}/clientes/${cliente_id}?stripe=success`,
      cancel_url: `${req.headers.get("origin")}/clientes/${cliente_id}?stripe=cancel`,
      metadata: { empresa_id, cliente_id },
    }, { stripeAccount: stripeAccountId });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-create-payment-link error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
