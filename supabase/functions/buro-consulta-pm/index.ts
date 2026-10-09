import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RFC_PM = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const REUSO_DIAS = 30;
const TIMEOUT_MS = 30_000;
const MAX_INTENTOS = 3;

type Credenciales = { api_url: string; api_key: string; usuario: string; password: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normRfc = (v: unknown) => String(v ?? "").toUpperCase().replace(/[\s-]/g, "");

const limpio = (v: unknown, max = 40) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().slice(0, max);

// ── Contrato Buró PM: ajustar llaves al layout entregado por Buró en el contrato ──
function buildRequest(c: Record<string, any>, cred: Credenciales) {
  return {
    encabezado: {
      usuario: cred.usuario,
      producto: Deno.env.get("BURO_PRODUCTO_PM") ?? "INFORME_BURO_PM",
      tipoConsulta: "PM",
      referencia: c.id_cliente,
    },
    empresa: {
      rfc: normRfc(c.rfc),
      razonSocial: limpio(c.razon_social || c.nombre_completo, 150),
      domicilio: {
        direccion: limpio(`${c.dom_calle ?? ""} ${c.dom_numero ?? ""}`, 80),
        coloniaPoblacion: limpio(c.dom_colonia),
        delegacionMunicipio: limpio(c.dom_municipio),
        ciudad: limpio(c.dom_ciudad || c.dom_municipio),
        estado: limpio(c.dom_estado, 4),
        codigoPostal: String(c.dom_cp ?? "").replace(/\D/g, "").padStart(5, "0"),
        pais: "MX",
      },
    },
  };
}

function findKey(obj: any, re: RegExp, depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 8) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (re.test(k) && (typeof v === "string" || typeof v === "number")) return v;
  }
  for (const v of Object.values(obj)) {
    const r = findKey(v, re, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

function findArray(obj: any, re: RegExp, depth = 0): any[] {
  if (!obj || typeof obj !== "object" || depth > 8) return [];
  for (const [k, v] of Object.entries(obj)) {
    if (re.test(k) && Array.isArray(v)) return v;
  }
  for (const v of Object.values(obj)) {
    const r = findArray(v, re, depth + 1);
    if (r.length) return r;
  }
  return [];
}

function parseResponse(data: any) {
  const folio = findKey(data, /^folio/i);
  const scoreRaw = findKey(data, /(score|calificacion)/i);
  const score = scoreRaw != null && !isNaN(Number(scoreRaw)) ? Math.round(Number(scoreRaw)) : null;
  const creditos = findArray(data, /(creditos|cuentas|creditoFinanciero)/i);
  const num = (v: any) => (isNaN(Number(v)) ? 0 : Number(v));
  const saldoTotal = creditos.reduce((s, cr) => s + num(findKey(cr, /saldo(Inicial|Vigente|Actual)?$/i)), 0);
  const saldoVencido = creditos.reduce(
    (s, cr) => s + num(findKey(cr, /saldoVencido|vencido(1a29|30a59|60a89|90|120|180)?/i)),
    0,
  );
  const sinHit = /no\s*(se\s*)?encontr|sin\s*hit|no\s*hit/i.test(JSON.stringify(findKey(data, /(mensaje|descripcion|estatus)/i) ?? ""));
  return {
    sinHit: sinHit && creditos.length === 0,
    folio: folio != null ? String(folio) : null,
    score,
    resumen: { num_creditos: creditos.length, saldo_total: saldoTotal, saldo_vencido: saldoVencido },
  };
}
// ───────────────────────────────────────────────────────────────────────────────

async function callBuro(payload: unknown, cred: Credenciales) {
  let lastErr = "";
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(cred.api_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-api-key": cred.api_key,
          username: cred.usuario,
          password: cred.password,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (res.ok) return { ok: true as const, data, intentos: i };
      lastErr = `HTTP ${res.status}: ${text.slice(0, 500)}`;
      if (res.status < 500 && res.status !== 429) return { ok: false as const, data, error: lastErr, intentos: i };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(t);
    }
    if (i < MAX_INTENTOS) await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
  }
  return { ok: false as const, data: null, error: lastErr, intentos: MAX_INTENTOS };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles || []).some((r) => r.role === "admin" || r.role === "supervisor")) {
      return json({ error: "Solo administradores o supervisores pueden consultar Buró" }, 403);
    }

    const { data: profile } = await admin.from("profiles").select("empresa_id").eq("id", user.id).single();
    if (!profile?.empresa_id) return json({ error: "Sin empresa asociada" }, 400);

    const { cliente_id, autorizacion_fecha, autorizacion_path, forzar } = await req.json();
    if (!cliente_id) return json({ error: "Falta cliente_id" }, 400);
    if (!autorizacion_fecha) return json({ error: "Falta fecha de autorización firmada" }, 400);
    if (new Date(autorizacion_fecha) > new Date()) return json({ error: "Fecha de autorización inválida" }, 400);
    if (autorizacion_path && !String(autorizacion_path).startsWith(`${profile.empresa_id}/`)) {
      return json({ error: "Archivo de autorización inválido" }, 400);
    }

    const { data: c } = await admin.from("clientes").select("*").eq("id", cliente_id).single();
    if (!c || c.empresa_id !== profile.empresa_id) return json({ error: "Cliente no encontrado" }, 404);
    if (c.tipo_persona !== "moral") return json({ error: "El cliente no es persona moral" }, 400);

    const rfc = normRfc(c.rfc);
    if (!RFC_PM.test(rfc)) return json({ error: "RFC de persona moral inválido (12 caracteres)" }, 400);
    const faltan = ["razon_social", "dom_calle", "dom_colonia", "dom_municipio", "dom_estado", "dom_cp"]
      .filter((k) => !String(c[k] ?? "").trim());
    if (faltan.length) return json({ error: `Faltan datos: ${faltan.join(", ")}` }, 400);

    if (!forzar) {
      const desde = new Date(Date.now() - REUSO_DIAS * 86400_000).toISOString();
      const { data: previa } = await admin.from("buro_consultas").select("*")
        .eq("cliente_id", cliente_id).eq("rfc", rfc).in("estatus", ["exitosa", "sin_hit"])
        .gte("created_at", desde).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (previa) return json({ reutilizada: true, consulta: previa });
    }

    const { data: credRow } = await admin.from("buro_credenciales").select("*")
      .eq("empresa_id", profile.empresa_id).eq("activo", true).maybeSingle();
    const cred: Credenciales | null = credRow ?? (Deno.env.get("BURO_API_URL")
      ? {
          api_url: Deno.env.get("BURO_API_URL")!,
          api_key: Deno.env.get("BURO_API_KEY") ?? "",
          usuario: Deno.env.get("BURO_USERNAME") ?? "",
          password: Deno.env.get("BURO_PASSWORD") ?? "",
        }
      : null);
    if (!cred) return json({ error: "Buró de Crédito no configurado para esta empresa" }, 400);

    const { data: consulta, error: insErr } = await admin.from("buro_consultas").insert({
      empresa_id: profile.empresa_id,
      cliente_id,
      tipo_persona: "moral",
      rfc,
      razon_social: c.razon_social,
      estatus: "pendiente",
      autorizacion_fecha,
      autorizacion_path: autorizacion_path ?? null,
      consultado_por: user.id,
    }).select("id").single();
    if (insErr) throw insErr;

    const r = await callBuro(buildRequest(c, cred), cred);

    let update: Record<string, unknown>;
    if (r.ok) {
      const p = parseResponse(r.data);
      update = {
        estatus: p.sinHit ? "sin_hit" : "exitosa",
        folio_consulta: p.folio,
        score: p.score,
        resumen: p.resumen,
        respuesta: r.data,
        intentos: r.intentos,
      };
    } else {
      update = { estatus: "error", error: r.error, respuesta: r.data, intentos: r.intentos };
    }

    const { data: final } = await admin.from("buro_consultas")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", consulta.id).select("*").single();

    return json({ reutilizada: false, consulta: final });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("buro-consulta-pm error:", msg);
    return json({ error: msg }, 500);
  }
});
