import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const {
        email, password, nombre_completo, telefono, direccion, rol,
        porcentaje_comision, activo, empresa_id,
        comision_tipo, comision_cobros_equipo, comision_prestamos,
        bono_meta_monto, bono_meta_objetivo, rutas_asignadas
      } = body;

      const targetEmpresaId = empresa_id || "00000000-0000-0000-0000-000000000001";

      // Check user limit for this empresa
      const { data: empresa } = await supabase
        .from("empresas")
        .select("max_usuarios, activa, plan, nombre")
        .eq("id", targetEmpresaId)
        .single();

      if (empresa && !empresa.activa) {
        throw new Error(`La empresa "${empresa.nombre}" está inactiva. No se pueden crear usuarios.`);
      }

      if (empresa) {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", targetEmpresaId);

        const currentCount = count || 0;
        const maxUsers = empresa.max_usuarios || 3;

        if (currentCount >= maxUsers && maxUsers < 999) {
          const planLabel = empresa.plan === "basico" ? "Básico (3 usuarios)" 
            : empresa.plan === "profesional" ? "Profesional (10 usuarios)" 
            : "Enterprise";
          throw new Error(
            `Límite de usuarios alcanzado. El plan ${planLabel} permite máximo ${maxUsers} usuarios. Actualmente tiene ${currentCount}. Contacte al administrador para actualizar el plan.`
          );
        }
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (authError) throw authError;
      const userId = authData.user.id;

      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        nombre_completo,
        telefono: telefono || null,
        direccion: direccion || null,
        porcentaje_comision: porcentaje_comision || 0,
        activo: activo ?? true,
        empresa_id: targetEmpresaId,
        comision_tipo: comision_tipo || "ninguna",
        comision_cobros_equipo: comision_cobros_equipo || 0,
        comision_prestamos: comision_prestamos || 0,
        bono_meta_monto: bono_meta_monto || 0,
        bono_meta_objetivo: bono_meta_objetivo || 0,
      });
      if (profileError) throw profileError;

      const roleMap: Record<string, string> = { Admin: "admin", Supervisor: "supervisor", Cobrador: "cobrador" };
      const dbRole = roleMap[rol] || "cobrador";
      const { error: roleError } = await supabase.from("user_roles").insert({ user_id: userId, role: dbRole });
      if (roleError) throw roleError;

      if (dbRole === "supervisor" && rutas_asignadas?.length) {
        const rows = rutas_asignadas.map((ruta_id: string) => ({ supervisor_id: userId, ruta_id }));
        await supabase.from("supervisor_rutas").insert(rows);
      }

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const {
        user_id, nombre_completo, telefono, direccion, rol,
        porcentaje_comision, activo, password, empresa_id,
        comision_tipo, comision_cobros_equipo, comision_prestamos,
        bono_meta_monto, bono_meta_objetivo, rutas_asignadas
      } = body;

      const { error: profileError } = await supabase.from("profiles").update({
        nombre_completo,
        telefono: telefono || null,
        direccion: direccion || null,
        porcentaje_comision: porcentaje_comision || 0,
        activo: activo ?? true,
        empresa_id: empresa_id || "00000000-0000-0000-0000-000000000001",
        comision_tipo: comision_tipo || "ninguna",
        comision_cobros_equipo: comision_cobros_equipo || 0,
        comision_prestamos: comision_prestamos || 0,
        bono_meta_monto: bono_meta_monto || 0,
        bono_meta_objetivo: bono_meta_objetivo || 0,
      }).eq("id", user_id);
      if (profileError) throw profileError;

      const roleMap: Record<string, string> = { Admin: "admin", Supervisor: "supervisor", Cobrador: "cobrador" };
      const dbRole = roleMap[rol] || "cobrador";
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      await supabase.from("user_roles").insert({ user_id, role: dbRole });

      await supabase.from("supervisor_rutas").delete().eq("supervisor_id", user_id);
      if (dbRole === "supervisor" && rutas_asignadas?.length) {
        const rows = rutas_asignadas.map((ruta_id: string) => ({ supervisor_id: user_id, ruta_id }));
        await supabase.from("supervisor_rutas").insert(rows);
      }

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
      const { empresa_id } = body;

      let query = supabase.from("profiles").select("*").order("nombre_completo");
      if (empresa_id) query = query.eq("empresa_id", empresa_id);
      const { data: profiles, error } = await query;
      if (error) throw error;

      const { data: roles } = await supabase.from("user_roles").select("*");
      const roleMap: Record<string, string> = {};
      for (const r of (roles || [])) roleMap[r.user_id] = r.role;

      const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
      if (authErr) throw authErr;
      const emailMap: Record<string, string> = {};
      for (const u of authUsers.users) emailMap[u.id] = u.email || "";

      const { data: supRutas } = await supabase.from("supervisor_rutas").select("supervisor_id, ruta_id");
      const rutasMap: Record<string, string[]> = {};
      for (const sr of (supRutas || [])) {
        if (!rutasMap[sr.supervisor_id]) rutasMap[sr.supervisor_id] = [];
        rutasMap[sr.supervisor_id].push(sr.ruta_id);
      }

      const result = (profiles || []).map((p: any) => ({
        ...p,
        email: emailMap[p.id] || "",
        rol: roleMap[p.id] || "cobrador",
        rutas_asignadas: rutasMap[p.id] || [],
      }));

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
