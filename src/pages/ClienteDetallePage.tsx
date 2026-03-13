import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Save, X, Trash2, MapPin, Loader2, User, Briefcase, Users, ShieldCheck, FileText, CreditCard, Upload, Camera } from "lucide-react";
import { useCliente, useCreateCliente, useUpdateCliente, useDeleteCliente } from "@/hooks/useClientes";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ClienteInsert } from "@/types/cliente";
import { $$ } from "@/lib/utils";

// ── Hooks ────────────────────────────────────────────────────────
function useClientePrestamos(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["cliente-prestamos", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data: prestamos, error } = await supabase
        .from("prestamos")
        .select(`id, monto_solicitado, monto_total_pagar, num_cuotas, estado, fecha_registro, fecha_primer_pago, frecuencia, modalidad, cajas ( nombre ), rutas ( nombre )`)
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (prestamos || []).map((p) => p.id);
      if (ids.length === 0) return [];
      const { data: amort } = await supabase.from("amortizacion").select("prestamo_id, saldo_total, saldo_mora, status").in("prestamo_id", ids);
      const amortMap: Record<string, { saldo: number; mora: number; pagadas: number; total: number }> = {};
      for (const a of amort || []) {
        if (!amortMap[a.prestamo_id]) amortMap[a.prestamo_id] = { saldo: 0, mora: 0, pagadas: 0, total: 0 };
        amortMap[a.prestamo_id].saldo += Number(a.saldo_total || 0);
        amortMap[a.prestamo_id].mora += Number(a.saldo_mora || 0);
        amortMap[a.prestamo_id].total += 1;
        if (a.status === "Pagada") amortMap[a.prestamo_id].pagadas += 1;
      }
      return (prestamos || []).map((p: any) => ({
        ...p, caja: p.cajas?.nombre || "—", ruta: p.rutas?.nombre || "—",
        saldo: amortMap[p.id]?.saldo || 0, mora: amortMap[p.id]?.mora || 0,
        cuotasPagadas: amortMap[p.id]?.pagadas || 0, totalCuotas: amortMap[p.id]?.total || p.num_cuotas,
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
      const { data: prestamos } = await supabase.from("prestamos").select("id").eq("cliente_id", clienteId);
      const ids = (prestamos || []).map((p) => p.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("pagos").select(`*, cajas ( nombre )`).in("prestamo_id", ids).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clienteId,
  });
}

// ── Constants ────────────────────────────────────────────────────
const estadoPrestamoColors: Record<string, string> = {
  Activo: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Al día": "bg-success text-success-foreground",
  Vencido: "bg-destructive text-destructive-foreground",
  Liquidado: "bg-muted text-muted-foreground",
  Cancelado: "bg-muted text-muted-foreground",
  Juridico: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const estadoColors: Record<string, string> = {
  Activo: "bg-success text-success-foreground",
  "En mora": "bg-destructive text-destructive-foreground",
  Bloqueado: "bg-muted text-muted-foreground",
  Inactivo: "bg-muted text-muted-foreground",
};

const emptyForm: ClienteInsert = {
  nombre_completo: "", telefono: "", correo: "", documento_identidad: "DUI", dni: "", direccion: "",
  foto_cliente: null, gps_lat: null, gps_lng: null, activo: true, sexo: null,
  situacion_laboral: null, ingresos: null, estado_civil: null, dependientes: 0, estado: "Activo",
  fecha_nacimiento: null, tipo_vivienda: null, gastos_mensuales: null, notas: null,
  trabajo_empresa: null, trabajo_cargo: null, trabajo_telefono: null, trabajo_antiguedad: null, direccion_trabajo: null,
  ref1_nombre: null, ref1_telefono: null, ref1_parentesco: null,
  ref2_nombre: null, ref2_telefono: null, ref2_parentesco: null,
  aval_nombre: null, aval_telefono: null, aval_direccion: null, aval_dni: null, aval_parentesco: null,
};

// ── Field helpers ────────────────────────────────────────────────
function ReadOrInput({ label, value, formValue, onChange, editing, type = "text", placeholder }: {
  label: string; value: string; formValue: string | number | null; onChange: (v: any) => void; editing: boolean; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input type={type} value={formValue ?? ""} onChange={(e) => onChange(type === "number" ? (e.target.value ? Number(e.target.value) : null) : e.target.value)} placeholder={placeholder} />
      ) : (
        <p className="text-sm font-medium mt-1">{value || "—"}</p>
      )}
    </div>
  );
}

function ReadOrSelect({ label, value, formValue, onChange, editing, options }: {
  label: string; value: string; formValue: string | null; onChange: (v: string) => void; editing: boolean; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Select value={formValue || ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <p className="text-sm font-medium mt-1">{value || "—"}</p>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
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
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill id_cliente for new clients
  useEffect(() => {
    if (isNew && !form.id_cliente) {
      supabase.from("clientes").select("id_cliente")
        .then(({ data }) => {
          let maxNum = 0;
          for (const row of data || []) {
            const m = row.id_cliente?.match(/(\d+)/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
          }
          setForm(p => ({ ...p, id_cliente: `CLI-${String(maxNum + 1).padStart(4, "0")}` }));
        });
    }
  }, [isNew]);

  useEffect(() => {
    if (cliente) {
      const { id: _id, created_at: _ca, ...rest } = cliente;
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

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no debe superar 5MB"); return; }
    setUploadingFoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `clientes/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("empresa-assets").upload(fileName, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(fileName);
      updateField("foto_cliente", urlData.publicUrl);
      toast.success("Foto subida correctamente");
    } catch (err: any) {
      toast.error("Error al subir foto: " + (err.message || err));
    } finally {
      setUploadingFoto(false);
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    const nombre = form.nombre_completo.trim();
    if (!nombre) { toast.error("El nombre es obligatorio"); return; }

    // ── Validación de duplicados ──
    try {
      const conditions: string[] = [];
      conditions.push(`nombre_completo.ilike.${nombre}`);
      if (form.telefono?.trim()) conditions.push(`telefono.eq.${form.telefono.trim()}`);
      if (form.correo?.trim()) conditions.push(`correo.eq.${form.correo.trim()}`);

      const { data: duplicados } = await supabase
        .from("clientes")
        .select("id, nombre_completo, telefono, correo")
        .or(conditions.join(","));

      const otros = (duplicados || []).filter((d) => d.id !== (isNew ? "__new__" : id));

      if (otros.length > 0) {
        const coincidencias: string[] = [];
        for (const d of otros) {
          if (d.nombre_completo?.toLowerCase() === nombre.toLowerCase()) coincidencias.push(`Nombre "${d.nombre_completo}"`);
          if (form.telefono?.trim() && d.telefono === form.telefono.trim()) coincidencias.push(`Teléfono "${d.telefono}"`);
          if (form.correo?.trim() && d.correo === form.correo.trim()) coincidencias.push(`Correo "${d.correo}"`);
        }
        if (coincidencias.length > 0) {
          const msg = `Ya existe un cliente con: ${[...new Set(coincidencias)].join(", ")}`;
          const continuar = confirm(`⚠️ ${msg}\n\n¿Desea continuar de todos modos?`);
          if (!continuar) return;
        }
      }
    } catch {
      // Si falla la validación, permitir continuar
    }

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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/clientes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Clientes</span><span>/</span><span>{isNew ? "Nuevo" : cliente?.id_cliente}</span>
            </div>
            <h1 className="text-lg md:text-2xl font-bold truncate">{isNew ? "Nuevo Cliente" : form.nombre_completo || "—"}</h1>
          </div>
          {!isNew && cliente && (
            <Badge className={`shrink-0 ${estadoColors[cliente.estado] || "bg-muted text-muted-foreground"}`}>{cliente.estado}</Badge>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleDiscard} disabled={isSaving}><X className="h-4 w-4 mr-1" />Descartar</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Guardar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4 mr-1" />Eliminar</Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className="w-full grid grid-cols-3 md:grid-cols-6 h-auto">
          <TabsTrigger value="personal" className="text-xs gap-1.5 py-2"><User className="h-3.5 w-3.5" /><span className="hidden sm:inline">Personal</span><span className="sm:hidden">Datos</span></TabsTrigger>
          <TabsTrigger value="trabajo" className="text-xs gap-1.5 py-2"><Briefcase className="h-3.5 w-3.5" />Trabajo</TabsTrigger>
          <TabsTrigger value="referencias" className="text-xs gap-1.5 py-2"><Users className="h-3.5 w-3.5" /><span className="hidden sm:inline">Referencias</span><span className="sm:hidden">Refs</span></TabsTrigger>
          <TabsTrigger value="aval" className="text-xs gap-1.5 py-2"><ShieldCheck className="h-3.5 w-3.5" />Aval</TabsTrigger>
          {!isNew && <TabsTrigger value="prestamos" className="text-xs gap-1.5 py-2"><FileText className="h-3.5 w-3.5" />Préstamos</TabsTrigger>}
          {!isNew && <TabsTrigger value="pagos" className="text-xs gap-1.5 py-2"><CreditCard className="h-3.5 w-3.5" />Pagos</TabsTrigger>}
        </TabsList>

        {/* ── Tab: Personal ─────────────────────────────────── */}
        <TabsContent value="personal" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Información Personal</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-4">
                <ReadOrInput label="Cód. Interno" value={isNew ? "" : (cliente?.id_cliente || "")} formValue={(form as any).id_cliente ?? ""} onChange={(v) => setForm((p) => ({ ...p, id_cliente: v } as any))} editing={editing} placeholder="CLI-001" />
                <ReadOrInput label="Nombre Completo *" value={form.nombre_completo} formValue={form.nombre_completo} onChange={(v) => updateField("nombre_completo", v)} editing={editing} />
                <ReadOrInput label="Teléfono" value={form.telefono || ""} formValue={form.telefono} onChange={(v) => updateField("telefono", v)} editing={editing} />
                <ReadOrInput label="Correo Electrónico" value={form.correo || ""} formValue={form.correo} onChange={(v) => updateField("correo", v)} editing={editing} />
                <ReadOrSelect label="Sexo" value={form.sexo || ""} formValue={form.sexo} onChange={(v) => updateField("sexo", v as any)} editing={editing}
                  options={[{ value: "Masculino", label: "Masculino" }, { value: "Femenino", label: "Femenino" }, { value: "Otro", label: "Otro" }]} />
                <ReadOrInput label="Fecha de Nacimiento" value={form.fecha_nacimiento || ""} formValue={form.fecha_nacimiento} onChange={(v) => updateField("fecha_nacimiento", v || null)} editing={editing} type="date" />
                <ReadOrSelect label="Estado Civil" value={form.estado_civil || ""} formValue={form.estado_civil} onChange={(v) => updateField("estado_civil", v as any)} editing={editing}
                  options={[{ value: "Soltero", label: "Soltero" }, { value: "Casado", label: "Casado" }, { value: "Unión libre", label: "Unión libre" }, { value: "Divorciado", label: "Divorciado" }, { value: "Viudo", label: "Viudo" }]} />
                <ReadOrInput label="Dependientes" value={String(form.dependientes)} formValue={form.dependientes} onChange={(v) => updateField("dependientes", v ?? 0)} editing={editing} type="number" />
                <ReadOrSelect label="Tipo de Vivienda" value={form.tipo_vivienda || ""} formValue={form.tipo_vivienda} onChange={(v) => updateField("tipo_vivienda", v)} editing={editing}
                  options={[{ value: "Propia", label: "Propia" }, { value: "Alquilada", label: "Alquilada" }, { value: "Familiar", label: "Familiar" }, { value: "Hipotecada", label: "Hipotecada" }, { value: "Otra", label: "Otra" }]} />
                <div className="sm:col-span-2">
                  <ReadOrInput label="Dirección" value={form.direccion || ""} formValue={form.direccion} onChange={(v) => updateField("direccion", v)} editing={editing} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identificación y Estado</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadOrSelect label="Tipo de Documento" value={form.documento_identidad} formValue={form.documento_identidad} onChange={(v) => updateField("documento_identidad", v as any)} editing={editing}
                  options={[{ value: "INE", label: "INE" }, { value: "DUI", label: "DUI" }, { value: "Pasaporte", label: "Pasaporte" }, { value: "NIT", label: "NIT" }, { value: "Otro", label: "Otro" }]} />
                <ReadOrInput label="Número de Documento" value={form.dni || ""} formValue={form.dni} onChange={(v) => updateField("dni", v)} editing={editing} />
                <ReadOrSelect label="Estado del Cliente" value={form.estado} formValue={form.estado} onChange={(v) => updateField("estado", v as any)} editing={editing}
                  options={[{ value: "Activo", label: "Activo" }, { value: "Inactivo", label: "Inactivo" }, { value: "Bloqueado", label: "Bloqueado" }, { value: "En mora", label: "En mora" }]} />
                <div>
                  <Label className="text-xs text-muted-foreground">Activo</Label>
                  {editing ? (
                    <div className="mt-2"><Switch checked={form.activo} onCheckedChange={(v) => updateField("activo", v)} /></div>
                  ) : (
                    <p className="text-sm font-medium mt-1">{form.activo ? "Sí" : "No"}</p>
                  )}
                </div>

                {/* GPS & Photo */}
                <div className="sm:col-span-2 pt-2 border-t space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ubicación y Foto</p>
                  {/* Photo preview */}
                  {form.foto_cliente && (
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border">
                      <img src={form.foto_cliente} alt="Foto del cliente" className="w-full h-full object-cover" />
                      {editing && (
                        <button
                          type="button"
                          onClick={() => updateField("foto_cliente", null)}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                  {editing ? (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground">Foto del Cliente</Label>
                        <input
                          ref={fotoInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handleFotoUpload}
                        />
                        <div className="flex gap-2 mt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-1 h-9 text-[13px]"
                            onClick={() => fotoInputRef.current?.click()}
                            disabled={uploadingFoto}
                          >
                            {uploadingFoto ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                            {uploadingFoto ? "Subiendo..." : "Subir foto"}
                          </Button>
                        </div>
                      </div>
                      <Button type="button" variant="outline" className="w-full" onClick={handleCapturarGPS} disabled={capturingGps}>
                        {capturingGps ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                        Capturar ubicación
                      </Button>
                    </>
                  ) : (
                    <div>
                      {!form.foto_cliente && (
                        <>
                          <Label className="text-xs text-muted-foreground">Foto</Label>
                          <p className="text-sm font-medium mt-1 text-muted-foreground">Sin foto</p>
                        </>
                      )}
                    </div>
                  )}
                  {(form.gps_lat != null && form.gps_lng != null) && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Coordenadas</Label>
                      <p className="text-sm font-medium mt-1">{form.gps_lat.toFixed(6)}, {form.gps_lng.toFixed(6)}</p>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="sm:col-span-2 pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">Notas / Observaciones</Label>
                  {editing ? (
                    <Textarea value={form.notas || ""} onChange={(e) => updateField("notas", e.target.value || null)} placeholder="Observaciones del cliente..." rows={3} className="mt-1" />
                  ) : (
                    <p className="text-sm font-medium mt-1 whitespace-pre-wrap">{form.notas || "—"}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab: Trabajo ──────────────────────────────────── */}
        <TabsContent value="trabajo">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Información Laboral</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ReadOrSelect label="Situación Laboral" value={form.situacion_laboral || ""} formValue={form.situacion_laboral} onChange={(v) => updateField("situacion_laboral", v as any)} editing={editing}
                options={[{ value: "Empleado", label: "Empleado" }, { value: "Independiente", label: "Independiente" }, { value: "Desempleado", label: "Desempleado" }, { value: "Pensionado", label: "Pensionado" }, { value: "Otro", label: "Otro" }]} />
              <ReadOrInput label="Empresa / Negocio" value={form.trabajo_empresa || ""} formValue={form.trabajo_empresa} onChange={(v) => updateField("trabajo_empresa", v || null)} editing={editing} placeholder="Nombre de la empresa" />
              <ReadOrInput label="Cargo / Puesto" value={form.trabajo_cargo || ""} formValue={form.trabajo_cargo} onChange={(v) => updateField("trabajo_cargo", v || null)} editing={editing} placeholder="Ej: Vendedor, Gerente" />
              <ReadOrInput label="Teléfono del Trabajo" value={form.trabajo_telefono || ""} formValue={form.trabajo_telefono} onChange={(v) => updateField("trabajo_telefono", v || null)} editing={editing} />
              <ReadOrInput label="Antigüedad" value={form.trabajo_antiguedad || ""} formValue={form.trabajo_antiguedad} onChange={(v) => updateField("trabajo_antiguedad", v || null)} editing={editing} placeholder="Ej: 2 años, 6 meses" />
              <div className="sm:col-span-2 lg:col-span-1">
                <ReadOrInput label="Dirección del Trabajo" value={form.direccion_trabajo || ""} formValue={form.direccion_trabajo} onChange={(v) => updateField("direccion_trabajo", v || null)} editing={editing} />
              </div>
              <ReadOrInput label="Ingresos Mensuales ($)" value={form.ingresos != null ? String(form.ingresos) : ""} formValue={form.ingresos} onChange={(v) => updateField("ingresos", v)} editing={editing} type="number" />
              <ReadOrInput label="Gastos Mensuales ($)" value={form.gastos_mensuales != null ? String(form.gastos_mensuales) : ""} formValue={form.gastos_mensuales} onChange={(v) => updateField("gastos_mensuales", v)} editing={editing} type="number" />
              {/* Capacity indicator */}
              {(form.ingresos != null && form.gastos_mensuales != null) && (
                <div>
                  <Label className="text-xs text-muted-foreground">Capacidad de Pago</Label>
                  <p className={`text-sm font-bold mt-1 ${(form.ingresos - form.gastos_mensuales) > 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                    {$$((form.ingresos || 0) - (form.gastos_mensuales || 0))} / mes
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Referencias ─────────────────────────────── */}
        <TabsContent value="referencias">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Referencia Personal #1</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadOrInput label="Nombre Completo" value={form.ref1_nombre || ""} formValue={form.ref1_nombre} onChange={(v) => updateField("ref1_nombre", v || null)} editing={editing} />
                <ReadOrInput label="Teléfono" value={form.ref1_telefono || ""} formValue={form.ref1_telefono} onChange={(v) => updateField("ref1_telefono", v || null)} editing={editing} />
                <ReadOrSelect label="Parentesco / Relación" value={form.ref1_parentesco || ""} formValue={form.ref1_parentesco} onChange={(v) => updateField("ref1_parentesco", v || null)} editing={editing}
                  options={[{ value: "Familiar", label: "Familiar" }, { value: "Amigo", label: "Amigo" }, { value: "Vecino", label: "Vecino" }, { value: "Compañero de trabajo", label: "Compañero de trabajo" }, { value: "Otro", label: "Otro" }]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Referencia Personal #2</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadOrInput label="Nombre Completo" value={form.ref2_nombre || ""} formValue={form.ref2_nombre} onChange={(v) => updateField("ref2_nombre", v || null)} editing={editing} />
                <ReadOrInput label="Teléfono" value={form.ref2_telefono || ""} formValue={form.ref2_telefono} onChange={(v) => updateField("ref2_telefono", v || null)} editing={editing} />
                <ReadOrSelect label="Parentesco / Relación" value={form.ref2_parentesco || ""} formValue={form.ref2_parentesco} onChange={(v) => updateField("ref2_parentesco", v || null)} editing={editing}
                  options={[{ value: "Familiar", label: "Familiar" }, { value: "Amigo", label: "Amigo" }, { value: "Vecino", label: "Vecino" }, { value: "Compañero de trabajo", label: "Compañero de trabajo" }, { value: "Otro", label: "Otro" }]} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab: Aval ────────────────────────────────────── */}
        <TabsContent value="aval">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Datos del Aval / Fiador</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ReadOrInput label="Nombre Completo" value={form.aval_nombre || ""} formValue={form.aval_nombre} onChange={(v) => updateField("aval_nombre", v || null)} editing={editing} />
              <ReadOrInput label="Teléfono" value={form.aval_telefono || ""} formValue={form.aval_telefono} onChange={(v) => updateField("aval_telefono", v || null)} editing={editing} />
              <ReadOrInput label="Documento de Identidad" value={form.aval_dni || ""} formValue={form.aval_dni} onChange={(v) => updateField("aval_dni", v || null)} editing={editing} placeholder="Número de DUI o documento" />
              <ReadOrInput label="Dirección" value={form.aval_direccion || ""} formValue={form.aval_direccion} onChange={(v) => updateField("aval_direccion", v || null)} editing={editing} />
              <ReadOrSelect label="Parentesco / Relación" value={form.aval_parentesco || ""} formValue={form.aval_parentesco} onChange={(v) => updateField("aval_parentesco", v || null)} editing={editing}
                options={[{ value: "Cónyuge", label: "Cónyuge" }, { value: "Padre/Madre", label: "Padre/Madre" }, { value: "Hermano/a", label: "Hermano/a" }, { value: "Hijo/a", label: "Hijo/a" }, { value: "Amigo", label: "Amigo" }, { value: "Otro", label: "Otro" }]} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Préstamos ───────────────────────────────── */}
        {!isNew && (
          <TabsContent value="prestamos">
            <ClientePrestamosSection clienteId={id!} />
          </TabsContent>
        )}

        {/* ── Tab: Pagos ───────────────────────────────────── */}
        {!isNew && (
          <TabsContent value="pagos">
            <ClientePagosSection clienteId={id!} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────
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
          <p className="text-[13px] text-muted-foreground py-8 text-center">No hay préstamos registrados</p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-table-header hover:bg-table-header border-b">
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Modalidad</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
                    <TableHead className="text-center text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cuotas</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Saldo</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Mora</TableHead>
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
                      <TableCell className="px-3">
                        <Badge className={estadoPrestamoColors[p.estado] || "bg-muted text-muted-foreground"}>{p.estado}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile */}
            <div className="md:hidden space-y-2 p-3">
              {prestamos.map((p: any) => (
                <div key={p.id} className="border rounded-lg p-3 cursor-pointer active:bg-muted/50 space-y-1" onClick={() => navigate(`/prestamos/${p.id}`)}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">{p.fecha_registro}</span>
                    <Badge className={estadoPrestamoColors[p.estado] || "bg-muted text-muted-foreground"}>{p.estado}</Badge>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold text-sm">{$$(Number(p.monto_solicitado))}</span>
                    <span className="text-xs text-muted-foreground">{p.cuotasPagadas}/{p.totalCuotas} cuotas</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Saldo: {$$(p.saldo)}</span>
                    {p.mora > 0 && <span className="text-destructive font-semibold">Mora: {$$(p.mora)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
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
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-table-header hover:bg-table-header border-b">
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Capital</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Interés</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Mora</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Método</TableHead>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile */}
            <div className="md:hidden space-y-2 p-3">
              {pagos.map((p: any) => (
                <div key={p.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-muted-foreground">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</span>
                    <span className="font-semibold text-sm">{$$(Number(p.monto_recibido))}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Cap: {$$(Number(p.aplicado_capital || 0))}</span>
                    <span>Int: {$$(Number(p.aplicado_interes || 0))}</span>
                    <span>Mora: {$$(Number(p.aplicado_mora || 0))}</span>
                  </div>
                  <div className="text-xs">{p.metodo_pago || "—"}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
