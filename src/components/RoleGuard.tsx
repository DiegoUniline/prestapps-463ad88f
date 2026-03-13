import { useAuthStore } from "@/stores/authStore";
import { Navigate } from "react-router-dom";
import type { AppRole } from "@/types/index";

interface RoleGuardProps {
  children: React.ReactNode;
  allowed: AppRole[];
}

export default function RoleGuard({ children, allowed }: RoleGuardProps) {
  const role = useAuthStore((s) => s.role);
  const loading = useAuthStore((s) => s.loading || s.roleLoading);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
