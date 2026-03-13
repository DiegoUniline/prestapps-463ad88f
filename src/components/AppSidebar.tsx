import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useCurrentUserRole, type AppRole } from "@/hooks/useCurrentUserRole";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Wallet,
  Route,
  FileText,
  HandCoins,
  CalendarCheck,
  Settings,
  UserCheck,
  ClipboardCheck,
  Building2,
  MessageSquare,
  Users2,
  Star,
  Receipt,
  Percent,
  MapPin,
  ClipboardList,
  BookOpen,
  Cog,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: AppRole[];
}

interface NavModule {
  label: string;
  items: NavItem[];
}

const modules: NavModule[] = [
  {
    label: "General",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "supervisor", "cobrador"] },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Cobranza Diaria", url: "/cobranza", icon: ClipboardCheck, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Pagos", url: "/pagos", icon: HandCoins, roles: ["admin", "supervisor", "cobrador"] },
      { title: "Promesas", url: "/promesas", icon: CalendarCheck, roles: ["admin", "supervisor", "cobrador"] },
    ],
  },
  {
    label: "Clientes y CRM",
    items: [
      { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin", "supervisor"] },
      { title: "CRM Cobranza", url: "/crm", icon: Users2, roles: ["admin", "supervisor"] },
      { title: "Lead Scoring", url: "/scoring", icon: Star, roles: ["admin", "supervisor"] },
      { title: "Mapa GPS", url: "/mapa-gps", icon: MapPin, roles: ["admin", "supervisor"] },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { title: "Cajas", url: "/cajas", icon: Wallet, roles: ["admin"] },
      { title: "Gastos", url: "/gastos", icon: Receipt, roles: ["admin"] },
      { title: "Comisiones", url: "/comisiones", icon: Percent, roles: ["admin"] },
      { title: "Liquidar Ruta", url: "/liquidar-ruta", icon: ClipboardList, roles: ["admin"] },
      { title: "Reportes", url: "/reportes", icon: FileText, roles: ["admin", "supervisor"] },
    ],
  },
  {
    label: "Equipo",
    items: [
      { title: "Cobradores", url: "/cobradores", icon: UserCheck, roles: ["admin"] },
      { title: "Rutas", url: "/rutas", icon: Route, roles: ["admin"] },
      { title: "Usuarios", url: "/usuarios", icon: Settings, roles: ["admin"] },
    ],
  },
  {
    label: "Configuración",
    items: [
      { title: "Empresas", url: "/empresas", icon: Building2, roles: ["admin"] },
      { title: "Config. Empresa", url: "/configuracion", icon: Cog, roles: ["admin"] },
      { title: "Catálogos", url: "/catalogos", icon: BookOpen, roles: ["admin"] },
      { title: "WhatsApp", url: "/whatsapp", icon: MessageSquare, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, loading } = useCurrentUserRole();

  const isActive = (path: string) =>
    location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  const visibleModules = modules
    .map((mod) => ({
      ...mod,
      items: loading ? mod.items : mod.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((mod) => mod.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-sm">P</span>
          </div>
          {!collapsed && <span className="font-bold text-lg tracking-tight">PrestApp</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {visibleModules.map((mod) => (
          <SidebarGroup key={mod.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-4">
              {mod.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mod.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:font-medium"
                    >
                      <NavLink to={item.url} end={item.url === "/"}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="text-[14px]">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">v1.0.0</p>
            <p className="text-[10px] text-muted-foreground">© 2026 PrestApp</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
