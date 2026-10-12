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

type Caller = {
  service: boolean;
  userId: string | null;
  email: string | null;
  empresaId: string | null;
  roles: string[];
  superAdmin: boolean;
};

async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) {
    return { service: true, userId: null, email: null, empresaId: null, roles: [], superAdmin: false };
  }
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    admin.from("profiles").select("empresa_id").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const email = String(user.email || "").toLowerCase();
  return {
    service: false,
    userId: user.id,
    email,
    empresaId: profile?.empresa_id ?? null,
    roles: (roleRows || []).map((r: { role: string }) => r.role),
    superAdmin: !!email && email === SUPER_ADMIN_EMAIL,
  };
}

// Service role and super admin run freely; any other caller (e.g. pg_cron with the anon key) is throttled.
async function cronGate(req: Request, admin: SupabaseClient, nombre: string): Promise<Response | null> {
  const caller = await getCaller(req, admin);
  if (caller?.service || caller?.superAdmin) return null;
  const { data: claimed, error } = await admin.rpc("cron_claim", { p_nombre: nombre, p_min_minutes: 50 });
  if (error) console.error(`[${nombre}] cron_claim error:`, error.message);
  if (error || claimed !== true) {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const gate = await cronGate(req, supabase, "whatsapp-cron");
    if (gate) return gate;

    // Get all empresas with active WhatsApp and at least one reminder enabled
    const { data: configs, error: cfgErr } = await supabase
      .from("whatsapp_config")
      .select("empresa_id, aviso_dia_antes, aviso_vencido")
      .eq("activo", true);

    if (cfgErr) throw cfgErr;

    const results: { empresa_id: string; tipo: string; sent: number; errors: number; total: number }[] = [];

    for (const cfg of (configs || [])) {
      // Send "dia_antes" reminders
      if (cfg.aviso_dia_antes) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "send-reminder",
              empresa_id: cfg.empresa_id,
              reminder_type: "dia_antes",
            }),
          });
          const data = await res.json();
          results.push({
            empresa_id: cfg.empresa_id,
            tipo: "dia_antes",
            sent: data.sent || 0,
            errors: data.errors || 0,
            total: data.total || 0,
          });
        } catch {
          results.push({ empresa_id: cfg.empresa_id, tipo: "dia_antes", sent: 0, errors: 1, total: 0 });
        }
      }

      // Send "vencido" reminders
      if (cfg.aviso_vencido) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "send-reminder",
              empresa_id: cfg.empresa_id,
              reminder_type: "vencido",
            }),
          });
          const data = await res.json();
          results.push({
            empresa_id: cfg.empresa_id,
            tipo: "vencido",
            sent: data.sent || 0,
            errors: data.errors || 0,
            total: data.total || 0,
          });
        } catch {
          results.push({ empresa_id: cfg.empresa_id, tipo: "vencido", sent: 0, errors: 1, total: 0 });
        }
      }
    }

    // Cola de WhatsApp (recibos, documentos): procesa lo pendiente de todas las empresas
    let queue: unknown = null;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "process-queue" }),
      });
      queue = await res.json().catch(() => ({ status: res.status }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("WhatsApp queue error:", msg || e);
      queue = { error: msg || String(e) };
    }

    console.log("WhatsApp cron results:", JSON.stringify(results), "queue:", JSON.stringify(queue));

    return new Response(JSON.stringify({ success: true, results, queue }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("WhatsApp cron error:", error);
    // cfgErr (PostgrestError) is a plain object with .message, not always an Error instance
    const msg = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
