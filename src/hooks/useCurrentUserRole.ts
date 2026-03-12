import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "supervisor" | "cobrador";

interface CurrentUserRole {
  role: AppRole;
  profileId: string | null;
  cobradorId: string | null;
  rutaIds: string[];
  loading: boolean;
}

async function fetchUserRole(userId: string) {
  // Get role from user_roles
  const roleResult = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role: AppRole = (roleResult.data?.role as AppRole) || "cobrador";

  let cobradorId: string | null = null;
  let rutaIds: string[] = [];

  if (role === "cobrador") {
    // user_id column on cobradores (added via migration, not in generated types)
    // Use rpc or raw approach to avoid type issues
    const { data } = await supabase.rpc("get_cobrador_by_user" as any, { p_user_id: userId });
    if (data && (data as any).length > 0) {
      cobradorId = (data as any)[0].id;
    }

    if (cobradorId) {
      const rutaResult = await supabase
        .from("rutas")
        .select("id")
        .eq("cobrador_id", cobradorId);
      rutaIds = (rutaResult.data || []).map((r) => r.id);
    }
  }

  if (role === "supervisor") {
    const supResult = await supabase
      .from("supervisor_rutas")
      .select("ruta_id")
      .eq("supervisor_id", userId);
    rutaIds = (supResult.data || []).map((r) => r.ruta_id);
  }

  return { role, profileId: userId, cobradorId, rutaIds };
}

export function useCurrentUserRole(): CurrentUserRole {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["current-user-role", userId],
    enabled: !!userId,
    queryFn: () => fetchUserRole(userId!),
  });

  return {
    role: data?.role || "cobrador",
    profileId: data?.profileId || null,
    cobradorId: data?.cobradorId || null,
    rutaIds: data?.rutaIds || [],
    loading: isLoading,
  };
}
