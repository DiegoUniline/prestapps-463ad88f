import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateSolicitud } from "@/hooks/useSolicitudes";
import { useFrecuenciasPagoActivas } from "@/hooks/useCatalogos";
import { useCajasOptions, useRutasOptions } from "@/hooks/usePrestamos";
import { calcNextDate, calcularAmortizacion } from "@/lib/financial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { ArrowLeft, CalendarIcon, Send, AlertTriangle } from "lucide-react";
import { QuickCreateButton } from "@/components/shared/QuickCreateDialog";
import { format } from "date-fns";
import { cn, $$, fmtDate } from "@/lib/utils";
import { toast } from "sonner";

function useClientesOptions(empresaId: string) {
  return useQuery({
    queryKey: ["clientes-options", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nombre_completo, id_cliente")
        .eq("activo", true)
        .eq("empresa_id", empresaId)
        .order("nombre_completo");
      return data || [];
    },
  });
}

// Hook to get caja balance for validation
function useCajaBalance(cajaId: string) {
  return useQuery({
    queryKey: ["caja-balance", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("cajas")
        .select("id, nombre, saldo_actual")
        .eq("id", cajaId)
        .single();
      return data;
    },
  });
}

export default function SolicitudPrestamoPage() {
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const { user } = useAuth();
  const { data: clientes = [] } = useClientesOptions(empresaId);
  const { data: cajas = [] } = useCajasOptions(empresaId);
  const { data: rutas = [] } = useRutasOptions(empresaId);
  const { data: frecuencias = [] } = useFrecuenciasPagoActivas();
  const createSolicitud = useCreateSolicitud();

  const [clienteId, setClienteId] = useState("");
  const [montoSolicitado, setMontoSolicitado] = useState("");
  const [tasaInteres, setTasaInteres] = useState("");
  const [numCuotas, setNumCuotas] = useState("");
  const [frecuencia, setFrecuencia] = useState("semanal");
  const [modalidad, setModalidad] = useState("fijo");
  const [fechaPrimerPago, setFechaPrimerPago] = useState<Date>();
  const [cajaId, setCajaId] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [gastosLegales, setGastosLegales] = useState("");
  const [tipoMora, setTipoMora] = useState("porcentaje");
  const [valorMora, setValorMora] = useState("");
  const [notas, setNotas] = useState("");

  const monto = parseFloat(montoSolicitado) || 0;
  const tasa = parseFloat(tasaInteres) || 0;
  const cuotas = parseInt(numCuotas) || 0;
  const interesTotal = monto * tasa / 100;
  const montoTotalPagar = monto + interesTotal;
  const cuotaCalculada = cuotas > 0 ? montoTotalPagar / cuotas : 0;

  // Get caja balance for validation display
  const { data: cajaData } = useCajaBalance(cajaId);
  const saldoCaja = cajaData ? Number(cajaData.saldo_actual) : null;
  const excedeSaldo = saldoCaja !== null && monto > saldoCaja;

  // Use centralized financial.ts for amortization preview
  const amortizacion = useMemo(() => {
    if (monto <= 0 || cuotas <= 0 || !fechaPrimerPago) return [];
    const rows = calcularAmortizacion(
      monto, cuotas, tasa,
      modalidad as "fijo" | "insolutos",
      format(fechaPrimerPago, "yyyy-MM-dd"),
      frecuencia as any
    );
    return rows.map((r) => ({
      num: r.numCuota,
      fecha: fmtDate(new Date(r.fechaVencimiento)),
      capital: r.capital,
      interes: r.interes,
      cuota: r.capitalInteres,
      saldo: r.saldoCapital,
    }));
  }, [monto, cuotas, tasa, frecuencia, modalidad, fechaPrimerPago]);

  const handleSubmit = () => {
    if (!clienteId || !monto || !cuotas) {
      toast.error("Completa cliente, monto y cuotas");
      return;
    }
    if (monto <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    if (!fechaPrimerPago) {
      toast.error("Selecciona la fecha del primer pago");
      return;
    }

    createSolicitud.mutate(
      {
        cliente_id: clienteId,
        empresa_id: empresaId,
        monto_solicitado: monto,
        tasa_interes: tasa,
        num_cuotas: cuotas,
        frecuencia,
        modalidad,
        fecha_primer_pago: format(fechaPrimerPago, "yyyy-MM-dd"),
        caja_id: cajaId || null,
        ruta_id: rutaId || null,
        gastos_legales: parseFloat(gastosLegales) || 0,
        tipo_mora: tipoMora,
        valor_mora: parseFloat(valorMora) || 0,
        notas: notas || null,
        solicitado_por: user?.id || null,
      },
      {
        onSuccess: () => {
          toast.success("Solicitud enviada correctamente");
          navigate("/solicitudes");
        },
        onError: (err: any) => toast.error(err.message || "Error al enviar solicitud"),
      }
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/solicitudes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Nueva Solicitud de Préstamo</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos de la Solicitud</CardTitle></CardHeader>
          <CardContent className="space-y-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Monto *</Label>
                <Input type="number" min="0" step="0.01" value={montoSolicitado} onChange={(e) => setMontoSolicitado(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Tasa (%)</Label>
                <Input type="number" min="0" step="0.01" value={tasaInteres} onChange={(e) => setTasaInteres(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Cuotas *</Label>
                <Input type="number" min="1" value={numCuotas} onChange={(e) => setNumCuotas(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Frecuencia</Label>
                <Select value={frecuencia} onValueChange={setFrecuencia}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {frecuencias.length > 0 ? frecuencias.map((f) => (
                      <SelectItem key={f.id} value={f.nombre}>{f.nombre.charAt(0).toUpperCase() + f.nombre.slice(1)}</SelectItem>
                    )) : (
                      <>
                        <SelectItem value="diario">Diario</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quincenal">Quincenal</SelectItem>
                        <SelectItem value="mensual">Mensual</SelectItem>
                      </>
                    )}
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

            <div className="space-y-1.5">
              <Label className="text-[13px]">Fecha Primer Pago *</Label>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Caja</Label>
                <Select value={cajaId} onValueChange={setCajaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {cajas.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>))}
                  </SelectContent>
                </Select>
                {saldoCaja !== null && (
                  <p className={cn("text-xs", excedeSaldo ? "text-destructive font-medium" : "text-muted-foreground")}>
                    Saldo disponible: {$$(saldoCaja)}
                    {excedeSaldo && (
                      <span className="flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        El monto excede el saldo de la caja
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Ruta</Label>
                <Select value={rutaId} onValueChange={setRutaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {rutas.map((r) => (<SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Gastos Legales</Label>
                <Input type="number" min="0" step="0.01" value={gastosLegales} onChange={(e) => setGastosLegales(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Tipo Mora</Label>
                <Select value={tipoMora} onValueChange={setTipoMora}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje">% por día</SelectItem>
                    <SelectItem value="fijo">Fijo por día</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Mora / día</Label>
                <Input type="number" min="0" step="0.01" value={valorMora} onChange={(e) => setValorMora(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">Notas</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones..." rows={2} />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate("/solicitudes")}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createSolicitud.isPending}>
                <Send className="h-4 w-4 mr-1.5" />
                {createSolicitud.isPending ? "Enviando..." : "Enviar Solicitud"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Vista previa de Amortización</CardTitle></CardHeader>
          <CardContent>
            {amortizacion.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-8 text-center">
                Ingresa monto, tasa, cuotas y fecha primer pago para ver la tabla.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Total a Pagar</p>
                    <p className="font-semibold text-sm">{$$(montoTotalPagar)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Cuota</p>
                    <p className="font-semibold text-sm">{$$(Math.ceil(cuotaCalculada))}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Interés</p>
                    <p className="font-semibold text-sm">{$$(interesTotal)}</p>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs text-right">Capital</TableHead>
                        <TableHead className="text-xs text-right">Interés</TableHead>
                        <TableHead className="text-xs text-right">Cuota</TableHead>
                        <TableHead className="text-xs text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {amortizacion.map((c) => (
                        <TableRow key={c.num}>
                          <TableCell className="text-xs">{c.num}</TableCell>
                          <TableCell className="text-xs">{c.fecha}</TableCell>
                          <TableCell className="text-xs text-right">${c.capital.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">${c.interes.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right font-medium">${c.cuota.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">${c.saldo.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
