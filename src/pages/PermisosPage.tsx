import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, Save, RotateCcw } from "lucide-react";
import {
  MODULE_DEFINITIONS,
  type AppRole,
  type PermisoModule,
  type PermisoAction,
  usePermisos,
} from "@/hooks/usePermisos";

const ROLES: { key: AppRole; label: string; color: string }[] = [
  { key: "admin", label: "Admin", color: "bg-primary text-primary-foreground" },
  { key: "supervisor", label: "Supervisor", color: "bg-blue-600 text-white" },
  { key: "cobrador", label: "Cobrador", color: "bg-amber-600 text-white" },
];

export default function PermisosPage() {
  const { isAllowed, saveMutation, isLoading } = usePermisos();
  const [activeRole, setActiveRole] = useState<AppRole>("supervisor");

  // Local state for editing: "module:action" -> boolean
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  // Initialize local state from current permissions
  useEffect(() => {
    if (isLoading) return;
    const state: Record<string, boolean> = {};
    for (const mod of MODULE_DEFINITIONS) {
      for (const act of mod.actions) {
        state[`${mod.key}:${act.key}`] = isAllowed(activeRole, mod.key, act.key);
      }
    }
    setLocal(state);
    setDirty(false);
  }, [activeRole, isLoading, isAllowed]);

  const toggle = (module: string, action: string) => {
    // Don't allow editing admin permisos module
    if (activeRole === "admin" && module === "permisos") return;
    setLocal((prev) => ({ ...prev, [`${module}:${action}`]: !prev[`${module}:${action}`] }));
    setDirty(true);
  };

  const toggleModule = (moduleKey: string) => {
    const mod = MODULE_DEFINITIONS.find((m) => m.key === moduleKey);
    if (!mod) return;
    const allChecked = mod.actions.every((a) => local[`${moduleKey}:${a.key}`]);
    const newVal = !allChecked;
    setLocal((prev) => {
      const next = { ...prev };
      for (const a of mod.actions) {
        if (activeRole === "admin" && moduleKey === "permisos") continue;
        next[`${moduleKey}:${a.key}`] = newVal;
      }
      return next;
    });
    setDirty(true);
  };

  const handleSave = () => {
    const perms = Object.entries(local).map(([key, allowed]) => {
      const [module, action] = key.split(":");
      return { role: activeRole, module, action, allowed };
    });
    saveMutation.mutate(perms, {
      onSuccess: () => {
        toast.success("Permisos guardados correctamente");
        setDirty(false);
      },
      onError: () => toast.error("Error al guardar permisos"),
    });
  };

  const handleReset = () => {
    const state: Record<string, boolean> = {};
    for (const mod of MODULE_DEFINITIONS) {
      for (const act of mod.actions) {
        state[`${mod.key}:${act.key}`] = isAllowed(activeRole, mod.key, act.key);
      }
    }
    setLocal(state);
    setDirty(false);
  };

  // Group modules by category
  const groups = useMemo(() => [
    { label: "General", modules: ["dashboard"] },
    { label: "Operaciones", modules: ["cobranza", "mi_cobranza", "prestamos", "pagos", "promesas", "solicitudes"] },
    { label: "Clientes y CRM", modules: ["clientes", "crm", "scoring", "mapa_gps"] },
    { label: "Finanzas", modules: ["cajas", "gastos", "comisiones", "liquidar_ruta", "reportes"] },
    { label: "Equipo", modules: ["cobradores", "rutas", "usuarios"] },
    { label: "Configuración", modules: ["empresas", "configuracion", "catalogos", "whatsapp", "permisos"] },
  ], []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Permisos por Rol"
        description="Configura qué puede ver y hacer cada rol en el sistema"
        icon={Shield}
      />

      <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as AppRole)}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            {ROLES.map((r) => (
              <TabsTrigger key={r.key} value={r.key} className="gap-1.5">
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={!dirty}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Descartar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {saveMutation.isPending ? "Guardando..." : "Guardar Permisos"}
            </Button>
          </div>
        </div>

        {ROLES.map((r) => (
          <TabsContent key={r.key} value={r.key} className="mt-4 space-y-4">
            {groups.map((group) => {
              const mods = MODULE_DEFINITIONS.filter((m) => group.modules.includes(m.key));
              if (mods.length === 0) return null;
              return (
                <Card key={group.label}>
                  <CardContent className="pt-4 pb-3">
                    <h3 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                      {group.label}
                    </h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-3 py-2 font-semibold w-[180px]">Módulo</th>
                            {/* Dynamic action headers from union of all actions in this group */}
                            {getGroupActions(mods).map((a) => (
                              <th key={a.key} className="text-center px-2 py-2 font-semibold whitespace-nowrap">
                                {a.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mods.map((mod) => {
                            const groupActions = getGroupActions(mods);
                            const allChecked = mod.actions.every((a) => local[`${mod.key}:${a.key}`]);
                            const someChecked = mod.actions.some((a) => local[`${mod.key}:${a.key}`]);
                            return (
                              <tr key={mod.key} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={allChecked}
                                      // @ts-ignore
                                      indeterminate={someChecked && !allChecked}
                                      onCheckedChange={() => toggleModule(mod.key)}
                                      disabled={activeRole === "admin" && mod.key === "permisos"}
                                    />
                                    <span className="font-medium">{mod.label}</span>
                                  </div>
                                </td>
                                {groupActions.map((ga) => {
                                  const hasAction = mod.actions.some((a) => a.key === ga.key);
                                  if (!hasAction) {
                                    return <td key={ga.key} className="text-center px-2 py-2 text-muted-foreground">—</td>;
                                  }
                                  const checked = !!local[`${mod.key}:${ga.key}`];
                                  const isLocked = activeRole === "admin" && mod.key === "permisos";
                                  return (
                                    <td key={ga.key} className="text-center px-2 py-2">
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={() => toggle(mod.key, ga.key)}
                                        disabled={isLocked}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** Get union of all action keys across modules in a group, maintaining order */
function getGroupActions(mods: typeof MODULE_DEFINITIONS) {
  const seen = new Set<string>();
  const result: { key: string; label: string }[] = [];
  // Base order
  const order = ["ver", "agregar", "editar", "eliminar"];
  // First pass: base actions in order
  for (const key of order) {
    for (const mod of mods) {
      const act = mod.actions.find((a) => a.key === key);
      if (act && !seen.has(key)) {
        seen.add(key);
        result.push(act);
        break;
      }
    }
  }
  // Second pass: special actions
  for (const mod of mods) {
    for (const act of mod.actions) {
      if (!seen.has(act.key)) {
        seen.add(act.key);
        result.push(act);
      }
    }
  }
  return result;
}
