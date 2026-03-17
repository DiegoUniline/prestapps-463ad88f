import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not found or no email");

    const { plan_id, num_usuarios = 1 } = await req.json();
    if (!plan_id) throw new Error("plan_id is required");

    // Get plan details
    const { data: plan, error: planError } = await supabaseClient
      .from("planes")
      .select("*")
      .eq("id", plan_id)
      .single();
    if (planError || !plan) throw new Error("Plan not found");
    logStep("Plan found", { nombre: plan.nombre, price_id: plan.stripe_price_id });

    // Get user profile for empresa_id
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("empresa_id")
      .eq("id", user.id)
      .single();
    if (!profile?.empresa_id) throw new Error("No empresa found for user");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer", { customerId });
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { empresa_id: profile.empresa_id, user_id: user.id },
      });
      customerId = customer.id;
      logStep("Created customer", { customerId });
    }

    const extraUsers = Math.max(0, num_usuarios - plan.usuarios_incluidos);

    const lineItems: any[] = [
      {
        price: plan.stripe_price_id,
        quantity: 1,
      },
    ];

    if (extraUsers > 0) {
      lineItems.push({
        price_data: {
          currency: "mxn",
          product: plan.stripe_product_id,
          unit_amount: Math.round(plan.precio_usuario_extra * 100),
          recurring: { interval: "month" as const },
        },
        quantity: extraUsers,
      });
    }

    const origin = req.headers.get("origin") || "https://prestapps.lovable.app";

    // Calculate billing_cycle_anchor: 1st of next month at 00:00 UTC
    const now = new Date();
    const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    const anchorTimestamp = Math.floor(firstOfNextMonth.getTime() / 1000);

    logStep("Proration setup", {
      today: now.toISOString(),
      anchor: firstOfNextMonth.toISOString(),
      anchorUnix: anchorTimestamp,
    });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: lineItems,
      mode: "subscription",
      success_url: `${origin}/mi-suscripcion?checkout=success`,
      cancel_url: `${origin}/mi-suscripcion?checkout=cancel`,
      metadata: {
        empresa_id: profile.empresa_id,
        plan_id: plan_id,
        num_usuarios: String(num_usuarios),
      },
      subscription_data: {
        billing_cycle_anchor: anchorTimestamp,
        proration_behavior: "create_prorations",
        metadata: {
          empresa_id: profile.empresa_id,
          plan_id: plan_id,
          num_usuarios: String(num_usuarios),
        },
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    // Save preliminary subscription record
    const fechaProximoCobro = firstOfNextMonth.toISOString().split("T")[0];

    await supabaseClient.from("suscripciones").upsert({
      empresa_id: profile.empresa_id,
      plan_id: plan_id,
      stripe_customer_id: customerId,
      num_usuarios: num_usuarios,
      precio_base: plan.precio_base_mes,
      precio_usuario_extra: plan.precio_usuario_extra,
      periodicidad: "mensual",
      estado: "pendiente_pago",
      fecha_inicio: new Date().toISOString().split("T")[0],
      fecha_proximo_cobro: fechaProximoCobro,
      es_manual: false,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "empresa_id" }).select();

    return new Response(JSON.stringify({ url: session.url }), {
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
});
