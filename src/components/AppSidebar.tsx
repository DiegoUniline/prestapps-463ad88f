import { useEffect, useMemo } from "react";
import logoIcon from "@/assets/logo-icon.png";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserRole, type AppRole } from "@/hooks/useCurrentUserRole";
import { usePermisosRead, type PermisoModule } from "@/hooks/usePermisos";
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
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, CreditCard, Users, Wallet, Route, FileText, HandCoins,
  CalendarCheck, Settings, UserCheck, ClipboardCheck, Building2, MessageSquare,
  Users2, Star, Receipt, Percent, MapPin, ClipboardList, BookOpen, Cog, BarChart3,
  FileInput, ShieldCheck, Bell, RefreshCw, PieChart, ScrollText,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: AppRole[];
  superAdminOnly?: boolean;
  permModule?: PermisoModule;
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
      { title: "Préstamos", url: "/prestamos", icon: CreditCard, roles: ["admin", "supervisor", "cobrador"], permModule: "prestamos" },
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
      { title: "Empresas", url: "/empresas", icon: Building2, roles: ["admin"], superAdminOnly: true, permModule: "empresas" },
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
    queryClient.prefetchQuery({
      queryKey: ["prestamos-list", undefined, undefined, empresaId],
      queryFn: async () => {
        const { data: prestamos } = await supabase
          .from("prestamos")
          .select("id, monto_solicitado, monto_total_pagar, num_cuotas, estado, fecha_registro, fecha_primer_pago, cliente_id, caja_id, ruta_id, cobrador_id, clientes(id, nombre_completo), cajas(nombre), rutas(nombre, cobrador_id)")
          .eq("empresa_id", empresaId)
          .order("created_at", { ascending: false });
        return prestamos || [];
      },
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
  }, [queryClient, empresaId]);

  const isActive = (path: string) =>
    location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  const userEmail = useAuthStore((s) => s.user?.email);
  const superAdmin = isSuperAdmin(userEmail);

  const visibleModules = useMemo(() => modules
    .map((mod) => ({
      ...mod,
      items: (loading || permLoading) ? [] : mod.items.filter((item) => {
        if (item.superAdminOnly && !superAdmin) return false;
        if (!item.roles.includes(role)) return false;
        // Check granular permission if permModule is defined
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
