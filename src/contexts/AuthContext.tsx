// Compatibility layer — bridges old Context API to Zustand stores
// Import this wherever useAuth() from AuthContext was used

import { useAuthStore } from "@/stores/authStore";

export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const signOut = useAuthStore((s) => s.signOut);
  return { session, user, loading, signOut };
}
