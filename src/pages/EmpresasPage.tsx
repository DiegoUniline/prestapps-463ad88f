import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Building2, Phone, MapPin, FileText } from "lucide-react";

interface Empresa {
  id: string;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
  activa: boolean;
  created_at: string | null;
}

interface EmpresaForm {
  nombre: string;
  ruc: string;
  telefono: string;
  direccion: string;
  activa: boolean;
}

const emptyForm: EmpresaForm = { nombre: "", ruc: "", telefono: "", direccion: "", activa: true };

export default function EmpresasPage() {
  const queryClient = useQueryClient();
  const { role } = useCurrentUserRole();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EmpresaForm>(emptyForm);

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ["empresas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .order("nombre");
      if (error) throw error;
      return data as Empresa[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nombre.trim()) throw new Error("El nombre es requerido");
      if (editId) {
        const { error } = await supabase
          .from("empresas")
          .update({
            nombre: form.nombre.trim(),
            ruc: form.ruc || null,
            telefono: form.telefono || null,
            direccion: form.direccion || null,
            activa: form.activa,
          })
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("empresas").insert({
          nombre: form.nombre.trim(),
          ruc: form.ruc || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          activa: form.activa,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Empresa actualizada" : "Empresa creada");
      queryClient.invalidateQueries({ queryKey: ["empresas-config"] });
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (e: Empresa) => {
    setEditId(e.id);
    setForm({
      nombre: e.nombre,
      ruc: e.ruc || "",
      telefono: e.telefono || "",
      direccion: e.direccion || "",
      activa: e.activa,
    });
    setOpen(true);
  };

  if (role !== "admin") {
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
          <p className="text-sm text-muted-foreground">Gestiona las empresas que usan el sistema</p>
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
                <TableHead>RUC / NIT</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : empresas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No hay empresas registradas
                  </TableCell>
                </TableRow>
              ) : (
                empresas.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {e.nombre}
                      </div>
                    </TableCell>
                    <TableCell>{e.ruc || "—"}</TableCell>
                    <TableCell>{e.telefono || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{e.direccion || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={e.activa ? "default" : "secondary"}>
                        {e.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Empresa" : "Nueva Empresa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre de la empresa"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RUC / NIT</Label>
                <Input
                  value={form.ruc}
                  onChange={(e) => setForm({ ...form, ruc: e.target.value })}
                  placeholder="0000-000000-000-0"
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  placeholder="+503 0000-0000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Textarea
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Dirección de la empresa"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activa} onCheckedChange={(v) => setForm({ ...form, activa: v })} />
              <Label>Empresa activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editId ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
