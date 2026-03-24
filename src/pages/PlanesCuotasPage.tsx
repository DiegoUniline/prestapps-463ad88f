import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ListOrdered } from "lucide-react";
import {
  usePlanesCuotas, useUpsertPlanCuota, useDeletePlanCuota, type PlanCuota,
} from "@/hooks/useCatalogos";
import { $$ } from "@/lib/utils";

export default function PlanesCuotasPage() {
  const navigate = useNavigate();
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary" /> Planes de Cuotas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Plantillas que pre-llenan automáticamente los datos al crear un préstamo.</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuevo Plan</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>No hay planes de cuotas configurados.</p>
              <Button size="sm" className="mt-3" onClick={openNew}>Crear primer plan</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-center">Cuotas</TableHead>
                    <TableHead className="text-center">Tasa %</TableHead>
                    <TableHead className="text-center">Frecuencia</TableHead>
                    <TableHead className="text-center">Modalidad</TableHead>
                    <TableHead className="text-center">Mora / día</TableHead>
                    <TableHead className="text-center">Com. Colocador</TableHead>
                    <TableHead className="text-center">Com. Cobrador</TableHead>
                    <TableHead>Estado</TableHead>
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
                      <TableCell className="text-center">{item.modalidad === "fijo" ? "Cuota Fija" : "Saldos Insolutos"}</TableCell>
                      <TableCell className="text-center">{item.tipo_mora === "porcentaje" ? `${item.valor_mora}%` : $$(item.valor_mora)}</TableCell>
                      <TableCell className="text-center">{item.comision_colocador}%</TableCell>
                      <TableCell className="text-center">{item.comision_cobrador}%</TableCell>
                      <TableCell><Badge variant={item.activo ? "default" : "secondary"}>{item.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog edición */}
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
      </div>
  );
}
