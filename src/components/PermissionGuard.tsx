import { Navigate } from "react-router-dom";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { usePermisos, type PermisoModule } from "@/hooks/usePermisos";

interface PermissionGuardProps {
  children: React.ReactNode;
  module: PermisoModule;
}

export default function PermissionGuard({ children, module }: PermissionGuardProps) {
  const { role, loading: roleLoading } = useCurrentUserRole();
  const { isAllowed, isLoading: permLoading } = usePermisos();

  if (roleLoading || permLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAllowed(role, module, "ver")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
