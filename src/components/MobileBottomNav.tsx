import { useLocation, useNavigate } from "react-router-dom";
import { useCan } from "@/hooks/usePermisos";
import { HandCoins, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const canMiCobranza = useCan("mi_cobranza", "ver");

  const isActive = (path: string) =>
    location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  const miCobranzaActive = isActive("/mi-cobranza");
  const dashboardActive = isActive("/dashboard");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-6">
        {/* Dashboard */}
        <button
          onClick={() => navigate("/dashboard")}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 transition-colors",
            dashboardActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          <LayoutDashboard className="h-6 w-6" />
          <span className="text-[10px] font-medium leading-none">Inicio</span>
        </button>

        {/* Mi Cobro — botón central destacado */}
        {canMiCobranza && (
          <button
            onClick={() => navigate("/mi-cobranza")}
            className="flex flex-col items-center justify-center -mt-5"
          >
            <div
              className={cn(
                "flex items-center justify-center h-14 w-14 rounded-full shadow-lg transition-all border-4 border-card",
                miCobranzaActive
                  ? "bg-primary text-primary-foreground scale-110"
                  : "bg-primary/90 text-primary-foreground"
              )}
            >
              <HandCoins className="h-6 w-6" />
            </div>
            <span
              className={cn(
                "text-[10px] font-bold leading-none mt-1",
                miCobranzaActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              Mi Cobro
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
