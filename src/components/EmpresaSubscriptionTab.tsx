import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, CreditCard, Receipt } from "lucide-react";
import { $$ } from "@/lib/utils";

interface Props {
  empresaId: string;
  empresaNombre: string;
}

const ESTADO_OPTIONS = ["activa", "trial", "suspendida", "cancelada", "gracia"];

export default function EmpresaSubscriptionTab({ empresaId, empresaNombre }: Props) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  // Fetch subscription
  const { data: suscripcion, isLoading } = useQuery({
    queryKey: ["empresa-suscripcion", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suscripciones")
        .select("*, planes(*)")
        .eq("empresa_id", empresaId)
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch planes
  const { data: planes = [] } = useQuery({
    queryKey: ["planes-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("planes").select("*").eq("activo", true).order("precio_base_mes");
      if (error) throw error;
      return data as Array<{ id: string; nombre: string; precio_base_mes: number; usuarios_incluidos: number; precio_usuario_extra: number }>;
    },
  });

  // Fetch facturas
  const { data: facturas = [] } = useQuery({
    queryKey: ["empresa-facturas", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facturas")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("fecha_emision", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Array<{
        id: string; numero_factura: string; periodo_inicio: string; periodo_fin: string;
        num_usuarios: number; total: number; estado: string; fecha_emision: string; fecha_pago: string | null;
      }>;
    },
  });

  // Form state
  const [form, setForm] = useState({
    plan_id: "",
    num_usuarios: 1,
    periodicidad: "mensual",
    estado: "activa",
    fecha_vencimiento: "",
    sin_vencimiento: true,
    descuento_porcentaje: 0,
    notas_admin: "",
  });

  const openForm = () => {
    if (suscripcion) {
      setForm({
        plan_id: suscripcion.plan_id || "",
        num_usuarios: suscripcion.num_usuarios || 1,
        periodicidad: suscripcion.periodicidad || "mensual",
        estado: suscripcion.estado || "activa",
        fecha_vencimiento: suscripcion.fecha_vencimiento || "",
        sin_vencimiento: !suscripcion.fecha_vencimiento,
        descuento_porcentaje: suscripcion.descuento_porcentaje || 0,
        notas_admin: suscripcion.notas_admin || "",
      });
    } else {
      setForm({
        plan_id: planes[0]?.id || "",
        num_usuarios: 1,
        periodicidad: "mensual",
        estado: "activa",
        fecha_vencimiento: "",
        sin_vencimiento: true,
        descuento_porcentaje: 0,
        notas_admin: "",
      });
    }
    setFormOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-create-subscription", {
        body: {
          action: suscripcion ? "update" : "create",
          empresa_id: empresaId,
          suscripcion_id: suscripcion?.id || null,
          plan_id: form.plan_id || null,
          num_usuarios: form.num_usuarios,
          periodicidad: form.periodicidad,
          estado: form.estado,
          fecha_vencimiento: form.sin_vencimiento ? null : form.fecha_vencimiento || null,
          descuento_porcentaje: form.descuento_porcentaje,
          notas_admin: form.notas_admin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Suscripción guardada");
      queryClient.invalidateQueries({ queryKey: ["empresa-suscripcion", empresaId] });
      queryClient.invalidateQueries({ queryKey: ["empresa-facturas", empresaId] });
      setFormOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!suscripcion) return;
      const { data, error } = await supabase.functions.invoke("admin-create-subscription", {
        body: { action: "cancel", suscripcion_id: suscripcion.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Suscripción cancelada");
      queryClient.invalidateQueries({ queryKey: ["empresa-suscripcion", empresaId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const selectedPlan = planes.find((p) => p.id === form.plan_id);

  if (isLoading) return <p className="text-sm text-muted-foreground py-4 text-center">Cargando...</p>;

  return (
    <div className="space-y-4">
      {/* Current subscription */}
      {suscripcion ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Suscripción Actual
              </CardTitle>
              <Badge variant={
                suscripcion.estado === "activa" ? "default" :
                suscripcion.estado === "trial" ? "outline" :
                "destructive"
              }>
                {suscripcion.estado}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs block">Plan</span>
                <span className="font-medium">{(suscripcion as any).planes?.nombre || "Manual"}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Usuarios</span>
                <span className="font-medium">{suscripcion.num_usuarios}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Tipo</span>
                <span className="font-medium">{suscripcion.es_manual ? "Manual" : "Stripe"}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Descuento</span>
                <span className="font-medium">{suscripcion.descuento_porcentaje || 0}%</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Próx. cobro</span>
                <span className="font-medium">{suscripcion.fecha_proximo_cobro || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Vencimiento</span>
                <span className="font-medium">{suscripcion.fecha_vencimiento || "Sin vencimiento"}</span>
              </div>
            </div>
            {suscripcion.notas_admin && (
              <p className="text-xs text-muted-foreground mt-2 italic">Notas: {suscripcion.notas_admin}</p>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={openForm}>Editar</Button>
              {suscripcion.estado !== "cancelada" && (
                <Button size="sm" variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? "Cancelando..." : "Cancelar Suscripción"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-6">
          <p className="text-muted-foreground text-sm mb-3">Esta empresa no tiene suscripción activa</p>
          <Button onClick={openForm} className="gap-2"><Plus className="h-4 w-4" /> Crear Suscripción Manual</Button>
        </div>
      )}

      {/* Invoices */}
      {facturas.length > 0 && (
        <>
          <Separator />
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <Receipt className="h-4 w-4" /> Facturas ({facturas.length})
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{f.numero_factura}</TableCell>
                  <TableCell className="text-xs">{f.periodo_inicio} — {f.periodo_fin}</TableCell>
                  <TableCell className="font-semibold">{$$(f.total)}</TableCell>
                  <TableCell>
                    <Badge variant={f.estado === "pagada" ? "default" : f.estado === "pendiente" ? "secondary" : "destructive"} className="text-xs">
                      {f.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{f.fecha_emision?.split("T")[0]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{suscripcion ? "Editar Suscripción" : "Nueva Suscripción Manual"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={form.plan_id} onValueChange={(v) => {
                const p = planes.find((pl) => pl.id === v);
                setForm({ ...form, plan_id: v, num_usuarios: Math.max(form.num_usuarios, p?.usuarios_incluidos || 1) });
              }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                <SelectContent>
                  {planes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} — {$$(p.precio_base_mes)}/mes ({p.usuarios_incluidos} usuarios)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Usuarios totales contratados</Label>
                <Input type="number" min={selectedPlan?.usuarios_incluidos || 1} value={form.num_usuarios} onChange={(e) => setForm({ ...form, num_usuarios: parseInt(e.target.value) || 1 })} />
                {selectedPlan && (
                  <p className="text-[11px] text-muted-foreground">
                    {selectedPlan.usuarios_incluidos} incluidos en el plan
                    {form.num_usuarios > selectedPlan.usuarios_incluidos
                      ? ` · ${form.num_usuarios - selectedPlan.usuarios_incluidos} extra(s)`
                      : ""}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Descuento %</Label>
                <Input type="number" min={0} max={100} value={form.descuento_porcentaje} onChange={(e) => setForm({ ...form, descuento_porcentaje: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Periodicidad</Label>
                <Select value={form.periodicidad} onValueChange={(v) => setForm({ ...form, periodicidad: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTADO_OPTIONS.map((e) => <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.sin_vencimiento} onCheckedChange={(v) => setForm({ ...form, sin_vencimiento: v })} />
              <Label>Sin vencimiento</Label>
            </div>
            {!form.sin_vencimiento && (
              <div className="space-y-2">
                <Label>Fecha vencimiento</Label>
                <Input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Notas internas</Label>
              <Textarea value={form.notas_admin} onChange={(e) => setForm({ ...form, notas_admin: e.target.value })} rows={2} placeholder="Notas visibles solo para superadmin" />
            </div>

            {selectedPlan && (
              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                <div className="font-semibold">Resumen</div>
                <div>Base: {$$(selectedPlan.precio_base_mes)}/mes</div>
                {form.num_usuarios > selectedPlan.usuarios_incluidos && (
                  <div>Usuarios extra: {form.num_usuarios - selectedPlan.usuarios_incluidos} × {$$(selectedPlan.precio_usuario_extra)} = {$$((form.num_usuarios - selectedPlan.usuarios_incluidos) * selectedPlan.precio_usuario_extra)}</div>
                )}
                {form.descuento_porcentaje > 0 && <div className="text-green-600">Descuento: {form.descuento_porcentaje}%</div>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
