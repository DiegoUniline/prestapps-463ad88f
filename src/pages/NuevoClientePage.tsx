import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, MapPin, Loader2, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCreateCliente } from "@/hooks/useClientes";
import { toast } from "sonner";
import type { ClienteInsert } from "@/types/cliente";

export default function NuevoClientePage() {
  const navigate = useNavigate();
  const createCliente = useCreateCliente();
  const [capturingGps, setCapturingGps] = useState(false);

  const [form, setForm] = useState<ClienteInsert>({
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
  });

  const updateField = <K extends keyof ClienteInsert>(key: K, value: ClienteInsert[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCapturarGPS = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalización no soportada");
      return;
    }
    setCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({ ...prev, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }));
        setCapturingGps(false);
        toast.success("Ubicación capturada");
      },
      (err) => {
        setCapturingGps(false);
        toast.error("No se pudo obtener la ubicación");
      }
    );
  };

  const handleSubmit = () => {
    if (!form.nombre_completo.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    createCliente.mutate(form, {
      onSuccess: (data) => {
        toast.success(`Cliente ${data.id_cliente} creado exitosamente`);
        navigate("/clientes");
      },
      onError: (err) => {
        toast.error("Error al crear cliente: " + (err as Error).message);
      },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nuevo Cliente</h1>
          <p className="text-muted-foreground text-sm">Registrar un nuevo cliente en el sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Información Personal</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nombre Completo *</Label>
              <Input value={form.nombre_completo} onChange={(e) => updateField("nombre_completo", e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.telefono || ""} onChange={(e) => updateField("telefono", e.target.value)} placeholder="7777-1234" />
            </div>
            <div>
              <Label>Correo Electrónico</Label>
              <Input type="email" value={form.correo || ""} onChange={(e) => updateField("correo", e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <Label>Sexo</Label>
              <Select value={form.sexo || ""} onValueChange={(v) => updateField("sexo", v as ClienteInsert["sexo"])}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Masculino">Masculino</SelectItem>
                  <SelectItem value="Femenino">Femenino</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado Civil</Label>
              <Select value={form.estado_civil || ""} onValueChange={(v) => updateField("estado_civil", v as ClienteInsert["estado_civil"])}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Soltero">Soltero</SelectItem>
                  <SelectItem value="Casado">Casado</SelectItem>
                  <SelectItem value="Unión libre">Unión libre</SelectItem>
                  <SelectItem value="Divorciado">Divorciado</SelectItem>
                  <SelectItem value="Viudo">Viudo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dependientes</Label>
              <Input type="number" value={form.dependientes} onChange={(e) => updateField("dependientes", Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Identificación y Empleo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Tipo de Documento</Label>
              <Select value={form.documento_identidad} onValueChange={(v) => updateField("documento_identidad", v as ClienteInsert["documento_identidad"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DUI">DUI</SelectItem>
                  <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                  <SelectItem value="NIT">NIT</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número de Documento</Label>
              <Input value={form.dni || ""} onChange={(e) => updateField("dni", e.target.value)} placeholder="00000000-0" />
            </div>
            <div>
              <Label>Situación Laboral</Label>
              <Select value={form.situacion_laboral || ""} onValueChange={(v) => updateField("situacion_laboral", v as ClienteInsert["situacion_laboral"])}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Empleado">Empleado</SelectItem>
                  <SelectItem value="Independiente">Independiente</SelectItem>
                  <SelectItem value="Desempleado">Desempleado</SelectItem>
                  <SelectItem value="Pensionado">Pensionado</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ingresos ($)</Label>
              <Input type="number" value={form.ingresos ?? ""} onChange={(e) => updateField("ingresos", e.target.value ? Number(e.target.value) : null)} placeholder="0.00" />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={form.direccion || ""} onChange={(e) => updateField("direccion", e.target.value)} placeholder="Dirección completa" />
            </div>
            <div>
              <Label>URL de Foto</Label>
              <Input value={form.foto_cliente || ""} onChange={(e) => updateField("foto_cliente", e.target.value || null)} placeholder="https://..." />
            </div>
            <div>
              <Label>Ubicación GPS</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={handleCapturarGPS} disabled={capturingGps}>
                  {capturingGps ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                  Capturar ubicación
                </Button>
              </div>
              {form.gps_lat && form.gps_lng && (
                <p className="text-xs text-muted-foreground mt-1">
                  Lat: {form.gps_lat.toFixed(6)}, Lng: {form.gps_lng.toFixed(6)}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Label>Cliente Activo</Label>
              <Switch checked={form.activo} onCheckedChange={(v) => updateField("activo", v)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/clientes")}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={createCliente.isPending}>
          {createCliente.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar Cliente
        </Button>
      </div>
    </div>
  );
}
