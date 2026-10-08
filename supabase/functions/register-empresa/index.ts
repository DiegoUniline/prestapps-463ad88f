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
const ADMIN_PHONE = "5213171035768";

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function getWaConfig(supabase: any) {
  const { data } = await supabase.from("system_notification_templates")
    .select("message_template").eq("template_key", "__system_wa_config").maybeSingle();
  try {
    const cfg = JSON.parse(data?.message_template || "{}");
    if (cfg.api_url && cfg.api_token) return cfg;
  } catch {}
  return null;
}

async function sendWa(supabase: any, phones: string[], message: string) {
  const cfg = await getWaConfig(supabase);
  if (!cfg) return false;
  for (const phone of phones) {
    try {
      const r = await fetch(cfg.api_url, {
        method: "POST",
        headers: { "x-api-token": cfg.api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-text", phone, message }),
      });
      const t = await r.text();
      logStep("WA send", { phone, status: r.status, body: t.slice(0, 200) });
      if (r.ok) return true;
    } catch (e) { logStep("WA error", { phone, e: String(e) }); }
  }
  return false;
}

async function sendWaRetry(supabase: any, phones: string[], message: string, tries = 3) {
  for (let i = 0; i < tries; i++) {
    if (await sendWa(supabase, phones, message)) return true;
    if (i < tries - 1) {
      logStep("WA retry", { attempt: i + 1 });
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return false;
}

function phoneCandidates(lada: string, tel: string) {
  const d = tel.replace(/\D/g, "");
  return lada === "52" ? [`52${d}`, `521${d}`] : [`${lada}${d}`];
}

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

    const body = await req.json();
    const { password, nombre_completo, nombre_empresa, telefono, otp } = body;
    const email = String(body.email || "").trim().toLowerCase();
    const lada_pais = String(body.lada_pais || "52").replace(/\D/g, "");
    const telDigits = String(telefono || "").replace(/\D/g, "");

    if (!telDigits || telDigits.length < 7 || telDigits.length > 12) {
      throw new Error("Ingresa un teléfono de WhatsApp válido para recibir tu código");
    }

    if (body.action === "send_otp") {
      if (!email || !nombre_empresa) throw new Error("Faltan datos");
      // Higiene: borra códigos vencidos o usados de hace más de un día.
      await supabase.from("otp_registro").delete()
        .lt("expires_at", new Date(Date.now() - 24 * 60 * 60000).toISOString());
      const { data: recent } = await supabase.from("otp_registro").select("id")
        .eq("email", email).gte("created_at", new Date(Date.now() - 10 * 60000).toISOString());
      if ((recent?.length || 0) >= 3) throw new Error("Demasiados códigos solicitados. Intenta en 10 minutos.");
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      await supabase.from("otp_registro").insert({
        email, telefono: `${lada_pais}${telDigits}`,
        code_hash: await sha256(`${email}:${code}`),
        expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      });
      const ok = await sendWaRetry(supabase, phoneCandidates(lada_pais, telDigits),
        `🔐 Tu código de verificación de PrestApp es: *${code}*\n\nVence en 10 minutos. No lo compartas con nadie.`);
      if (!ok) throw new Error("No pudimos enviar el código por WhatsApp. Verifica tu número.");
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify OTP
    if (!otp) throw new Error("Ingresa el código que te enviamos por WhatsApp");
    const { data: otpRows } = await supabase.from("otp_registro").select("*")
      .eq("email", email).eq("usado", false).order("created_at", { ascending: false }).limit(3);
    const hash = await sha256(`${email}:${String(otp).trim()}`);
    const otpRow = (otpRows || []).find((r: any) =>
      r.telefono === `${lada_pais}${telDigits}` &&
      new Date(r.expires_at) >= new Date() &&
      r.code_hash === hash
    );
    if (!otpRow) {
      const activo = (otpRows || []).find((r: any) =>
        r.telefono === `${lada_pais}${telDigits}` && new Date(r.expires_at) >= new Date()
      );
      if (activo && activo.intentos >= 5) throw new Error("Demasiados intentos. Solicita un código nuevo.");
      if (activo) await supabase.from("otp_registro").update({ intentos: activo.intentos + 1 }).eq("id", activo.id);
      throw new Error(activo ? "Código incorrecto" : "El código expiró. Solicita uno nuevo.");
    }
    await supabase.from("otp_registro").update({ usado: true }).eq("id", otpRow.id);

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
        lada_pais: lada_pais || "52",
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

    const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
    await sendWa(supabase, [ADMIN_PHONE], `🆕 *Nueva empresa registrada en PrestApp*\n\n🏢 Empresa: ${nombre_empresa}\n👤 Responsable: ${nombre_completo}\n📧 Correo: ${email}\n📱 Teléfono: +${lada_pais} ${telDigits} (verificado ✅)\n🎁 Plan: Prueba ${TRIAL_DAYS} días (vence ${trialEnd.toISOString().split("T")[0]})\n🆔 ID: ${empresa.id}\n🕒 Fecha: ${fecha}`);

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
