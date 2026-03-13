import { useAuthStore } from "@/stores/authStore";
import { Navigate } from "react-router-dom";

const SUPER_ADMIN_EMAIL = "diego.leon@uniline.mx";

interface SuperAdminGuardProps {
  children: React.ReactNode;
}

export default function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (user?.email !== SUPER_ADMIN_EMAIL) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export function isSuperAdmin(email?: string | null): boolean {
  return email === SUPER_ADMIN_EMAIL;
}
