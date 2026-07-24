import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No autorizado");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("No autorizado");

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify admin role
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      throw new Error("Solo administradores pueden eliminar préstamos");
    }

    const { data: profile } = await admin
      .from("profiles").select("empresa_id").eq("id", user.id).single();
    if (!profile?.empresa_id) throw new Error("Sin empresa asociada");

    const { prestamoId } = await req.json();
    if (!prestamoId) throw new Error("Falta prestamoId");

    // Verify same empresa
    const { data: prestamo } = await admin
      .from("prestamos")
      .select("id, empresa_id, id_prestamo")
      .eq("id", prestamoId)
      .single();
    if (!prestamo) throw new Error("Préstamo no encontrado");
    if (prestamo.empresa_id !== profile.empresa_id) {
      throw new Error("El préstamo no pertenece a tu empresa");
    }

    // Reverse efectivo_en_mano for each active payment's cobrador
    const { data: pagos } = await admin
      .from("pagos")
      .select("cobrador_id, monto_recibido, anulado")
      .eq("prestamo_id", prestamoId);
    const reversos: Record<string, number> = {};
    for (const p of pagos || []) {
      if (p.anulado) continue;
      if (!p.cobrador_id) continue;
      reversos[p.cobrador_id] = (reversos[p.cobrador_id] || 0) + Number(p.monto_recibido || 0);
    }
    for (const [cobradorId, monto] of Object.entries(reversos)) {
      const { data: prof } = await admin
        .from("profiles").select("efectivo_en_mano").eq("id", cobradorId).single();
      const nuevo = Math.max(0, Number(prof?.efectivo_en_mano || 0) - monto);
      await admin.from("profiles").update({ efectivo_en_mano: nuevo }).eq("id", cobradorId);
    }

    // Delete children (order matters). movimientos_caja trigger will recalc caja saldo.
    await admin.from("stripe_charges_log").delete().eq("prestamo_id", prestamoId);
    await admin.from("crm_gestiones").delete().eq("prestamo_id", prestamoId);
    await admin.from("promesas_pago").delete().eq("prestamo_id", prestamoId);
    await admin.from("pagos").delete().eq("prestamo_id", prestamoId);
    await admin.from("movimientos_caja").delete().eq("prestamo_id", prestamoId);
    await admin.from("amortizacion").delete().eq("prestamo_id", prestamoId);
    // Clear self-references
    await admin.from("prestamos").update({ reestructurado_de: null }).eq("reestructurado_de", prestamoId);
    await admin.from("solicitudes_prestamo").update({ prestamo_generado_id: null }).eq("prestamo_generado_id", prestamoId);

    const { error: delErr } = await admin.from("prestamos").delete().eq("id", prestamoId);
    if (delErr) throw delErr;

    return new Response(
      JSON.stringify({ success: true, message: `Préstamo ${prestamo.id_prestamo} eliminado` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});