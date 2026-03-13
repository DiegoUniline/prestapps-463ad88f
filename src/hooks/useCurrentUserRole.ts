// Compatibility layer — bridges old useCurrentUserRole hook to Zustand authStore

import { useAuthStore } from "@/stores/authStore";

export type AppRole = "admin" | "supervisor" | "cobrador";

interface CurrentUserRole {
  role: AppRole;
  profileId: string | null;
  cobradorId: string | null;
  rutaIds: string[];
  loading: boolean;
}

export function useCurrentUserRole(): CurrentUserRole {
  const role = useAuthStore((s) => s.role);
  const profileId = useAuthStore((s) => s.profileId);
  const cobradorId = useAuthStore((s) => s.cobradorId);
  const rutaIds = useAuthStore((s) => s.rutaIds);
  const loading = useAuthStore((s) => s.loading || s.roleLoading);
  return { role, profileId, cobradorId, rutaIds, loading };
}
