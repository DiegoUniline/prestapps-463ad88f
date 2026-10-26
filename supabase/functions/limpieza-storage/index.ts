// Limpieza diaria de empresa-assets:
//  - temp-receipts/<empresa>/…: recibos/documentos temporales de WhatsApp con más de 2 días.
//  - clientes/…: fotos con más de 1 día que ya no usa ningún cliente (reemplazadas o de clientes borrados).
// body { dry_run: true } solo cuenta, no borra.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const SUPER_ADMIN_EMAIL = (Deno.env.get("SUPER_ADMIN_EMAIL") || "diego.leon@uniline.mx").trim().toLowerCase();
const BUCKET = "empresa-assets";
const DIA = 86400_000;
const PAGINA = 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Archivo = { path: string; creado: number; bytes: number };

async function listar(admin: SupabaseClient, carpeta: string): Promise<{ archivos: Archivo[]; carpetas: string[] }> {
  const archivos: Archivo[] = [];
  const carpetas: string[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await admin.storage.from(BUCKET).list(carpeta, { limit: PAGINA, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${carpeta}: ${error.message}`);
    for (const f of data ?? []) {
      if (!f.id) carpetas.push(`${carpeta}/${f.name}`);
      else archivos.push({ path: `${carpeta}/${f.name}`, creado: new Date(f.created_at).getTime(), bytes: Number(f.metadata?.size ?? 0) });
    }
    if ((data ?? []).length < PAGINA) break;
  }
  return { archivos, carpetas };
}

async function borrar(admin: SupabaseClient, paths: string[]) {
  for (let i = 0; i < paths.length; i += PAGINA) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + PAGINA));
    if (error) throw new Error(`remove: ${error.message}`);
  }
}

// Ruta dentro del bucket a partir de la URL pública (o de una ruta ya relativa). null = formato desconocido.
function rutaDe(url: string, prefijo: string): string | null {
  const v = url.trim();
  if (v.startsWith(prefijo)) return decodeURIComponent(v.slice(prefijo.length).split("?")[0]);
  if (v.startsWith("clientes/")) return v.split("?")[0];
  return null;
}

const resumen = (a: Archivo[]) => ({ archivos: a.length, mb: Math.round(a.reduce((s, x) => s + x.bytes, 0) / 1048576) });

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    // Service role y super admin corren libres; cualquier otro (pg_cron con la anon key) una vez por día.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    let libre = !!token && token === serviceKey;
    if (!libre && token) {
      const { data } = await admin.auth.getUser(token);
      libre = (data?.user?.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
    }
    if (!libre) {
      const { data: claimed, error } = await admin.rpc("cron_claim", dryRun
        ? { p_nombre: "limpieza-storage-dry", p_min_minutes: 1 }
        : { p_nombre: "limpieza-storage", p_min_minutes: 600 });
      if (error) console.error("[limpieza-storage] cron_claim error:", error.message);
      if (error || claimed !== true) return json({ skipped: true });
    }

    const ahora = Date.now();

    // 1) Temporales de WhatsApp
    const { carpetas } = await listar(admin, "temp-receipts");
    const temporales: Archivo[] = [];
    for (const c of carpetas) {
      const { archivos } = await listar(admin, c);
      temporales.push(...archivos.filter((a) => a.creado < ahora - 2 * DIA));
    }

    // 2) Fotos de clientes sin referencia
    const prefijo = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
    const usadas = new Set<string>();
    let desconocidas = 0;
    for (let from = 0; ; from += PAGINA) {
      const { data, error } = await admin.from("clientes").select("foto_cliente")
        .not("foto_cliente", "is", null).order("id").range(from, from + PAGINA - 1);
      if (error) throw new Error(`clientes: ${error.message}`);
      for (const r of data ?? []) {
        if (!String(r.foto_cliente).trim()) continue;
        const p = rutaDe(String(r.foto_cliente), prefijo);
        if (p) usadas.add(p); else desconocidas++;
      }
      if ((data ?? []).length < PAGINA) break;
    }
    const { archivos: fotos } = await listar(admin, "clientes");
    // Si alguna foto_cliente tiene un formato que no se reconoce, no se borra ninguna foto.
    const huerfanas = desconocidas ? [] : fotos.filter((a) => a.creado < ahora - DIA && !usadas.has(a.path));

    if (!dryRun) {
      await borrar(admin, temporales.map((a) => a.path));
      await borrar(admin, huerfanas.map((a) => a.path));
    }

    const res = {
      dry_run: dryRun,
      temporales: resumen(temporales),
      fotos_huerfanas: resumen(huerfanas),
      fotos_en_uso: resumen(fotos.filter((a) => usadas.has(a.path))),
      fotos_formato_desconocido: desconocidas,
    };
    console.log("limpieza-storage:", JSON.stringify(res));
    return json(res);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("limpieza-storage error:", msg);
    return json({ error: msg }, 500);
  }
}));
