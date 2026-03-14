import { useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn, $$ } from "@/lib/utils";
import { format, parseISO, isPast, isToday as isTodayFn } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, User, Phone, MapPin, Mail, CreditCard, ShieldCheck, Package, Wrench,
  HandCoins, AlertTriangle, CheckCircle2, Clock, FileText, CalendarCheck, Eye,
  DollarSign, TrendingDown, Filter,
} from "lucide-react";
import { PagoModal } from "@/components/PagoModal";
import { PromesaModal } from "@/components/PromesaModal";
import { VisitaModal } from "@/components/VisitaModal";
import { StatusBadge } from "@/components/shared/StatusBadge";

// ── Types ──
interface Cuota {
  id: string;
  prestamoId: string;
  numCuota: number;
  capitalInteres: number;
  saldoTotal: number;
  saldoMora: number;
  saldoCapital: number;
  saldoInteres: number;
  moraPagada: number;
  interesPagado: number;
  capitalPagado: number;
  fechaVencimiento: string;
  fechaPagada: string | null;
  status: string;
  diasAtraso: number;
}

interface CuentaCliente {
  prestamoId: string;
  idPrestamo: string;
  tipoCuenta: string;
  montoSolicitado: number;
  montoTotalPagar: number;
  estado: string;
  frecuencia: string;
  fechaRegistro: string;
  rutaId: string | null;
  cobradorId: string | null;
  cajaId: string | null;
  rutaNombre: string;
  cajaNombre: string;
  cobradorNombre: string;
  todasCuotas: Cuota[];
  cuotasPendientes: Cuota[];
  totalSaldo: number;
  totalMora: number;
  montoAlCorriente: number; // overdue only
  cuotasTotales: number;
  cuotasPagadas: number;
  cuotasVencidas: number;
}

const TIPO_ICONS: Record<string, React.ReactNode> = {
  prestamo: <CreditCard className="h-4 w-4" />,
  venta_seguro: <ShieldCheck className="h-4 w-4" />,
  venta_producto: <Package className="h-4 w-4" />,
  venta_servicio: <Wrench className="h-4 w-4" />,
};
const TIPO_LABELS: Record<string, string> = {
  prestamo: "Préstamo",
  venta_seguro: "Seguro",
  venta_producto: "Producto",
  venta_servicio: "Servicio",
};

// ── Data Hooks ──
function useClienteInfo(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["cobranza-cliente-info", clienteId],
    queryFn: async () => {
      if (!clienteId) return null;
      const { data, error } = await supabase
        .from("clientes")
        .select("id, id_cliente, nombre_completo, telefono, correo, dni, direccion, foto_cliente, estado, documento_identidad, trabajo_empresa, trabajo_cargo, ingresos, ref1_nombre, ref1_telefono, ref1_parentesco, aval_nombre, aval_telefono")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clienteId,
    staleTime: 30_000,
  });
}

function useCuentasCliente(clienteId: string | undefined, empresaId: string) {
  return useQuery({
    queryKey: ["cobranza-cuentas", clienteId, empresaId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data: prestamos, error } = await (supabase.from as any)("prestamos")
        .select(`
          id, id_prestamo, tipo_cuenta, monto_solicitado, monto_total_pagar,
          estado, num_cuotas, frecuencia, fecha_registro, ruta_id, cobrador_id, caja_id,
          rutas ( nombre ), cajas ( nombre )
        `)
        .eq("cliente_id", clienteId)
        .eq("empresa_id", empresaId)
        .in("estado", ["Activo", "Al día", "Vencido"]);

      if (error) throw error;
      if (!prestamos || prestamos.length === 0) return [];

      const prestamoIds = prestamos.map((p: any) => p.id);

      const cobIds = [...new Set(prestamos.map((p: any) => p.cobrador_id).filter(Boolean))] as string[];
      const cobMap: Record<string, string> = {};
      if (cobIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, nombre_completo").in("id", cobIds);
        for (const c of profiles || []) cobMap[c.id] = c.nombre_completo;
      }

      // ALL cuotas (pagadas + pendientes)
      const { data: cuotas } = await supabase
        .from("amortizacion")
        .select(`
          id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
          saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
          fecha_vencimiento, fecha_pagada, status, dias_atraso
        `)
        .in("prestamo_id", prestamoIds)
        .order("num_cuota", { ascending: true });

      const cuotasByPrestamo: Record<string, any[]> = {};
      for (const c of cuotas || []) {
        if (!cuotasByPrestamo[c.prestamo_id]) cuotasByPrestamo[c.prestamo_id] = [];
        cuotasByPrestamo[c.prestamo_id].push(c);
      }

      const mapCuota = (c: any): Cuota => ({
        id: c.id,
        prestamoId: c.prestamo_id,
        numCuota: c.num_cuota,
        capitalInteres: Number(c.capital_interes || 0),
        saldoTotal: Number(c.saldo_total || 0),
        saldoMora: Number(c.saldo_mora || 0),
        saldoCapital: Number(c.saldo_capital || 0),
        saldoInteres: Number(c.saldo_interes || 0),
        moraPagada: Number(c.mora_pagada || 0),
        interesPagado: Number(c.interes_pagado || 0),
        capitalPagado: Number(c.capital_pagado || 0),
        fechaVencimiento: c.fecha_vencimiento,
        fechaPagada: c.fecha_pagada || null,
        status: c.status || "Pendiente",
        diasAtraso: Number(c.dias_atraso || 0),
      });

      return prestamos.map((p: any): CuentaCliente => {
        const allCuotas = (cuotasByPrestamo[p.id] || []).map(mapCuota);
        const pendientes = allCuotas.filter((c) => c.status !== "Pagada");
        const pagadas = allCuotas.filter((c) => c.status === "Pagada");
        const vencidas = pendientes.filter((c) => c.diasAtraso > 0);
        const montoAlCorriente = vencidas.reduce((s, c) => s + c.saldoTotal, 0);

        return {
          prestamoId: p.id,
          idPrestamo: p.id_prestamo,
          tipoCuenta: p.tipo_cuenta || "prestamo",
          montoSolicitado: Number(p.monto_solicitado),
          montoTotalPagar: Number(p.monto_total_pagar || 0),
          estado: p.estado,
          frecuencia: p.frecuencia,
          fechaRegistro: p.fecha_registro,
          rutaId: p.ruta_id,
          cobradorId: p.cobrador_id,
          cajaId: p.caja_id,
          rutaNombre: p.rutas?.nombre || "Sin ruta",
          cajaNombre: p.cajas?.nombre || "—",
          cobradorNombre: p.cobrador_id ? (cobMap[p.cobrador_id] || "—") : "Sin asignar",
          todasCuotas: allCuotas,
          cuotasPendientes: pendientes,
          totalSaldo: pendientes.reduce((s, c) => s + c.saldoTotal, 0),
          totalMora: pendientes.reduce((s, c) => s + c.saldoMora, 0),
          montoAlCorriente,
          cuotasTotales: allCuotas.length,
          cuotasPagadas: pagadas.length,
          cuotasVencidas: vencidas.length,
        };
      });
    },
    enabled: !!clienteId,
    staleTime: 15_000,
  });
}

function usePagosCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["cobranza-pagos-cliente", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data: prestamos } = await supabase.from("prestamos").select("id, id_prestamo").eq("cliente_id", clienteId);
      const ids = (prestamos || []).map((p) => p.id);
      if (ids.length === 0) return [];
      const nameMap: Record<string, string> = {};
      for (const p of prestamos || []) nameMap[p.id] = p.id_prestamo;
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, prestamo_id, monto_recibido, metodo_pago, aplicado_capital, aplicado_interes, aplicado_mora, created_at, anulado")
        .in("prestamo_id", ids)
        .order("created_at", { ascending: false })
        .limit(50);
      return (pagos || []).map((p: any) => ({ ...p, idPrestamo: nameMap[p.prestamo_id] || "—" }));
    },
    enabled: !!clienteId,
    staleTime: 15_000,
  });
}

function useCajasAll(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-all", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre").eq("empresa_id", empresaId).order("nombre");
      return data || [];
    },
    staleTime: 5 * 60_000,
  });
}

// ── Page ──
export default function ClienteCobranzaDetallePage() {
  const navigate = useNavigate();
  const { id: clienteId } = useParams();
  const [searchParams] = useSearchParams();
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();

  const { data: cliente, isLoading: loadingCliente } = useClienteInfo(clienteId);
  const { data: cuentas, isLoading: loadingCuentas } = useCuentasCliente(clienteId, empresaId);
  const { data: pagos, isLoading: loadingPagos } = usePagosCliente(clienteId);
  const { data: cajas } = useCajasAll(empresaId);

  // Filters
  const [filtroPrestamo, setFiltroPrestamo] = useState("todos");
  const [filtroCuota, setFiltroCuota] = useState<"todas" | "pendientes" | "vencidas" | "pagadas">("todas");
  const [vistaActiva, setVistaActiva] = useState<"cuotas" | "pagos">("cuotas");

  // Pago modal
  const [pagoOpen, setPagoOpen] = useState(false);
  const [pagoPrestamoId, setPagoPrestamoId] = useState("");
  const [pagoCuotas, setPagoCuotas] = useState<any[]>([]);
  const [pagoRutaId, setPagoRutaId] = useState<string | null>(null);
  const [pagoCobradorId, setPagoCobradorId] = useState<string | null>(null);
  const [pagoMontoInicial, setPagoMontoInicial] = useState<number | undefined>();

  // Promesa modal
  const [promesaOpen, setPromesaOpen] = useState(false);
  const [promesaCuenta, setPromesaCuenta] = useState<CuentaCliente | null>(null);

  // Visita modal
  const [visitaOpen, setVisitaOpen] = useState(false);

  // ── Computed ──
  const totales = useMemo(() => {
    if (!cuentas?.length) return { saldo: 0, mora: 0, cuentas: 0, alCorriente: 0, cuotasVencidas: 0, totalAbonado: 0, totalPrestado: 0, totalAPagar: 0, liquidacion: 0, cuotasTotales: 0, cuotasPagadas: 0, proximaCuota: null as Cuota | null, proximaFecha: "", proximoMonto: 0 };

    const saldo = cuentas.reduce((s, c) => s + c.totalSaldo, 0);
    const mora = cuentas.reduce((s, c) => s + c.totalMora, 0);
    const alCorriente = cuentas.reduce((s, c) => s + c.montoAlCorriente, 0);
    const cuotasVencidas = cuentas.reduce((s, c) => s + c.cuotasVencidas, 0);
    const totalPrestado = cuentas.reduce((s, c) => s + c.montoSolicitado, 0);
    const totalAPagar = cuentas.reduce((s, c) => s + c.montoTotalPagar, 0);
    const cuotasTotales = cuentas.reduce((s, c) => s + c.cuotasTotales, 0);
    const cuotasPagadas = cuentas.reduce((s, c) => s + c.cuotasPagadas, 0);

    // Total abonado = total pagos no anulados
    const totalAbonado = (pagos || []).filter((p: any) => !p.anulado).reduce((s: number, p: any) => s + Number(p.monto_recibido || 0), 0);

    // Liquidación = solo saldo capital restante (sin intereses futuros ni mora)
    const liquidacion = cuentas.reduce((s, c) => s + c.cuotasPendientes.reduce((sc, q) => sc + q.saldoCapital, 0), 0);

    // Próxima cuota más cercana no pagada
    let proximaCuota: Cuota | null = null;
    for (const c of cuentas) {
      for (const q of c.cuotasPendientes) {
        if (!proximaCuota || q.fechaVencimiento < proximaCuota.fechaVencimiento) {
          proximaCuota = q;
        }
      }
    }

    return {
      saldo, mora, cuentas: cuentas.length, alCorriente, cuotasVencidas,
      totalAbonado, totalPrestado, totalAPagar, liquidacion,
      cuotasTotales, cuotasPagadas,
      proximaCuota,
      proximaFecha: proximaCuota?.fechaVencimiento || "",
      proximoMonto: proximaCuota?.saldoTotal || 0,
    };
  }, [cuentas, pagos]);

  // Flatten all cuotas, apply filters
  const cuotasFiltradas = useMemo(() => {
    if (!cuentas) return [];
    let all: (Cuota & { idPrestamo: string; tipoCuenta: string })[] = [];
    for (const c of cuentas) {
      if (filtroPrestamo !== "todos" && c.prestamoId !== filtroPrestamo) continue;
      for (const q of c.todasCuotas) {
        all.push({ ...q, idPrestamo: c.idPrestamo, tipoCuenta: c.tipoCuenta });
      }
    }
    if (filtroCuota === "pendientes") all = all.filter((c) => c.status !== "Pagada");
    else if (filtroCuota === "vencidas") all = all.filter((c) => c.diasAtraso > 0 && c.status !== "Pagada");
    else if (filtroCuota === "pagadas") all = all.filter((c) => c.status === "Pagada");
    return all;
  }, [cuentas, filtroPrestamo, filtroCuota]);

  // Selected cuenta for actions
  const cuentaSeleccionada = useMemo(() => {
    if (filtroPrestamo !== "todos") return cuentas?.find((c) => c.prestamoId === filtroPrestamo) || null;
    return null;
  }, [cuentas, filtroPrestamo]);

  const openPagoCuenta = (cuenta: CuentaCliente) => {
    setPagoPrestamoId(cuenta.prestamoId);
    setPagoCuotas(cuenta.cuotasPendientes.map((c) => ({
      id: c.id, num_cuota: c.numCuota,
      saldo_mora: c.saldoMora, saldo_interes: c.saldoInteres, saldo_capital: c.saldoCapital,
      saldo_total: c.saldoTotal, mora_pagada: c.moraPagada, interes_pagado: c.interesPagado,
      capital_pagado: c.capitalPagado, status: c.status, fecha_vencimiento: c.fechaVencimiento,
    })));
    setPagoRutaId(cuenta.rutaId);
    setPagoCobradorId(cuenta.cobradorId);
    setPagoMontoInicial(cuenta.cuotasPendientes[0]?.saldoTotal);
    setPagoOpen(true);
  };

  const handlePagoClose = (open: boolean) => {
    setPagoOpen(open);
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["cobranza-cuentas", clienteId] });
      queryClient.invalidateQueries({ queryKey: ["cobranza-pagos-cliente", clienteId] });
      queryClient.invalidateQueries({ queryKey: ["cobranza-diaria"] });
    }
  };

  if (loadingCliente || loadingCuentas) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Cliente no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/cobranza")}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 mt-0.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold truncate">{cliente.nombre_completo}</h1>
            <StatusBadge status={cliente.estado || "Activo"} />
            <Badge variant="secondary" className="text-[10px]">{cliente.id_cliente}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
            {cliente.telefono && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <a href={`tel:${cliente.telefono}`} className="hover:text-foreground">{cliente.telefono}</a>
              </span>
            )}
            {cliente.correo && (
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{cliente.correo}</span>
            )}
            {cliente.direccion && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{cliente.direccion}</span>
            )}
            {cliente.dni && (
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{cliente.documento_identidad}: {cliente.dni}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate(`/clientes/${clienteId}`)}>
            <User className="h-3 w-3 mr-1" />Ficha
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setVisitaOpen(true)}>
            <MapPin className="h-3 w-3 mr-1" />Visita
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cuentas Activas</span>
              <CreditCard className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold">{totales.cuentas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Deuda Total</span>
              <DollarSign className="h-3.5 w-3.5 text-destructive" />
            </div>
            <p className="text-xl font-bold text-destructive">{$$(totales.saldo)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Mora Total</span>
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            </div>
            <p className={cn("text-xl font-bold", totales.mora > 0 ? "text-destructive" : "text-muted-foreground")}>{$$(totales.mora)}</p>
          </CardContent>
        </Card>
        <Card className={cn(totales.alCorriente > 0 && "border-warning/50 bg-warning/5")}>
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Para Al Corriente</span>
              <TrendingDown className="h-3.5 w-3.5 text-warning" />
            </div>
            <p className="text-xl font-bold text-warning">{$$(totales.alCorriente)}</p>
            <p className="text-[10px] text-muted-foreground">{totales.cuotasVencidas} cuota{totales.cuotasVencidas !== 1 ? "s" : ""} vencida{totales.cuotasVencidas !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cobrar</span>
            <div className="flex gap-1.5 mt-2">
              {cuentas && cuentas.length === 1 ? (
                <Button size="sm" className="h-8 text-xs flex-1" onClick={() => openPagoCuenta(cuentas[0])}>
                  <HandCoins className="h-3.5 w-3.5 mr-1" />Abonar
                </Button>
              ) : cuentaSeleccionada ? (
                <Button size="sm" className="h-8 text-xs flex-1" onClick={() => openPagoCuenta(cuentaSeleccionada)}>
                  <HandCoins className="h-3.5 w-3.5 mr-1" />Abonar {cuentaSeleccionada.idPrestamo}
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">Filtra por cuenta para abonar</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Préstamos/Cuentas Resumen ── */}
      {cuentas && cuentas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cuentas.map((cuenta) => {
            const progreso = cuenta.cuotasTotales > 0 ? (cuenta.cuotasPagadas / cuenta.cuotasTotales) * 100 : 0;
            const isSelected = filtroPrestamo === cuenta.prestamoId;
            return (
              <Card
                key={cuenta.prestamoId}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  isSelected && "ring-2 ring-primary",
                  cuenta.cuotasVencidas > 0 && "border-destructive/30",
                )}
                onClick={() => setFiltroPrestamo(isSelected ? "todos" : cuenta.prestamoId)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-primary">{TIPO_ICONS[cuenta.tipoCuenta] || TIPO_ICONS.prestamo}</span>
                      <span className="font-semibold text-sm">{cuenta.idPrestamo}</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                        {TIPO_LABELS[cuenta.tipoCuenta] || "Préstamo"}
                      </Badge>
                    </div>
                    <StatusBadge status={cuenta.estado} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Monto</p>
                      <p className="text-sm font-semibold">{$$(cuenta.montoSolicitado)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Saldo</p>
                      <p className="text-sm font-semibold text-destructive">{$$(cuenta.totalSaldo)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Mora</p>
                      <p className={cn("text-sm font-semibold", cuenta.totalMora > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {cuenta.totalMora > 0 ? $$(cuenta.totalMora) : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-1.5">
                    <Progress value={progreso} className="flex-1 h-2" />
                    <span className="text-[11px] font-medium text-muted-foreground shrink-0">{cuenta.cuotasPagadas}/{cuenta.cuotasTotales}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{cuenta.frecuencia} · {cuenta.rutaNombre} · {cuenta.cobradorNombre}</span>
                    {cuenta.cuotasVencidas > 0 && (
                      <span className="text-destructive font-medium">{cuenta.cuotasVencidas} vencida{cuenta.cuotasVencidas !== 1 ? "s" : ""}</span>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Button size="sm" className="h-7 text-[11px] px-3 flex-1" onClick={(e) => { e.stopPropagation(); openPagoCuenta(cuenta); }}>
                      <HandCoins className="h-3 w-3 mr-1" />Abonar
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[11px] px-3" onClick={(e) => { e.stopPropagation(); setPromesaCuenta(cuenta); setPromesaOpen(true); }}>
                      <CalendarCheck className="h-3 w-3 mr-1" />Promesa
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[11px] px-3" onClick={(e) => { e.stopPropagation(); navigate(`/prestamos/${cuenta.prestamoId}`); }}>
                      <Eye className="h-3 w-3 mr-1" />Ver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Filter bar + vista toggle ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-filter-bar border border-filter-bar-border rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filtroPrestamo} onValueChange={setFiltroPrestamo}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Cuenta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las cuentas</SelectItem>
              {cuentas?.map((c) => (
                <SelectItem key={c.prestamoId} value={c.prestamoId}>
                  {c.idPrestamo} ({TIPO_LABELS[c.tipoCuenta]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vistaActiva === "cuotas" && (
            <Select value={filtroCuota} onValueChange={(v) => setFiltroCuota(v as any)}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las cuotas</SelectItem>
                <SelectItem value="pendientes">Pendientes</SelectItem>
                <SelectItem value="vencidas">Vencidas</SelectItem>
                <SelectItem value="pagadas">Pagadas</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant={vistaActiva === "cuotas" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setVistaActiva("cuotas")}>
            Cuotas ({cuotasFiltradas.length})
          </Button>
          <Button variant={vistaActiva === "pagos" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setVistaActiva("pagos")}>
            Pagos
          </Button>
        </div>
      </div>

      {/* ── Cuotas Table ── */}
      {vistaActiva === "cuotas" && (
        <div className="border rounded-lg overflow-hidden">
          {cuotasFiltradas.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
              <p>No hay cuotas con ese filtro</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  {(cuentas?.length || 0) > 1 && <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Cuenta</TableHead>}
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold">#</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Vencimiento</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Cuota</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Capital</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Interés</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Mora</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Saldo</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-center">Atraso</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuotasFiltradas.map((c) => {
                  const isPagada = c.status === "Pagada";
                  const isVencida = c.diasAtraso > 0 && !isPagada;
                  return (
                    <TableRow
                      key={c.id}
                      className={cn(
                        "text-xs",
                        isPagada && "bg-badge-activo/10 text-muted-foreground",
                        isVencida && "bg-destructive/5",
                      )}
                    >
                      {(cuentas?.length || 0) > 1 && (
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-primary">{TIPO_ICONS[c.tipoCuenta] || TIPO_ICONS.prestamo}</span>
                            <span className="font-medium">{c.idPrestamo}</span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{c.numCuota}</TableCell>
                      <TableCell>
                        <span className={cn(isVencida && "text-destructive font-medium")}>
                          {format(parseISO(c.fechaVencimiento), "dd/MM/yyyy")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{$$(c.capitalInteres)}</TableCell>
                      <TableCell className="text-right">{isPagada ? <span className="text-muted-foreground/50">—</span> : $$(c.saldoCapital)}</TableCell>
                      <TableCell className="text-right">{isPagada ? <span className="text-muted-foreground/50">—</span> : $$(c.saldoInteres)}</TableCell>
                      <TableCell className={cn("text-right", c.saldoMora > 0 && !isPagada ? "text-destructive font-medium" : "text-muted-foreground/50")}>
                        {c.saldoMora > 0 && !isPagada ? $$(c.saldoMora) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{isPagada ? <span className="text-muted-foreground/50">$0</span> : $$(c.saldoTotal)}</TableCell>
                      <TableCell className="text-center">
                        {isVencida ? (
                          <span className="text-destructive font-semibold">{c.diasAtraso}d</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isPagada ? (
                          <Badge className="text-[9px] px-1.5 py-0 bg-badge-activo text-badge-activo-foreground border-0">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Pagada
                          </Badge>
                        ) : c.status === "Parcial" ? (
                          <Badge className="text-[9px] px-1.5 py-0 bg-badge-aldia text-badge-aldia-foreground border-0">Parcial</Badge>
                        ) : isVencida ? (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Vencida</Badge>
                        ) : c.status === "Prometida" ? (
                          <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-0">Prometida</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Pendiente</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* ── Pagos Table ── */}
      {vistaActiva === "pagos" && (
        <div className="border rounded-lg overflow-hidden">
          {loadingPagos ? (
            <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !pagos?.length ? (
            <div className="p-12 text-center text-muted-foreground">Sin pagos registrados</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Fecha</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Cuenta</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Monto</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Capital</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Interés</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Mora</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Método</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos
                  .filter((p: any) => filtroPrestamo === "todos" || p.prestamo_id === filtroPrestamo)
                  .map((p: any) => (
                    <TableRow key={p.id} className={cn("text-xs", p.anulado && "opacity-40 line-through")}>
                      <TableCell>{p.created_at ? format(new Date(p.created_at), "dd/MM/yy HH:mm") : "—"}</TableCell>
                      <TableCell className="font-medium">{p.idPrestamo}</TableCell>
                      <TableCell className="text-right font-medium">{$$(Number(p.monto_recibido))}</TableCell>
                      <TableCell className="text-right">{$$(Number(p.aplicado_capital || 0))}</TableCell>
                      <TableCell className="text-right">{$$(Number(p.aplicado_interes || 0))}</TableCell>
                      <TableCell className="text-right">{$$(Number(p.aplicado_mora || 0))}</TableCell>
                      <TableCell>{p.metodo_pago || "—"}</TableCell>
                      <TableCell className="text-center">
                        {p.anulado ? (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Anulado</Badge>
                        ) : (
                          <Badge className="text-[9px] px-1.5 py-0 bg-badge-activo text-badge-activo-foreground border-0">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {pagoOpen && (
        <PagoModal
          open={pagoOpen}
          onOpenChange={handlePagoClose}
          prestamoId={pagoPrestamoId}
          cuotasPendientes={pagoCuotas}
          cajas={cajas || []}
          rutaId={pagoRutaId}
          cobradorId={pagoCobradorId}
          montoInicial={pagoMontoInicial}
        />
      )}

      {promesaOpen && promesaCuenta && (
        <PromesaModal
          open={promesaOpen}
          onOpenChange={(open) => {
            setPromesaOpen(open);
            if (!open) queryClient.invalidateQueries({ queryKey: ["cobranza-cuentas", clienteId] });
          }}
          prestamoId={promesaCuenta.prestamoId}
          cuotaNum={promesaCuenta.cuotasPendientes[0]?.numCuota || 1}
          cuotaId={promesaCuenta.cuotasPendientes[0]?.id || ""}
          saldoTotal={promesaCuenta.cuotasPendientes[0]?.saldoTotal || 0}
          fechaVencimiento={promesaCuenta.cuotasPendientes[0]?.fechaVencimiento || ""}
        />
      )}

      {visitaOpen && clienteId && (
        <VisitaModal
          open={visitaOpen}
          onOpenChange={(open) => { setVisitaOpen(open); }}
          prestamoId={cuentas?.[0]?.prestamoId || ""}
          clienteId={clienteId}
          clienteNombre={cliente.nombre_completo}
          cuotaId={cuentas?.[0]?.cuotasPendientes[0]?.id || ""}
          cuotaNum={cuentas?.[0]?.cuotasPendientes[0]?.numCuota || 1}
          saldoTotal={totales.saldo}
        />
      )}
    </div>
  );
}
