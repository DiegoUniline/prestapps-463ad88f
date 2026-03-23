import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REGISTER-EMPRESA] ${step}${d}`);
};

const TRIAL_DAYS = 7;

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

    const { email, password, nombre_completo, nombre_empresa, telefono, lada_pais } = await req.json();

    if (!email || !password || !nombre_completo || !nombre_empresa) {
      throw new Error("Faltan campos requeridos: email, password, nombre_completo, nombre_empresa");
    }

    logStep("Creating user", { email, nombre_empresa });

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for trial
      user_metadata: { nombre_completo, nombre_empresa },
    });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        throw new Error("Este correo ya está registrado. Intenta iniciar sesión.");
      }
      throw new Error(`Error creando usuario: ${authError.message}`);
    }

    const userId = authData.user.id;
    logStep("User created", { userId });

    // 2. Create empresa
    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .insert({
        nombre: nombre_empresa,
        plan: "trial",
        max_usuarios: 3,
        activa: true,
        telefono: telefono || null,
      })
      .select()
      .single();

    if (empresaError) throw new Error(`Error creando empresa: ${empresaError.message}`);
    logStep("Empresa created", { empresaId: empresa.id });

    // 3. Create profile linked to empresa
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        nombre_completo,
        empresa_id: empresa.id,
        telefono: telefono || null,
        activo: true,
        porcentaje_comision: 0,
        efectivo_en_mano: 0,
      });

    if (profileError) throw new Error(`Error creando perfil: ${profileError.message}`);
    logStep("Profile created");

    // 4. Assign admin role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "admin",
      });

    if (roleError) throw new Error(`Error asignando rol: ${roleError.message}`);
    logStep("Admin role assigned");

    // 5. Create trial subscription (7 days)
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const { error: subError } = await supabase
      .from("suscripciones")
      .insert({
        empresa_id: empresa.id,
        plan_id: null, // no plan yet
        estado: "trial",
        es_manual: true,
        num_usuarios: 3,
        precio_base: 0,
        precio_usuario_extra: 0,
        periodicidad: "mensual",
        fecha_inicio: now.toISOString().split("T")[0],
        fecha_vencimiento: trialEnd.toISOString().split("T")[0],
        fecha_proximo_cobro: firstOfNextMonth.toISOString().split("T")[0],
        notas_admin: `Trial automático de ${TRIAL_DAYS} días`,
        actualizado_en: now.toISOString(),
      });

    if (subError) throw new Error(`Error creando suscripción trial: ${subError.message}`);
    logStep("Trial subscription created", { trialEnd: trialEnd.toISOString() });

    // 6. Create default caja
    const { error: cajaError } = await supabase
      .from("cajas")
      .insert({
        nombre: "Caja Principal",
        empresa_id: empresa.id,
        saldo_actual: 0,
        descripcion: "Caja principal creada automáticamente",
      });

    if (cajaError) logStep("Warning: could not create default caja", { error: cajaError.message });
    else logStep("Default caja created");

    // 7. Create default folio sequences
    await supabase.from("folios").insert([
      { empresa_id: empresa.id, tipo: "prestamo", prefijo: "PRE", ultimo_folio: 0 },
      { empresa_id: empresa.id, tipo: "cliente", prefijo: "CLI", ultimo_folio: 0 },
    ]);
    logStep("Default folios created");

    logStep("Registration complete", { userId, empresaId: empresa.id });

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      empresa_id: empresa.id,
      trial_end: trialEnd.toISOString().split("T")[0],
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
