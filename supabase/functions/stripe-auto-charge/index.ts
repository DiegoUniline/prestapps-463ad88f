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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const results: any[] = [];

  try {
    // Find all active loans with auto-charge enabled
    const { data: prestamos, error: pErr } = await supabase
      .from("prestamos")
      .select("id, cliente_id, empresa_id")
      .eq("cobro_automatico_stripe", true)
      .in("estado", ["Activo", "Al día", "Vencido"]);

    if (pErr) throw pErr;
    if (!prestamos?.length) {
      return new Response(JSON.stringify({ message: "No loans with auto-charge", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const prestamo of prestamos) {
      try {
        // Find cuotas due today or overdue that haven't been paid
        const { data: cuotas } = await supabase
          .from("amortizacion")
          .select("id, num_cuota, saldo_total, fecha_vencimiento")
          .eq("prestamo_id", prestamo.id)
          .in("status", ["Pendiente", "Vencida", "Parcial"])
          .lte("fecha_vencimiento", new Date().toISOString().split("T")[0])
          .gt("saldo_total", 0)
          .order("num_cuota", { ascending: true })
          .limit(1);

        if (!cuotas?.length) continue;

        const cuota = cuotas[0];
        const monto = Number(cuota.saldo_total);
        if (monto <= 0) continue;

        // Check if client has a payment method
        const { data: pm } = await supabase
          .from("stripe_payment_methods")
          .select("stripe_customer_id, stripe_payment_method_id, brand, last4")
          .eq("empresa_id", prestamo.empresa_id)
          .eq("cliente_id", prestamo.cliente_id)
          .eq("activo", true)
          .maybeSingle();

        if (!pm?.stripe_payment_method_id) {
          results.push({ prestamo_id: prestamo.id, status: "skipped", reason: "no_payment_method" });
          continue;
        }

        // Get connect account
        const { data: connectAccount } = await supabase
          .from("stripe_connect_accounts")
          .select("stripe_account_id, charges_enabled")
          .eq("empresa_id", prestamo.empresa_id)
          .single();

        if (!connectAccount?.charges_enabled) {
          results.push({ prestamo_id: prestamo.id, status: "skipped", reason: "connect_not_enabled" });
          continue;
        }

        // Check if already charged today for this cuota
        const today = new Date().toISOString().split("T")[0];
        const { data: existingCharge } = await supabase
          .from("stripe_charges_log")
          .select("id")
          .eq("prestamo_id", prestamo.id)
          .eq("cuota_id", cuota.id)
          .eq("status", "succeeded")
          .gte("created_at", today)
          .maybeSingle();

        if (existingCharge) {
          results.push({ prestamo_id: prestamo.id, status: "skipped", reason: "already_charged_today" });
          continue;
        }

        // Charge
        const amountCents = Math.round(monto * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          customer: pm.stripe_customer_id,
          payment_method: pm.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            prestamo_id: prestamo.id,
            cuota_id: cuota.id,
            cliente_id: prestamo.cliente_id,
            empresa_id: prestamo.empresa_id,
            auto_charge: "true",
          },
        }, { stripeAccount: connectAccount.stripe_account_id });

        // Log charge
        await supabase.from("stripe_charges_log").insert({
          empresa_id: prestamo.empresa_id,
          prestamo_id: prestamo.id,
          cuota_id: cuota.id,
          cliente_id: prestamo.cliente_id,
          stripe_payment_intent_id: paymentIntent.id,
          monto,
          moneda: "usd",
          status: paymentIntent.status,
        });

        // (WA notifications are sent by billing-notifications at 9AM)

        results.push({
          prestamo_id: prestamo.id,
          cuota_id: cuota.id,
          status: paymentIntent.status,
          monto,
        });
      } catch (chargeErr: any) {
        const msg = chargeErr instanceof Error ? chargeErr.message : "Unknown";
        console.error(`Auto-charge error for ${prestamo.id}:`, msg);

        await supabase.from("stripe_charges_log").insert({
          empresa_id: prestamo.empresa_id,
          prestamo_id: prestamo.id,
          cliente_id: prestamo.cliente_id,
          monto: 0,
          moneda: "usd",
          status: "failed",
          error_mensaje: msg,
        });

        results.push({ prestamo_id: prestamo.id, status: "failed", error: msg });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-auto-charge error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
