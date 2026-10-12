import { cn } from "@/lib/utils";
import { HandCoins, TrendingUp, Receipt, User, Navigation } from "lucide-react";

interface MobileBottomNavProps {
  activeTab: string;
  setHoy: () => void;
  setActiveTab: (tab: string) => void;
}

export function MobileBottomNav({
  activeTab, setHoy, setActiveTab,
}: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/95 shadow-[0_-12px_35px_-28px_rgba(15,23,42,.55)] backdrop-blur-xl sm:hidden safe-area-bottom">
      <div className="grid grid-cols-5 px-1">
        {[
          { val: "resumen", label: "Inicio", icon: TrendingUp },
          { val: "ruta", label: "Ruta", icon: Navigation },
          { val: "cobranza", label: "Cobrar", icon: HandCoins, main: true },
          { val: "pagos", label: "Pagos", icon: Receipt },
          { val: "perfil", label: "Perfil", icon: User },
        ].map(({ val, label, icon: Icon, main }) => {
          const active = activeTab === val;
          return (
            <button
              key={val}
              onClick={() => {
                if (val === "ruta") setHoy();
                setActiveTab(val);
              }}
              className={cn(
                "relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span className={cn(
                "flex items-center justify-center transition-all",
                main ? "-mt-7 h-[52px] w-[52px] rounded-2xl border-4 border-background bg-primary text-primary-foreground shadow-[0_10px_25px_-10px_rgba(240,20,77,.8)]" : "h-7 w-9 rounded-xl",
                !main && active && "bg-primary/10",
              )}>
                <Icon className={cn(main ? "h-5 w-5" : "h-[18px] w-[18px]", active && !main && "scale-105")} />
              </span>
              <span className={cn("text-[9px] font-semibold", main && "-mt-0.5")}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
