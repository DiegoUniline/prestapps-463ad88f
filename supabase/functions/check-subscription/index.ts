import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUB] ${step}${d}`);
};

const DIAS_GRACIA = 3;

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not found");
    logStep("User authenticated", { userId: user.id });

    // Get user's empresa_id from profiles
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("empresa_id")
      .eq("id", user.id)
      .single();

    if (!profile?.empresa_id) {
      logStep("No empresa found for user");
      return new Response(JSON.stringify({ subscribed: false, estado: "sin_empresa" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empresaId = profile.empresa_id;
    logStep("Empresa found", { empresaId });

    // Check local suscripciones table first (covers manual subscriptions)
    const { data: suscripcion } = await supabaseClient
      .from("suscripciones")
      .select("*, planes(*)")
      .eq("empresa_id", empresaId)
      .neq("estado", "cancelada")
      .order("creado_en", { ascending: false })
      .limit(1)
      .single();

    if (!suscripcion) {
      logStep("No subscription found");
      return new Response(JSON.stringify({
        subscribed: false,
        estado: "sin_suscripcion",
        empresa_id: empresaId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Subscription found", { id: suscripcion.id, estado: suscripcion.estado, es_manual: suscripcion.es_manual });

    // For manual/trial subscriptions, check fecha_vencimiento
    if (suscripcion.es_manual || suscripcion.estado === "trial") {
      let estado = suscripcion.estado;
      let diasTrialRestantes: number | null = null;
      let diasGraciaRestantes: number | null = null;

      if (suscripcion.estado === "trial" && suscripcion.fecha_vencimiento) {
        const vencimiento = new Date(suscripcion.fecha_vencimiento + "T23:59:59");
        const now = new Date();
        const diffMs = vencimiento.getTime() - now.getTime();
        diasTrialRestantes = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        if (diasTrialRestantes <= 0) {
          // Trial expired — calculate grace days (3 days after expiration)
          const daysSinceExpiry = Math.floor((now.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24));
          diasGraciaRestantes = Math.max(0, DIAS_GRACIA - daysSinceExpiry);

          if (diasGraciaRestantes > 0) {
            // Still within grace period
            estado = "trial_expirado";
          } else {
            // Grace period over — fully blocked
            estado = "trial_expirado";
            diasGraciaRestantes = 0;
          }
        }
      } else if (suscripcion.estado !== "trial") {
        const vencida = suscripcion.fecha_vencimiento && new Date(suscripcion.fecha_vencimiento) < new Date();
        if (vencida) estado = "suspendida";
      }

      if (estado === "gracia" && suscripcion.actualizado_en) {
        const graciaStart = new Date(suscripcion.actualizado_en);
        const daysSince = Math.floor((new Date().getTime() - graciaStart.getTime()) / (1000 * 60 * 60 * 24));
        diasGraciaRestantes = Math.max(0, DIAS_GRACIA - daysSince);
      }

      return new Response(JSON.stringify({
        subscribed: estado === "activa" || estado === "trial",
        estado,
        suscripcion_id: suscripcion.id,
        plan_nombre: suscripcion.planes?.nombre || (estado === "trial" || estado === "trial_expirado" ? "Prueba Gratuita" : "Manual"),
        num_usuarios: suscripcion.num_usuarios,
        fecha_vencimiento: suscripcion.fecha_vencimiento,
        fecha_proximo_cobro: suscripcion.fecha_proximo_cobro,
        es_manual: suscripcion.es_manual,
        empresa_id: empresaId,
        card_brand: null,
        card_last4: null,
        dias_gracia_restantes: diasGraciaRestantes,
        dias_trial_restantes: diasTrialRestantes,
        factura_pendiente: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For Stripe subscriptions, verify with Stripe if we have a subscription ID
    if (suscripcion.stripe_subscription_id) {
      try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
          const stripeSub = await stripe.subscriptions.retrieve(suscripcion.stripe_subscription_id);
          
          let dbEstado = suscripcion.estado;
          if (stripeSub.status === "active") dbEstado = "activa";
          else if (stripeSub.status === "past_due") dbEstado = "gracia";
          else if (stripeSub.status === "canceled" || stripeSub.status === "unpaid") dbEstado = "suspendida";

          if (dbEstado !== suscripcion.estado) {
            const updateData: any = { estado: dbEstado, actualizado_en: new Date().toISOString() };
            await supabaseClient
              .from("suscripciones")
              .update(updateData)
              .eq("id", suscripcion.id);
          }

          suscripcion.estado = dbEstado;
          logStep("Stripe sync done", { stripeStatus: stripeSub.status, dbEstado });
        }
      } catch (e) {
        logStep("Stripe verify failed, using DB state", { error: String(e) });
      }
    }

    // ── Calculate grace period info ──
    let diasGraciaRestantes: number | null = null;
    if (suscripcion.estado === "gracia" && suscripcion.actualizado_en) {
      const graciaStart = new Date(suscripcion.actualizado_en);
      const now = new Date();
      const daysSince = Math.floor((now.getTime() - graciaStart.getTime()) / (1000 * 60 * 60 * 24));
      diasGraciaRestantes = Math.max(0, DIAS_GRACIA - daysSince);
    }

    // ── Check for pending invoice ──
    let facturaPendiente: any = null;
    if (suscripcion.estado === "gracia" || suscripcion.estado === "suspendida") {
      const { data: factura } = await supabaseClient
        .from("facturas")
        .select("id, numero_factura, total, estado, periodo_inicio, periodo_fin")
        .eq("empresa_id", empresaId)
        .in("estado", ["pendiente", "procesando"])
        .order("fecha_emision", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (factura) {
        facturaPendiente = factura;
      }
    }

    return new Response(JSON.stringify({
      subscribed: suscripcion.estado === "activa" || suscripcion.estado === "trial",
      estado: suscripcion.estado,
      suscripcion_id: suscripcion.id,
      plan_nombre: suscripcion.planes?.nombre || "—",
      plan_id: suscripcion.plan_id,
      num_usuarios: suscripcion.num_usuarios,
      precio_base: suscripcion.precio_base,
      periodicidad: suscripcion.periodicidad,
      fecha_proximo_cobro: suscripcion.fecha_proximo_cobro,
      fecha_vencimiento: suscripcion.fecha_vencimiento,
      descuento_porcentaje: suscripcion.descuento_porcentaje,
      es_manual: suscripcion.es_manual,
      empresa_id: empresaId,
      card_brand: suscripcion.card_brand,
      card_last4: suscripcion.card_last4,
      stripe_customer_id: suscripcion.stripe_customer_id,
      dias_gracia_restantes: diasGraciaRestantes,
      factura_pendiente: facturaPendiente,
    }), {
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
