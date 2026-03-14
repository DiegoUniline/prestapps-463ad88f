import { useLocation, useNavigate } from "react-router-dom";
import { useCan } from "@/hooks/usePermisos";
import { HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const canMiCobranza = useCan("mi_cobranza", "ver");

  const miCobranzaActive = location.pathname === "/mi-cobranza" || location.pathname.startsWith("/mi-cobranza");

  if (!canMiCobranza) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-area-bottom flex justify-center pb-4 pointer-events-none">
      <button
        onClick={() => navigate("/mi-cobranza")}
        className={cn(
          "pointer-events-auto flex flex-col items-center justify-center",
        )}
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
    </nav>
  );
}
