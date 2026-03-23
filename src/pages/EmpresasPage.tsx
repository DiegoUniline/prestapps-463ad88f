import { useState } from "react";
import { fmtDate } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { isSuperAdmin } from "@/components/SuperAdminGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Building2, UserPlus, Crown, Shield, Users, Eye, CreditCard } from "lucide-react";
import EmpresaSubscriptionTab from "@/components/EmpresaSubscriptionTab";

const PLAN_CONFIG: Record<string, { label: string; maxUsers: number; price: string; icon: React.ReactNode }> = {
  basico: { label: "Básico", maxUsers: 3, price: "$499/mes", icon: <Shield className="h-3.5 w-3.5" /> },
  profesional: { label: "Profesional", maxUsers: 10, price: "$999/mes", icon: <Users className="h-3.5 w-3.5" /> },
  enterprise: { label: "Enterprise", maxUsers: 999, price: "$1,999/mes", icon: <Crown className="h-3.5 w-3.5" /> },
};

const LADA_FLAGS: Record<string, string> = {
  "52": "🇲🇽", "1": "🇺🇸", "502": "🇬🇹", "503": "🇸🇻", "504": "🇭🇳",
  "505": "🇳🇮", "506": "🇨🇷", "507": "🇵🇦", "51": "🇵🇪", "57": "🇨🇴",
  "56": "🇨🇱", "54": "🇦🇷", "593": "🇪🇨", "591": "🇧🇴", "595": "🇵🇾",
  "598": "🇺🇾", "58": "🇻🇪", "809": "🇩🇴", "34": "🇪🇸",
};

interface Empresa {
  id: string;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
  activa: boolean;
  created_at: string | null;
  plan: string;
  max_usuarios: number;
  lada_pais: string;
}

interface EmpresaForm {
  nombre: string;
  ruc: string;
  telefono: string;
  direccion: string;
  activa: boolean;
  plan: string;
  adminEmail: string;
  adminPassword: string;
  adminNombre: string;
  adminTelefono: string;
}

const emptyForm: EmpresaForm = {
  nombre: "", ruc: "", telefono: "", direccion: "", activa: true, plan: "basico",
  adminEmail: "", adminPassword: "", adminNombre: "", adminTelefono: "",
};

export default function EmpresasPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EmpresaForm>(emptyForm);
  const [detailEmpresa, setDetailEmpresa] = useState<Empresa | null>(null);

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ["empresas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nombre, ruc, telefono, direccion, logo_url, activa, created_at, plan, max_usuarios, lada_pais")
        .order("nombre");
      if (error) throw error;
      return (data as unknown) as Empresa[];
    },
  });

  const { data: adminMap = {} } = useQuery({
    queryKey: ["empresas-admins"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("manage-users", {
        body: { action: "list" },
      });
      const map: Record<string, { nombre: string; email: string }[]> = {};
      for (const u of data || []) {
        if (u.rol === "admin") {
          const eid = u.empresa_id || "00000000-0000-0000-0000-000000000001";
          if (!map[eid]) map[eid] = [];
          map[eid].push({ nombre: u.nombre_completo, email: u.email });
        }
      }
      return map;
    },
  });

  // Real subscription data from suscripciones table
  const { data: subsMap = {} } = useQuery({
    queryKey: ["empresas-suscripciones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suscripciones")
        .select("empresa_id, estado, num_usuarios, plan_id, fecha_inicio, fecha_vencimiento, planes(nombre, precio_base_mes)")
        .neq("estado", "cancelada")
        .order("creado_en", { ascending: false });
      if (error) throw error;
      const map: Record<string, { estado: string; num_usuarios: number; plan_nombre: string; precio: number; fecha_inicio: string | null; fecha_vencimiento: string | null }> = {};
      for (const s of data || []) {
        if (!map[s.empresa_id]) {
          map[s.empresa_id] = {
            estado: s.estado,
            num_usuarios: s.num_usuarios,
            plan_nombre: (s.planes as any)?.nombre || "Manual",
            precio: (s.planes as any)?.precio_base_mes || 0,
            fecha_inicio: s.fecha_inicio,
            fecha_vencimiento: s.fecha_vencimiento,
          };
        }
      }
      return map;
    },
  });

  const { data: userCountMap = {} } = useQuery({
    queryKey: ["empresas-user-counts"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("manage-users", {
        body: { action: "list" },
      });
      const map: Record<string, number> = {};
      for (const u of data || []) {
        const eid = u.empresa_id || "00000000-0000-0000-0000-000000000001";
        map[eid] = (map[eid] || 0) + 1;
      }
      return map;
    },
  });

  // Users for selected empresa detail
  const { data: detailUsers = [], isLoading: loadingDetail } = useQuery({
    queryKey: ["empresa-detail-users", detailEmpresa?.id],
    enabled: !!detailEmpresa,
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("manage-users", {
        body: { action: "list", empresa_id: detailEmpresa!.id },
      });
      return (data || []) as Array<{
        id: string;
        nombre_completo: string;
        email: string;
        rol: string;
        telefono: string | null;
        activo: boolean;
        created_at: string | null;
      }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nombre.trim()) throw new Error("El nombre es requerido");

      const planInfo = PLAN_CONFIG[form.plan] || PLAN_CONFIG.basico;

      if (editId) {
        const { error } = await supabase.from("empresas").update({
          nombre: form.nombre.trim(),
          ruc: form.ruc || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          activa: form.activa,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        if (!form.adminEmail.trim()) throw new Error("El correo del administrador es requerido");
        if (!form.adminPassword || form.adminPassword.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
        if (!form.adminNombre.trim()) throw new Error("El nombre del administrador es requerido");

        const { data: newEmpresa, error: empError } = await supabase.from("empresas").insert({
          nombre: form.nombre.trim(),
          ruc: form.ruc || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          activa: form.activa,
          plan: form.plan,
          max_usuarios: planInfo.maxUsers,
        }).select("id").single();
        if (empError) throw empError;

        const { data: result, error: fnError } = await supabase.functions.invoke("manage-users", {
          body: {
            action: "create",
            email: form.adminEmail.trim(),
            password: form.adminPassword,
            nombre_completo: form.adminNombre.trim(),
            telefono: form.adminTelefono || null,
            rol: "Admin",
            activo: true,
            empresa_id: newEmpresa.id,
          },
        });
        if (fnError) throw fnError;
        if (result?.error) throw new Error(result.error);
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Empresa actualizada" : "Empresa y administrador creados");
      queryClient.invalidateQueries({ queryKey: ["empresas-config"] });
      queryClient.invalidateQueries({ queryKey: ["empresas-admins"] });
      queryClient.invalidateQueries({ queryKey: ["empresas-user-counts"] });
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };

  const openEdit = (e: Empresa) => {
    setEditId(e.id);
    setForm({
      nombre: e.nombre, ruc: e.ruc || "", telefono: e.telefono || "",
      direccion: e.direccion || "", activa: e.activa, plan: e.plan || "basico",
      adminEmail: "", adminPassword: "", adminNombre: "", adminTelefono: "",
    });
    setOpen(true);
  };

  if (!isSuperAdmin(user?.email)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No tienes permisos para acceder a esta página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-sm text-muted-foreground">Gestiona las empresas, planes y administradores</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nueva Empresa
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Lada</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Correo Admin</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                   <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Cargando...</TableCell>
                 </TableRow>
               ) : empresas.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No hay empresas</TableCell>
                </TableRow>
              ) : (
                empresas.map((e) => {
                  const admins = adminMap[e.id] || [];
                    const planInfo = PLAN_CONFIG[e.plan] || PLAN_CONFIG.basico;
                    const userCount = userCountMap[e.id] || 0;
                    const sub = subsMap[e.id];
                    const subPlanName = sub?.plan_nombre || null;
                    const subEstado = sub?.estado || null;
                    const subUsuarios = sub?.num_usuarios || 0;
                    const atLimit = userCount >= (subUsuarios || e.max_usuarios) && (subUsuarios || e.max_usuarios) < 999;

                  return (
                    <TableRow key={e.id} className={`${!e.activa ? "opacity-50" : ""} cursor-pointer hover:bg-muted/50`} onClick={() => setDetailEmpresa(e)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {e.nombre}
                        </div>
                      </TableCell>
                      <TableCell>
                        {sub ? (
                          <div className="space-y-0.5">
                            <Badge variant="outline" className="gap-1">
                              {planInfo.icon} {subPlanName}
                            </Badge>
                            <Badge variant={subEstado === "activa" ? "default" : subEstado === "trial" ? "outline" : "destructive"} className="text-[10px] ml-1">
                              {subEstado}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sin suscripción</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sub ? (
                          <span className={atLimit ? "text-destructive font-semibold" : ""}>
                            {userCount} / {subUsuarios}
                          </span>
                        ) : (
                          <span>{userCount} <span className="text-muted-foreground text-xs">(sin plan)</span></span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(e.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        {sub?.fecha_vencimiento ? (
                          <span className={new Date(sub.fecha_vencimiento) < new Date() ? "text-destructive font-semibold" : ""}>
                            {fmtDate(sub.fecha_vencimiento)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {LADA_FLAGS[e.lada_pais] || "🌐"} +{e.lada_pais}
                      </TableCell>
                      <TableCell className="text-xs">{e.telefono || "—"}</TableCell>
                      <TableCell>
                        {admins.length > 0 ? (
                          <div className="space-y-0.5">
                            {admins.map((a, i) => (
                              <div key={i} className="text-xs">
                                <span className="font-medium">{a.nombre}</span>
                                <br />
                                <span className="text-muted-foreground">{a.email}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Sin admin</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.activa ? "default" : "secondary"}>
                          {e.activa ? "Activa" : "Inactiva"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Empresa" : "Nueva Empresa + Administrador"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Building2 className="h-4 w-4" /> Datos de la Empresa
            </div>
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre de la empresa" />
            </div>

            {/* Plan selector - only for new empresas */}
            {!editId && (
              <div className="space-y-2">
                <Label>Plan inicial</Label>
                <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLAN_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          {cfg.icon} {cfg.label} — {cfg.price} (hasta {cfg.maxUsers >= 999 ? "∞" : cfg.maxUsers} usuarios)
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editId && (
              <div className="text-xs text-muted-foreground bg-secondary rounded-lg p-3">
                💡 El plan y usuarios se gestionan desde la pestaña <strong>Suscripción</strong> en el detalle de la empresa.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RUC / NIT</Label>
                <Input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} placeholder="0000-000000-000-0" />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="+52 000-000-0000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Textarea value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección" rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activa} onCheckedChange={(v) => setForm({ ...form, activa: v })} />
              <Label>Empresa activa</Label>
            </div>

            {!editId && (
              <>
                <Separator />
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <UserPlus className="h-4 w-4" /> Administrador de la Empresa
                </div>
                <p className="text-xs text-muted-foreground">Este usuario será el admin de la empresa.</p>
                <div className="space-y-2">
                  <Label>Nombre completo *</Label>
                  <Input value={form.adminNombre} onChange={(e) => setForm({ ...form, adminNombre: e.target.value })} placeholder="Nombre del administrador" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Correo electrónico *</Label>
                    <Input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@empresa.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Contraseña *</Label>
                    <Input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder="Min. 6 caracteres" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input value={form.adminTelefono} onChange={(e) => setForm({ ...form, adminTelefono: e.target.value })} placeholder="+52 000-000-0000" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editId ? "Actualizar" : "Crear Empresa + Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailEmpresa} onOpenChange={(v) => !v && setDetailEmpresa(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> {detailEmpresa?.nombre}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="info"><Users className="h-3.5 w-3.5 mr-1" /> Info</TabsTrigger>
              <TabsTrigger value="usuarios"><Users className="h-3.5 w-3.5 mr-1" /> Usuarios</TabsTrigger>
              <TabsTrigger value="suscripcion"><CreditCard className="h-3.5 w-3.5 mr-1" /> Suscripción</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-2">
                <div>
                  <span className="text-muted-foreground block text-xs">Suscripción</span>
                  {detailEmpresa && subsMap[detailEmpresa.id] ? (
                    <div className="mt-0.5 space-y-0.5">
                      <Badge variant="outline" className="gap-1">
                        {subsMap[detailEmpresa.id].plan_nombre}
                      </Badge>
                      <Badge variant={subsMap[detailEmpresa.id].estado === "activa" ? "default" : "destructive"} className="text-[10px] ml-1">
                        {subsMap[detailEmpresa.id].estado}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic mt-0.5 block">Sin suscripción</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">RUC / NIT</span>
                  <span className="font-medium">{detailEmpresa?.ruc || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Teléfono</span>
                  <span className="font-medium">{detailEmpresa?.telefono || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Estado</span>
                  <Badge variant={detailEmpresa?.activa ? "default" : "secondary"} className="mt-0.5">
                    {detailEmpresa?.activa ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="usuarios" className="max-h-[60vh] overflow-y-auto">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground pt-2 mb-2">
                <Users className="h-4 w-4" /> Usuarios ({detailUsers.length})
              </div>
              {loadingDetail ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Cargando usuarios...</p>
              ) : detailUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No hay usuarios registrados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailUsers.map((u) => {
                      const rolLabel: Record<string, string> = { admin: "Admin", supervisor: "Supervisor", cobrador: "Cobrador" };
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.nombre_completo}</TableCell>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{rolLabel[u.rol] || u.rol}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.activo ? "default" : "secondary"}>
                              {u.activo ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="suscripcion" className="max-h-[60vh] overflow-y-auto">
              {detailEmpresa && (
                <EmpresaSubscriptionTab empresaId={detailEmpresa.id} empresaNombre={detailEmpresa.nombre} />
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailEmpresa(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
