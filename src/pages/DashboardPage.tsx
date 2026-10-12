import { useState, useMemo } from "react";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { rpc } from "@/lib/supabaseQuery";
import { format } from "date-fns";
import { hoyNegocio, hoyNegocioDate } from "@/lib/fechaNegocio";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, AreaChart, Area, ComposedChart, Line,
} from "recharts";
import {
  ANALYTICS_COLORS,
  AnalyticsChartCard,
  AnalyticsTooltip,
  DonutBreakdown,
  TrendPill,
} from "@/components/analytics/ChartPrimitives";
import {
  DollarSign, TrendingUp, AlertTriangle, Clock, Users, Wallet,
  CalendarClock, Landmark, ArrowRight, Percent, ShieldAlert,
  Target, BarChart3, Activity, CircleDollarSign, Scale, TrendingDown,
  Banknote, PiggyBank, Receipt, ArrowUpRight, ArrowDownRight,
  CalendarIcon, Filter, X, Eye, CreditCard, BadgeDollarSign,
  MapPin, Phone, ChevronRight, HandCoins, Building2, CircleAlert,
  Plus, CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { cn, $$, fmtDate } from "@/lib/utils";

const pct = (n: number) => `${n.toFixed(1)}%`;

type DashboardNum = number | string | null;
type DashboardPieItem = { name: string; value: number };
type DashboardRpc = {
  today: string;
  prestamos: Record<"total" | "activos" | "liquidados" | "juridicos" | "vencidos" | "capital_colocado" | "total_pagar", DashboardNum>;
  cuotas: Record<
    | "saldo_por_cobrar" | "saldo_capital" | "saldo_interes" | "mora_total" | "capital_recuperado" | "interes_recuperado"
    | "mora_recuperada" | "cuotas_vencidas" | "cuotas_pendientes" | "cuotas_pagadas" | "total_cuotas" | "monto_vencido"
    | "monto_vence_hoy" | "cuotas_vencen_hoy" | "prestamos_en_riesgo",
    DashboardNum
  >;
  pagos: Record<
    | "total_cobrado" | "capital_cobrado" | "interes_cobrado" | "mora_cobrada" | "cobrado_hoy" | "num_pagos_hoy"
    | "cobrado_mes" | "ingreso_financiero_mes",
    DashboardNum
  >;
  gastosMes: DashboardNum;
  misc: Record<
    | "efectivo_calle" | "capital_cajas" | "promesas_pendientes" | "promesas_por_atender" | "monto_promesas_hoy"
    | "clientes_activos" | "clientes_mora",
    DashboardNum
  >;
  topDeudores: {
    id: string; cliente: string; telefono: string | null; direccion: string | null;
    gpsLat: number | null; gpsLng: number | null; saldo: DashboardNum; vencido: DashboardNum;
    mora: DashboardNum; diasAtraso: DashboardNum; ruta: string; cobrador: string;
  }[];
  meses: { ym: string; colocado: DashboardNum; cobrado: DashboardNum; mora: DashboardNum; interes: DashboardNum; capital: DashboardNum }[];
  pies: { estado: DashboardPieItem[]; frecuencia: DashboardPieItem[]; cuota_status: DashboardPieItem[] };
  cobradorStats: { id: string; nombre: string | null; cobrado: DashboardNum; prestamos: DashboardNum; efectivo: DashboardNum; saldo: DashboardNum; mora: DashboardNum }[];
  rutaStats: { nombre: string; prestamos: DashboardNum; saldo: DashboardNum; mora: DashboardNum }[];
  opciones: {
    rutas: { id: string; nombre: string }[];
    cobradores: { id: string; nombre_completo: string | null }[];
    cajas: { id: string; nombre: string; saldo: DashboardNum }[];
  };
};

// desde/hasta: días de negocio (YYYY-MM-DD) inclusivos; "hoy" lo calcula el servidor en hora de México.
type DashboardFilters = {
  desde: string | null;
  hasta: string | null;
  ruta_id: string | null;
  cobrador_id: string | null;
  caja_id: string | null;
  meses: string[];
};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Últimos 6 meses respecto a hoy en hora de México (el servidor agrega por "YYYY-MM").
function lastSixMonths() {
  const out: { ym: string; label: string }[] = [];
  const [y, m] = hoyNegocio().split("-").map(Number);
  for (let i = 0; i < 6; i++) {
    const d = new Date(y, m - 1 - 5 + i, 1);
    out.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
    });
  }
  return out;
}

// ── Data fetching ─────────────────────────────────────────────────
// Todo el agregado (KPIs, series, top deudores) se calcula en SQL: rpc dashboard_kpis.
function useDashboardData(empresaId: string, filters: DashboardFilters) {
  return useQuery({
    queryKey: ["dashboard", empresaId, filters],
    queryFn: async () => {
      const { data, error } = await rpc<DashboardRpc>("dashboard_kpis", { p_filters: filters });
      if (error) throw error;
      return data as DashboardRpc;
    },
    enabled: !!empresaId,
    staleTime: 1000 * 60 * 3, // 3 min cache
    placeholderData: keepPreviousData,
  });
}

function buildDashboardStats(d: DashboardRpc, meses: { ym: string; label: string }[]) {
  const n = (v: DashboardNum | undefined) => Number(v || 0);
  const P = d.prestamos, C = d.cuotas, G = d.pagos, M = d.misc;

  const capitalColocado = n(P.capital_colocado);
  const totalPagar = n(P.total_pagar);
  const interesEsperado = totalPagar - capitalColocado;
  const totalActivos = n(P.activos);

  const saldoPorCobrar = n(C.saldo_por_cobrar);
  const saldoCapital = n(C.saldo_capital);
  const saldoInteres = n(C.saldo_interes);
  const moraTotal = n(C.mora_total);
  const capitalRecuperado = n(C.capital_recuperado);
  const interesRecuperado = n(C.interes_recuperado);
  const moraRecuperada = n(C.mora_recuperada);
  const cuotasVencidas = n(C.cuotas_vencidas);
  const cuotasPendientes = n(C.cuotas_pendientes);
  const cuotasPagadas = n(C.cuotas_pagadas);
  const totalCuotas = n(C.total_cuotas);
  const montoVencido = n(C.monto_vencido);

  const totalCobrado = n(G.total_cobrado);
  const capitalCobrado = n(G.capital_cobrado);
  const interesCobrado = n(G.interes_cobrado);
  const moraCobrada = n(G.mora_cobrada);
  const cobradoHoy = n(G.cobrado_hoy);
  const numPagosHoy = n(G.num_pagos_hoy);

  const efectivoCalle = n(M.efectivo_calle);
  const capitalCajas = n(M.capital_cajas);

  const tasaRecuperacion = capitalColocado > 0 ? (capitalRecuperado / capitalColocado) * 100 : 0;
  const tasaMorosidad = saldoPorCobrar > 0 ? (montoVencido / saldoPorCobrar) * 100 : 0;
  const eficienciaCobranza = totalPagar > 0 ? (totalCobrado / totalPagar) * 100 : 0;
  const indiceMora = capitalColocado > 0 ? (moraTotal / capitalColocado) * 100 : 0;
  const rendimientoCartera = capitalColocado > 0 ? (interesRecuperado / capitalColocado) * 100 : 0;
  const ticketPromedio = totalActivos > 0 ? capitalColocado / totalActivos : 0;
  const cuotaPromedio = cuotasPendientes > 0 ? saldoPorCobrar / cuotasPendientes : 0;
  const carteraVencidaPct = capitalColocado > 0 ? (montoVencido / capitalColocado) * 100 : 0;

  const liquidezTotal = capitalCajas + efectivoCalle;
  const gananciaNeta = interesCobrado + moraCobrada;
  const cobradoMes = n(G.cobrado_mes);
  const ingresoFinancieroMes = n(G.ingreso_financiero_mes);
  const gastosMes = n(d.gastosMes);
  const gananciaMes = ingresoFinancieroMes - gastosMes;

  const topDeudores = d.topDeudores.map((t) => ({
    ...t,
    saldo: n(t.saldo),
    vencido: n(t.vencido),
    mora: n(t.mora),
    diasAtraso: n(t.diasAtraso),
  }));

  const mesesMap = new Map(d.meses.map((m) => [m.ym, m]));
  const colocacionMes = meses.map(({ ym, label }) => {
    const m = mesesMap.get(ym);
    return { mes: label, colocado: n(m?.colocado), cobrado: n(m?.cobrado), mora: n(m?.mora), interes: n(m?.interes), capital: n(m?.capital) };
  });

  const currentPeriod = colocacionMes[colocacionMes.length - 1];
  const previousPeriod = colocacionMes[colocacionMes.length - 2];
  const variation = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };
  const monthlyTrend = {
    collected: variation(currentPeriod.cobrado, previousPeriod.cobrado),
    placed: variation(currentPeriod.colocado, previousPeriod.colocado),
    arrears: variation(currentPeriod.mora, previousPeriod.mora),
  };

  const estadoPie = d.pies.estado.map(({ name, value }) => ({ name, value: n(value) }));
  const saldoPie = [{ name: "Capital", value: saldoCapital }, { name: "Interés", value: saldoInteres }, { name: "Mora", value: moraTotal }].filter(s => s.value > 0);
  const freqPie = d.pies.frecuencia.map(({ name, value }) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value: n(value) }));
  const cuotaStatusPie = d.pies.cuota_status.map(({ name, value }) => ({ name, value: n(value) }));

  const cobradorStats = d.cobradorStats.map((c) => ({
    nombre: c.nombre || "",
    cobrado: n(c.cobrado),
    prestamos: n(c.prestamos),
    efectivo: n(c.efectivo),
    saldo: n(c.saldo),
    mora: n(c.mora),
  }));
  const rutaStats = d.rutaStats.map((r) => ({ nombre: r.nombre, prestamos: n(r.prestamos), saldo: n(r.saldo), mora: n(r.mora) }));
  const cajasData = d.opciones.cajas.map((c) => ({ nombre: c.nombre, saldo: n(c.saldo) }));
  const cobradoresChart = cobradorStats.slice(0, 8).map((c) => ({ nombre: c.nombre.split(" ")[0], cobrado: c.cobrado, saldo: c.saldo }));

  return {
    capitalColocado, totalPagar, interesEsperado, saldoPorCobrar, saldoCapital, saldoInteres, moraTotal,
    capitalRecuperado, interesRecuperado, moraRecuperada, montoVencido, cuotasVencidas, cuotasPendientes,
    cuotasPagadas, totalCuotas, prestamosVencidos: n(P.vencidos), totalCobrado, capitalCobrado, interesCobrado, moraCobrada,
    cobradoHoy, numPagosHoy, efectivoCalle, capitalCajas, tasaRecuperacion, tasaMorosidad, eficienciaCobranza,
    indiceMora, rendimientoCartera, ticketPromedio, cuotaPromedio, promesasPendientes: n(M.promesas_pendientes),
    promesasPorAtender: n(M.promesas_por_atender), montoPromesasHoy: n(M.monto_promesas_hoy),
    clientesActivos: n(M.clientes_activos), clientesMora: n(M.clientes_mora), liquidezTotal, gananciaNeta, carteraVencidaPct,
    cobradoMes, ingresoFinancieroMes, gastosMes, gananciaMes, montoVenceHoy: n(C.monto_vence_hoy), cuotasVencenHoy: n(C.cuotas_vencen_hoy),
    prestamosEnRiesgo: n(C.prestamos_en_riesgo), topDeudores,
    totalPrestamos: n(P.total), totalActivos, totalLiquidados: n(P.liquidados),
    totalJuridicos: n(P.juridicos), colocacionMes, monthlyTrend,
    estadoPie, saldoPie, freqPie, cuotaStatusPie,
    cobradorStats, rutaStats, cajasData, cobradoresChart,
  };
}

function KPI({ title, value, icon: Icon, accent, sub, trend, large }: {
  title: string; value: string; icon: LucideIcon; accent: string; sub?: string;
  trend?: "up" | "down" | null; large?: boolean;
}) {
  return (
    <div className={cn(
      "group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_16px_35px_-30px_rgba(15,23,42,.42)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_20px_44px_-30px_rgba(240,20,77,.28)]",
      large ? "px-5 py-4" : "px-4 py-3",
    )}>
      <div className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-primary/[0.045] blur-2xl transition-colors group-hover:bg-primary/[0.08]" />
      <div className="flex items-center justify-between">
        <p className={cn("font-medium text-muted-foreground uppercase tracking-wider", large ? "text-[12px]" : "text-[11px]")}>{title}</p>
        <span className="rounded-lg border border-border/60 bg-muted/35 p-1.5">
          <Icon className={cn(large ? "h-[18px] w-[18px]" : "h-3.5 w-3.5", accent)} />
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <p className={cn("font-semibold", large ? "text-2xl" : "text-lg")}>{value}</p>
        {trend && (trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5 text-success" /> : <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />)}
      </div>
      {sub && <p className={cn("text-muted-foreground", large ? "text-[12px]" : "text-[11px]")}>{sub}</p>}
    </div>
  );
}

function DatePick({ value, onChange, placeholder }: { value: Date | undefined; onChange: (d: Date | undefined) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 text-[12px] justify-start gap-1.5 min-w-[130px]", !value && "text-muted-foreground")}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {value ? fmtDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { empresaId, empresaNombre } = useEmpresa();

  const [fechaDesde, setFechaDesde] = useState<Date | undefined>();
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>();
  const [filtroRuta, setFiltroRuta] = useState<string>("__all__");
  const [filtroCobrador, setFiltroCobrador] = useState<string>("__all__");
  const [filtroCaja, setFiltroCaja] = useState<string>("__all__");

  const meses = useMemo(() => lastSixMonths(), []);
  const filters = useMemo<DashboardFilters>(() => ({
    desde: fechaDesde ? format(fechaDesde, "yyyy-MM-dd") : null,
    hasta: fechaHasta ? format(fechaHasta, "yyyy-MM-dd") : null,
    ruta_id: filtroRuta !== "__all__" ? filtroRuta : null,
    cobrador_id: filtroCobrador !== "__all__" ? filtroCobrador : null,
    caja_id: filtroCaja !== "__all__" ? filtroCaja : null,
    meses: meses.map((m) => m.ym),
  }), [fechaDesde, fechaHasta, filtroRuta, filtroCobrador, filtroCaja, meses]);
  const { data, isLoading } = useDashboardData(empresaId, filters);

  const hasFilters = fechaDesde || fechaHasta || filtroRuta !== "__all__" || filtroCobrador !== "__all__" || filtroCaja !== "__all__";
  const clearFilters = () => { setFechaDesde(undefined); setFechaHasta(undefined); setFiltroRuta("__all__"); setFiltroCobrador("__all__"); setFiltroCaja("__all__"); };
  const setPreset = (days: number) => { const now = hoyNegocioDate(); const from = hoyNegocioDate(); from.setDate(now.getDate() - days); setFechaDesde(from); setFechaHasta(now); };

  const stats = useMemo(() => (data ? buildDashboardStats(data, meses) : null), [data, meses]);

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-xl font-semibold">Dashboard</h1><p className="text-muted-foreground text-[13px]">Cargando datos...</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Card key={i}><CardContent className="pt-5 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Resumen ejecutivo</p>
          <h1 className="text-xl font-semibold mt-0.5">Así está {empresaNombre || "tu empresa"} hoy</h1>
          <p className="text-muted-foreground text-[13px]">Dinero, cobranza y prioridades en una sola vista.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/pagos")}>
            <HandCoins className="h-3.5 w-3.5 mr-1.5" />Registrar pago
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => navigate("/prestamos/nuevo")}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo préstamo
          </Button>
        </div>
      </div>

      {/* ── FILTROS ─────────────────────────────────────────── */}
      <details className="group rounded-lg border border-border bg-card">
        <summary className="flex h-9 cursor-pointer list-none items-center justify-between px-3 text-[12px] font-medium text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2"><Filter className="h-3.5 w-3.5" />Filtrar esta vista</span>
          <span className="flex items-center gap-2">
            {hasFilters && <Badge variant="outline" className="h-5 text-[9px] text-primary border-primary/30">Filtros activos</Badge>}
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          </span>
        </summary>
        <div className="border-t border-border p-3">
      {/* Desktop filters */}
      <div className="hidden md:block">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mr-1">Filtros:</span>
          <div className="flex items-center gap-1">
            {[{ label: "Hoy", days: 0 }, { label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }].map(p => (
              <Button key={p.label} variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => p.days === 0 ? (() => { const t = hoyNegocioDate(); setFechaDesde(t); setFechaHasta(t); })() : setPreset(p.days)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="h-5 w-px bg-border mx-1" />
          <DatePick value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" />
          <span className="text-[11px] text-muted-foreground">—</span>
          <DatePick value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" />
          <div className="h-5 w-px bg-border mx-1" />
          <Select value={filtroRuta} onValueChange={setFiltroRuta}>
            <SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue placeholder="Ruta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas rutas</SelectItem>
              {(data?.opciones.rutas || []).map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroCobrador} onValueChange={setFiltroCobrador}>
            <SelectTrigger className="h-8 w-[140px] text-[12px]"><SelectValue placeholder="Cobrador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(data?.opciones.cobradores || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre_completo}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroCaja} onValueChange={setFiltroCaja}>
            <SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue placeholder="Caja" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas cajas</SelectItem>
              {(data?.opciones.cajas || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive hover:text-destructive" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" />Limpiar
            </Button>
          )}
        </div>
      </div>
      {/* Mobile filters */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[{ label: "Hoy", days: 0 }, { label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }].map(p => (
            <Button key={p.label} variant="outline" size="sm" className="h-7 text-[11px] px-2.5 shrink-0" onClick={() => p.days === 0 ? (() => { const t = hoyNegocioDate(); setFechaDesde(t); setFechaHasta(t); })() : setPreset(p.days)}>
              {p.label}
            </Button>
          ))}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive shrink-0" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" />Limpiar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filtroRuta} onValueChange={setFiltroRuta}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Ruta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas rutas</SelectItem>
              {(data?.opciones.rutas || []).map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroCobrador} onValueChange={setFiltroCobrador}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Cobrador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(data?.opciones.cobradores || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre_completo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
        </div>
      </details>

      {/* ── ONBOARDING CHECKLIST ──────────────────────── */}
      <OnboardingChecklist />

      {/* ── TABS ─────────────────────────────────────────── */}
      <Tabs defaultValue="principal">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="principal" className="text-xs gap-1"><Eye className="h-3.5 w-3.5" /><span className="hidden sm:inline">Principal</span><span className="sm:hidden">Inicio</span></TabsTrigger>
          <TabsTrigger value="financiero" className="text-xs gap-1"><BadgeDollarSign className="h-3.5 w-3.5" /><span className="hidden sm:inline">Financiero</span><span className="sm:hidden">Finanzas</span></TabsTrigger>
          <TabsTrigger value="flujo" className="text-xs gap-1"><Banknote className="h-3.5 w-3.5" /> Flujo</TabsTrigger>
          <TabsTrigger value="portafolio" className="text-xs gap-1"><CreditCard className="h-3.5 w-3.5" /><span className="hidden sm:inline">Portafolio</span><span className="sm:hidden">Cartera</span></TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════
            TAB PRINCIPAL — resumen ejecutivo accionable
            ════════════════════════════════════════════════════ */}
        <TabsContent value="principal" className="mt-4 space-y-4">
          {/* Lectura de 5 segundos: cuánto hay, cuánto falta y qué está en riesgo. */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              {
                label: "Te deben",
                value: $$(stats.saldoPorCobrar),
                detail: `${stats.totalActivos} préstamos activos`,
                icon: Wallet,
                tone: "text-primary bg-primary/10",
              },
              {
                label: "Ya está vencido",
                value: $$(stats.montoVencido),
                detail: `${stats.prestamosEnRiesgo} cuentas requieren atención`,
                icon: CircleAlert,
                tone: stats.montoVencido > 0 ? "text-destructive bg-destructive/10" : "text-success bg-success/10",
              },
              {
                label: "Dinero disponible",
                value: $$(stats.liquidezTotal),
                detail: `${$$(stats.capitalCajas)} en cajas · ${$$(stats.efectivoCalle)} en calle`,
                icon: Landmark,
                tone: "text-success bg-success/10",
              },
              {
                label: "Ganancia del mes",
                value: $$(stats.gananciaMes),
                detail: `${$$(stats.ingresoFinancieroMes)} intereses/mora · ${$$(stats.gastosMes)} gastos`,
                icon: stats.gananciaMes >= 0 ? TrendingUp : TrendingDown,
                tone: stats.gananciaMes >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
              },
            ].map(({ label, value, detail, icon: Icon, tone }) => (
              <Card key={label} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="text-xl md:text-2xl font-bold tracking-tight mt-1 truncate">{value}</p>
                    </div>
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", tone)}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* Quién debe, cuánto, desde cuándo y dónde encontrarlo. */}
            <Card className="xl:col-span-8 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Quién te debe</CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Primero aparecen los saldos vencidos de mayor importe.</p>
                  </div>
                  <button onClick={() => navigate("/cobranza")} className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline shrink-0">
                    Ver cobranza <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {stats.topDeudores.length === 0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="text-sm font-medium">No hay saldos pendientes</p>
                    <p className="text-xs text-muted-foreground">Tu cartera está al corriente.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {stats.topDeudores.map(deudor => (
                      <button
                        key={deudor.id}
                        onClick={() => navigate(`/prestamos/${deudor.id}`)}
                        className="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(190px,1.2fr)_minmax(170px,1fr)_120px_130px_20px] gap-3 items-center px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold truncate">{deudor.cliente}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            {deudor.telefono && <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{deudor.telefono}</span>}
                            <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{deudor.ruta}</span>
                          </div>
                        </div>
                        <div className="hidden md:block min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ubicación / responsable</p>
                          <p className="text-[11px] truncate mt-0.5">{deudor.direccion || deudor.ruta}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{deudor.cobrador}</p>
                        </div>
                        <div className="hidden md:block text-right">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo total</p>
                          <p className="text-[13px] font-semibold mt-0.5">{$$(deudor.saldo)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{deudor.vencido > 0 ? "Vencido" : "Pendiente"}</p>
                          <p className={cn("text-[13px] font-bold mt-0.5", deudor.vencido > 0 ? "text-destructive" : "text-foreground")}>
                            {$$(deudor.vencido > 0 ? deudor.vencido : deudor.saldo)}
                          </p>
                          <p className={cn("text-[10px]", deudor.diasAtraso > 0 ? "text-destructive" : "text-muted-foreground")}>
                            {deudor.diasAtraso > 0 ? `${deudor.diasAtraso} días de atraso` : "Al corriente"}
                          </p>
                        </div>
                        <ChevronRight className="hidden md:block h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="xl:col-span-4 space-y-4">
              <Card className={cn("overflow-hidden", stats.montoVencido > 0 && "border-destructive/30")}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">Prioridades de hoy</CardTitle>
                    <Badge variant="outline" className={cn("text-[10px]", stats.montoVencido > 0 ? "border-destructive/30 text-destructive" : "border-success/30 text-success")}>
                      {stats.montoVencido > 0 ? "Requiere atención" : "Todo en orden"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2.5 mb-3">
                    <div className="flex items-center gap-2 text-success">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-[12px] font-medium">Cobrado hoy</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-bold text-success">{$$(stats.cobradoHoy)}</p>
                      <p className="text-[9px] text-muted-foreground">{stats.numPagosHoy} pagos recibidos</p>
                    </div>
                  </div>
                  {[
                    { label: "Cartera vencida", value: $$(stats.montoVencido), sub: `${stats.prestamosEnRiesgo} cuentas`, path: "/cobranza", urgent: stats.montoVencido > 0 },
                    { label: "Cobrar hoy", value: $$(stats.montoVenceHoy), sub: `${stats.cuotasVencenHoy} cuotas`, path: "/cobranza", urgent: false },
                    { label: "Promesas por atender", value: $$(stats.montoPromesasHoy), sub: `${stats.promesasPorAtender} vencen o vencieron`, path: "/promesas", urgent: stats.montoPromesasHoy > 0 },
                  ].map(item => (
                    <button key={item.label} onClick={() => navigate(item.path)} className="w-full flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/40 transition-colors text-left">
                      <div>
                        <p className="text-[12px] font-medium">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={cn("text-[13px] font-bold", item.urgent && "text-destructive")}>{item.value}</p>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                  <Button className="w-full h-9 text-xs mt-1" onClick={() => navigate("/cobranza")}>
                    Ir a cobrar ahora <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Dónde está tu dinero</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {[
                    { label: "En clientes", value: stats.saldoPorCobrar, icon: Users, path: "/prestamos" },
                    { label: "En cajas", value: stats.capitalCajas, icon: Building2, path: "/cajas" },
                    { label: "Con cobradores", value: stats.efectivoCalle, icon: HandCoins, path: "/cobradores" },
                  ].map(({ label, value, icon: Icon, path }) => (
                    <button key={label} onClick={() => navigate(path)} className="w-full flex items-center justify-between py-2 border-b border-border/60 last:border-0 hover:text-primary transition-colors">
                      <span className="flex items-center gap-2 text-[12px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
                      <span className="text-[13px] font-semibold">{$$(value)}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <AnalyticsChartCard
            eyebrow="Pulso del negocio"
            title="Movimiento de los últimos 6 meses"
            description="Colocación, recuperación y mora en una sola lectura."
            meta={(
              <TrendPill
                value={`${Math.abs(stats.monthlyTrend.collected).toFixed(1)}%`}
                label="cobranza vs. mes anterior"
                tone={stats.monthlyTrend.collected >= 0 ? "positive" : "negative"}
              />
            )}
            action={<button onClick={() => navigate("/rentabilidad")} className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:opacity-75">Ver rentabilidad <ArrowRight className="h-3 w-3" /></button>}
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={stats.colocacionMes} margin={{ top: 12, right: 6, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardPlaced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ANALYTICS_COLORS.primary} stopOpacity={0.92} />
                    <stop offset="100%" stopColor={ANALYTICS_COLORS.primary} stopOpacity={0.34} />
                  </linearGradient>
                  <linearGradient id="dashboardCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ANALYTICS_COLORS.success} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={ANALYTICS_COLORS.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,.08)" }} content={<AnalyticsTooltip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 18 }} />
                <Bar dataKey="colocado" name="Colocado" fill="url(#dashboardPlaced)" barSize={18} radius={[6, 6, 2, 2]} />
                <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke={ANALYTICS_COLORS.success} fill="url(#dashboardCollected)" strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "white" }} />
                <Line type="monotone" dataKey="mora" name="Mora" stroke={ANALYTICS_COLORS.danger} strokeWidth={2.4} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </AnalyticsChartCard>
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB FINANCIERO — Indicadores, recuperación, rendimiento
            ════════════════════════════════════════════════════ */}
        <TabsContent value="financiero" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI large title="Capital Colocado" value={$$(stats.capitalColocado)} icon={DollarSign} accent="text-primary" sub={`${stats.totalActivos} préstamos`} />
            <KPI large title="Saldo por Cobrar" value={$$(stats.saldoPorCobrar)} icon={Wallet} accent="text-[hsl(217,91%,60%)]" sub={`${stats.cuotasPendientes} cuotas`} />
            <KPI large title="Total Cobrado" value={$$(stats.totalCobrado)} icon={TrendingUp} accent="text-success" sub={`Hoy: ${$$(stats.cobradoHoy)}`} />
            <KPI large title="Utilidad Bruta" value={$$(stats.gananciaNeta)} icon={CircleDollarSign} accent="text-success" sub="Interés + mora cobrados" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
            <KPI title="Tasa Recuperación" value={pct(stats.tasaRecuperacion)} icon={Target} accent="text-success" sub="Capital recup. / colocado" />
            <KPI title="Tasa Morosidad" value={pct(stats.tasaMorosidad)} icon={ShieldAlert} accent={stats.tasaMorosidad > 20 ? "text-destructive" : "text-warning"} sub="Vencido / por cobrar" trend={stats.tasaMorosidad > 20 ? "down" : null} />
            <KPI title="Eficiencia Cobranza" value={pct(stats.eficienciaCobranza)} icon={Activity} accent="text-[hsl(217,91%,60%)]" sub="Cobrado / total pagar" />
            <KPI title="Índice Mora" value={pct(stats.indiceMora)} icon={TrendingDown} accent={stats.indiceMora > 5 ? "text-destructive" : "text-success"} sub="Mora / capital" />
            <KPI title="Rendimiento" value={pct(stats.rendimientoCartera)} icon={BarChart3} accent="text-primary" sub="Interés / capital" />
            <KPI title="Cartera Vencida" value={pct(stats.carteraVencidaPct)} icon={AlertTriangle} accent={stats.carteraVencidaPct > 15 ? "text-destructive" : "text-warning"} sub="% del capital" />
          </div>

          {/* Desglose */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 md:gap-3">
            <KPI title="Capital Recuperado" value={$$(stats.capitalRecuperado)} icon={Banknote} accent="text-success" />
            <KPI title="Interés Cobrado" value={$$(stats.interesCobrado)} icon={Percent} accent="text-success" />
            <KPI title="Mora Cobrada" value={$$(stats.moraCobrada)} icon={DollarSign} accent="text-warning" />
            <KPI title="Interés Esperado" value={$$(stats.interesEsperado)} icon={Target} accent="text-primary" />
            <KPI title="Saldo Capital" value={$$(stats.saldoCapital)} icon={Scale} accent="text-[hsl(217,91%,60%)]" />
            <KPI title="Saldo Interés" value={$$(stats.saldoInteres)} icon={Percent} accent="text-[hsl(217,91%,60%)]" />
            <KPI title="Monto Vencido" value={$$(stats.montoVencido)} icon={ShieldAlert} accent="text-destructive" />
            <KPI title="Ticket Promedio" value={$$(stats.ticketPromedio)} icon={Receipt} accent="text-primary" />
          </div>

          {/* Progress bars */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Progreso de Recuperación</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {[
                  { label: "Capital", pct: stats.capitalColocado > 0 ? (stats.capitalRecuperado / stats.capitalColocado) * 100 : 0 },
                  { label: "Interés", pct: stats.interesEsperado > 0 ? (stats.interesCobrado / stats.interesEsperado) * 100 : 0 },
                  { label: "Cuotas", pct: stats.totalCuotas > 0 ? (stats.cuotasPagadas / stats.totalCuotas) * 100 : 0, extra: `${stats.cuotasPagadas}/${stats.totalCuotas}` },
                  { label: "Eficiencia", pct: stats.eficienciaCobranza },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-[12px] mb-1"><span className="text-muted-foreground">{item.label}</span><span className="font-medium">{item.extra || pct(item.pct)}</span></div>
                    <Progress value={Math.min(item.pct, 100)} className="h-2.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Comparativa mensual interés vs capital */}
          <AnalyticsChartCard
            eyebrow="Calidad del ingreso"
            title="Capital vs. ingreso financiero"
            description="Separa la recuperación de capital del interés y la mora cobrados."
            meta={<TrendPill value={pct(stats.rendimientoCartera)} label="rendimiento de cartera" tone="positive" />}
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={stats.colocacionMes} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="financialCapital" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ANALYTICS_COLORS.primary} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={ANALYTICS_COLORS.primary} stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="financialInterest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ANALYTICS_COLORS.success} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ANALYTICS_COLORS.success} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<AnalyticsTooltip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 18 }} />
                <Bar dataKey="capital" name="Capital recuperado" fill="url(#financialCapital)" barSize={19} radius={[6, 6, 2, 2]} />
                <Area type="monotone" dataKey="interes" name="Interés" stroke={ANALYTICS_COLORS.success} fill="url(#financialInterest)" strokeWidth={2.8} dot={false} />
                <Line type="monotone" dataKey="mora" name="Mora cobrada" stroke={ANALYTICS_COLORS.warning} strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </AnalyticsChartCard>
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB FLUJO — Efectivo, cajas, cobradores
            ════════════════════════════════════════════════════ */}
        <TabsContent value="flujo" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI large title="Capital en Cajas" value={$$(stats.capitalCajas)} icon={Landmark} accent="text-success" />
            <KPI large title="Efectivo en Calle" value={$$(stats.efectivoCalle)} icon={Clock} accent="text-warning" />
            <KPI large title="Liquidez Total" value={$$(stats.liquidezTotal)} icon={PiggyBank} accent="text-[hsl(217,91%,60%)]" sub="Cajas + calle" />
            <KPI large title="Cobrado Hoy" value={$$(stats.cobradoHoy)} icon={TrendingUp} accent="text-success" sub={`${stats.numPagosHoy} pagos`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cajas */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo en Cajas</CardTitle>
                  <button onClick={() => navigate("/cajas")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver cajas <ArrowRight className="h-3 w-3" /></button>
                </div>
              </CardHeader>
              <CardContent>
                {stats.cajasData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Sin cajas</p> : (
                  <div className="space-y-3">
                    {stats.cajasData.map((c) => (
                      <div key={c.nombre} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-muted-foreground" /><p className="text-[13px] font-medium">{c.nombre}</p></div>
                        <p className={cn("text-[13px] font-semibold", c.saldo > 0 ? "text-success" : "text-muted-foreground")}>{$$(c.saldo)}</p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <p className="text-[12px] font-semibold text-muted-foreground">TOTAL</p>
                      <p className="text-[14px] font-bold">{$$(stats.capitalCajas)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cobradores */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Rendimiento por Cobrador</CardTitle>
                  <button onClick={() => navigate("/cobradores")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver todos <ArrowRight className="h-3 w-3" /></button>
                </div>
              </CardHeader>
              <CardContent>
                {stats.cobradorStats.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Sin cobradores</p> : (
                  <div className="space-y-2">
                    {stats.cobradorStats.slice(0, 8).map((c) => (
                      <div key={c.nombre} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        <div className="min-w-0 flex-1"><p className="text-[13px] font-medium truncate">{c.nombre}</p><p className="text-[11px] text-muted-foreground">{c.prestamos} prést · Ef: {$$(c.efectivo)}</p></div>
                        <div className="text-right ml-3"><p className="text-[13px] font-semibold text-success">{$$(c.cobrado)}</p><p className="text-[10px] text-muted-foreground">Mora: {$$(c.mora)}</p></div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Cobrado por cobrador chart */}
          <AnalyticsChartCard
            eyebrow="Equipo de calle"
            title="Cobranza por cobrador"
            description="Compara lo recuperado frente al saldo aún asignado."
            action={<button onClick={() => navigate("/cobradores")} className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:opacity-75">Ver equipo <ArrowRight className="h-3 w-3" /></button>}
          >
            {stats.cobradoresChart.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.cobradoresChart} layout="vertical" barSize={12} barGap={5} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="collectorPaid" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={ANALYTICS_COLORS.success} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={ANALYTICS_COLORS.success} stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="collectorBalance" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={ANALYTICS_COLORS.primary} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={ANALYTICS_COLORS.primary} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" tick={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 }} width={78} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(148,163,184,.08)" }} content={<AnalyticsTooltip />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
                  <Bar dataKey="cobrado" name="Cobrado" fill="url(#collectorPaid)" radius={[0, 7, 7, 0]} />
                  <Bar dataKey="saldo" name="Saldo asignado" fill="url(#collectorBalance)" radius={[0, 7, 7, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </AnalyticsChartCard>

          {/* Cobranza mensual trend */}
          <AnalyticsChartCard
            eyebrow="Velocidad de recuperación"
            title="Tendencia de cobranza"
            description="Evolución mensual del efectivo recuperado."
            meta={<TrendPill value={`${Math.abs(stats.monthlyTrend.collected).toFixed(1)}%`} label="último mes" tone={stats.monthlyTrend.collected >= 0 ? "positive" : "negative"} />}
          >
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats.colocacionMes} margin={{ top: 12, right: 6, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="collectionTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ANALYTICS_COLORS.success} stopOpacity={0.36} />
                    <stop offset="100%" stopColor={ANALYTICS_COLORS.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<AnalyticsTooltip />} />
                <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke={ANALYTICS_COLORS.success} fill="url(#collectionTrend)" strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "white" }} />
              </AreaChart>
            </ResponsiveContainer>
          </AnalyticsChartCard>
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB PORTAFOLIO — Composición, estados, rutas
            ════════════════════════════════════════════════════ */}
        <TabsContent value="portafolio" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI large title="Total Préstamos" value={stats.totalPrestamos.toString()} icon={CreditCard} accent="text-primary" />
            <KPI large title="Activos" value={stats.totalActivos.toString()} icon={Activity} accent="text-success" sub={`Vencidos: ${stats.prestamosVencidos}`} />
            <KPI large title="Liquidados" value={stats.totalLiquidados.toString()} icon={Target} accent="text-[hsl(217,91%,60%)]" />
            <KPI large title="Jurídicos" value={stats.totalJuridicos.toString()} icon={ShieldAlert} accent="text-warning" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI title="Clientes Activos" value={stats.clientesActivos.toString()} icon={Users} accent="text-success" />
            <KPI title="Clientes en Mora" value={stats.clientesMora.toString()} icon={AlertTriangle} accent="text-destructive" />
            <KPI title="Cuota Promedio" value={$$(stats.cuotaPromedio)} icon={Receipt} accent="text-muted-foreground" />
            <KPI title="Promesas Pendientes" value={stats.promesasPendientes.toString()} icon={CalendarClock} accent="text-warning" sub={$$(stats.montoPromesasHoy)} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AnalyticsChartCard eyebrow="Composición" title="Estado de cartera" description="Distribución de préstamos por situación.">
              <DonutBreakdown
                data={stats.estadoPie}
                centerLabel="Préstamos"
                centerValue={stats.totalPrestamos.toLocaleString("es-MX")}
                valueFormatter={(value) => value.toLocaleString("es-MX")}
              />
            </AnalyticsChartCard>

            <AnalyticsChartCard eyebrow="Exposición" title="Composición del saldo" description="Qué parte corresponde a capital, interés y mora.">
              <DonutBreakdown
                data={stats.saldoPie}
                centerLabel="Por cobrar"
                centerValue={$$(stats.saldoPorCobrar)}
              />
            </AnalyticsChartCard>

            <AnalyticsChartCard eyebrow="Operación" title="Estado de cuotas" description="Cuotas pagadas, pendientes y vencidas.">
              <DonutBreakdown
                data={stats.cuotaStatusPie}
                centerLabel="Cuotas"
                centerValue={stats.totalCuotas.toLocaleString("es-MX")}
                valueFormatter={(value) => value.toLocaleString("es-MX")}
              />
            </AnalyticsChartCard>
          </div>

          {/* Frecuencia + Mora trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnalyticsChartCard eyebrow="Hábitos de pago" title="Frecuencia de cartera" description="Cómo se reparte la cartera activa por periodicidad.">
              <DonutBreakdown
                data={stats.freqPie}
                centerLabel="Activos"
                centerValue={stats.totalActivos.toLocaleString("es-MX")}
                valueFormatter={(value) => value.toLocaleString("es-MX")}
              />
            </AnalyticsChartCard>

            <AnalyticsChartCard
              eyebrow="Riesgo"
              title="Tendencia de mora"
              description="Mora recuperada por mes; menos exposición es mejor."
              meta={<TrendPill value={`${Math.abs(stats.monthlyTrend.arrears).toFixed(1)}%`} label="último mes" tone={stats.monthlyTrend.arrears <= 0 ? "positive" : "negative"} />}
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.colocacionMes} margin={{ top: 12, right: 6, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="arrearsTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ANALYTICS_COLORS.danger} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={ANALYTICS_COLORS.danger} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<AnalyticsTooltip />} />
                  <Area type="monotone" dataKey="mora" name="Mora" stroke={ANALYTICS_COLORS.danger} fill="url(#arrearsTrend)" strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "white" }} />
                </AreaChart>
              </ResponsiveContainer>
            </AnalyticsChartCard>
          </div>

          {/* Rutas */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo por Ruta</CardTitle>
                <button onClick={() => navigate("/rutas")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver rutas <ArrowRight className="h-3 w-3" /></button>
              </div>
            </CardHeader>
            <CardContent>
              {stats.rutaStats.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Sin rutas</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {stats.rutaStats.map((r) => (
                    <div key={r.nombre} className="flex items-center justify-between py-2 px-3 border rounded-lg">
                      <div><p className="text-[13px] font-medium">{r.nombre}</p><p className="text-[11px] text-muted-foreground">{r.prestamos} préstamos · Mora: {$$(r.mora)}</p></div>
                      <p className="text-[13px] font-semibold">{$$(r.saldo)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </div>
  );
}
