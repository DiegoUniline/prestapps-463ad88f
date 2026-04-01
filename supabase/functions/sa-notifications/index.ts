import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPER_ADMIN_EMAIL = "diego.leon@uniline.mx";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify super admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No auth" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(token);
  if (userData.user?.email !== SUPER_ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: "Not authorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 403,
    });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "logs";

  try {
    if (action === "logs") {
      const { data, error } = await supabase
        .from("whatsapp_log")
        .select("*")
        .is("empresa_id", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "templates") {
      const { data, error } = await supabase
        .from("system_notification_templates")
        .select("*");
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save-template" && req.method === "POST") {
      const body = await req.json();
      const { template_key, message_template } = body;

      const { data: existing } = await supabase
        .from("system_notification_templates")
        .select("id")
        .eq("template_key", template_key)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("system_notification_templates")
          .update({ message_template, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("system_notification_templates")
          .insert({ template_key, message_template });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "empresas") {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nombre")
        .order("nombre");
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "wa-configs") {
      const { data, error } = await supabase
        .from("whatsapp_config")
        .select("*, empresas:empresa_id(nombre, telefono)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "system-wa-config") {
      const { data, error } = await supabase
        .from("system_notification_templates")
        .select("message_template")
        .eq("template_key", "__system_wa_config")
        .maybeSingle();
      if (error) throw error;
      let config = { api_url: "", api_token: "" };
      try { config = JSON.parse(data?.message_template || "{}"); } catch {}
      return new Response(JSON.stringify(config), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save-system-wa-config" && req.method === "POST") {
      const body = await req.json();
      const { api_url, api_token } = body;
      const configJson = JSON.stringify({ api_url: api_url || "", api_token: api_token || "" });

      const { data: existing } = await supabase
        .from("system_notification_templates")
        .select("id")
        .eq("template_key", "__system_wa_config")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("system_notification_templates")
          .update({ message_template: configJson, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("system_notification_templates")
          .insert({ template_key: "__system_wa_config", message_template: configJson });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
