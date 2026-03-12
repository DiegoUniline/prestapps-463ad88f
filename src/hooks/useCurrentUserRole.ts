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
  // Get role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role: AppRole = (roleData?.role as AppRole) || "cobrador";

  let cobradorId: string | null = null;
  let rutaIds: string[] = [];

  if (role === "cobrador") {
    // user_id column added via migration, cast to bypass generated types
    const { data: cobData } = await (supabase
      .from("cobradores")
      .select("id")
      .eq("user_id" as any, userId)
      .maybeSingle() as any);
    cobradorId = cobData?.id || null;

    if (cobradorId) {
      const { data: rutaData } = await supabase
        .from("rutas")
        .select("id")
        .eq("cobrador_id", cobradorId);
      rutaIds = (rutaData || []).map((r: any) => r.id);
    }
  }

  if (role === "supervisor") {
    const { data: supData } = await supabase
      .from("supervisor_rutas")
      .select("ruta_id")
      .eq("supervisor_id", userId);
    rutaIds = (supData || []).map((r: any) => r.ruta_id);
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
