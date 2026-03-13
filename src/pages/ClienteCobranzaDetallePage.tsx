import { useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, $$ } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, User, Phone, MapPin, Mail, CreditCard, ShieldCheck, Package, Wrench,
  HandCoins, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, FileText,
  CalendarCheck, Eye,
} from "lucide-react";
import { PagoModal } from "@/components/PagoModal";
import { PromesaModal } from "@/components/PromesaModal";
import { VisitaModal } from "@/components/VisitaModal";
import { StatusBadge } from "@/components/shared/StatusBadge";

// ── Types ──
interface CuotaPendiente {
  id: string;
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
  cuotasPendientes: CuotaPendiente[];
  totalSaldo: number;
  totalMora: number;
  cuotasTotales: number;
  cuotasPagadas: number;
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
        .select("id, id_cliente, nombre_completo, telefono, correo, dni, direccion, foto_cliente, estado, documento_identidad, sexo, situacion_laboral, ingresos, gastos_mensuales, trabajo_empresa, trabajo_cargo, ref1_nombre, ref1_telefono, ref1_parentesco, ref2_nombre, ref2_telefono, ref2_parentesco, aval_nombre, aval_telefono, aval_direccion")
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

      // Cobrador names
      const cobIds = [...new Set(prestamos.map((p: any) => p.cobrador_id).filter(Boolean))] as string[];
      const cobMap: Record<string, string> = {};
      if (cobIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, nombre_completo").in("id", cobIds);
        for (const c of profiles || []) cobMap[c.id] = c.nombre_completo;
      }

      // Cuotas
      const { data: cuotas } = await supabase
        .from("amortizacion")
        .select(`
          id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
          saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
          fecha_vencimiento, status, dias_atraso
        `)
        .in("prestamo_id", prestamoIds)
        .order("num_cuota", { ascending: true });

      const cuotasByPrestamo: Record<string, any[]> = {};
      for (const c of cuotas || []) {
        if (!cuotasByPrestamo[c.prestamo_id]) cuotasByPrestamo[c.prestamo_id] = [];
        cuotasByPrestamo[c.prestamo_id].push(c);
      }

      return prestamos.map((p: any): CuentaCliente => {
        const allCuotas = cuotasByPrestamo[p.id] || [];
        const pendientes = allCuotas.filter((c: any) => c.status !== "Pagada");
        const pagadas = allCuotas.filter((c: any) => c.status === "Pagada");

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
          cuotasPendientes: pendientes.map((c: any): CuotaPendiente => ({
            id: c.id,
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
            status: c.status || "Pendiente",
            diasAtraso: Number(c.dias_atraso || 0),
          })),
          totalSaldo: pendientes.reduce((s: number, c: any) => s + Number(c.saldo_total || 0), 0),
          totalMora: pendientes.reduce((s: number, c: any) => s + Number(c.saldo_mora || 0), 0),
          cuotasTotales: allCuotas.length,
          cuotasPagadas: pagadas.length,
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

  const [expandedCuenta, setExpandedCuenta] = useState<string | null>(null);

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

  const totales = useMemo(() => {
    if (!cuentas) return { saldo: 0, mora: 0, cuentas: 0 };
    return {
      saldo: cuentas.reduce((s, c) => s + c.totalSaldo, 0),
      mora: cuentas.reduce((s, c) => s + c.totalMora, 0),
      cuentas: cuentas.length,
    };
  }, [cuentas]);

  const openPagoCuenta = (cuenta: CuentaCliente) => {
    setPagoPrestamoId(cuenta.prestamoId);
    setPagoCuotas(cuenta.cuotasPendientes.map((c) => ({
      id: c.id,
      num_cuota: c.numCuota,
      saldo_mora: c.saldoMora,
      saldo_interes: c.saldoInteres,
      saldo_capital: c.saldoCapital,
      saldo_total: c.saldoTotal,
      mora_pagada: c.moraPagada,
      interes_pagado: c.interesPagado,
      capital_pagado: c.capitalPagado,
      status: c.status,
      fecha_vencimiento: c.fechaVencimiento,
    })));
    setPagoRutaId(cuenta.rutaId);
    setPagoCobradorId(cuenta.cobradorId);
    const proxima = cuenta.cuotasPendientes[0];
    setPagoMontoInicial(proxima?.saldoTotal);
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

  const fechaCobranza = searchParams.get("fecha") || format(new Date(), "yyyy-MM-dd");

  if (loadingCliente || loadingCuentas) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Cliente no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/cobranza")}>Volver a Cobranza</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold truncate">{cliente.nombre_completo}</h1>
            <StatusBadge status={cliente.estado || "Activo"} />
          </div>
          <p className="text-sm text-muted-foreground">{cliente.id_cliente} · Estado de Cuenta</p>
        </div>
      </div>

      {/* Client Info + Totals */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Client Info Card */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Información
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {cliente.foto_cliente && (
              <img src={cliente.foto_cliente} alt="" className="w-16 h-16 rounded-full object-cover mx-auto" />
            )}
            {cliente.dni && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>{cliente.documento_identidad}: {cliente.dni}</span>
              </div>
            )}
            {cliente.telefono && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <a href={`tel:${cliente.telefono}`} className="hover:text-foreground">{cliente.telefono}</a>
              </div>
            )}
            {cliente.correo && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{cliente.correo}</span>
              </div>
            )}
            {cliente.direccion && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{cliente.direccion}</span>
              </div>
            )}
            <Separator />
            {cliente.trabajo_empresa && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Trabajo:</span> {cliente.trabajo_empresa}
                {cliente.trabajo_cargo && ` · ${cliente.trabajo_cargo}`}
              </div>
            )}
            {cliente.ingresos && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Ingresos:</span> {$$(Number(cliente.ingresos))}
              </div>
            )}
            {cliente.ref1_nombre && (
              <>
                <Separator />
                <div className="text-xs space-y-1">
                  <p className="font-medium text-foreground">Referencia 1</p>
                  <p className="text-muted-foreground">{cliente.ref1_nombre} ({cliente.ref1_parentesco})</p>
                  {cliente.ref1_telefono && <p className="text-muted-foreground">{cliente.ref1_telefono}</p>}
                </div>
              </>
            )}
            {cliente.ref2_nombre && (
              <div className="text-xs space-y-1">
                <p className="font-medium text-foreground">Referencia 2</p>
                <p className="text-muted-foreground">{cliente.ref2_nombre} ({cliente.ref2_parentesco})</p>
                {cliente.ref2_telefono && <p className="text-muted-foreground">{cliente.ref2_telefono}</p>}
              </div>
            )}
            {cliente.aval_nombre && (
              <>
                <Separator />
                <div className="text-xs space-y-1">
                  <p className="font-medium text-foreground">Aval</p>
                  <p className="text-muted-foreground">{cliente.aval_nombre}</p>
                  {cliente.aval_telefono && <p className="text-muted-foreground">{cliente.aval_telefono}</p>}
                  {cliente.aval_direccion && <p className="text-muted-foreground">{cliente.aval_direccion}</p>}
                </div>
              </>
            )}

            <Separator />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={() => navigate(`/clientes/${clienteId}`)}>
                <Eye className="h-3 w-3 mr-1" /> Ficha Completa
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right side: KPIs + Cuentas */}
        <div className="lg:col-span-3 space-y-4">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cuentas Activas</p>
                <p className="text-2xl font-bold">{totales.cuentas}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Deuda Total</p>
                <p className="text-2xl font-bold text-destructive">{$$(totales.saldo)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Mora Total</p>
                <p className={cn("text-2xl font-bold", totales.mora > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {$$(totales.mora)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Acciones</p>
                <div className="flex gap-2 justify-center mt-1">
                  <Button size="sm" className="h-7 text-[11px] px-3" disabled={!cuentas?.length} onClick={() => {
                    if (cuentas?.length === 1) openPagoCuenta(cuentas[0]);
                  }}>
                    <HandCoins className="h-3 w-3 mr-1" />Cobrar
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] px-3" onClick={() => setVisitaOpen(true)}>
                    <MapPin className="h-3 w-3 mr-1" />Visita
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs: Cuentas / Pagos */}
          <Tabs defaultValue="cuentas">
            <TabsList>
              <TabsTrigger value="cuentas">Cuentas ({totales.cuentas})</TabsTrigger>
              <TabsTrigger value="pagos">Historial de Pagos</TabsTrigger>
            </TabsList>

            <TabsContent value="cuentas" className="space-y-3 mt-3">
              {!cuentas || cuentas.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
                    <p className="font-medium">Sin cuentas pendientes</p>
                  </CardContent>
                </Card>
              ) : cuentas.map((cuenta) => {
                const isExpanded = expandedCuenta === cuenta.prestamoId;
                const progreso = cuenta.cuotasTotales > 0
                  ? (cuenta.cuotasPagadas / cuenta.cuotasTotales) * 100 : 0;
                const tieneVencidas = cuenta.cuotasPendientes.some((c) => c.diasAtraso > 0);

                return (
                  <Card key={cuenta.prestamoId} className={cn("overflow-hidden", tieneVencidas && "border-destructive/30")}>
                    <CardContent className="p-0">
                      {/* Header */}
                      <button
                        className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedCuenta(isExpanded ? null : cuenta.prestamoId)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-primary">{TIPO_ICONS[cuenta.tipoCuenta] || TIPO_ICONS.prestamo}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold">{cuenta.idPrestamo}</span>
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                  {TIPO_LABELS[cuenta.tipoCuenta] || "Préstamo"}
                                </Badge>
                                <StatusBadge status={cuenta.estado} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {$$(cuenta.montoSolicitado)} · {cuenta.frecuencia} · {cuenta.cuotasPagadas}/{cuenta.cuotasTotales} cuotas · {cuenta.rutaNombre} · {cuenta.cobradorNombre}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-base font-bold">{$$(cuenta.totalSaldo)}</p>
                              {cuenta.totalMora > 0 && (
                                <p className="text-[10px] text-destructive font-medium">+{$$(cuenta.totalMora)} mora</p>
                              )}
                            </div>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 bg-secondary rounded-full h-1.5">
                            <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${progreso}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium shrink-0">{progreso.toFixed(0)}%</span>
                        </div>
                      </button>

                      {/* Expanded: cuotas */}
                      {isExpanded && (
                        <div className="border-t bg-muted/20">
                          <div className="max-h-[320px] overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-table-header">
                                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Cuota</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Vence</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Capital</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Interés</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Mora</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Saldo</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-center">Estado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {cuenta.cuotasPendientes.map((c) => (
                                  <TableRow key={c.id} className={cn("text-xs", c.diasAtraso > 0 && "bg-destructive/5")}>
                                    <TableCell className="font-medium">#{c.numCuota}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {format(parseISO(c.fechaVencimiento), "dd/MM/yy")}
                                    </TableCell>
                                    <TableCell className="text-right">{$$(c.saldoCapital)}</TableCell>
                                    <TableCell className="text-right">{$$(c.saldoInteres)}</TableCell>
                                    <TableCell className={cn("text-right", c.saldoMora > 0 ? "text-destructive font-medium" : "text-muted-foreground/50")}>
                                      {c.saldoMora > 0 ? $$(c.saldoMora) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">{$$(c.saldoTotal)}</TableCell>
                                    <TableCell className="text-center">
                                      {c.diasAtraso > 0 ? (
                                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">{c.diasAtraso}d</Badge>
                                      ) : c.status === "Parcial" ? (
                                        <Badge className="text-[9px] px-1.5 py-0 bg-badge-aldia text-badge-aldia-foreground border-0">Parcial</Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Pte</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Action bar */}
                          <div className="p-3 border-t flex items-center justify-between bg-secondary/30">
                            <div className="text-xs text-muted-foreground">
                              {cuenta.cuotasPendientes.length} cuota{cuenta.cuotasPendientes.length !== 1 ? "s" : ""} pendiente{cuenta.cuotasPendientes.length !== 1 ? "s" : ""}
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-7 text-[11px] px-3" onClick={() => navigate(`/prestamos/${cuenta.prestamoId}`)}>
                                <Eye className="h-3 w-3 mr-1" />Ver Detalle
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 text-[11px] px-3" onClick={() => {
                                setPromesaCuenta(cuenta);
                                setPromesaOpen(true);
                              }}>
                                <CalendarCheck className="h-3 w-3 mr-1" />Promesa
                              </Button>
                              <Button size="sm" className="h-7 text-[11px] px-3" onClick={() => openPagoCuenta(cuenta)}>
                                <HandCoins className="h-3 w-3 mr-1" />Abonar
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="pagos" className="mt-3">
              {loadingPagos ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : !pagos || pagos.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Sin pagos registrados
                  </CardContent>
                </Card>
              ) : (
                <div className="border rounded-lg overflow-hidden">
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
                      {pagos.map((p: any) => (
                        <TableRow key={p.id} className={cn("text-xs", p.anulado && "opacity-50 line-through")}>
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
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modals */}
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
          onOpenChange={(open) => {
            setVisitaOpen(open);
            if (!open) queryClient.invalidateQueries({ queryKey: ["cobranza-cuentas", clienteId] });
          }}
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
