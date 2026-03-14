import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";

export type PermisoModule =
  | "dashboard" | "cobranza" | "mi_cobranza" | "prestamos" | "pagos"
  | "promesas" | "solicitudes" | "clientes" | "crm" | "scoring"
  | "mapa_gps" | "cajas" | "gastos" | "comisiones" | "liquidar_ruta"
  | "reportes" | "cobradores" | "rutas" | "usuarios" | "empresas"
  | "configuracion" | "catalogos" | "whatsapp" | "permisos";

export type PermisoAction =
  | "ver" | "agregar" | "editar" | "eliminar"
  // Acciones especiales
  | "anular_pago" | "cancelar_prestamo" | "reestructurar"
  | "reasignar" | "liquidar_ruta" | "aprobar_solicitud"
  | "rechazar_solicitud" | "enviar_whatsapp";

export interface ModuleDef {
  key: PermisoModule;
  label: string;
  actions: { key: PermisoAction; label: string }[];
}

const baseActions: { key: PermisoAction; label: string }[] = [
  { key: "ver", label: "Ver" },
  { key: "agregar", label: "Agregar" },
  { key: "editar", label: "Editar" },
  { key: "eliminar", label: "Eliminar" },
];

const viewOnly = [{ key: "ver" as PermisoAction, label: "Ver" }];

export const MODULE_DEFINITIONS: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", actions: viewOnly },
  { key: "cobranza", label: "Cobranza Diaria", actions: viewOnly },
  { key: "mi_cobranza", label: "Mi Cobranza", actions: viewOnly },
  {
    key: "prestamos", label: "Préstamos", actions: [
      ...baseActions,
      { key: "cancelar_prestamo", label: "Cancelar Préstamo" },
      { key: "reestructurar", label: "Reestructurar" },
      { key: "reasignar", label: "Reasignar" },
    ],
  },
  {
    key: "pagos", label: "Pagos", actions: [
      ...baseActions,
      { key: "anular_pago", label: "Anular Pago" },
    ],
  },
  { key: "promesas", label: "Promesas", actions: baseActions },
  {
    key: "solicitudes", label: "Solicitudes", actions: [
      ...baseActions,
      { key: "aprobar_solicitud", label: "Aprobar" },
      { key: "rechazar_solicitud", label: "Rechazar" },
    ],
  },
  { key: "clientes", label: "Clientes", actions: baseActions },
  { key: "crm", label: "CRM Cobranza", actions: [...baseActions] },
  { key: "scoring", label: "Lead Scoring", actions: viewOnly },
  { key: "mapa_gps", label: "Mapa GPS", actions: viewOnly },
  { key: "cajas", label: "Cajas", actions: baseActions },
  { key: "gastos", label: "Gastos", actions: baseActions },
  { key: "comisiones", label: "Comisiones", actions: viewOnly },
  {
    key: "liquidar_ruta", label: "Liquidar Ruta", actions: [
      { key: "ver", label: "Ver" },
      { key: "liquidar_ruta", label: "Liquidar" },
    ],
  },
  { key: "reportes", label: "Reportes", actions: viewOnly },
  { key: "cobradores", label: "Cobradores", actions: baseActions },
  { key: "rutas", label: "Rutas", actions: baseActions },
  { key: "usuarios", label: "Usuarios", actions: baseActions },
  { key: "empresas", label: "Empresas", actions: baseActions },
  { key: "configuracion", label: "Config. Empresa", actions: [{ key: "ver", label: "Ver" }, { key: "editar", label: "Editar" }] },
  { key: "catalogos", label: "Catálogos", actions: baseActions },
  {
    key: "whatsapp", label: "WhatsApp", actions: [
      { key: "ver", label: "Ver" },
      { key: "editar", label: "Editar" },
      { key: "enviar_whatsapp", label: "Enviar Mensaje" },
    ],
  },
  { key: "permisos", label: "Permisos", actions: [{ key: "ver", label: "Ver" }, { key: "editar", label: "Editar" }] },
];

// Default permissions for each role (used when no DB record exists)
const DEFAULTS: Record<string, boolean> = {};
// Admin gets everything by default
MODULE_DEFINITIONS.forEach((m) => {
  m.actions.forEach((a) => {
    DEFAULTS[`admin:${m.key}:${a.key}`] = true;
  });
});
// Supervisor defaults
["dashboard", "cobranza", "mi_cobranza", "prestamos", "pagos", "promesas", "solicitudes", "clientes", "crm", "scoring", "mapa_gps", "reportes"].forEach((mod) => {
  ["ver", "agregar", "editar"].forEach((act) => {
    DEFAULTS[`supervisor:${mod}:${act}`] = true;
  });
});
// Cobrador defaults
["dashboard", "cobranza", "mi_cobranza", "prestamos", "pagos", "promesas", "solicitudes"].forEach((mod) => {
  DEFAULTS[`cobrador:${mod}:ver`] = true;
  if (["pagos", "promesas"].includes(mod)) {
    DEFAULTS[`cobrador:${mod}:agregar`] = true;
  }
});

export type AppRole = "admin" | "supervisor" | "cobrador";

interface PermissionRow {
  id: string;
  empresa_id: string;
  role: AppRole;
  module: string;
  action: string;
  allowed: boolean;
}

export function usePermisos() {
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["role_permissions", empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from("role_permissions" as any)
        .select("*")
        .eq("empresa_id", empresaId);
      if (error) throw error;
      return (data || []) as unknown as PermissionRow[];
    },
    enabled: !!empresaId,
    staleTime: 1000 * 60 * 10,
  });

  // Build a map: "role:module:action" -> boolean
  const permMap = new Map<string, boolean>();
  for (const r of rows) {
    permMap.set(`${r.role}:${r.module}:${r.action}`, r.allowed);
  }

  function isAllowed(role: AppRole, module: PermisoModule, action: PermisoAction): boolean {
    // Admin always has access to permisos page
    if (role === "admin" && module === "permisos") return true;
    const key = `${role}:${module}:${action}`;
    if (permMap.has(key)) return permMap.get(key)!;
    return DEFAULTS[key] ?? false;
  }

  const saveMutation = useMutation({
    mutationFn: async (perms: { role: AppRole; module: string; action: string; allowed: boolean }[]) => {
      if (!empresaId) return;
      // Upsert all permissions
      const rows = perms.map((p) => ({
        empresa_id: empresaId,
        role: p.role,
        module: p.module,
        action: p.action,
        allowed: p.allowed,
      }));

      const { error } = await supabase
        .from("role_permissions" as any)
        .upsert(rows, { onConflict: "empresa_id,role,module,action" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role_permissions", empresaId] });
    },
  });

  return { isAllowed, isLoading, rows, saveMutation, permMap };
}

/** Lightweight hook for checking a single permission in components */
export function useCan(module: PermisoModule, action: PermisoAction): boolean {
  const { role } = useCurrentUserRole();
  const { isAllowed, isLoading } = usePermisos();
  if (isLoading) return false;
  return isAllowed(role, module, action);
}
