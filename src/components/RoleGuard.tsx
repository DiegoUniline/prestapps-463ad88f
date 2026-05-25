import { useAuthStore } from "@/stores/authStore";
import { Navigate } from "react-router-dom";
import type { AppRole } from "@/types/index";
import { usePermisosRead, type PermisoAction, type PermisoModule } from "@/hooks/usePermisos";

interface RoleGuardProps {
  children: React.ReactNode;
  allowed?: AppRole[];
  module?: PermisoModule;
  action?: PermisoAction;
}

export default function RoleGuard({ children, allowed = [], module, action = "ver" }: RoleGuardProps) {
  const role = useAuthStore((s) => s.role);
  const loading = useAuthStore((s) => s.loading || s.roleLoading);
  const { isAllowed, isLoading: permisosLoading } = usePermisosRead();

  if (loading || (module && permisosLoading)) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const hasRoleAccess = allowed.includes(role);
  const hasPermissionAccess = module ? isAllowed(role, module, action) : false;

  if (!hasRoleAccess && !hasPermissionAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
