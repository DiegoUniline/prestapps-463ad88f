import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import DashboardPage from "@/pages/DashboardPage";
import { Navigate } from "react-router-dom";
import { usePermisosRead, type PermisoModule } from "@/hooks/usePermisos";

export default function HomeRouter() {
  const { role, loading } = useCurrentUserRole();
  const { isAllowed, isLoading: permLoading } = usePermisosRead();
  if (loading || permLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }
  if (role === "admin") return <DashboardPage />;

  // Cobradores y supervisores: encuentra la primera vista a la que tienen acceso
  const candidates: { module: PermisoModule; path: string }[] = [
    { module: "mi_cobranza", path: "/mi-cobranza" },
    { module: "cobranza", path: "/cobranza" },
    { module: "dashboard", path: "/dashboard" },
    { module: "prestamos", path: "/prestamos" },
    { module: "pagos", path: "/pagos" },
    { module: "promesas", path: "/promesas" },
    { module: "solicitudes", path: "/solicitudes" },
    { module: "clientes", path: "/clientes" },
    { module: "crm", path: "/crm" },
    { module: "scoring", path: "/scoring" },
    { module: "mapa_gps", path: "/mapa-gps" },
    { module: "reportes", path: "/reportes" },
  ];
  const first = candidates.find((c) => isAllowed(role, c.module, "ver"));
  if (first) return <Navigate to={first.path} replace />;

  // Sin acceso a ningún módulo
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-sm text-center space-y-2">
        <h2 className="text-lg font-semibold">Sin permisos asignados</h2>
        <p className="text-sm text-muted-foreground">
          Tu usuario no tiene acceso a ningún módulo. Solicita al administrador que te asigne permisos en Configuración → Permisos.
        </p>
      </div>
    </div>
  );
}
