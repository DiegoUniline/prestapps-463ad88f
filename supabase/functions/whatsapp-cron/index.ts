import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
        } catch (e: any) {
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
        } catch (e: any) {
          results.push({ empresa_id: cfg.empresa_id, tipo: "vencido", sent: 0, errors: 1, total: 0 });
        }
      }
    }

    console.log("WhatsApp cron results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("WhatsApp cron error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
