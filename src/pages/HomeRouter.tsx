import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import DashboardPage from "@/pages/DashboardPage";
import { Navigate } from "react-router-dom";

export default function HomeRouter() {
  const { role, loading } = useCurrentUserRole();
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }
  if (role === "admin") return <DashboardPage />;
  // Cobradores y supervisores van directo a su cobranza
  return <Navigate to="/mi-cobranza" replace />;
}
