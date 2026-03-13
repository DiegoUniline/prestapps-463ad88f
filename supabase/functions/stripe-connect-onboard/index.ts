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

    const { empresa_id, return_url } = await req.json();
    if (!empresa_id) throw new Error("empresa_id required");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if account already exists
    const { data: existing } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, onboarding_complete")
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    let accountId: string;

    if (existing?.stripe_account_id) {
      accountId = existing.stripe_account_id;
      
      // If already onboarded, just return status
      if (existing.onboarding_complete) {
        const account = await stripe.accounts.retrieve(accountId);
        return new Response(JSON.stringify({
          already_connected: true,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      // Create new Connect account
      const account = await stripe.accounts.create({
        type: "standard",
      });
      accountId = account.id;

      // Save to DB
      await supabase.from("stripe_connect_accounts").insert({
        empresa_id,
        stripe_account_id: accountId,
      });
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: return_url || `${req.headers.get("origin")}/configuracion`,
      return_url: return_url || `${req.headers.get("origin")}/configuracion`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-connect-onboard error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
