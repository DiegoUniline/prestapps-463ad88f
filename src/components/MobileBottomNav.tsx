import { useLocation, useNavigate } from "react-router-dom";
import { useCan } from "@/hooks/usePermisos";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { CalendarCheck, HandCoins, Home, MapPinned, Receipt, Route, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileNavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  main?: boolean;
  visible: boolean;
};

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useCurrentUserRole();
  const canMiCobranza = useCan("mi_cobranza", "ver");
  const canCobranza = useCan("cobranza", "ver");
  const canPagos = useCan("pagos", "ver");
  const canClientes = useCan("clientes", "ver");
  const canMapa = useCan("mapa_gps", "ver");
  const canPromesas = useCan("promesas", "ver");

  // Mi Cobranza has its own context-aware navigation.
  if (location.pathname.startsWith("/mi-cobranza")) return null;

  const ownerItems: MobileNavItem[] = [
    { label: "Inicio", path: "/dashboard", icon: Home, visible: true },
    { label: "Clientes", path: "/clientes", icon: Users, visible: canClientes },
    { label: "Cobrar", path: "/cobranza", icon: HandCoins, main: true, visible: canCobranza },
    { label: "Mapa", path: "/mapa-gps", icon: MapPinned, visible: canMapa },
    { label: "Pagos", path: "/pagos", icon: Receipt, visible: canPagos },
  ];

  const fieldItems: MobileNavItem[] = [
    { label: "Inicio", path: "/dashboard", icon: Home, visible: true },
    { label: "Ruta", path: "/mi-cobranza?view=ruta", icon: Route, visible: canMiCobranza },
    { label: "Cobrar", path: "/mi-cobranza?view=cobranza", icon: HandCoins, main: true, visible: canMiCobranza },
    role === "supervisor"
      ? { label: "Clientes", path: "/clientes", icon: Users, visible: canClientes }
      : { label: "Pagos", path: "/pagos", icon: Receipt, visible: canPagos },
    role === "supervisor"
      ? { label: "Mapa", path: "/mapa-gps", icon: MapPinned, visible: canMapa }
      : { label: "Promesas", path: "/promesas", icon: CalendarCheck, visible: canPromesas },
  ];

  const items = (role === "admin" ? ownerItems : fieldItems).filter((item) => item.visible);
  if (!items.length) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/95 shadow-[0_-12px_35px_-28px_rgba(15,23,42,.55)] backdrop-blur-xl md:hidden safe-area-bottom">
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ label, path, icon: Icon, main }) => {
          const [pathName, query] = path.split("?");
          const active = location.pathname === pathName && (!query || location.search === `?${query}`);
          return (
            <button
              key={`${label}-${path}`}
              onClick={() => navigate(path)}
              className={cn("relative flex min-h-[62px] flex-col items-center justify-center gap-0.5 py-2 transition-colors", active ? "text-primary" : "text-muted-foreground")}
            >
              <span className={cn(
                "flex items-center justify-center transition-all",
                main ? "-mt-7 h-[52px] w-[52px] rounded-2xl border-4 border-background bg-primary text-primary-foreground shadow-[0_10px_25px_-10px_rgba(240,20,77,.8)]" : "h-7 w-9 rounded-xl",
                !main && active && "bg-primary/10",
              )}>
                <Icon className={main ? "h-5 w-5" : "h-[18px] w-[18px]"} />
              </span>
              <span className={cn("text-[9px] font-semibold", main && "-mt-0.5")}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
