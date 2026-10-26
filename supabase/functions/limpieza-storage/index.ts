import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// Solo se borran archivos temporales de esta carpeta y con estas extensiones.
const BUCKET = "empresa-assets";
const PREFIX = "temp-receipts";
const EXTENSIONES = [".png", ".html", ".pdf"];
const DIAS = Math.max(1, Number(Deno.env.get("STORAGE_RETENTION_DAYS") || "7"));
const CHUNK = 100;

type Caller = { service: boolean; superAdmin: boolean };

async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return { service: true, superAdmin: false };
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;
  const email = String(user.email || "").toLowerCase();
  return { service: false, superAdmin: !!email && email === SUPER_ADMIN_EMAIL };
}

// El cron llega con la anon key: solo corre si gana el reclamo (una vez por periodo).
async function cronGate(req: Request, admin: SupabaseClient): Promise<Response | null> {
  const caller = await getCaller(req, admin);
  if (caller?.service || caller?.superAdmin) return null;
  const { data: claimed, error } = await admin.rpc("cron_claim", {
    p_nombre: "limpieza-storage",
    p_min_minutes: DIAS * 24 * 60,
  });
  if (error) console.error("[limpieza-storage] cron_claim error:", error.message);
  if (error || claimed !== true) {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

type Objeto = { name: string; created_at: string | null; metadata: unknown };

function esArchivoTemporal(name: string): boolean {
  const lower = name.toLowerCase();
  return EXTENSIONES.some((ext) => lower.endsWith(ext));
}

function tamano(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const meta = metadata as Record<string, unknown>;
  const size = Number(meta.size ?? 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

// Recorre todos los archivos de una carpeta, paginados de 1000 en 1000.
async function recorrer(supabase: SupabaseClient, prefix: string, fn: (o: Objeto) => void): Promise<void> {
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) throw error;
    const page = data || [];
    for (const o of page) fn({ name: o.name, created_at: o.created_at, metadata: o.metadata });
    if (page.length < 1000) break;
    offset += page.length;
  }
}

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const gate = await cronGate(req, supabase);
    if (gate) return gate;

    const corte = Date.now() - DIAS * 24 * 60 * 60 * 1000;

    // Archivos que la cola todavía necesita (mensajes que no han cerrado).
    const protegidos = new Set<string>();
    const { data: pendientes } = await supabase
      .from("whatsapp_cola")
      .select("media_url")
      .not("estado", "in", "(enviado,error)");
    const publicPrefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
    for (const row of pendientes || []) {
      const url: string = row.media_url || "";
      if (!url.startsWith(publicPrefix)) continue;
      const path = decodeURIComponent(url.slice(publicPrefix.length).split("?")[0]);
      if (path.startsWith(`${PREFIX}/`) && !path.includes("..")) protegidos.add(path);
    }

    const archivos: { path: string; size: number }[] = [];
    const subcarpetas: string[] = [];
    let revisados = 0;

    const considerar = (o: Objeto, folder: string) => {
      if (!esArchivoTemporal(o.name)) return;
      revisados++;
      if (!o.created_at) return;
      const creado = new Date(o.created_at).getTime();
      if (!Number.isFinite(creado) || creado >= corte) return;
      const path = `${folder}/${o.name}`;
      if (protegidos.has(path)) return;
      archivos.push({ path, size: tamano(o.metadata) });
    };

    // Raíz de temp-receipts: archivos sueltos y subcarpetas (una por empresa).
    await recorrer(supabase, PREFIX, (o) => {
      if (o.created_at) considerar(o, PREFIX);
      else if (o.name && !o.name.includes("..")) subcarpetas.push(o.name);
    });

    for (const sub of subcarpetas) {
      const folder = `${PREFIX}/${sub}`;
      await recorrer(supabase, folder, (o) => considerar(o, folder));
    }

    let borrados = 0;
    let liberado = 0;
    const errores: string[] = [];
    for (let i = 0; i < archivos.length; i += CHUNK) {
      const lote = archivos.slice(i, i + CHUNK);
      const { data: ok, error } = await supabase.storage.from(BUCKET).remove(lote.map((a) => a.path));
      if (error) {
        errores.push(error.message);
        continue;
      }
      const names = new Set((ok || []).map((f) => String(f.name ?? "")));
      const matched = lote.filter((a) => names.has(a.path) || names.has(a.path.split("/").pop() ?? ""));
      const items = matched.length === lote.length ? lote : matched;
      borrados += Math.min(ok?.length ?? 0, lote.length);
      liberado += items.reduce((s, a) => s + a.size, 0);
    }

    const resumen = {
      success: errores.length === 0,
      dias: DIAS,
      revisados,
      borrados,
      liberado_mb: Math.round((liberado / (1024 * 1024)) * 100) / 100,
      protegidos: protegidos.size,
      errores: errores.slice(0, 5),
    };
    console.log("[limpieza-storage]", JSON.stringify(resumen));

    return new Response(JSON.stringify(resumen), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error);
    console.error("[limpieza-storage] error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
