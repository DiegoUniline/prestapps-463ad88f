import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-CREATE-SUB] ${step}${d}`);
};

const SUPER_ADMIN_EMAIL = "diego.leon@uniline.mx";

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
    if (user?.email !== SUPER_ADMIN_EMAIL) throw new Error("Not authorized - superadmin only");

    const body = await req.json();
    const {
      action = "create",
      empresa_id,
      plan_id,
      num_usuarios = 1,
      periodicidad = "mensual",
      estado = "activa",
      fecha_vencimiento = null,
      descuento_porcentaje = 0,
      notas_admin = "",
      suscripcion_id = null,
      factura_id = null,
      nuevo_estado = null,
      metodo_pago = null,
    } = body;

    if (action === "create" || action === "update") {
      if (!empresa_id) throw new Error("empresa_id required");

      // Get plan info
      let precioBase = 0;
      let precioExtra = 0;
      if (plan_id) {
        const { data: plan } = await supabaseClient
          .from("planes")
          .select("*")
          .eq("id", plan_id)
          .single();
        if (plan) {
          precioBase = plan.precio_base_mes;
          precioExtra = plan.precio_usuario_extra;
        }
      }

      const subData = {
        empresa_id,
        plan_id: plan_id || null,
        num_usuarios,
        precio_base: precioBase,
        precio_usuario_extra: precioExtra,
        periodicidad,
        estado,
        fecha_vencimiento,
        descuento_porcentaje,
        notas_admin,
        es_manual: true,
        fecha_inicio: new Date().toISOString().split("T")[0],
        fecha_proximo_cobro: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split("T")[0],
        actualizado_en: new Date().toISOString(),
      };

      let result;
      if (action === "update" && suscripcion_id) {
        const { data, error } = await supabaseClient
          .from("suscripciones")
          .update(subData)
          .eq("id", suscripcion_id)
          .select()
          .single();
        if (error) throw error;
        result = data;
        logStep("Updated subscription", { id: suscripcion_id });
      } else {
        // Delete existing subs for this empresa first
        await supabaseClient
          .from("suscripciones")
          .delete()
          .eq("empresa_id", empresa_id);

        const { data, error } = await supabaseClient
          .from("suscripciones")
          .insert(subData)
          .select()
          .single();
        if (error) throw error;
        result = data;
        logStep("Created subscription", { id: result.id });

        // Create initial invoice if needed
        if (descuento_porcentaje < 100) {
          const extraUsers = Math.max(0, num_usuarios - (plan_id ? 0 : 0));
          const subtotal = precioBase + (extraUsers * precioExtra);
          const total = subtotal * (1 - descuento_porcentaje / 100);

          const now = new Date();
          const facNum = `FAC-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;

          await supabaseClient.from("facturas").insert({
            empresa_id,
            suscripcion_id: result.id,
            numero_factura: facNum,
            periodo_inicio: now.toISOString().split("T")[0],
            periodo_fin: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0],
            num_usuarios,
            precio_unitario: precioBase,
            descuento_porcentaje,
            subtotal,
            total,
            estado: estado === "activa" ? "pagada" : "pendiente",
            fecha_pago: estado === "activa" ? now.toISOString() : null,
          });
          logStep("Created invoice");
        }
      }

      return new Response(JSON.stringify({ success: true, suscripcion: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel" && suscripcion_id) {
      const { error } = await supabaseClient
        .from("suscripciones")
        .update({ estado: "cancelada", actualizado_en: new Date().toISOString() })
        .eq("id", suscripcion_id);
      if (error) throw error;
      logStep("Cancelled subscription", { id: suscripcion_id });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manually mark an invoice as paid / pending / failed (Stripe webhook fallback)
    if (action === "set_factura_estado" && factura_id) {
      const estadoFactura = nuevo_estado || "pagada";
      const nowIso = new Date().toISOString();

      const { data: factura, error: facErr } = await supabaseClient
        .from("facturas")
        .update({
          estado: estadoFactura,
          fecha_pago: estadoFactura === "pagada" ? nowIso : null,
          metodo_pago: metodo_pago || (estadoFactura === "pagada" ? "manual" : null),
        })
        .eq("id", factura_id)
        .select()
        .single();
      if (facErr) throw facErr;
      logStep("Invoice state updated", { factura_id, estadoFactura });

      // Reactivate subscription when marking as paid
      if (estadoFactura === "pagada" && factura?.suscripcion_id) {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const { error: subErr } = await supabaseClient
          .from("suscripciones")
          .update({
            estado: "activa",
            fecha_proximo_cobro: next.toISOString().split("T")[0],
            actualizado_en: nowIso,
          })
          .eq("id", factura.suscripcion_id);
        if (subErr) throw subErr;
        logStep("Subscription reactivated", { suscripcion_id: factura.suscripcion_id });
      }

      return new Response(JSON.stringify({ success: true, factura }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
