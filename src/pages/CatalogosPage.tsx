import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Banknote, CreditCard, ShieldCheck, Plus, Pencil, Trash2, CheckCircle, XCircle } from "lucide-react";
import {
  useMetodosPago,
  useUpsertMetodoPago,
  useDeleteMetodoPago,
  useEstadosPrestamo,
  useUpsertEstadoPrestamo,
  useDeleteEstadoPrestamo,
  type MetodoPago,
  type EstadoPrestamo,
} from "@/hooks/useCatalogos";

// ── Métodos de Pago Tab ──
function MetodosPagoTab() {
  const { data: items = [], isLoading } = useMetodosPago();
  const upsert = useUpsertMetodoPago();
  const remove = useDeleteMetodoPago();
  const [editing, setEditing] = useState<Partial<MetodoPago> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const openNew = () => setEditing({ nombre: "", requiere_validacion: false, descripcion: "", activo: true });
  const openEdit = (item: MetodoPago) => setEditing({ ...item });

  const handleSave = () => {
    if (!editing?.nombre?.trim()) return;
    upsert.mutate(editing as MetodoPago, { onSuccess: () => setEditing(null) });
  };

  const handleDelete = () => {
    if (deleting) remove.mutate(deleting, { onSuccess: () => setDeleting(null) });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-5 w-5 text-primary" />
            Métodos de Pago
          </CardTitle>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
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
                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 border">
                          <CheckCircle className="h-3 w-3 mr-1" /> Sí
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" /> No
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{item.descripcion}</TableCell>
                    <TableCell>
                      <Badge variant={item.activo ? "default" : "secondary"}>
                        {item.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No hay métodos de pago registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar" : "Nuevo"} Método de Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={editing?.nombre || ""}
                onChange={(e) => setEditing((p) => p && { ...p, nombre: e.target.value })}
                placeholder="Ej: Efectivo"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={editing?.descripcion || ""}
                onChange={(e) => setEditing((p) => p && { ...p, descripcion: e.target.value })}
                placeholder="Descripción del método"
                maxLength={200}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Requiere Validación</Label>
              <Switch
                checked={editing?.requiere_validacion || false}
                onCheckedChange={(v) => setEditing((p) => p && { ...p, requiere_validacion: v })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Si está activado, al registrar un pago con este método se solicitará validar el comprobante.
            </p>
            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch
                checked={editing?.activo ?? true}
                onCheckedChange={(v) => setEditing((p) => p && { ...p, activo: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!editing?.nombre?.trim() || upsert.isPending}>
              {upsert.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar método de pago?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Estados de Préstamo Tab ──
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

  const handleSave = () => {
    if (!editing?.nombre?.trim()) return;
    upsert.mutate(editing as EstadoPrestamo, { onSuccess: () => setEditing(null) });
  };

  const handleDelete = () => {
    if (deleting) remove.mutate(deleting, { onSuccess: () => setDeleting(null) });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" />
            Estados de Préstamo
          </CardTitle>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
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
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${item.color}`}>
                        {item.nombre}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{item.descripcion}</TableCell>
                    <TableCell>
                      <Badge variant={item.activo ? "default" : "secondary"}>
                        {item.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No hay estados registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar" : "Nuevo"} Estado de Préstamo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={editing?.nombre || ""}
                onChange={(e) => setEditing((p) => p && { ...p, nombre: e.target.value })}
                placeholder="Ej: Activo"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setEditing((p) => p && { ...p, color: c.value })}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all ${c.value} ${
                      editing?.color === c.value ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {editing?.nombre && (
                <div className="pt-1">
                  <span className="text-xs text-muted-foreground mr-2">Vista previa:</span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${editing?.color}`}>
                    {editing.nombre}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={editing?.descripcion || ""}
                onChange={(e) => setEditing((p) => p && { ...p, descripcion: e.target.value })}
                placeholder="Descripción del estado"
                maxLength={200}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch
                checked={editing?.activo ?? true}
                onCheckedChange={(v) => setEditing((p) => p && { ...p, activo: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!editing?.nombre?.trim() || upsert.isPending}>
              {upsert.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar estado de préstamo?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Roles Tab (solo lectura) ──
function RolesTab() {
  const roles = [
    { valor: "admin", descripcion: "Acceso total al sistema: gestión de usuarios, empresas, cajas, reportes y configuración", permisos: ["Dashboard", "Cobranza", "Préstamos", "Clientes", "Cajas", "Gastos", "Reportes", "Usuarios", "Empresas", "WhatsApp", "Catálogos"] },
    { valor: "supervisor", descripcion: "Visualización de rutas asignadas, clientes, reportes y CRM", permisos: ["Dashboard", "Cobranza", "Préstamos", "Pagos", "Promesas", "Clientes", "CRM", "Lead Scoring", "Mapa GPS", "Reportes"] },
    { valor: "cobrador", descripcion: "Cobranza diaria, registro de pagos y promesas en rutas asignadas", permisos: ["Dashboard", "Cobranza", "Préstamos", "Pagos", "Promesas"] },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Roles de Usuario
          <Badge variant="secondary" className="ml-2 text-[10px]">Solo lectura</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {roles.map((r) => (
          <div key={r.valor} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Badge className="text-sm px-3 py-1">{r.valor}</Badge>
              <p className="text-sm text-muted-foreground">{r.descripcion}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Acceso a módulos:</p>
              <div className="flex flex-wrap gap-1.5">
                {r.permisos.map((p) => (
                  <Badge key={p} variant="outline" className="text-[11px]">{p}</Badge>
                ))}
              </div>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Los roles se gestionan desde la sección de Usuarios. Los permisos están definidos a nivel del sistema y no son editables desde este catálogo.
        </p>
      </CardContent>
    </Card>
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

      <Tabs defaultValue="metodos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="metodos" className="gap-1.5">
            <Banknote className="h-4 w-4" /> Métodos de Pago
          </TabsTrigger>
          <TabsTrigger value="estados" className="gap-1.5">
            <CreditCard className="h-4 w-4" /> Estados Préstamo
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metodos">
          <MetodosPagoTab />
        </TabsContent>
        <TabsContent value="estados">
          <EstadosPrestamoTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
