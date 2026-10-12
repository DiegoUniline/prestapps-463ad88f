import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o) => o.trim()).filter(Boolean);

const withCors = (handler: (req: Request) => Response | Promise<Response>) => async (req: Request) => {
  const res = await handler(req);
  const origin = req.headers.get("Origin") || "";
  const headers = new Headers(res.headers);
  if (!ALLOWED_ORIGINS.length) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else {
    if (ALLOWED_ORIGINS.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
    else headers.delete("Access-Control-Allow-Origin");
    headers.append("Vary", "Origin");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
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

class AppError extends Error {}

const MAX_INTENTOS_OTP = 5;

serve(withCors(async (req) => {
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
    const telCompleto = `${lada_pais}${telDigits}`;

    if (!telDigits || telDigits.length < 7 || telDigits.length > 12) {
      throw new AppError("Ingresa un teléfono de WhatsApp válido para recibir tu código");
    }

    if (body.action === "send_otp") {
      if (!email || !nombre_empresa) throw new AppError("Faltan datos");
      // Higiene: borra códigos vencidos o usados de hace más de un día.
      await supabase.from("otp_registro").delete()
        .lt("expires_at", new Date(Date.now() - 24 * 60 * 60000).toISOString());
      const { data: recent } = await supabase.from("otp_registro").select("id")
        .eq("email", email).gte("created_at", new Date(Date.now() - 10 * 60000).toISOString());
      if ((recent?.length || 0) >= 3) throw new AppError("Demasiados códigos solicitados. Intenta en 10 minutos.");
      const { data: recentTel } = await supabase.from("otp_registro").select("id")
        .eq("telefono", telCompleto).gte("created_at", new Date(Date.now() - 15 * 60000).toISOString());
      if ((recentTel?.length || 0) >= 3) throw new AppError("Demasiados códigos solicitados para este teléfono. Intenta en 15 minutos.");
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const { error: otpInsErr } = await supabase.from("otp_registro").insert({
        email, telefono: telCompleto,
        code_hash: await sha256(`${email}:${code}`),
        expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      });
      if (otpInsErr) throw otpInsErr;
      const ok = await sendWaRetry(supabase, phoneCandidates(lada_pais, telDigits),
        `🔐 Tu código de verificación de PrestApp es: *${code}*\n\nVence en 10 minutos. No lo compartas con nadie.`);
      if (!ok) throw new AppError("No pudimos enviar el código por WhatsApp. Verifica tu número.");
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!email || !password || !nombre_completo || !nombre_empresa) {
      throw new AppError("Faltan campos requeridos: email, password, nombre_completo, nombre_empresa");
    }

    // Verify OTP
    if (!otp) throw new AppError("Ingresa el código que te enviamos por WhatsApp");
    const { data: otpRows, error: otpErr } = await supabase.from("otp_registro").select("*")
      .eq("email", email).eq("telefono", telCompleto).eq("usado", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (otpErr) throw otpErr;
    const activos = otpRows || [];
    if (!activos.length) throw new AppError("El código expiró. Solicita uno nuevo.");
    if (activos.some((r: any) => (r.intentos || 0) >= MAX_INTENTOS_OTP)) {
      throw new AppError("Demasiados intentos. Espera 10 minutos y solicita un código nuevo.");
    }

    // Charge the attempt before comparing (optimistic: concurrent guesses lose the race)
    const ultimo = activos[0];
    const { data: intentoOk } = await supabase.from("otp_registro")
      .update({ intentos: (ultimo.intentos || 0) + 1 })
      .eq("id", ultimo.id).eq("intentos", ultimo.intentos || 0)
      .select("id");
    if (!intentoOk?.length) throw new AppError("No pudimos validar el código. Intenta de nuevo.");

    const hash = await sha256(`${email}:${String(otp).trim()}`);
    const otpRow = activos.find((r: any) => r.code_hash === hash);
    if (!otpRow) throw new AppError("Código incorrecto");

    const { data: consumido } = await supabase.from("otp_registro")
      .update({ usado: true })
      .eq("id", otpRow.id).eq("usado", false)
      .select("id");
    if (!consumido?.length) throw new AppError("El código ya fue utilizado. Solicita uno nuevo.");

    logStep("Creating user", { email, nombre_empresa });

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for trial
      user_metadata: { nombre_completo, nombre_empresa },
    });

    if (authError) {
      await supabase.from("otp_registro").update({ usado: false }).eq("id", otpRow.id);
      const m = String(authError.message || "").toLowerCase();
      if (m.includes("already been registered") || m.includes("already registered") || m.includes("already exists")) {
        throw new AppError("Este correo ya está registrado. Intenta iniciar sesión.");
      }
      if (m.includes("password")) {
        throw new AppError("La contraseña no cumple los requisitos mínimos (al menos 6 caracteres).");
      }
      throw authError;
    }

    const userId = authData.user.id;
    logStep("User created", { userId });

    let empresaId: string | null = null;
    let trialEnd = new Date();
    try {
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

      if (empresaError) throw empresaError;
      empresaId = empresa.id;
      logStep("Empresa created", { empresaId });

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

      if (profileError) throw profileError;
      logStep("Profile created");

      // 4. Assign admin role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          role: "admin",
        });

      if (roleError) throw roleError;
      logStep("Admin role assigned");

      // 5. Create trial subscription (7 days)
      const now = new Date();
      trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
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

      if (subError) throw subError;
      logStep("Trial subscription created", { trialEnd: trialEnd.toISOString() });
    } catch (e) {
      logStep("Rolling back registration", { userId, empresaId, error: e instanceof Error ? e.message : String(e) });
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("profiles").delete().eq("id", userId);
      if (empresaId) {
        await supabase.from("suscripciones").delete().eq("empresa_id", empresaId);
        await supabase.from("empresas").delete().eq("id", empresaId);
      }
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) logStep("Rollback deleteUser error", { error: delErr.message });
      await supabase.from("otp_registro").update({ usado: false }).eq("id", otpRow.id);
      throw e;
    }

    // 6. Create default caja
    const { error: cajaError } = await supabase
      .from("cajas")
      .insert({
        nombre: "Caja Principal",
        empresa_id: empresaId,
        saldo_actual: 0,
        descripcion: "Caja principal creada automáticamente",
      });

    if (cajaError) logStep("Warning: could not create default caja", { error: cajaError.message });
    else logStep("Default caja created");

    // 7. Create default folio sequences
    await supabase.from("folios").insert([
      { empresa_id: empresaId, tipo: "prestamo", prefijo: "PRE", ultimo_folio: 0 },
      { empresa_id: empresaId, tipo: "cliente", prefijo: "CLI", ultimo_folio: 0 },
    ]);
    logStep("Default folios created");

    const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
    const alertaAdmin = await sendWaRetry(supabase, [ADMIN_PHONE], `🆕 *Nueva empresa registrada en PrestApp*\n\n🏢 Empresa: ${nombre_empresa}\n👤 Responsable: ${nombre_completo}\n📧 Correo: ${email}\n📱 Teléfono: +${lada_pais} ${telDigits} (verificado ✅)\n🎁 Plan: Prueba ${TRIAL_DAYS} días (vence ${trialEnd.toISOString().split("T")[0]})\n🆔 ID: ${empresaId}\n🕒 Fecha: ${fecha}`);
    if (!alertaAdmin) logStep("WARNING: alerta de alta no llegó al administrador", { empresaId });

    logStep("Registration complete", { userId, empresaId });

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      empresa_id: empresaId,
      trial_end: trialEnd.toISOString().split("T")[0],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    const publicMsg = error instanceof AppError
      ? msg
      : "No pudimos completar el registro. Intenta de nuevo en unos minutos.";
    return new Response(JSON.stringify({ error: publicMsg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
}));
