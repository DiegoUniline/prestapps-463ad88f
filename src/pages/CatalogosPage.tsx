import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Banknote, CreditCard, ShieldCheck, Plus, Pencil, Trash2, CheckCircle, XCircle,
  Clock, FileText, Heart, Briefcase, ListOrdered,
} from "lucide-react";
import {
  useMetodosPago, useUpsertMetodoPago, useDeleteMetodoPago,
  useEstadosPrestamo, useUpsertEstadoPrestamo, useDeleteEstadoPrestamo,
  useFrecuenciasPago, useUpsertFrecuenciaPago, useDeleteFrecuenciaPago,
  useTiposDocumento, useUpsertTipoDocumento, useDeleteTipoDocumento,
  useEstadosCiviles, useUpsertEstadoCivil, useDeleteEstadoCivil,
  useSituacionesLaborales, useUpsertSituacionLaboral, useDeleteSituacionLaboral,
  usePlanesCuotas, useUpsertPlanCuota, useDeletePlanCuota,
  type MetodoPago, type EstadoPrestamo, type CatalogoSimple, type PlanCuota,
} from "@/hooks/useCatalogos";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";

// ── Generic Simple CRUD Tab ──
function SimpleCrudTab({
  title, icon: Icon, query, upsertMutation, deleteMutation,
}: {
  title: string;
  icon: LucideIcon;
  query: UseQueryResult<CatalogoSimple[]>;
  upsertMutation: UseMutationResult<void, any, any>;
  deleteMutation: UseMutationResult<void, any, string>;
}) {
  const { data: items = [], isLoading } = query;
  const [editing, setEditing] = useState<Partial<CatalogoSimple> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const openNew = () => setEditing({ nombre: "", descripcion: "", activo: true });
  const openEdit = (item: CatalogoSimple) => setEditing({ ...item });

  const handleSave = () => {
    if (!editing?.nombre?.trim()) return;
    upsertMutation.mutate(editing as CatalogoSimple, { onSuccess: () => setEditing(null) });
  };
  const handleDelete = () => {
    if (deleting) deleteMutation.mutate(deleting, { onSuccess: () => setDeleting(null) });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-5 w-5 text-primary" /> {title}
          </CardTitle>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuevo</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{item.descripcion}</TableCell>
                    <TableCell>
                      <Badge variant={item.activo ? "default" : "secondary"}>{item.activo ? "Activo" : "Inactivo"}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin registros</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nuevo"} {title}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={editing?.nombre || ""} onChange={(e) => setEditing((p) => p && { ...p, nombre: e.target.value })} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={editing?.descripcion || ""} onChange={(e) => setEditing((p) => p && { ...p, descripcion: e.target.value })} maxLength={200} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch checked={editing?.activo ?? true} onCheckedChange={(v) => setEditing((p) => p && { ...p, activo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!editing?.nombre?.trim() || upsertMutation.isPending}>
              {upsertMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Métodos de Pago Tab (custom — has requiere_validacion) ──
function MetodosPagoTab() {
  const { data: items = [], isLoading } = useMetodosPago();
  const upsert = useUpsertMetodoPago();
  const remove = useDeleteMetodoPago();
  const [editing, setEditing] = useState<Partial<MetodoPago> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const openNew = () => setEditing({ nombre: "", requiere_validacion: false, descripcion: "", activo: true });
  const openEdit = (item: MetodoPago) => setEditing({ ...item });
  const handleSave = () => { if (!editing?.nombre?.trim()) return; upsert.mutate(editing as MetodoPago, { onSuccess: () => setEditing(null) }); };
  const handleDelete = () => { if (deleting) remove.mutate(deleting, { onSuccess: () => setDeleting(null) }); };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-5 w-5 text-primary" /> Métodos de Pago</CardTitle>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuevo</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Requiere Validación</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nombre}</TableCell>
                    <TableCell>
                      {item.requiere_validacion ? (
                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 border"><CheckCircle className="h-3 w-3 mr-1" /> Sí</Badge>
                      ) : (
                        <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{item.descripcion}</TableCell>
                    <TableCell><Badge variant={item.activo ? "default" : "secondary"}>{item.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin registros</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nuevo"} Método de Pago</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nombre *</Label><Input value={editing?.nombre || ""} onChange={(e) => setEditing((p) => p && { ...p, nombre: e.target.value })} maxLength={50} /></div>
            <div className="space-y-2"><Label>Descripción</Label><Textarea value={editing?.descripcion || ""} onChange={(e) => setEditing((p) => p && { ...p, descripcion: e.target.value })} maxLength={200} /></div>
            <div className="flex items-center justify-between"><Label>Requiere Validación</Label><Switch checked={editing?.requiere_validacion || false} onCheckedChange={(v) => setEditing((p) => p && { ...p, requiere_validacion: v })} /></div>
            <p className="text-xs text-muted-foreground">Si está activado, al registrar un pago con este método se solicitará validar el comprobante.</p>
            <div className="flex items-center justify-between"><Label>Activo</Label><Switch checked={editing?.activo ?? true} onCheckedChange={(v) => setEditing((p) => p && { ...p, activo: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!editing?.nombre?.trim() || upsert.isPending}>{upsert.isPending ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar método de pago?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Estados de Préstamo Tab (custom — has color) ──
function EstadosPrestamoTab() {
  const { data: items = [], isLoading } = useEstadosPrestamo();
  const upsert = useUpsertEstadoPrestamo();
  const remove = useDeleteEstadoPrestamo();
  const [editing, setEditing] = useState<Partial<EstadoPrestamo> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const colorOptions = [
    { label: "Azul", value: "bg-blue-500/15 text-blue-700" },
    { label: "Verde", value: "bg-green-500/15 text-green-700" },
    { label: "Rojo", value: "bg-red-500/15 text-red-700" },
    { label: "Esmeralda", value: "bg-emerald-500/15 text-emerald-700" },
    { label: "Naranja", value: "bg-orange-500/15 text-orange-700" },
    { label: "Amarillo", value: "bg-amber-500/15 text-amber-700" },
    { label: "Morado", value: "bg-purple-500/15 text-purple-700" },
    { label: "Gris", value: "bg-muted text-muted-foreground" },
  ];

  const openNew = () => setEditing({ nombre: "", color: "bg-blue-500/15 text-blue-700", descripcion: "", activo: true });
  const openEdit = (item: EstadoPrestamo) => setEditing({ ...item });
  const handleSave = () => { if (!editing?.nombre?.trim()) return; upsert.mutate(editing as EstadoPrestamo, { onSuccess: () => setEditing(null) }); };
  const handleDelete = () => { if (deleting) remove.mutate(deleting, { onSuccess: () => setDeleting(null) }); };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-5 w-5 text-primary" /> Estados de Préstamo</CardTitle>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuevo</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vista Previa</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nombre}</TableCell>
                    <TableCell><span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${item.color}`}>{item.nombre}</span></TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{item.descripcion}</TableCell>
                    <TableCell><Badge variant={item.activo ? "default" : "secondary"}>{item.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin registros</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nuevo"} Estado de Préstamo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nombre *</Label><Input value={editing?.nombre || ""} onChange={(e) => setEditing((p) => p && { ...p, nombre: e.target.value })} maxLength={50} /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => (
                  <button key={c.value} type="button" onClick={() => setEditing((p) => p && { ...p, color: c.value })}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all ${c.value} ${editing?.color === c.value ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {editing?.nombre && (
                <div className="pt-1">
                  <span className="text-xs text-muted-foreground mr-2">Vista previa:</span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${editing?.color}`}>{editing.nombre}</span>
                </div>
              )}
            </div>
            <div className="space-y-2"><Label>Descripción</Label><Textarea value={editing?.descripcion || ""} onChange={(e) => setEditing((p) => p && { ...p, descripcion: e.target.value })} maxLength={200} /></div>
            <div className="flex items-center justify-between"><Label>Activo</Label><Switch checked={editing?.activo ?? true} onCheckedChange={(v) => setEditing((p) => p && { ...p, activo: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!editing?.nombre?.trim() || upsert.isPending}>{upsert.isPending ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar estado?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Roles Tab (read-only) ──
function RolesTab() {
  const roles = [
    { valor: "admin", descripcion: "Acceso total al sistema", permisos: ["Dashboard", "Operaciones", "Clientes y CRM", "Finanzas", "Equipo", "Configuración"] },
    { valor: "supervisor", descripcion: "Visualización de rutas, clientes, reportes y CRM", permisos: ["Dashboard", "Operaciones", "Clientes y CRM", "Reportes"] },
    { valor: "cobrador", descripcion: "Cobranza diaria, pagos y promesas en rutas asignadas", permisos: ["Dashboard", "Cobranza", "Préstamos", "Pagos", "Promesas"] },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-primary" /> Roles de Usuario
          <Badge variant="secondary" className="ml-2 text-[10px]">Solo lectura</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {roles.map((r) => (
          <div key={r.valor} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Badge className="text-sm px-3 py-1">{r.valor}</Badge>
              <p className="text-sm text-muted-foreground">{r.descripcion}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.permisos.map((p) => (<Badge key={p} variant="outline" className="text-[11px]">{p}</Badge>))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Los roles se gestionan desde Usuarios. No son editables desde este catálogo.</p>
      </CardContent>
    </Card>
  );
}

// ── Planes de Cuotas Tab ──
function PlanesCuotasTab() {
  const { data: items = [], isLoading } = usePlanesCuotas();
  const upsert = useUpsertPlanCuota();
  const remove = useDeletePlanCuota();
  const [editing, setEditing] = useState<Partial<PlanCuota> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const openNew = () => setEditing({ nombre: "", num_cuotas: 12, tasa_interes: 10, comision_colocador: 0, comision_cobrador: 0, frecuencia: "semanal", modalidad: "fijo", tipo_mora: "porcentaje", valor_mora: 0, activo: true });
  const openEdit = (item: PlanCuota) => setEditing({ ...item });
  const handleSave = () => { if (!editing?.nombre?.trim()) return; upsert.mutate(editing as PlanCuota, { onSuccess: () => setEditing(null) }); };
  const handleDelete = () => { if (deleting) remove.mutate(deleting, { onSuccess: () => setDeleting(null) }); };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ListOrdered className="h-5 w-5 text-primary" /> Planes de Cuotas</CardTitle>
            <CardDescription className="text-xs mt-1">Define plantillas que pre-llenan automáticamente los datos al crear un préstamo.</CardDescription>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuevo</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-center">Cuotas</TableHead>
                    <TableHead className="text-center">Tasa %</TableHead>
                    <TableHead className="text-center">Frecuencia</TableHead>
                    <TableHead className="text-center">Com. Colocador</TableHead>
                    <TableHead className="text-center">Com. Cobrador</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell className="text-center">{item.num_cuotas}</TableCell>
                      <TableCell className="text-center">{item.tasa_interes}%</TableCell>
                      <TableCell className="text-center capitalize">{item.frecuencia}</TableCell>
                      <TableCell className="text-center">{item.comision_colocador}%</TableCell>
                      <TableCell className="text-center">{item.comision_cobrador}%</TableCell>
                      <TableCell><Badge variant={item.activo ? "default" : "secondary"}>{item.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin planes registrados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nuevo"} Plan de Cuotas</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={editing?.nombre || ""} onChange={(e) => setEditing((p) => p && { ...p, nombre: e.target.value })} placeholder="Ej: 12 semanas al 10%" maxLength={80} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Cuotas</Label>
                <Input type="number" min="1" value={editing?.num_cuotas ?? ""} onChange={(e) => setEditing((p) => p && { ...p, num_cuotas: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Tasa Interés %</Label>
                <Input type="number" min="0" step="0.01" value={editing?.tasa_interes ?? ""} onChange={(e) => setEditing((p) => p && { ...p, tasa_interes: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <Select value={editing?.frecuencia || "semanal"} onValueChange={(v) => setEditing((p) => p && { ...p, frecuencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diario">Diario</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quincenal">Quincenal</SelectItem>
                    <SelectItem value="mensual">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Modalidad</Label>
                <Select value={editing?.modalidad || "fijo"} onValueChange={(v) => setEditing((p) => p && { ...p, modalidad: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fijo">Cuota Fija</SelectItem>
                    <SelectItem value="insolutos">Saldos Insolutos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo Mora</Label>
                <Select value={editing?.tipo_mora || "porcentaje"} onValueChange={(v) => setEditing((p) => p && { ...p, tipo_mora: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje">% por día</SelectItem>
                    <SelectItem value="fijo">Fijo por día</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Mora / día</Label>
                <Input type="number" min="0" step="0.01" value={editing?.valor_mora ?? ""} onChange={(e) => setEditing((p) => p && { ...p, valor_mora: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Com. Colocador %</Label>
                <Input type="number" min="0" step="0.01" value={editing?.comision_colocador ?? ""} onChange={(e) => setEditing((p) => p && { ...p, comision_colocador: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Com. Cobrador %</Label>
                <Input type="number" min="0" step="0.01" value={editing?.comision_cobrador ?? ""} onChange={(e) => setEditing((p) => p && { ...p, comision_cobrador: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch checked={editing?.activo ?? true} onCheckedChange={(v) => setEditing((p) => p && { ...p, activo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!editing?.nombre?.trim() || upsert.isPending}>{upsert.isPending ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar plan de cuotas?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Página Principal ──
export default function CatalogosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catálogos del Sistema</h1>
        <p className="text-muted-foreground text-sm mt-1">Administra los valores de referencia del sistema</p>
      </div>

      <Tabs defaultValue="planes" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="planes" className="gap-1.5"><ListOrdered className="h-4 w-4" /> Planes Cuotas</TabsTrigger>
          <TabsTrigger value="metodos" className="gap-1.5"><Banknote className="h-4 w-4" /> Métodos Pago</TabsTrigger>
          <TabsTrigger value="estados" className="gap-1.5"><CreditCard className="h-4 w-4" /> Estados Préstamo</TabsTrigger>
          <TabsTrigger value="frecuencias" className="gap-1.5"><Clock className="h-4 w-4" /> Frecuencias</TabsTrigger>
          <TabsTrigger value="documentos" className="gap-1.5"><FileText className="h-4 w-4" /> Documentos</TabsTrigger>
          <TabsTrigger value="civiles" className="gap-1.5"><Heart className="h-4 w-4" /> Estado Civil</TabsTrigger>
          <TabsTrigger value="laborales" className="gap-1.5"><Briefcase className="h-4 w-4" /> Sit. Laboral</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><ShieldCheck className="h-4 w-4" /> Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="planes"><PlanesCuotasTab /></TabsContent>
        <TabsContent value="metodos"><MetodosPagoTab /></TabsContent>
        <TabsContent value="estados"><EstadosPrestamoTab /></TabsContent>
        <TabsContent value="frecuencias">
          <SimpleCrudTab title="Frecuencias de Pago" icon={Clock} query={useFrecuenciasPago()} upsertMutation={useUpsertFrecuenciaPago()} deleteMutation={useDeleteFrecuenciaPago()} />
        </TabsContent>
        <TabsContent value="documentos">
          <SimpleCrudTab title="Tipos de Documento" icon={FileText} query={useTiposDocumento()} upsertMutation={useUpsertTipoDocumento()} deleteMutation={useDeleteTipoDocumento()} />
        </TabsContent>
        <TabsContent value="civiles">
          <SimpleCrudTab title="Estados Civiles" icon={Heart} query={useEstadosCiviles()} upsertMutation={useUpsertEstadoCivil()} deleteMutation={useDeleteEstadoCivil()} />
        </TabsContent>
        <TabsContent value="laborales">
          <SimpleCrudTab title="Situaciones Laborales" icon={Briefcase} query={useSituacionesLaborales()} upsertMutation={useUpsertSituacionLaboral()} deleteMutation={useDeleteSituacionLaboral()} />
        </TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
