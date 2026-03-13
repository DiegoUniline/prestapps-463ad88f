import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
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
} from "lucide-react";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "supervisor", "cobrador"] },
  { title: "Cobranza Diaria", url: "/cobranza", icon: ClipboardCheck, roles: ["admin", "supervisor", "cobrador"] },
  { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["admin", "supervisor", "cobrador"] },
  { title: "Pagos", url: "/pagos", icon: HandCoins, roles: ["admin", "supervisor", "cobrador"] },
  { title: "Promesas", url: "/promesas", icon: CalendarCheck, roles: ["admin", "supervisor", "cobrador"] },
  { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin", "supervisor"] },
  { title: "CRM Cobranza", url: "/crm", icon: Users2, roles: ["admin", "supervisor"] },
  { title: "Lead Scoring", url: "/scoring", icon: Star, roles: ["admin", "supervisor"] },
  { title: "Mapa GPS", url: "/mapa-gps", icon: MapPin, roles: ["admin", "supervisor"] },
];

const adminNav = [
  { title: "Cajas", url: "/cajas", icon: Wallet, roles: ["admin"] },
  { title: "Gastos", url: "/gastos", icon: Receipt, roles: ["admin"] },
  { title: "Comisiones", url: "/comisiones", icon: Percent, roles: ["admin"] },
  { title: "Liquidar Ruta", url: "/liquidar-ruta", icon: ClipboardList, roles: ["admin"] },
  { title: "Cobradores", url: "/cobradores", icon: UserCheck, roles: ["admin"] },
  { title: "Rutas", url: "/rutas", icon: Route, roles: ["admin"] },
  { title: "Reportes", url: "/reportes", icon: FileText, roles: ["admin", "supervisor"] },
  { title: "Usuarios", url: "/usuarios", icon: Settings, roles: ["admin"] },
  { title: "Empresas", url: "/empresas", icon: Building2, roles: ["admin"] },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageSquare, roles: ["admin"] },
  { title: "Catálogos", url: "/catalogos", icon: BookOpen, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, loading } = useCurrentUserRole();
  const isActive = (path: string) => location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  const visibleMain = loading ? mainNav : mainNav.filter((item) => item.roles.includes(role));
  const visibleAdmin = loading ? adminNav : adminNav.filter((item) => item.roles.includes(role));

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
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-4">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map((item) => (
                <SidebarMenuItem key={item.title}>
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
        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-4">
              Administración
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:font-medium"
                    >
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="text-[14px]">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
