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

export function useCurrentUserRole(): CurrentUserRole {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["current-user-role", userId],
    enabled: !!userId,
    queryFn: async () => {
      // Get role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .maybeSingle();

      const role: AppRole = (roleData?.role as AppRole) || "cobrador";

      // Get cobrador_id if cobrador — match via rutas.cobrador_id linked to cobradores
      // We look up cobradores where user_id matches (added via migration)
      let cobradorId: string | null = null;
      let rutaIds: string[] = [];

      if (role === "cobrador") {
        // Query cobradores with a raw filter for user_id (column added via migration, not in generated types)
        const { data: cobData } = await supabase
          .from("cobradores")
          .select("id")
          .eq("user_id" as any, userId!)
          .maybeSingle();
        cobradorId = (cobData as any)?.id || null;

        // Get routes assigned to this cobrador
        if (cobradorId) {
          const { data: rutaData } = await supabase
            .from("rutas")
            .select("id")
            .eq("cobrador_id", cobradorId);
          rutaIds = (rutaData || []).map((r) => r.id);
        }
      }

      if (role === "supervisor") {
        const { data: supData } = await supabase
          .from("supervisor_rutas")
          .select("ruta_id")
          .eq("supervisor_id", userId!);
        rutaIds = (supData || []).map((r) => r.ruta_id);
      }

      // Admin: empty rutaIds means no filter (show all)
      return { role, profileId: userId!, cobradorId, rutaIds };
    },
  });

  return {
    role: data?.role || "cobrador",
    profileId: data?.profileId || null,
    cobradorId: data?.cobradorId || null,
    rutaIds: data?.rutaIds || [],
    loading: isLoading,
  };
}
