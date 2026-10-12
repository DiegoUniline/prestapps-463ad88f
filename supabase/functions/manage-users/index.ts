import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function getCaller(req: Request, admin: any): Promise<Caller | null> {
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
    roles: (roleRows || []).map((r: any) => r.role),
    superAdmin: !!email && email === SUPER_ADMIN_EMAIL,
  };
}

class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
const roleMap: Record<string, string> = { Admin: "admin", Supervisor: "supervisor", Cobrador: "cobrador" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function chunk<T>(arr: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function authErrorMessage(err: any): AppError | null {
  const m = String(err?.message || "").toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return new AppError("Este correo ya está registrado.");
  }
  if (m.includes("password")) {
    return new AppError("La contraseña no cumple los requisitos mínimos (al menos 6 caracteres).");
  }
  if (m.includes("email") && m.includes("invalid")) {
    return new AppError("El correo electrónico no es válido.");
  }
  return null;
}

async function validarRutas(supabase: any, rutas: unknown, empresaId: string): Promise<string[]> {
  if (!Array.isArray(rutas) || !rutas.length) return [];
  const ids = Array.from(new Set(rutas.map((r) => String(r))));
  const { data, error } = await supabase.from("rutas").select("id").eq("empresa_id", empresaId).in("id", ids);
  if (error) throw error;
  if ((data || []).length !== ids.length) throw new AppError("Alguna de las rutas asignadas no pertenece a la empresa.");
  return ids;
}

async function getTarget(supabase: any, userId: string) {
  if (!userId) throw new AppError("Falta user_id");
  const { data: profile, error } = await supabase.from("profiles").select("id, empresa_id").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!profile) throw new AppError("Usuario no encontrado", 404);
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = String(authUser?.user?.email || "").toLowerCase();
  return { profile, isSuperAdmin: !!email && email === SUPER_ADMIN_EMAIL };
}

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const caller = await getCaller(req, supabase);
    if (!caller) return json({ error: "No autorizado" }, 401);
    const isSuper = caller.service || caller.superAdmin;
    if (!isSuper && !caller.roles.includes("admin")) {
      return json({ error: "Solo administradores pueden gestionar usuarios" }, 403);
    }
    if (!isSuper && !caller.empresaId) return json({ error: "Sin empresa asociada" }, 403);

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const {
        email, password, nombre_completo, telefono, direccion, rol,
        porcentaje_comision, activo, empresa_id,
        comision_tipo, comision_cobros_equipo, comision_prestamos,
        bono_meta_monto, bono_meta_objetivo, rutas_asignadas
      } = body;

      const targetEmpresaId: string = isSuper ? (empresa_id || DEFAULT_EMPRESA_ID) : caller.empresaId!;
      if (!isSuper && empresa_id && empresa_id !== targetEmpresaId) {
        throw new AppError("No puedes crear usuarios en otra empresa", 403);
      }
      if (!isSuper && String(email || "").trim().toLowerCase() === SUPER_ADMIN_EMAIL) {
        throw new AppError("Correo no permitido", 403);
      }

      const dbRole = roleMap[rol] || "cobrador";
      const rutasValidas = dbRole === "supervisor" ? await validarRutas(supabase, rutas_asignadas, targetEmpresaId) : [];

      // Check user limit for this empresa
      const { data: empresa } = await supabase
        .from("empresas")
        .select("max_usuarios, activa, plan, nombre")
        .eq("id", targetEmpresaId)
        .maybeSingle();

      if (!empresa && !isSuper) throw new AppError("Empresa no encontrada", 404);

      if (empresa && !empresa.activa) {
        throw new AppError(`La empresa "${empresa.nombre}" está inactiva. No se pueden crear usuarios.`);
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
          throw new AppError(
            `Límite de usuarios alcanzado. El plan ${planLabel} permite máximo ${maxUsers} usuarios. Actualmente tiene ${currentCount}. Contacte al administrador para actualizar el plan.`
          );
        }
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (authError) throw authErrorMessage(authError) || authError;
      const userId = authData.user.id;

      try {
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

        const { error: roleError } = await supabase.from("user_roles").insert({ user_id: userId, role: dbRole });
        if (roleError) throw roleError;

        if (dbRole === "supervisor" && rutasValidas.length) {
          const rows = rutasValidas.map((ruta_id: string) => ({ supervisor_id: userId, ruta_id }));
          const { error: rutasError } = await supabase.from("supervisor_rutas").insert(rows);
          if (rutasError) throw rutasError;
        }
      } catch (e) {
        await supabase.from("supervisor_rutas").delete().eq("supervisor_id", userId);
        await supabase.from("user_roles").delete().eq("user_id", userId);
        await supabase.from("profiles").delete().eq("id", userId);
        const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
        if (delErr) console.error("manage-users rollback deleteUser error:", delErr.message);
        throw e;
      }

      return json({ success: true, user_id: userId });
    }

    if (action === "update") {
      const {
        user_id, nombre_completo, telefono, direccion, rol,
        porcentaje_comision, activo, password, empresa_id,
        comision_tipo, comision_cobros_equipo, comision_prestamos,
        bono_meta_monto, bono_meta_objetivo, rutas_asignadas
      } = body;

      const target = await getTarget(supabase, user_id);
      const dbRole = roleMap[rol] || "cobrador";
      let targetEmpresaId: string | null = target.profile.empresa_id;

      if (!isSuper) {
        if (target.profile.empresa_id !== caller.empresaId || target.isSuperAdmin) {
          throw new AppError("Usuario no encontrado", 404);
        }
        if (empresa_id && empresa_id !== caller.empresaId) {
          throw new AppError("No puedes mover usuarios a otra empresa", 403);
        }
        if (user_id === caller.userId && dbRole !== "admin") {
          throw new AppError("No puedes quitarte el rol de administrador");
        }
      } else if (empresa_id) {
        targetEmpresaId = empresa_id;
      }

      const rutasValidas = dbRole === "supervisor" && targetEmpresaId
        ? await validarRutas(supabase, rutas_asignadas, targetEmpresaId)
        : [];

      const { error: profileError } = await supabase.from("profiles").update({
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
      }).eq("id", user_id);
      if (profileError) throw profileError;

      await supabase.from("user_roles").delete().eq("user_id", user_id);
      const { error: roleError } = await supabase.from("user_roles").insert({ user_id, role: dbRole });
      if (roleError) throw roleError;

      await supabase.from("supervisor_rutas").delete().eq("supervisor_id", user_id);
      if (dbRole === "supervisor" && rutasValidas.length) {
        const rows = rutasValidas.map((ruta_id: string) => ({ supervisor_id: user_id, ruta_id }));
        await supabase.from("supervisor_rutas").insert(rows);
      }

      if (password) {
        const { error: pwError } = await supabase.auth.admin.updateUserById(user_id, { password });
        if (pwError) throw authErrorMessage(pwError) || pwError;
      }

      return json({ success: true });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (user_id === caller.userId) throw new AppError("No puedes eliminar tu propio usuario");
      const target = await getTarget(supabase, user_id);
      if (!isSuper && (target.profile.empresa_id !== caller.empresaId || target.isSuperAdmin)) {
        throw new AppError("Usuario no encontrado", 404);
      }
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "list") {
      const empresaFiltro: string | null = isSuper ? (body.empresa_id || null) : caller.empresaId;

      const profiles: any[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let query = supabase.from("profiles").select("*").order("nombre_completo").order("id").range(from, from + PAGE - 1);
        if (empresaFiltro) query = query.eq("empresa_id", empresaFiltro);
        const { data, error } = await query;
        if (error) throw error;
        profiles.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }

      const ids = profiles.map((p: any) => p.id);
      const rolesByUser: Record<string, string> = {};
      const rutasMap: Record<string, string[]> = {};
      for (const part of chunk(ids)) {
        const [{ data: roles, error: rErr }, { data: supRutas, error: sErr }] = await Promise.all([
          supabase.from("user_roles").select("user_id, role").in("user_id", part),
          supabase.from("supervisor_rutas").select("supervisor_id, ruta_id").in("supervisor_id", part),
        ]);
        if (rErr) throw rErr;
        if (sErr) throw sErr;
        for (const r of (roles || [])) rolesByUser[r.user_id] = r.role;
        for (const sr of (supRutas || [])) {
          if (!rutasMap[sr.supervisor_id]) rutasMap[sr.supervisor_id] = [];
          rutasMap[sr.supervisor_id].push(sr.ruta_id);
        }
      }

      const pending = new Set(ids);
      const emailMap: Record<string, string> = {};
      const PER_PAGE = 1000;
      for (let page = 1; pending.size > 0; page++) {
        const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
        if (authErr) throw authErr;
        const users = authUsers?.users || [];
        for (const u of users) {
          if (pending.has(u.id)) {
            emailMap[u.id] = u.email || "";
            pending.delete(u.id);
          }
        }
        if (users.length < PER_PAGE) break;
      }

      const result = profiles.map((p: any) => ({
        ...p,
        email: emailMap[p.id] || "",
        rol: rolesByUser[p.id] || "cobrador",
        rutas_asignadas: rutasMap[p.id] || [],
      }));

      return json(result);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error: any) {
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    console.error("manage-users error:", error?.message || error);
    return json({ error: "No se pudo completar la operación. Intenta de nuevo." }, 400);
  }
}));
