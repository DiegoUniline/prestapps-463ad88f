import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Menu, LayoutDashboard, ClipboardCheck, CreditCard, Users, Wallet,
  HandCoins, Bell, FileText, PieChart, CalendarCheck, Settings, UserCheck,
  Building2, MessageSquare, Users2, Star, Receipt, Percent,
  MapPin, ClipboardList, BookOpen, Cog, FileInput, ShieldCheck,
  RefreshCw, ScrollText, Route, type LucideIcon,
} from "lucide-react";

interface NavTab {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: string[];
}

const allMenuItems: { section: string; items: NavTab[] }[] = [
  {
    section: "Principal",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "supervisor", "cobrador"] },
    ],
  },
  {
    section: "Operaciones",
    items: [
      { title: "Mi Cobranza", url: "/mi-cobranza", icon: HandCoins, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Cobranza Diaria", url: "/cobranza", icon: ClipboardCheck, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Pagos", url: "/pagos", icon: Wallet, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Promesas", url: "/promesas", icon: CalendarCheck, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Solicitudes", url: "/solicitudes", icon: FileInput, roles: ["admin", "supervisor", "cobrador"] },
    ],
  },
  {
    section: "Clientes y CRM",
    items: [
      { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin", "supervisor"] },
      { title: "CRM Cobranza", url: "/crm", icon: Users2, roles: ["admin", "supervisor"] },
      { title: "Lead Scoring", url: "/scoring", icon: Star, roles: ["admin", "supervisor"] },
      { title: "Alertas", url: "/alertas", icon: Bell, roles: ["admin", "supervisor"] },
      { title: "Mapa GPS", url: "/mapa-gps", icon: MapPin, roles: ["admin", "supervisor"] },
    ],
  },
  {
    section: "Finanzas",
    items: [
      { title: "Cajas", url: "/cajas", icon: Wallet, roles: ["admin"] },
      { title: "Gastos", url: "/gastos", icon: Receipt, roles: ["admin"] },
      { title: "Comisiones", url: "/comisiones", icon: Percent, roles: ["admin"] },
      { title: "Liquidar Ruta", url: "/liquidar-ruta", icon: ClipboardList, roles: ["admin"] },
      { title: "Rentabilidad", url: "/rentabilidad", icon: PieChart, roles: ["admin"] },
      { title: "Reportes", url: "/reportes", icon: FileText, roles: ["admin", "supervisor"] },
      { title: "Renovación", url: "/renovacion", icon: RefreshCw, roles: ["admin"] },
    ],
  },
  {
    section: "Equipo",
    items: [
      { title: "Cobradores", url: "/cobradores", icon: UserCheck, roles: ["admin"] },
      { title: "Rutas", url: "/rutas", icon: Route, roles: ["admin"] },
      { title: "Usuarios", url: "/usuarios", icon: Settings, roles: ["admin"] },
    ],
  },
  {
    section: "Configuración",
    items: [
      { title: "Empresas", url: "/empresas", icon: Building2, roles: ["admin"] },
      { title: "Config. Empresa", url: "/configuracion", icon: Cog, roles: ["admin"] },
      { title: "Catálogos", url: "/catalogos", icon: BookOpen, roles: ["admin"] },
      { title: "WhatsApp", url: "/whatsapp", icon: MessageSquare, roles: ["admin"] },
      { title: "Permisos", url: "/permisos", icon: ShieldCheck, roles: ["admin"] },
      { title: "Auditoría", url: "/auditoria", icon: ScrollText, roles: ["admin"] },
    ],
  },
];

export function MobileMenuSheet({ role }: { role: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  const visibleSections = allMenuItems
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => i.roles.includes(role)),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <ScrollArea className="h-full">
          <div className="px-4 py-5 space-y-5">
            {visibleSections.map((section) => (
              <div key={section.section}>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">
                  {section.section}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.url}
                      onClick={() => {
                        navigate(item.url);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors",
                        isActive(item.url)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Sync / force update button */}
            <div className="border-t pt-4 mt-2">
              <button
                onClick={async () => {
                  setOpen(false);
                  try {
                    const reg = await navigator.serviceWorker?.getRegistration();
                    if (reg?.waiting) {
                      reg.waiting.postMessage({ type: "SKIP_WAITING" });
                      navigator.serviceWorker.addEventListener("controllerchange", () => {
                        window.location.reload();
                      });
                      return;
                    }
                  } catch {}
                  // Fallback: clear caches and hard reload
                  if ("caches" in window) {
                    const names = await caches.keys();
                    await Promise.all(names.map((n) => caches.delete(n)));
                  }
                  window.location.reload();
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw className="h-4 w-4 shrink-0" />
                <span>Actualizar app</span>
              </button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
