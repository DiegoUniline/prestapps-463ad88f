import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, password, nombre_completo, telefono, direccion, rol, porcentaje_comision, activo } = body;

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError) throw authError;

      const userId = authData.user.id;

      // Create profile
      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        nombre_completo,
        telefono: telefono || null,
        direccion: direccion || null,
        porcentaje_comision: porcentaje_comision || 0,
        activo: activo ?? true,
      });
      if (profileError) throw profileError;

      // Assign role
      const roleMap: Record<string, string> = { Admin: "admin", Supervisor: "supervisor", Cobrador: "cobrador" };
      const dbRole = roleMap[rol] || "cobrador";
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: dbRole,
      });
      if (roleError) throw roleError;

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, nombre_completo, telefono, direccion, rol, porcentaje_comision, activo, password } = body;

      // Update profile
      const { error: profileError } = await supabase.from("profiles").update({
        nombre_completo,
        telefono: telefono || null,
        direccion: direccion || null,
        porcentaje_comision: porcentaje_comision || 0,
        activo: activo ?? true,
      }).eq("id", user_id);
      if (profileError) throw profileError;

      // Update role
      const roleMap: Record<string, string> = { Admin: "admin", Supervisor: "supervisor", Cobrador: "cobrador" };
      const dbRole = roleMap[rol] || "cobrador";
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: user_id,
        role: dbRole,
      });
      if (roleError) throw roleError;

      // Update password if provided
      if (password) {
        const { error: pwError } = await supabase.auth.admin.updateUserById(user_id, { password });
        if (pwError) throw pwError;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = body;
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      // Get all profiles
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("nombre_completo");
      if (error) throw error;

      // Get roles
      const { data: roles } = await supabase.from("user_roles").select("*");
      const roleMap: Record<string, string> = {};
      for (const r of (roles || [])) {
        roleMap[r.user_id] = r.role;
      }

      // Get emails from auth
      const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
      if (authErr) throw authErr;

      const emailMap: Record<string, string> = {};
      for (const u of authUsers.users) {
        emailMap[u.id] = u.email || "";
      }

      const result = (profiles || []).map((p: any) => ({
        ...p,
        email: emailMap[p.id] || "",
        rol: roleMap[p.id] || "cobrador",
      }));

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
