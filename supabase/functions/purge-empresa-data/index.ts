import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No autorizado");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the user with their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("No autorizado");

    // Get user's empresa_id and verify they are admin
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("empresa_id")
      .eq("id", user.id)
      .single();

    if (!profile?.empresa_id) throw new Error("Sin empresa asociada");

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (!roleData || roleData.length === 0) {
      throw new Error("Solo administradores pueden ejecutar esta acción");
    }

    const empresaId = profile.empresa_id;

    const { keepCatalogs, confirmCode } = await req.json();

    // Validate confirmation code (must be "BORRAR-TODO" exactly)
    if (confirmCode !== "BORRAR-TODO") {
      throw new Error("Código de confirmación incorrecto");
    }

    // ── DELETE ORDER (respects foreign keys) ──

    // 1. WhatsApp logs
    await adminClient.from("whatsapp_log").delete().eq("empresa_id", empresaId);

    // 2. CRM gestiones
    await adminClient.from("crm_gestiones").delete().eq("empresa_id", empresaId);

    // 3. Stripe charges log
    await adminClient.from("stripe_charges_log").delete().eq("empresa_id", empresaId);

    // 4. Promesas de pago
    await adminClient.from("promesas_pago").delete().eq("empresa_id", empresaId);

    // 5. Pagos
    await adminClient.from("pagos").delete().eq("empresa_id", empresaId);

    // 6. Amortización
    await adminClient.from("amortizacion").delete().eq("empresa_id", empresaId);

    // 7. Movimientos de caja
    await adminClient.from("movimientos_caja").delete().eq("empresa_id", empresaId);

    // 8. Cortes
    await adminClient.from("cortes").delete().eq("empresa_id", empresaId);

    // 9. Solicitudes de préstamo
    await adminClient.from("solicitudes_prestamo").delete().eq("empresa_id", empresaId);

    // 10. Préstamos
    await adminClient.from("prestamos").delete().eq("empresa_id", empresaId);

    // 11. Stripe payment methods
    await adminClient.from("stripe_payment_methods").delete().eq("empresa_id", empresaId);

    // 12. Clientes
    await adminClient.from("clientes").delete().eq("empresa_id", empresaId);

    // 13. Rutas
    await adminClient.from("rutas").delete().eq("empresa_id", empresaId);

    // 14. Reset caja saldos (keep cajas but reset)
    await adminClient.from("cajas").update({ saldo_actual: 0 }).eq("empresa_id", empresaId);

    // 15. Reset folios
    await adminClient.from("folios").update({ ultimo_folio: 0 }).eq("empresa_id", empresaId);

    // 16. Catálogos (only if user chose to delete them too)
    if (!keepCatalogs) {
      await adminClient.from("cat_cuotas").delete().eq("empresa_id", empresaId);
      await adminClient.from("cat_estados_civiles").delete().eq("empresa_id", empresaId);
      await adminClient.from("cat_estados_prestamo").delete().eq("empresa_id", empresaId);
      await adminClient.from("cat_frecuencias_pago").delete().eq("empresa_id", empresaId);
      await adminClient.from("cat_metodos_pago").delete().eq("empresa_id", empresaId);
      await adminClient.from("cat_situaciones_laborales").delete().eq("empresa_id", empresaId);
      await adminClient.from("cat_tipos_documento").delete().eq("empresa_id", empresaId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: keepCatalogs
          ? "Datos operativos eliminados. Catálogos conservados."
          : "Todos los datos eliminados.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
