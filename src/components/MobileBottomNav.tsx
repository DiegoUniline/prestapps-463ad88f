import { useLocation, useNavigate } from "react-router-dom";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import {
  LayoutDashboard, HandCoins, CreditCard, Users, Wallet,
  ClipboardCheck, MoreHorizontal, Bell, FileText, PieChart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CalendarCheck, Settings, UserCheck, Building2, MessageSquare,
  Users2, Star, Receipt, Percent, MapPin, ClipboardList, BookOpen, Cog,
  FileInput, ShieldCheck, RefreshCw, ScrollText, Route,
} from "lucide-react";

interface NavTab {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: string[];
}

const mainTabs: Record<string, NavTab[]> = {
  admin: [
    { title: "Inicio", url: "/dashboard", icon: LayoutDashboard, roles: ["admin"] },
    { title: "Cobranza", url: "/cobranza", icon: ClipboardCheck, roles: ["admin"] },
    { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["admin"] },
    { title: "Alertas", url: "/alertas", icon: Bell, roles: ["admin"] },
  ],
  supervisor: [
    { title: "Inicio", url: "/dashboard", icon: LayoutDashboard, roles: ["supervisor"] },
    { title: "Cobranza", url: "/cobranza", icon: ClipboardCheck, roles: ["supervisor"] },
    { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["supervisor"] },
    { title: "Clientes", url: "/clientes", icon: Users, roles: ["supervisor"] },
  ],
  cobrador: [
    { title: "Inicio", url: "/", icon: LayoutDashboard, roles: ["cobrador"] },
    { title: "Mi Cobro", url: "/mi-cobranza", icon: HandCoins, roles: ["cobrador"] },
    { title: "Cobranza", url: "/cobranza", icon: ClipboardCheck, roles: ["cobrador"] },
    { title: "Pagos", url: "/pagos", icon: Wallet, roles: ["cobrador"] },
  ],
};

const allMenuItems: { section: string; items: NavTab[] }[] = [
  {
    section: "Operaciones",
    items: [
      { title: "Mi Cobranza", url: "/mi-cobranza", icon: HandCoins, roles: ["cobrador"] },
      { title: "Cobranza Diaria", url: "/cobranza", icon: ClipboardCheck, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Pagos", url: "/pagos", icon: HandCoins, roles: ["admin", "supervisor", "cobrador"] },
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

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useCurrentUserRole();
  const [open, setOpen] = useState(false);

  const tabs = mainTabs[role] || mainTabs.cobrador;

  const isActive = (path: string) =>
    location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  const visibleSections = allMenuItems
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => i.roles.includes(role)),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => (
          <button
            key={tab.url}
            onClick={() => navigate(tab.url)}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors",
              isActive(tab.url)
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <tab.icon className={cn("h-5 w-5", isActive(tab.url) && "stroke-[2.5]")} />
            <span className="text-[10px] font-medium leading-none">{tab.title}</span>
          </button>
        ))}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors",
                open ? "text-primary" : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">Más</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl px-0 pb-0">
            <div className="px-4 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-3" />
              <h3 className="font-semibold text-base">Menú completo</h3>
            </div>
            <ScrollArea className="h-[calc(70vh-4rem)]">
              <div className="px-4 pb-8 space-y-4">
                {visibleSections.map((section) => (
                  <div key={section.section}>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">
                      {section.section}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {section.items.map((item) => (
                        <button
                          key={item.url}
                          onClick={() => {
                            navigate(item.url);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors",
                            isActive(item.url)
                              ? "bg-primary/10 text-primary"
                              : "bg-muted/50 text-foreground hover:bg-muted"
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          <span className="text-[11px] font-medium text-center leading-tight">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
