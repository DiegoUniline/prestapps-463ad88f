// Reporte de Crédito Consolidado Persona Moral — Círculo de Crédito (APIHub)
// Firma: ECDSA P-384 + SHA-256 sobre el body, DER en hex, header x-signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RFC_PM = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const ESTADOS = new Set([
  "AGS", "BCN", "BCS", "CAM", "CHS", "CHI", "COA", "COL", "CDMX", "DF", "DGO", "EM", "GTO", "GRO", "HGO", "JAL",
  "MICH", "MOR", "NAY", "NL", "OAX", "PUE", "QRO", "QR", "SLP", "SIN", "SON", "TAB", "TAM", "TLA", "VER", "YUC", "ZAC",
]);
const REUSO_DIAS = 30;
const TIMEOUT_MS = 30_000;
const MAX_INTENTOS = 3;

type Credenciales = {
  api_url: string;
  api_key: string;
  usuario: string;
  password: string;
  private_key: string;
  cdc_public_key: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normRfc = (v: unknown) => String(v ?? "").toUpperCase().replace(/[\s-]/g, "");

const limpio = (v: unknown, max: number) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim().slice(0, max);

// ── Firma ECDSA ────────────────────────────────────────────────────────────────
const pemToDer = (pem: string) =>
  Uint8Array.from(atob(pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from(h.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));

function derLen(n: number) {
  return n < 0x80 ? [n] : [0x81, n];
}

function rawToDer(raw: Uint8Array) {
  const n = raw.length / 2;
  const int = (x: Uint8Array) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    const v = Array.from(x.slice(i));
    if (v[0] & 0x80) v.unshift(0);
    return [0x02, ...derLen(v.length), ...v];
  };
  const body = [...int(raw.slice(0, n)), ...int(raw.slice(n))];
  return new Uint8Array([0x30, ...derLen(body.length), ...body]);
}

function derToRaw(der: Uint8Array, n: number) {
  let p = 2 + (der[1] & 0x80 ? der[1] & 0x7f : 0);
  const read = () => {
    if (der[p++] !== 0x02) throw new Error("Firma DER inválida");
    const len = der[p++];
    let v = der.slice(p, p + len);
    p += len;
    while (v.length > n && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(n);
    out.set(v, n - v.length);
    return out;
  };
  const r = read();
  const s = read();
  return new Uint8Array([...r, ...s]);
}

async function firmar(body: string, privatePem: string) {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(privatePem), { name: "ECDSA", namedCurve: "P-384" }, false, ["sign"]);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(body)));
  return toHex(rawToDer(raw));
}

const CURVAS: [string, number][] = [["P-384", 48], ["P-256", 32], ["P-521", 66]];

async function verificar(body: string, firmaHex: string, publicPem: string) {
  for (const [namedCurve, n] of CURVAS) {
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey("spki", pemToDer(publicPem), { name: "ECDSA", namedCurve }, false, ["verify"]);
    } catch {
      continue;
    }
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(fromHex(firmaHex), n), new TextEncoder().encode(body));
  }
  throw new Error("Llave pública de Círculo no soportada");
}

// ── Mapeo Círculo de Crédito RCC PM ───────────────────────────────────────────
function buildRequest(c: Record<string, any>, folioOtorgante: string) {
  return {
    folioOtorgante,
    persona: {
      RFC: normRfc(c.rfc),
      nombre: limpio(c.razon_social || c.nombre_completo, 75),
      domicilio: {
        direccion: limpio(`${c.dom_calle ?? ""} ${c.dom_numero ?? ""}`, 40),
        coloniaPoblacion: limpio(c.dom_colonia, 60),
        delegacionMunicipio: limpio(c.dom_municipio, 60),
        ciudad: limpio(c.dom_ciudad || c.dom_municipio, 40),
        estado: limpio(c.dom_estado, 4),
        CP: String(c.dom_cp ?? "").replace(/\D/g, "").padStart(5, "0"),
        pais: "MX",
      },
    },
  };
}

const num = (v: unknown) => (isNaN(Number(v)) ? 0 : Number(v));
const BUCKETS_VENCIDO = ["29dias", "59dias", "89dias", "119dias", "179dias", "180MasDias"];

function parseResponse(d: any) {
  const fin: any[] = d?.credito?.cuentasFinancieras ?? [];
  const com: any[] = d?.credito?.cuentasComerciales ?? [];
  const cuentas = [...fin, ...com];
  const califs: string[] = (d?.calificacionCartera ?? []).map((x: any) => String(x?.calificacion ?? "")).filter(Boolean);
  const peor = califs.sort().at(-1) ?? null;
  return {
    folio: d?.folioConsulta != null ? String(d.folioConsulta) : null,
    sinHit: cuentas.length === 0 && !(d?.consultasInstitucionales?.consultasFinancieras?.length),
    resumen: {
      clave_retorno: d?.claveRetorno ?? null,
      num_creditos: cuentas.length,
      num_financieras: fin.length,
      num_comerciales: com.length,
      saldo_total: cuentas.reduce((s, x) => s + num(x?.saldoTotal), 0),
      saldo_vigente: cuentas.reduce((s, x) => s + num(x?.vigente), 0),
      saldo_vencido: cuentas.reduce((s, x) => s + BUCKETS_VENCIDO.reduce((a, k) => a + num(x?.[k]), 0), 0),
      atraso_mayor: cuentas.reduce((m, x) => Math.max(m, num(x?.atrasoMayor)), 0),
      peor_calificacion: peor,
      claves_prevencion: (d?.clavePrevenciones ?? []).length,
      consultas_financieras: (d?.consultasInstitucionales?.consultasFinancieras ?? []).length,
      consultas_comerciales: (d?.consultasInstitucionales?.consultasComerciales ?? []).length,
    },
  };
}

async function callApi(payload: unknown, cred: Credenciales) {
  const body = JSON.stringify(payload);
  // Sandbox: solo x-api-key. Producción: usuario/contraseña + firma.
  const produccion = !!(cred.usuario && cred.password);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": cred.api_key,
  };
  if (produccion) {
    headers.username = cred.usuario;
    headers.password = cred.password;
    headers["x-signature"] = await firmar(body, cred.private_key);
  }
  let lastErr = "";
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(cred.api_url, {
        method: "POST",
        headers,
        body,
        signal: ctrl.signal,
      });
      if (res.status === 204) return { ok: false as const, status: 204, data: null, error: "Sin historial", intentos: i };
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (res.ok && produccion && cred.cdc_public_key) {
        const sig = res.headers.get("x-signature");
        if (!sig || !(await verificar(text, sig, cred.cdc_public_key))) {
          return { ok: false as const, status: res.status, data, error: "Firma de respuesta inválida", intentos: i };
        }
      }
      if (res.ok) return { ok: true as const, status: res.status, data, intentos: i };

      const errs = (data?.errores ?? []).map((e: any) => `${e.codigo}: ${e.mensaje}`).join(" | ");
      lastErr = `HTTP ${res.status}${errs ? ` — ${errs}` : `: ${text.slice(0, 300)}`}`;
      if (res.status < 500 && res.status !== 429) return { ok: false as const, status: res.status, data, error: lastErr, intentos: i };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(t);
    }
    if (i < MAX_INTENTOS) await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
  }
  return { ok: false as const, status: 0, data: null, error: lastErr, intentos: MAX_INTENTOS };
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
    if (!ESTADOS.has(String(c.dom_estado).toUpperCase())) return json({ error: "Estado inválido para Círculo de Crédito" }, 400);

    if (!forzar) {
      const desde = new Date(Date.now() - REUSO_DIAS * 86400_000).toISOString();
      const { data: previa } = await admin.from("buro_consultas").select("*")
        .eq("cliente_id", cliente_id).eq("rfc", rfc).in("estatus", ["exitosa", "sin_hit"])
        .gte("created_at", desde).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (previa) return json({ reutilizada: true, consulta: previa });
    }

    const { data: cred } = await admin.from("circulo_config").select("*").eq("id", 1).maybeSingle();
    if (!cred?.activo || !cred.api_url || !cred.api_key || (cred.usuario && cred.password && !cred.private_key)) {
      return json({ error: "Servicio de consulta no disponible" }, 503);
    }

    const { data: plan } = await admin.from("buro_empresa_config").select("*")
      .eq("empresa_id", profile.empresa_id).maybeSingle();
    if (!plan?.habilitado) return json({ error: "Tu empresa no tiene contratado el servicio de consultas" }, 403);
    if (plan.creditos <= 0) return json({ error: "Sin créditos de consulta disponibles" }, 402);

    const { data: consulta, error: insErr } = await admin.from("buro_consultas").insert({
      empresa_id: profile.empresa_id,
      cliente_id,
      proveedor: "circulo",
      tipo_persona: "moral",
      rfc,
      razon_social: c.razon_social,
      estatus: "pendiente",
      autorizacion_fecha,
      autorizacion_path: autorizacion_path ?? null,
      consultado_por: user.id,
      precio: plan.precio_consulta,
    }).select("id").single();
    if (insErr) throw insErr;

    const { data: saldo, error: credErr } = await admin.rpc("buro_mover_creditos", {
      p_empresa_id: profile.empresa_id, p_cantidad: -1, p_tipo: "consumo", p_consulta_id: consulta.id, p_user: user.id,
    });
    if (credErr || saldo === null) {
      await admin.from("buro_consultas").update({ estatus: "error", error: "Sin créditos", precio: null }).eq("id", consulta.id);
      return json({ error: "Sin créditos de consulta disponibles" }, 402);
    }

    const folioOtorgante = consulta.id.replace(/-/g, "").slice(0, 25);
    const r = await callApi(buildRequest(c, folioOtorgante), cred);

    let update: Record<string, unknown>;
    if (r.ok) {
      const p = parseResponse(r.data);
      update = {
        estatus: p.sinHit ? "sin_hit" : "exitosa",
        folio_consulta: p.folio,
        resumen: p.resumen,
        respuesta: r.data,
        intentos: r.intentos,
      };
    } else if (r.status === 404 || r.status === 204) {
      update = { estatus: "sin_hit", error: r.error, respuesta: r.data, intentos: r.intentos };
    } else {
      update = { estatus: "error", error: r.error, respuesta: r.data, intentos: r.intentos, precio: null };
      await admin.rpc("buro_mover_creditos", {
        p_empresa_id: profile.empresa_id, p_cantidad: 1, p_tipo: "reembolso", p_consulta_id: consulta.id, p_user: user.id,
      });
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
