import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CalendarIcon, Save } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCajasOptions, useRutasOptions } from "@/hooks/usePrestamos";

function useClientesOptions() {
  return useQuery({
    queryKey: ["clientes-options"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nombre_completo, id_cliente")
        .eq("activo", true)
        .order("nombre_completo");
      return data || [];
    },
  });
}

export default function NuevoPrestamoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: clientes = [] } = useClientesOptions();
  const { data: cajas = [] } = useCajasOptions();
  const { data: rutas = [] } = useRutasOptions();

  const [clienteId, setClienteId] = useState("");
  const [montoSolicitado, setMontoSolicitado] = useState("");
  const [tasaInteres, setTasaInteres] = useState("");
  const [numCuotas, setNumCuotas] = useState("");
  const [frecuencia, setFrecuencia] = useState<string>("semanal");
  const [modalidad, setModalidad] = useState<string>("fijo");
  const [fechaPrimerPago, setFechaPrimerPago] = useState<Date>();
  const [cajaId, setCajaId] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [gastosLegales, setGastosLegales] = useState("");
  const [tipoMora, setTipoMora] = useState<string>("porcentaje");
  const [valorMora, setValorMora] = useState("");
  const [cobradorId, setCobradorId] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [notas, setNotas] = useState("");

  // Cálculos
  const monto = parseFloat(montoSolicitado) || 0;
  const tasa = parseFloat(tasaInteres) || 0;
  const cuotas = parseInt(numCuotas) || 0;

  const montoTotalPagar = modalidad === "fijo"
    ? monto + (monto * tasa / 100)
    : monto + (monto * tasa / 100); // simplified

  const cuotaCalculada = cuotas > 0 ? montoTotalPagar / cuotas : 0;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!clienteId || !monto || !cuotas) {
        throw new Error("Completa los campos obligatorios");
      }

      const { data, error } = await supabase
        .from("prestamos")
        .insert({
          cliente_id: clienteId,
          monto_solicitado: monto,
          monto_total_pagar: montoTotalPagar,
          tasa_interes: tasa,
          num_cuotas: cuotas,
          frecuencia: frecuencia as any,
          modalidad: modalidad as any,
          fecha_primer_pago: fechaPrimerPago ? format(fechaPrimerPago, "yyyy-MM-dd") : null,
          caja_id: cajaId || null,
          ruta_id: rutaId || null,
          gastos_legales: parseFloat(gastosLegales) || 0,
          tipo_mora: tipoMora as any,
          valor_mora: parseFloat(valorMora) || 0,
          cobrador_id: cobradorId || null,
          empresa: empresa || null,
          notas: notas || null,
          cuota_calculada: cuotaCalculada,
          cuota_redondeada: Math.ceil(cuotaCalculada),
        })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Préstamo creado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["prestamos-list"] });
      navigate(`/prestamos/${data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al crear préstamo");
    },
  });

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/prestamos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Nuevo Préstamo</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del Préstamo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label className="text-[13px]">Cliente *</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre_completo} ({c.id_cliente})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Monto + Tasa + Cuotas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Monto Solicitado *</Label>
              <Input type="number" min="0" value={montoSolicitado} onChange={(e) => setMontoSolicitado(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Tasa de Interés (%)</Label>
              <Input type="number" min="0" value={tasaInteres} onChange={(e) => setTasaInteres(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Número de Cuotas *</Label>
              <Input type="number" min="1" value={numCuotas} onChange={(e) => setNumCuotas(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Frecuencia + Modalidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Frecuencia</Label>
              <Select value={frecuencia} onValueChange={setFrecuencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diario">Diario</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="quincenal">Quincenal</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Modalidad</Label>
              <Select value={modalidad} onValueChange={setModalidad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fijo">Cuota Fija</SelectItem>
                  <SelectItem value="insolutos">Saldos Insolutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fecha primer pago */}
          <div className="space-y-1.5">
            <Label className="text-[13px]">Fecha Primer Pago</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fechaPrimerPago && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fechaPrimerPago ? format(fechaPrimerPago, "dd/MM/yyyy") : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fechaPrimerPago} onSelect={setFechaPrimerPago} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Caja + Ruta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Caja</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Ruta</Label>
              <Select value={rutaId} onValueChange={setRutaId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ruta" /></SelectTrigger>
                <SelectContent>
                  {rutas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Gastos legales + Mora */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Gastos Legales</Label>
              <Input type="number" min="0" value={gastosLegales} onChange={(e) => setGastosLegales(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Tipo de Mora</Label>
              <Select value={tipoMora} onValueChange={setTipoMora}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje</SelectItem>
                  <SelectItem value="fijo">Fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Valor Mora</Label>
              <Input type="number" min="0" value={valorMora} onChange={(e) => setValorMora(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Empresa */}
          <div className="space-y-1.5">
            <Label className="text-[13px]">Empresa</Label>
            <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Nombre de empresa (opcional)" />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label className="text-[13px]">Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones..." rows={3} />
          </div>

          {/* Resumen */}
          {monto > 0 && cuotas > 0 && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-[13px]">
              <p><span className="text-muted-foreground">Total a pagar:</span> <span className="font-semibold">${montoTotalPagar.toLocaleString()}</span></p>
              <p><span className="text-muted-foreground">Cuota estimada:</span> <span className="font-semibold">${Math.ceil(cuotaCalculada).toLocaleString()}</span></p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate("/prestamos")}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              <Save className="h-4 w-4 mr-1.5" />
              {createMutation.isPending ? "Guardando..." : "Crear Préstamo"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
