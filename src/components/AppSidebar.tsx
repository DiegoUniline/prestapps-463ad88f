import { useEffect, useMemo } from "react";
import logoIcon from "@/assets/logo-icon.png";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserRole, type AppRole } from "@/hooks/useCurrentUserRole";
import { usePermisosRead, type PermisoModule } from "@/hooks/usePermisos";
import { fetchPrestamos } from "@/hooks/usePrestamos";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuthStore } from "@/stores/authStore";
import { isSuperAdmin } from "@/components/SuperAdminGuard";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LayoutDashboard, CreditCard, Users, Wallet, Route, FileText, HandCoins,
  CalendarCheck, Settings, UserCheck, ClipboardCheck, Building2, MessageSquare,
  Users2, Star, Receipt, Percent, MapPin, ClipboardList, BookOpen, Cog, BarChart3,
  FileInput, ShieldCheck, Bell, RefreshCw, PieChart, ScrollText, CalendarDays,
  ChevronRight, CheckCircle2, Clock, AlertTriangle, Send,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: AppRole[];
  superAdminOnly?: boolean;
  permModule?: PermisoModule;
  subItems?: { title: string; url: string; icon: LucideIcon }[];
}

interface NavModule {
  label: string;
  items: NavItem[];
}

const modules: NavModule[] = [
  {
    label: "General",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "supervisor", "cobrador"], permModule: "dashboard" },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Mi Cobranza", url: "/mi-cobranza", icon: HandCoins, roles: ["admin", "supervisor", "cobrador"], permModule: "mi_cobranza" },
      { title: "Cobranza Diaria", url: "/cobranza", icon: ClipboardCheck, roles: ["admin", "supervisor", "cobrador"], permModule: "cobranza" },
      {
        title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["admin", "supervisor", "cobrador"], permModule: "prestamos",
        subItems: [
          { title: "Liquidados", url: "/prestamos?vista=liquidados", icon: CheckCircle2 },
          { title: "Por Vencer", url: "/prestamos?vista=por_vencer", icon: Clock },
          { title: "Atrasados", url: "/prestamos?vista=atrasados", icon: AlertTriangle },
        ],
      },
      { title: "Planes de Cuotas", url: "/planes-cuotas", icon: BookOpen, roles: ["admin", "supervisor"], permModule: "prestamos" },
      { title: "Pagos", url: "/pagos", icon: HandCoins, roles: ["admin", "supervisor", "cobrador"], permModule: "pagos" },
      { title: "Promesas", url: "/promesas", icon: CalendarCheck, roles: ["admin", "supervisor", "cobrador"], permModule: "promesas" },
      { title: "Solicitudes", url: "/solicitudes", icon: FileInput, roles: ["admin", "supervisor", "cobrador"], permModule: "solicitudes" },
    ],
  },
  {
    label: "Clientes y CRM",
    items: [
      { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin", "supervisor"], permModule: "clientes" },
      { title: "CRM Cobranza", url: "/crm", icon: Users2, roles: ["admin", "supervisor"], permModule: "crm" },
      { title: "Lead Scoring", url: "/scoring", icon: Star, roles: ["admin", "supervisor"], permModule: "scoring" },
      { title: "Alertas", url: "/alertas", icon: Bell, roles: ["admin", "supervisor"] },
      { title: "Mapa GPS", url: "/mapa-gps", icon: MapPin, roles: ["admin", "supervisor"], permModule: "mapa_gps" },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { title: "Cajas", url: "/cajas", icon: Wallet, roles: ["admin"], permModule: "cajas" },
      { title: "Gastos", url: "/gastos", icon: Receipt, roles: ["admin"], permModule: "gastos" },
      { title: "Comisiones", url: "/comisiones", icon: Percent, roles: ["admin"], permModule: "comisiones" },
      { title: "Liquidar Ruta", url: "/liquidar-ruta", icon: ClipboardList, roles: ["admin"], permModule: "liquidar_ruta" },
      { title: "Rentabilidad", url: "/rentabilidad", icon: PieChart, roles: ["admin"] },
      { title: "Productividad", url: "/productividad", icon: BarChart3, roles: ["admin", "supervisor"] },
      { title: "Reportes", url: "/reportes", icon: FileText, roles: ["admin", "supervisor"], permModule: "reportes" },
      { title: "Reporte Semanal", url: "/reporte-semanal", icon: CalendarDays, roles: ["admin"] },
      { title: "Renovación", url: "/renovacion", icon: RefreshCw, roles: ["admin"] },
    ],
  },
  {
    label: "Equipo",
    items: [
      { title: "Cobradores", url: "/cobradores", icon: UserCheck, roles: ["admin"], permModule: "cobradores" },
      { title: "Rutas", url: "/rutas", icon: Route, roles: ["admin"], permModule: "rutas" },
      { title: "Usuarios", url: "/usuarios", icon: Settings, roles: ["admin"], permModule: "usuarios" },
    ],
  },
  {
    label: "Configuración",
    items: [
      { title: "Super Admin", url: "/super-admin", icon: Building2, roles: ["admin"], superAdminOnly: true },
      { title: "Config. Empresa", url: "/configuracion", icon: Cog, roles: ["admin"], permModule: "configuracion" },
      { title: "Catálogos", url: "/catalogos", icon: BookOpen, roles: ["admin"], permModule: "catalogos" },
      { title: "WhatsApp", url: "/whatsapp", icon: MessageSquare, roles: ["admin"], permModule: "whatsapp" },
      { title: "Permisos", url: "/permisos", icon: ShieldCheck, roles: ["admin"], permModule: "permisos" },
      { title: "Auditoría", url: "/auditoria", icon: ScrollText, roles: ["admin"] },
      { title: "Mi Suscripción", url: "/mi-suscripcion", icon: CreditCard, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, loading } = useCurrentUserRole();
  const { isAllowed, isLoading: permLoading } = usePermisosRead();
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();

  // Prefetch main views on mount — keys MUST match actual hook keys
  useEffect(() => {
    if (!empresaId) return;
    // Solo admins ven Préstamos/Cajas/Rutas en sidebar — evita cargar
    // miles de filas de amortización para cobradores/supervisores.
    if (role !== "admin") return;
    queryClient.prefetchQuery({
      queryKey: ["prestamos-list-v2", undefined, undefined, empresaId],
      queryFn: () => fetchPrestamos({ empresaId }),
      staleTime: 1000 * 60 * 5,
    });
    queryClient.prefetchQuery({
      queryKey: ["cajas-options", empresaId],
      queryFn: async () => {
        const { data } = await supabase
          .from("cajas")
          .select("id, nombre, saldo_actual")
          .eq("empresa_id", empresaId)
          .order("nombre");
        return data || [];
      },
      staleTime: 1000 * 60 * 5,
    });
    queryClient.prefetchQuery({
      queryKey: ["rutas-options", empresaId],
      queryFn: async () => {
        const { data } = await supabase.from("rutas").select("id, nombre").eq("empresa_id", empresaId).order("nombre");
        return data || [];
      },
      staleTime: 1000 * 60 * 5,
    });
  }, [queryClient, empresaId, role]);

  const fullPath = location.pathname + location.search;

  const isActive = (path: string) => {
    // For URLs with query params (sub-items), match exactly
    if (path.includes("?")) {
      return fullPath === path;
    }
    // For the parent /prestamos, only match exact path without query params
    if (path === "/prestamos") {
      return location.pathname === "/prestamos" && !location.search;
    }
    return location.pathname === path || (path !== "/" && location.pathname.startsWith(path));
  };

  // Check if any sub-item is active (to keep collapsible open)
  const isAnySub = location.pathname === "/prestamos";

  const userEmail = useAuthStore((s) => s.user?.email);
  const superAdmin = isSuperAdmin(userEmail);

  const visibleModules = useMemo(() => modules
    .map((mod) => ({
      ...mod,
      items: (loading || permLoading) ? [] : mod.items.filter((item) => {
        if (item.superAdminOnly && !superAdmin) return false;
        if (!item.roles.includes(role)) return false;
        if (item.permModule) {
          return isAllowed(role, item.permModule, "ver");
        }
        return true;
      }),
    }))
    .filter((mod) => mod.items.length > 0),
    [loading, permLoading, role, superAdmin, isAllowed]
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2.5">
          <img src={logoIcon} alt="PrestApp" className="h-8 w-8 rounded-lg flex-shrink-0 object-contain" />
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
                {mod.items.map((item) =>
                  item.subItems && !collapsed ? (
                    <Collapsible key={item.url} defaultOpen={isAnySub} className="group/collapsible">
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.url)}
                          className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:font-medium"
                        >
                          <NavLink to={item.url} end>
                            <item.icon className="h-4 w-4" />
                            <span className="text-[14px] flex-1">{item.title}</span>
                            <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="p-0.5 rounded hover:bg-muted">
                                <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                              </button>
                            </CollapsibleTrigger>
                          </NavLink>
                        </SidebarMenuButton>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.subItems.map((sub) => (
                              <SidebarMenuSubItem key={sub.url}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isActive(sub.url)}
                                  className="data-[active=true]:text-primary data-[active=true]:font-medium"
                                >
                                  <NavLink to={sub.url}>
                                    <sub.icon className="h-3.5 w-3.5" />
                                    <span className="text-[13px]">{sub.title}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  ) : (
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
                  )
                )}
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
