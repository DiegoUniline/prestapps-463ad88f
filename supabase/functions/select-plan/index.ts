import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SELECT-PLAN] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not found");

    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", user.id)
      .single();
    if (!profile?.empresa_id) throw new Error("No empresa found");
    const empresaId = profile.empresa_id;
    logStep("User authenticated", { userId: user.id, empresaId });

    const { plan_id, num_usuarios = 1 } = await req.json();
    if (!plan_id) throw new Error("plan_id is required");

    // Get plan
    const { data: plan, error: planErr } = await supabase
      .from("planes")
      .select("*")
      .eq("id", plan_id)
      .single();
    if (planErr || !plan) throw new Error("Plan not found");
    logStep("Plan found", { nombre: plan.nombre, precio: plan.precio_base_mes });

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Calculate cost
    const extraUsers = Math.max(0, num_usuarios - plan.usuarios_incluidos);
    const subtotal = plan.precio_base_mes + (extraUsers * plan.precio_usuario_extra);

    // Calculate proration: from today to end of month
    const diasEnMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const diaActual = now.getDate();
    const diasRestantes = diasEnMes - diaActual + 1; // including today
    const esPrimerDia = diaActual === 1;
    const esProrrateo = !esPrimerDia;

    const total = esProrrateo
      ? Math.round((subtotal / diasEnMes) * diasRestantes * 100) / 100
      : subtotal;

    const periodoInicio = today;
    const periodoFin = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().split("T")[0];
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    logStep("Cost calculated", { subtotal, total, diasRestantes, esProrrateo });

    // Update subscription
    const subData = {
      empresa_id: empresaId,
      plan_id: plan_id,
      num_usuarios,
      precio_base: plan.precio_base_mes,
      precio_usuario_extra: plan.precio_usuario_extra,
      periodicidad: "mensual",
      estado: "pendiente_pago",
      es_manual: true,
      fecha_inicio: today,
      fecha_proximo_cobro: firstOfNextMonth.toISOString().split("T")[0],
      actualizado_en: now.toISOString(),
    };

    // Upsert subscription (replace trial or existing)
    const { data: existingSub } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("empresa_id", empresaId)
      .limit(1)
      .maybeSingle();

    let suscripcionId: string;
    if (existingSub) {
      const { data: updated, error: upErr } = await supabase
        .from("suscripciones")
        .update(subData)
        .eq("id", existingSub.id)
        .select("id")
        .single();
      if (upErr) throw new Error(`Error updating subscription: ${upErr.message}`);
      suscripcionId = updated.id;
      logStep("Subscription updated", { id: suscripcionId });
    } else {
      const { data: created, error: crErr } = await supabase
        .from("suscripciones")
        .insert(subData)
        .select("id")
        .single();
      if (crErr) throw new Error(`Error creating subscription: ${crErr.message}`);
      suscripcionId = created.id;
      logStep("Subscription created", { id: suscripcionId });
    }

    // Delete any existing pending invoices for this empresa
    await supabase
      .from("facturas")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("estado", "pendiente");

    // Generate invoice
    const facNum = `FAC-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;

    const { data: factura, error: facErr } = await supabase
      .from("facturas")
      .insert({
        empresa_id: empresaId,
        suscripcion_id: suscripcionId,
        numero_factura: facNum,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        num_usuarios,
        precio_unitario: plan.precio_base_mes,
        subtotal,
        total,
        descuento_porcentaje: 0,
        estado: "pendiente",
        es_prorrateo: esProrrateo,
        fecha_vencimiento: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (facErr) throw new Error(`Error creating invoice: ${facErr.message}`);
    logStep("Invoice created", { id: factura.id, total, esProrrateo });

    return new Response(JSON.stringify({
      success: true,
      suscripcion_id: suscripcionId,
      factura: {
        id: factura.id,
        numero_factura: facNum,
        total,
        subtotal,
        es_prorrateo: esProrrateo,
        dias_cobrados: diasRestantes,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
      },
      plan_nombre: plan.nombre,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
