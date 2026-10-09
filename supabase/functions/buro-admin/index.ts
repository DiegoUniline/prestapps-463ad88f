// Super Admin: configuración global de Círculo de Crédito y créditos de consulta por empresa
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as x509 from "npm:@peculiar/x509@1.12.3";

x509.cryptoProvider.set(crypto);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPER_ADMIN_EMAIL = "diego.leon@uniline.mx";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const toPem = (der: ArrayBuffer, label: string) => {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
};

const mask = (v: string | null) => (v ? `••••${v.slice(-4)}` : null);

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
    if (!user || user.email !== SUPER_ADMIN_EMAIL) return json({ error: "Solo super admin" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "get") {
      const { data: cfg } = await admin.from("circulo_config").select("*").eq("id", 1).maybeSingle();
      const { data: empresas } = await admin.from("empresas").select("id, nombre").order("nombre");
      const { data: confs } = await admin.from("buro_empresa_config").select("*");

      const inicioMes = new Date();
      inicioMes.setUTCDate(1);
      inicioMes.setUTCHours(0, 0, 0, 0);
      const { data: consumos } = await admin.from("buro_consultas")
        .select("empresa_id, precio")
        .gte("created_at", inicioMes.toISOString())
        .not("precio", "is", null);

      const uso: Record<string, { consultas: number; importe: number }> = {};
      for (const c of consumos || []) {
        uso[c.empresa_id] ??= { consultas: 0, importe: 0 };
        uso[c.empresa_id].consultas += 1;
        uso[c.empresa_id].importe += Number(c.precio || 0);
      }
      const confMap = Object.fromEntries((confs || []).map((c) => [c.empresa_id, c]));

      return json({
        config: {
          api_url: cfg?.api_url ?? "",
          usuario: cfg?.usuario ?? "",
          api_key_mask: mask(cfg?.api_key ?? null),
          tiene_password: !!cfg?.password,
          tiene_llave: !!cfg?.private_key,
          certificado: cfg?.certificado ?? null,
          tiene_cert_cdc: !!cfg?.cdc_public_key,
          activo: !!cfg?.activo,
          updated_at: cfg?.updated_at ?? null,
        },
        empresas: (empresas || []).map((e) => ({
          id: e.id,
          nombre: e.nombre,
          habilitado: confMap[e.id]?.habilitado ?? false,
          creditos: confMap[e.id]?.creditos ?? 0,
          precio_consulta: Number(confMap[e.id]?.precio_consulta ?? 0),
          consultas_mes: uso[e.id]?.consultas ?? 0,
          importe_mes: uso[e.id]?.importe ?? 0,
        })),
      });
    }

    if (action === "save_config") {
      const upd: Record<string, unknown> = {
        api_url: String(body.api_url ?? "").trim() || null,
        usuario: String(body.usuario ?? "").trim() || null,
        activo: !!body.activo,
        updated_at: new Date().toISOString(),
      };
      if (body.api_key) upd.api_key = String(body.api_key).trim();
      if (body.password) upd.password = String(body.password);
      const { error } = await admin.from("circulo_config").upsert({ id: 1, ...upd });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "generar_llaves") {
      // Círculo de Crédito: prime256v1 + SHA256withECDSA (Deno no soporta P-384 con SHA-256)
      const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
      const keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]) as CryptoKeyPair;
      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        name: "C=MX, O=PrestApps, CN=PrestApps Circulo",
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 2 * 365 * 86400_000),
        signingAlgorithm: alg,
        keys,
      });
      const privatePem = toPem(await crypto.subtle.exportKey("pkcs8", keys.privateKey), "PRIVATE KEY");
      const certPem = cert.toString("pem");
      const { error } = await admin.from("circulo_config").upsert({
        id: 1, private_key: privatePem, certificado: certPem, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ ok: true, certificado: certPem });
    }

    if (action === "subir_cert_cdc") {
      const pem = String(body.pem ?? "").trim();
      let spki: string;
      if (pem.includes("BEGIN CERTIFICATE")) {
        spki = new x509.X509Certificate(pem).publicKey.toString("pem");
      } else if (pem.includes("BEGIN PUBLIC KEY")) {
        spki = new x509.PublicKey(pem).toString("pem");
      } else {
        return json({ error: "Archivo no reconocido (se espera certificado PEM)" }, 400);
      }
      const { error } = await admin.from("circulo_config").upsert({
        id: 1, cdc_public_key: spki, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "save_empresa") {
      if (!body.empresa_id) return json({ error: "Falta empresa_id" }, 400);
      const { error } = await admin.from("buro_empresa_config").upsert({
        empresa_id: body.empresa_id,
        habilitado: !!body.habilitado,
        precio_consulta: Math.max(0, Number(body.precio_consulta) || 0),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "asignar_creditos") {
      const cantidad = Math.trunc(Number(body.cantidad));
      if (!body.empresa_id || !cantidad) return json({ error: "Datos incompletos" }, 400);
      const { data: saldo, error } = await admin.rpc("buro_mover_creditos", {
        p_empresa_id: body.empresa_id,
        p_cantidad: cantidad,
        p_tipo: cantidad > 0 ? "asignacion" : "ajuste",
        p_nota: body.nota ?? null,
        p_user: user.id,
      });
      if (error) throw error;
      if (saldo === null) return json({ error: "El ajuste deja el saldo en negativo" }, 400);
      return json({ ok: true, saldo });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("buro-admin error:", msg);
    return json({ error: msg }, 500);
  }
});
