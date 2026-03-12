import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Save, X, Trash2, MapPin, Loader2 } from "lucide-react";
import { useCliente, useCreateCliente, useUpdateCliente, useDeleteCliente } from "@/hooks/useClientes";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ClienteInsert } from "@/types/cliente";

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function useClientePrestamos(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["cliente-prestamos", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data: prestamos, error } = await supabase
        .from("prestamos")
        .select(`
          id, monto_solicitado, monto_total_pagar, num_cuotas, estado,
          fecha_registro, fecha_primer_pago, frecuencia, modalidad,
          cajas ( nombre ), rutas ( nombre )
        `)
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Get amortization summary per prestamo
      const ids = (prestamos || []).map((p) => p.id);
      if (ids.length === 0) return [];

      const { data: amort } = await supabase
        .from("amortizacion")
        .select("prestamo_id, saldo_total, saldo_mora, status")
        .in("prestamo_id", ids);

      const amortMap: Record<string, { saldo: number; mora: number; pagadas: number; total: number }> = {};
      for (const a of amort || []) {
        if (!amortMap[a.prestamo_id]) amortMap[a.prestamo_id] = { saldo: 0, mora: 0, pagadas: 0, total: 0 };
        amortMap[a.prestamo_id].saldo += Number(a.saldo_total || 0);
        amortMap[a.prestamo_id].mora += Number(a.saldo_mora || 0);
        amortMap[a.prestamo_id].total += 1;
        if (a.status === "Pagada") amortMap[a.prestamo_id].pagadas += 1;
      }

      return (prestamos || []).map((p: any) => ({
        ...p,
        caja: p.cajas?.nombre || "—",
        ruta: p.rutas?.nombre || "—",
        saldo: amortMap[p.id]?.saldo || 0,
        mora: amortMap[p.id]?.mora || 0,
        cuotasPagadas: amortMap[p.id]?.pagadas || 0,
        totalCuotas: amortMap[p.id]?.total || p.num_cuotas,
      }));
    },
    enabled: !!clienteId,
  });
}

function useClientePagos(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["cliente-pagos", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      // Get prestamo IDs for this client
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select("id")
        .eq("cliente_id", clienteId);
      const ids = (prestamos || []).map((p) => p.id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from("pagos")
        .select(`*, cajas ( nombre )`)
        .in("prestamo_id", ids)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clienteId,
  });
}

const estadoPrestamoColors: Record<string, string> = {
  Activo: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Al día": "bg-success text-success-foreground",
  Vencido: "bg-destructive text-destructive-foreground",
  Liquidado: "bg-muted text-muted-foreground",
  Cancelado: "bg-muted text-muted-foreground",
  Juridico: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};
const emptyForm: ClienteInsert = {
  nombre_completo: "",
  telefono: "",
  correo: "",
  documento_identidad: "DUI",
  dni: "",
  direccion: "",
  foto_cliente: null,
  gps_lat: null,
  gps_lng: null,
  activo: true,
  sexo: null,
  situacion_laboral: null,
  ingresos: null,
  estado_civil: null,
  dependientes: 0,
  estado: "Activo",
};

const estadoColors: Record<string, string> = {
  Activo: "bg-success text-success-foreground",
  "En mora": "bg-destructive text-destructive-foreground",
  Bloqueado: "bg-muted text-muted-foreground",
  Inactivo: "bg-muted text-muted-foreground",
};

export default function ClienteDetallePage() {
  const { id } = useParams();
  const isNew = !id || id === "nuevo";
  const navigate = useNavigate();

  const { data: cliente, isLoading } = useCliente(isNew ? undefined : id);
  const createCliente = useCreateCliente();
  const updateCliente = useUpdateCliente();
  const deleteCliente = useDeleteCliente();

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<ClienteInsert>(emptyForm);
  const [capturingGps, setCapturingGps] = useState(false);

  useEffect(() => {
    if (cliente) {
      const { id: _id, id_cliente: _idc, created_at: _ca, ...rest } = cliente;
      setForm(rest);
    }
  }, [cliente]);

  const updateField = <K extends keyof ClienteInsert>(key: K, value: ClienteInsert[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCapturarGPS = () => {
    if (!navigator.geolocation) { toast.error("Geolocalización no soportada"); return; }
    setCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setForm((p) => ({ ...p, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude })); setCapturingGps(false); toast.success("Ubicación capturada"); },
      () => { setCapturingGps(false); toast.error("No se pudo obtener la ubicación"); }
    );
  };

  const handleSave = () => {
    if (!form.nombre_completo.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (isNew) {
      createCliente.mutate(form, {
        onSuccess: (data) => { toast.success(`Cliente ${data.id_cliente} creado`); navigate(`/clientes/${data.id}`, { replace: true }); },
        onError: (e) => toast.error("Error: " + (e as Error).message),
      });
    } else {
      updateCliente.mutate({ id: id!, ...form }, {
        onSuccess: () => { toast.success("Cliente actualizado"); setEditing(false); },
        onError: (e) => toast.error("Error: " + (e as Error).message),
      });
    }
  };

  const handleDiscard = () => {
    if (isNew) { navigate("/clientes"); return; }
    if (cliente) { const { id: _id, id_cliente: _idc, created_at: _ca, ...rest } = cliente; setForm(rest); }
    setEditing(false);
  };

  const handleDelete = () => {
    if (!confirm("¿Eliminar este cliente permanentemente?")) return;
    deleteCliente.mutate(id!, {
      onSuccess: () => { toast.success("Cliente eliminado"); navigate("/clientes"); },
      onError: (e) => toast.error("Error: " + (e as Error).message),
    });
  };

  if (!isNew && isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const isSaving = createCliente.isPending || updateCliente.isPending;

  // Field renderer: read mode shows text, edit mode shows input
  const ReadOrInput = ({ label, value, field, type = "text" }: { label: string; value: string; field: keyof ClienteInsert; type?: string }) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input type={type} value={(form[field] as string | number) ?? ""} onChange={(e) => updateField(field, type === "number" ? (e.target.value ? Number(e.target.value) : null) as any : e.target.value as any)} />
      ) : (
        <p className="text-sm font-medium mt-1">{value || "—"}</p>
      )}
    </div>
  );

  const ReadOrSelect = ({ label, value, field, options }: { label: string; value: string; field: keyof ClienteInsert; options: { value: string; label: string }[] }) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Select value={(form[field] as string) || ""} onValueChange={(v) => updateField(field, v as any)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <p className="text-sm font-medium mt-1">{value || "—"}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/clientes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Clientes</p>
              <span className="text-sm text-muted-foreground">/</span>
              <p className="text-sm">{isNew ? "Nuevo" : cliente?.id_cliente}</p>
            </div>
            <h1 className="text-2xl font-bold">{isNew ? "Nuevo Cliente" : form.nombre_completo || "—"}</h1>
          </div>
          {!isNew && cliente && (
            <Badge className={estadoColors[cliente.estado] || "bg-muted text-muted-foreground"}>{cliente.estado}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={handleDiscard} disabled={isSaving}><X className="h-4 w-4 mr-2" />Descartar</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button>
              <Button variant="outline" onClick={handleDelete} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</Button>
            </>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Información Personal</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <ReadOrInput label="Nombre Completo" value={form.nombre_completo} field="nombre_completo" />
            <ReadOrInput label="Teléfono" value={form.telefono || ""} field="telefono" />
            <ReadOrInput label="Correo Electrónico" value={form.correo || ""} field="correo" />
            <ReadOrSelect label="Sexo" value={form.sexo || ""} field="sexo" options={[
              { value: "Masculino", label: "Masculino" },
              { value: "Femenino", label: "Femenino" },
              { value: "Otro", label: "Otro" },
            ]} />
            <ReadOrSelect label="Estado Civil" value={form.estado_civil || ""} field="estado_civil" options={[
              { value: "Soltero", label: "Soltero" },
              { value: "Casado", label: "Casado" },
              { value: "Unión libre", label: "Unión libre" },
              { value: "Divorciado", label: "Divorciado" },
              { value: "Viudo", label: "Viudo" },
            ]} />
            <ReadOrInput label="Dependientes" value={String(form.dependientes)} field="dependientes" type="number" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identificación y Empleo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <ReadOrSelect label="Tipo de Documento" value={form.documento_identidad} field="documento_identidad" options={[
              { value: "DUI", label: "DUI" },
              { value: "Pasaporte", label: "Pasaporte" },
              { value: "NIT", label: "NIT" },
              { value: "Otro", label: "Otro" },
            ]} />
            <ReadOrInput label="Número de Documento" value={form.dni || ""} field="dni" />
            <ReadOrSelect label="Situación Laboral" value={form.situacion_laboral || ""} field="situacion_laboral" options={[
              { value: "Empleado", label: "Empleado" },
              { value: "Independiente", label: "Independiente" },
              { value: "Desempleado", label: "Desempleado" },
              { value: "Pensionado", label: "Pensionado" },
              { value: "Otro", label: "Otro" },
            ]} />
            <ReadOrInput label="Ingresos ($)" value={form.ingresos != null ? String(form.ingresos) : ""} field="ingresos" type="number" />
            <div className="col-span-2">
              <ReadOrInput label="Dirección" value={form.direccion || ""} field="direccion" />
            </div>
            <ReadOrSelect label="Estado" value={form.estado} field="estado" options={[
              { value: "Activo", label: "Activo" },
              { value: "Inactivo", label: "Inactivo" },
              { value: "Bloqueado", label: "Bloqueado" },
              { value: "En mora", label: "En mora" },
            ]} />
            <div>
              <Label className="text-xs text-muted-foreground">Activo</Label>
              {editing ? (
                <div className="mt-2"><Switch checked={form.activo} onCheckedChange={(v) => updateField("activo", v)} /></div>
              ) : (
                <p className="text-sm font-medium mt-1">{form.activo ? "Sí" : "No"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Ubicación y Foto</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">URL de Foto</Label>
                  <Input value={form.foto_cliente || ""} onChange={(e) => updateField("foto_cliente", e.target.value || null)} placeholder="https://..." />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Ubicación GPS</Label>
                  <Button type="button" variant="outline" className="w-full mt-1" onClick={handleCapturarGPS} disabled={capturingGps}>
                    {capturingGps ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                    Capturar ubicación
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">Foto</Label>
                  <p className="text-sm font-medium mt-1">{form.foto_cliente || "Sin foto"}</p>
                </div>
              </>
            )}
            {(form.gps_lat != null && form.gps_lng != null) && (
              <div>
                <Label className="text-xs text-muted-foreground">Coordenadas</Label>
                <p className="text-sm font-medium mt-1">{form.gps_lat.toFixed(6)}, {form.gps_lng.toFixed(6)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Préstamos del cliente */}
      {!isNew && <ClientePrestamosSection clienteId={id!} />}

      {/* Últimos pagos */}
      {!isNew && <ClientePagosSection clienteId={id!} />}
    </div>
  );
}

function ClientePrestamosSection({ clienteId }: { clienteId: string }) {
  const navigate = useNavigate();
  const { data: prestamos, isLoading } = useClientePrestamos(clienteId);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Historial de Préstamos</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !prestamos?.length ? (
          <p className="text-[13px] text-muted-foreground py-8 text-center">No hay préstamos registrados para este cliente</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header border-b">
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Modalidad</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
                <TableHead className="text-center text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cuotas</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Saldo</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Mora</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Caja</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prestamos.map((p: any) => (
                <TableRow key={p.id} className="cursor-pointer border-b border-border/50 hover:bg-table-hover transition-colors" onClick={() => navigate(`/prestamos/${p.id}`)}>
                  <TableCell className="text-[12px] px-3">{p.fecha_registro || "—"}</TableCell>
                  <TableCell className="text-[13px] px-3 capitalize">{p.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos"}</TableCell>
                  <TableCell className="text-right font-semibold text-[13px] px-3">{$$(Number(p.monto_solicitado))}</TableCell>
                  <TableCell className="text-center text-[12px] px-3">{p.cuotasPagadas}/{p.totalCuotas}</TableCell>
                  <TableCell className="text-right text-[13px] px-3">{$$(p.saldo)}</TableCell>
                  <TableCell className="text-right px-3">
                    <span className={p.mora > 0 ? "text-destructive font-semibold text-[13px]" : "text-muted-foreground text-[13px]"}>{$$(p.mora)}</span>
                  </TableCell>
                  <TableCell className="text-[12px] px-3">{p.caja}</TableCell>
                  <TableCell className="px-3">
                    <Badge className={estadoPrestamoColors[p.estado] || "bg-muted text-muted-foreground"}>{p.estado}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ClientePagosSection({ clienteId }: { clienteId: string }) {
  const { data: pagos, isLoading } = useClientePagos(clienteId);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Últimos Pagos</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !pagos?.length ? (
          <p className="text-[13px] text-muted-foreground py-8 text-center">No hay pagos registrados</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header border-b">
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Capital</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Interés</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Mora</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Método</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Caja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((p: any) => (
                <TableRow key={p.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                  <TableCell className="text-[12px] px-3">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-[13px] px-3">{$$(Number(p.monto_recibido))}</TableCell>
                  <TableCell className="text-right text-[12px] px-3">{$$(Number(p.aplicado_capital || 0))}</TableCell>
                  <TableCell className="text-right text-[12px] px-3">{$$(Number(p.aplicado_interes || 0))}</TableCell>
                  <TableCell className="text-right text-[12px] px-3">{$$(Number(p.aplicado_mora || 0))}</TableCell>
                  <TableCell className="text-[12px] px-3">{p.metodo_pago || "—"}</TableCell>
                  <TableCell className="text-[12px] px-3">{p.cajas?.nombre || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
