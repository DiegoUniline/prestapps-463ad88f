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

      // Get cobrador_id if cobrador — match via cobradores.user_id
      let cobradorId: string | null = null;
      if (role === "cobrador") {
        const { data: cobData } = await supabase
          .from("cobradores")
          .select("id")
          .eq("user_id", userId!)
          .maybeSingle();
        cobradorId = cobData?.id || null;
      }

      // Get supervised ruta_ids if supervisor
      let rutaIds: string[] = [];
      if (role === "supervisor") {
        const { data: supData } = await supabase
          .from("supervisor_rutas")
          .select("ruta_id")
          .eq("supervisor_id", userId!);
        rutaIds = (supData || []).map((r) => r.ruta_id);
      }

      // Admin sees all — get all ruta IDs for convenience
      if (role === "admin") {
        rutaIds = []; // empty = no filter
      }

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
