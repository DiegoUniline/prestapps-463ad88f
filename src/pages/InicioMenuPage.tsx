import { useNavigate } from "react-router-dom";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import {
  HandCoins, ClipboardCheck, CreditCard, CalendarCheck, FileInput,
  Users, MapPin, Bell, type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/types";

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: AppRole[];
  description: string;
  accent: string;
}

const items: MenuItem[] = [
  { title: "Mi Cobranza", url: "/mi-cobranza", icon: HandCoins, roles: ["cobrador", "supervisor"], description: "Tu ruta de cobros del día", accent: "text-primary" },
  { title: "Cobranza Diaria", url: "/cobranza", icon: ClipboardCheck, roles: ["cobrador", "supervisor"], description: "Listado completo de cobros", accent: "text-[hsl(217,91%,60%)]" },
  { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["cobrador", "supervisor"], description: "Consultar préstamos", accent: "text-foreground" },
  { title: "Pagos", url: "/pagos", icon: HandCoins, roles: ["cobrador", "supervisor"], description: "Historial de pagos", accent: "text-success" },
  { title: "Promesas", url: "/promesas", icon: CalendarCheck, roles: ["cobrador", "supervisor"], description: "Compromisos de pago", accent: "text-warning" },
  { title: "Solicitudes", url: "/solicitudes", icon: FileInput, roles: ["cobrador", "supervisor"], description: "Solicitudes de préstamo", accent: "text-primary" },
  { title: "Clientes", url: "/clientes", icon: Users, roles: ["supervisor"], description: "Directorio de clientes", accent: "text-foreground" },
  { title: "Mapa GPS", url: "/mapa-gps", icon: MapPin, roles: ["supervisor"], description: "Ubicación de cobros", accent: "text-destructive" },
  { title: "Alertas", url: "/alertas", icon: Bell, roles: ["supervisor"], description: "Avisos del sistema", accent: "text-warning" },
];

export default function InicioMenuPage() {
  const navigate = useNavigate();
  const { role } = useCurrentUserRole();
  const user = useAuthStore((s) => s.user);
  const visible = items.filter((i) => i.roles.includes(role));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bienvenido</h1>
        <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((it) => (
          <Button
            key={it.url}
            variant="outline"
            onClick={() => navigate(it.url)}
            className="h-auto flex-col items-start gap-2 p-4 hover:border-primary hover:shadow-md transition-all text-left"
          >
            <it.icon className={`h-6 w-6 ${it.accent}`} />
            <div className="w-full">
              <p className="font-semibold text-[14px]">{it.title}</p>
              <p className="text-[11px] text-muted-foreground font-normal whitespace-normal">{it.description}</p>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
