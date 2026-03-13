import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGeoLocation } from "@/hooks/useGeoLocation";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFrecuenciasPagoActivas } from "@/hooks/useCatalogos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CalendarIcon, Save, AlertTriangle } from "lucide-react";
import { format, addDays, addWeeks, addMonths, parse, isValid } from "date-fns";
import { cn, $$ } from "@/lib/utils";
import { toast } from "sonner";
import { useCajasOptions, useRutasOptions } from "@/hooks/usePrestamos";
import { QuickCreateButton } from "@/components/shared/QuickCreateDialog";

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

interface CuotaPreview {
  num: number;
  fechaVencimiento: string;
  capital: number;
  interes: number;
  cuota: number;
  saldo: number;
}

function calcNextDate(base: Date, frecuencia: string, n: number): Date {
  switch (frecuencia) {
    case "diario": return addDays(base, n);
    case "semanal": return addWeeks(base, n);
    case "quincenal": return addDays(base, n * 15);
    case "mensual": return addMonths(base, n);
    default: return addWeeks(base, n);
  }
}

export default function NuevoPrestamoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId, empresaNombre } = useEmpresa();
  const { user } = useAuth();

  const { data: clientes = [] } = useClientesOptions(empresaId);
  const { data: cajas = [] } = useCajasOptions(empresaId);
  const { data: rutas = [] } = useRutasOptions(empresaId);
  const { data: frecuencias = [] } = useFrecuenciasPagoActivas();
  const geo = useGeoLocation();

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
  const [notas, setNotas] = useState("");
  const [codigoInterno, setCodigoInterno] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState<string>("prestamo");

  // Pre-fill codigoInterno with next PRE-XXXX
  useEffect(() => {
    if (!codigoInterno) {
      (supabase.from as any)("prestamos")
        .select("id_prestamo")
        .then(({ data }: any) => {
          let maxNum = 0;
          for (const row of data || []) {
            const m = row.id_prestamo?.match(/(\d+)/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
          }
          setCodigoInterno(`PRE-${String(maxNum + 1).padStart(4, "0")}`);
        });
    }
  }, []);
  const [cuotaOverride, setCuotaOverride] = useState("");
  const [esInicial, setEsInicial] = useState(false);
  const [cuotasCubiertas, setCuotasCubiertas] = useState("");
  const [montoPagadoInicial, setMontoPagadoInicial] = useState("");
  const [inicialMode, setInicialMode] = useState<"cuotas" | "monto">("cuotas");
  const [fechaTexto, setFechaTexto] = useState("");

  // Cálculos
  const monto = parseFloat(montoSolicitado) || 0;
  const tasa = parseFloat(tasaInteres) || 0;
  const cuotas = parseInt(numCuotas) || 0;

  const interesTotal = monto * tasa / 100;
  const montoTotalPagar = monto + interesTotal;
  const cuotaCalculada = cuotas > 0 ? montoTotalPagar / cuotas : 0;
  const cuotaFinal = cuotaOverride ? parseFloat(cuotaOverride) || cuotaCalculada : Math.ceil(cuotaCalculada);

  // Recalcular total real (última cuota se ajusta)
  const totalConCuotaFinal = montoTotalPagar; // el total real no cambia, solo la distribución

  // Calcular cuotas cubiertas según modo
  const numCuotasCubiertas = useMemo(() => {
    if (!esInicial) return 0;
    if (inicialMode === "cuotas") return parseInt(cuotasCubiertas) || 0;
    // Modo monto: calcular cuántas cuotas completas cubre
    const pagado = parseFloat(montoPagadoInicial) || 0;
    if (pagado <= 0 || cuotaFinal <= 0) return 0;
    return Math.min(Math.floor(pagado / cuotaFinal), cuotas);
  }, [esInicial, inicialMode, cuotasCubiertas, montoPagadoInicial, cuotaFinal, cuotas]);

  // Resumen de carga inicial
  const resumenInicial = useMemo(() => {
    if (!esInicial || cuotas <= 0) return null;
    const cubiertas = numCuotasCubiertas;
    const pendientes = cuotas - cubiertas;
    const montoCubierto = cubiertas * cuotaFinal;
    const montoPendiente = montoTotalPagar - montoCubierto;
    return { cubiertas, pendientes, montoCubierto, montoPendiente: Math.max(0, montoPendiente) };
  }, [esInicial, numCuotasCubiertas, cuotas, cuotaFinal, montoTotalPagar]);

  // Tabla de amortización en tiempo real
  const amortizacion = useMemo((): CuotaPreview[] => {
    if (monto <= 0 || cuotas <= 0) return [];
    const baseDate = fechaPrimerPago || new Date();

    if (modalidad === "fijo") {
      // Las primeras n-1 cuotas son cuotaFinal, la última es el remanente
      const totalInteres = montoTotalPagar - monto;
      const interesPorCuota = totalInteres / cuotas;
      const capitalPorCuotaNormal = cuotaFinal - interesPorCuota;

      let saldo = monto;
      const rows: CuotaPreview[] = [];

      for (let i = 0; i < cuotas; i++) {
        const isLast = i === cuotas - 1;
        const capital = isLast ? saldo : Math.min(capitalPorCuotaNormal, saldo);
        const interes = isLast ? (saldo * totalInteres / monto) : interesPorCuota;
        const cuotaVal = isLast ? capital + interes : cuotaFinal;
        saldo = Math.max(0, saldo - capital);

        rows.push({
          num: i + 1,
          fechaVencimiento: format(calcNextDate(baseDate, frecuencia, i), "dd/MM/yyyy"),
          capital: Math.round(capital * 100) / 100,
          interes: Math.round(interes * 100) / 100,
          cuota: Math.round(cuotaVal * 100) / 100,
          saldo: Math.round(saldo * 100) / 100,
        });
      }
      return rows;
    } else {
      // Saldos insolutos
      const tasaPeriodo = tasa / 100 / cuotas;
      const capitalPorCuota = monto / cuotas;
      let saldo = monto;
      return Array.from({ length: cuotas }, (_, i) => {
        const inter = saldo * tasaPeriodo;
        const cuotaVal = capitalPorCuota + inter;
        saldo -= capitalPorCuota;
        return {
          num: i + 1,
          fechaVencimiento: format(calcNextDate(baseDate, frecuencia, i), "dd/MM/yyyy"),
          capital: Math.round(capitalPorCuota * 100) / 100,
          interes: Math.round(inter * 100) / 100,
          cuota: Math.round(cuotaVal * 100) / 100,
          saldo: Math.max(0, Math.round(saldo * 100) / 100),
        };
      });
    }
  }, [monto, cuotas, cuotaFinal, frecuencia, modalidad, tasa, fechaPrimerPago]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!clienteId || !monto || !cuotas) {
        throw new Error("Completa los campos obligatorios");
      }

      const esVenta = tipoCuenta !== "prestamo";

      // Validate caja balance if not carga inicial and not a sale
      if (!esInicial && !esVenta && cajaId) {
        const { data: caja } = await supabase
          .from("cajas")
          .select("saldo_actual")
          .eq("id", cajaId)
          .single();
        if (caja && Number(caja.saldo_actual) < monto) {
          throw new Error(`Saldo insuficiente en caja (${$$(Number(caja.saldo_actual))}). Monto requerido: ${$$(monto)}`);
        }
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
          empresa: empresaNombre || null,
          notas: esInicial ? `[CARGA INICIAL] ${notas || ""}`.trim() : notas || null,
          codigo_interno: codigoInterno || null,
          tipo_cuenta: tipoCuenta,
          cuota_calculada: cuotaCalculada,
          cuota_redondeada: cuotaFinal,
          gps_lat: geo.lat,
          gps_lng: geo.lng,
          empresa_id: empresaId,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Insertar cuotas de amortización
      if (amortizacion.length > 0) {
        const baseDate = fechaPrimerPago || new Date();
        const numCubiertas = numCuotasCubiertas;

        const cuotasInsert = amortizacion.map((c) => {
          const yaPagada = c.num <= numCubiertas;
          return {
            prestamo_id: data.id,
            num_cuota: c.num,
            capital: c.capital,
            interes: c.interes,
            capital_interes: c.cuota,
            fecha_vencimiento: format(calcNextDate(baseDate, frecuencia, c.num - 1), "yyyy-MM-dd"),
            saldo_capital: yaPagada ? 0 : c.capital,
            saldo_interes: yaPagada ? 0 : c.interes,
            saldo_total: yaPagada ? 0 : c.cuota,
            capital_pagado: yaPagada ? c.capital : 0,
            interes_pagado: yaPagada ? c.interes : 0,
            fecha_pagada: yaPagada ? format(new Date(), "yyyy-MM-dd") : null,
            status: yaPagada ? ("Pagada" as const) : ("Pendiente" as const),
            empresa_id: empresaId,
          };
        });

        const { error: amortError } = await supabase
          .from("amortizacion")
          .insert(cuotasInsert);

        if (amortError) {
          console.error("Error insertando amortización:", amortError);
          toast.error("Préstamo creado pero hubo error al generar cuotas");
        }

        // Para carga inicial, recalcular mora en cuotas vencidas pendientes
        if (esInicial && numCubiertas < cuotas) {
          await supabase.rpc("recalcular_mora", { p_prestamo_id: data.id });
        }
      }

      // Register cash outflow ONLY if NOT carga inicial AND NOT a sale
      if (!esInicial && !esVenta && cajaId) {
        await supabase.from("movimientos_caja").insert({
          caja_id: cajaId,
          empresa_id: empresaId,
          tipo: "salida" as any,
          monto: monto,
          concepto: `Desembolso préstamo`,
          prestamo_id: data.id,
          registrado_por: user?.id,
        });

        const { data: cajaActual } = await supabase
          .from("cajas")
          .select("saldo_actual")
          .eq("id", cajaId)
          .single();

        if (cajaActual) {
          await supabase
            .from("cajas")
            .update({ saldo_actual: Number(cajaActual.saldo_actual) - monto })
            .eq("id", cajaId);
        }
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success(tipoCuenta === "prestamo" ? "Préstamo creado exitosamente" : "Venta creada exitosamente");
      queryClient.invalidateQueries({ queryKey: ["prestamos-list"] });
      navigate(`/prestamos/${data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al crear préstamo");
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/prestamos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">
          {tipoCuenta === "prestamo" ? "Nuevo Préstamo" : "Nueva Venta a Crédito"}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT — Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {tipoCuenta === "prestamo" ? "Datos del Préstamo" : "Datos de la Venta"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tipo de Cuenta */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Tipo de Cuenta *</Label>
              <Select value={tipoCuenta} onValueChange={setTipoCuenta}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prestamo">💰 Préstamo</SelectItem>
                  <SelectItem value="venta_seguro">🛡️ Venta de Seguro</SelectItem>
                  <SelectItem value="venta_producto">📦 Venta de Producto</SelectItem>
                  <SelectItem value="venta_servicio">🔧 Venta de Servicio</SelectItem>
                </SelectContent>
              </Select>
              {tipoCuenta !== "prestamo" && (
                <p className="text-[11px] text-muted-foreground">Las ventas no descuentan de caja al crear, solo suman al cobrar.</p>
              )}
            </div>
            {/* Código Interno + Cliente */}
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Cód. Interno</Label>
                <Input value={codigoInterno} onChange={(e) => setCodigoInterno(e.target.value)} placeholder="CI-001" className="h-9 text-sm font-mono" />
              </div>
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
                <QuickCreateButton entityType="cliente" onCreated={(id) => setClienteId(id)} />
              </div>
            </div>

            {/* Monto + Tasa + Cuotas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Monto *</Label>
                <Input type="number" min="0" value={montoSolicitado} onChange={(e) => setMontoSolicitado(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Tasa (%)</Label>
                <Input type="number" min="0" value={tasaInteres} onChange={(e) => setTasaInteres(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Cuotas *</Label>
                <Input type="number" min="1" value={numCuotas} onChange={(e) => setNumCuotas(e.target.value)} placeholder="0" />
              </div>
            </div>

            {/* Frecuencia + Modalidad */}
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

            {/* Cuota fija override */}
            {monto > 0 && cuotas > 0 && modalidad === "fijo" && (
              <div className="space-y-1.5">
                <Label className="text-[13px]">
                  Cuota Fija
                  <span className="text-muted-foreground ml-1">(calculada: {$$(Math.ceil(cuotaCalculada))})</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={cuotaOverride}
                  onChange={(e) => setCuotaOverride(e.target.value)}
                  placeholder={String(Math.ceil(cuotaCalculada))}
                />
                <p className="text-[11px] text-muted-foreground">Déjalo vacío para usar la cuota calculada, o escribe un valor personalizado.</p>
              </div>
            )}

            {/* Fecha primer pago */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Fecha Primer Pago</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="dd/mm/aaaa"
                  value={fechaTexto}
                  onChange={(e) => {
                    let raw = e.target.value.replace(/[^\d]/g, "");
                    if (raw.length > 8) raw = raw.slice(0, 8);
                    let formatted = raw;
                    if (raw.length > 4) {
                      formatted = raw.slice(0, 2) + "/" + raw.slice(2, 4) + "/" + raw.slice(4);
                    } else if (raw.length > 2) {
                      formatted = raw.slice(0, 2) + "/" + raw.slice(2);
                    }
                    setFechaTexto(formatted);
                    if (formatted.length === 10) {
                      const parsed = parse(formatted, "dd/MM/yyyy", new Date());
                      if (isValid(parsed)) setFechaPrimerPago(parsed);
                    }
                  }}
                  maxLength={10}
                  className="flex-1"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0">
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fechaPrimerPago}
                      onSelect={(d) => {
                        setFechaPrimerPago(d);
                        if (d) setFechaTexto(format(d, "dd/MM/yyyy"));
                      }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Caja + Ruta */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Caja</Label>
                <Select value={cajaId} onValueChange={setCajaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {cajas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <QuickCreateButton entityType="caja" onCreated={(id) => setCajaId(id)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Ruta</Label>
                <Select value={rutaId} onValueChange={setRutaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {rutas.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <QuickCreateButton entityType="ruta" onCreated={(id) => setRutaId(id)} />
              </div>
            </div>

            {/* Carga inicial checkbox - only for prestamos */}
            {tipoCuenta === "prestamo" && (
            <>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
              <Checkbox
                checked={esInicial}
                onCheckedChange={(v) => setEsInicial(!!v)}
                className="mt-0.5"
              />
              <div>
                <p className="text-[13px] font-medium">Préstamo inicial (carga de cartera)</p>
                <p className="text-[11px] text-muted-foreground">No descontará el monto de la caja. Útil para cargar préstamos existentes al sistema.</p>
              </div>
            </label>

            {esInicial && cuotas > 0 && (
              <div className="space-y-3 pl-1 border-l-2 border-primary/20 ml-1 pl-4">
                {/* Mode selector */}
                <div className="space-y-1.5">
                  <Label className="text-[13px]">¿Cómo deseas indicar lo pagado?</Label>
                  <Select value={inicialMode} onValueChange={(v) => setInicialMode(v as "cuotas" | "monto")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cuotas">Por número de cuotas</SelectItem>
                      <SelectItem value="monto">Por monto pagado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {inicialMode === "cuotas" ? (
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Cuotas ya pagadas</Label>
                    <Input
                      type="number"
                      min="0"
                      max={cuotas}
                      value={cuotasCubiertas}
                      onChange={(e) => setCuotasCubiertas(e.target.value)}
                      placeholder={`0 de ${cuotas}`}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Monto total pagado</Label>
                    <Input
                      type="number"
                      min="0"
                      value={montoPagadoInicial}
                      onChange={(e) => setMontoPagadoInicial(e.target.value)}
                      placeholder="0.00"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Se liquidarán las cuotas completas que cubra este monto ({numCuotasCubiertas} de {cuotas}).
                    </p>
                  </div>
                )}

                {/* Resumen */}
                {resumenInicial && resumenInicial.cubiertas > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <p className="text-[12px] font-semibold">Resumen de carga</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                      <span className="text-muted-foreground">Cuotas pagadas:</span>
                      <span className="font-medium">{resumenInicial.cubiertas} de {cuotas}</span>
                      <span className="text-muted-foreground">Monto cubierto:</span>
                      <span className="font-medium">{$$(resumenInicial.montoCubierto)}</span>
                      <span className="text-muted-foreground">Cuotas pendientes:</span>
                      <span className="font-medium text-destructive">{resumenInicial.pendientes}</span>
                      <span className="text-muted-foreground">Deuda restante:</span>
                      <span className="font-medium text-destructive">{$$(resumenInicial.montoPendiente)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Las cuotas pendientes con fecha vencida se marcarán con mora automáticamente.
                    </p>
                  </div>
                )}
              </div>
            )}
            </>
            )}

            {tipoCuenta === "prestamo" && !esInicial && !cajaId && (
              <div className="flex items-center gap-2 text-warning text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Sin caja asignada — no se registrará movimiento de salida.</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Gastos Legales</Label>
                <Input type="number" min="0" value={gastosLegales} onChange={(e) => setGastosLegales(e.target.value)} placeholder="0.00" />
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
                <Input type="number" min="0" value={valorMora} onChange={(e) => setValorMora(e.target.value)} placeholder="0" />
              </div>
            </div>

            {/* Empresa */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Empresa</Label>
              <Input value={empresaNombre || ""} disabled className="bg-muted/50" />
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Notas</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones..." rows={2} />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate("/prestamos")}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                <Save className="h-4 w-4 mr-1.5" />
                {createMutation.isPending ? "Guardando..." : tipoCuenta === "prestamo" ? "Crear Préstamo" : "Crear Venta"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — Live preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa de Amortización</CardTitle>
          </CardHeader>
          <CardContent>
            {amortizacion.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-8 text-center">
                Ingresa monto, tasa y cuotas para ver la tabla en tiempo real.
              </p>
            ) : (
              <>
                {/* Summary strip */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total a Pagar</p>
                    <p className="text-sm font-semibold">{$$(totalConCuotaFinal)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cuota Fija</p>
                    <p className="text-sm font-semibold">{$$(cuotaFinal)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Mora / día</p>
                    <p className="text-sm font-semibold">
                      {tipoMora === "porcentaje"
                        ? `${parseFloat(valorMora) || 0}%`
                        : $$(parseFloat(valorMora) || 0)}
                    </p>
                  </div>
                </div>

                <div className="border rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-table-header hover:bg-table-header">
                        <TableHead className="text-[11px] px-2 py-2">#</TableHead>
                        <TableHead className="text-[11px] px-2 py-2">Vencimiento</TableHead>
                        <TableHead className="text-[11px] px-2 py-2 text-right">Capital</TableHead>
                        <TableHead className="text-[11px] px-2 py-2 text-right">Interés</TableHead>
                        <TableHead className="text-[11px] px-2 py-2 text-right">Cuota</TableHead>
                        <TableHead className="text-[11px] px-2 py-2 text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {amortizacion.map((c) => {
                        const yaPagada = c.num <= numCuotasCubiertas;
                        return (
                          <TableRow key={c.num} className={cn("border-b border-border/50", yaPagada && "opacity-50 line-through")}>
                            <TableCell className="text-[12px] px-2 py-1.5 font-medium">{c.num} {yaPagada && "✓"}</TableCell>
                            <TableCell className="text-[12px] px-2 py-1.5 text-muted-foreground">{c.fechaVencimiento}</TableCell>
                            <TableCell className="text-[12px] px-2 py-1.5 text-right">{$$(c.capital)}</TableCell>
                            <TableCell className="text-[12px] px-2 py-1.5 text-right">{$$(c.interes)}</TableCell>
                            <TableCell className="text-[12px] px-2 py-1.5 text-right font-medium">{$$(c.cuota)}</TableCell>
                            <TableCell className="text-[12px] px-2 py-1.5 text-right">{yaPagada ? "$0.00" : $$(c.saldo)}</TableCell>
                          </TableRow>
                        );
                      })}
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
