import { useState, useMemo } from "react";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
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
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  DollarSign, TrendingUp, AlertTriangle, Clock, Users, Wallet,
  CalendarClock, Landmark, ArrowRight, Percent, ShieldAlert,
  Target, BarChart3, Activity, CircleDollarSign, Scale, TrendingDown,
  Banknote, PiggyBank, Receipt, ArrowUpRight, ArrowDownRight,
  CalendarIcon, Filter, X, Gauge, Eye, CreditCard, BadgeDollarSign,
} from "lucide-react";
import { cn, $$, fmtDate } from "@/lib/utils";

const pct = (n: number) => `${n.toFixed(1)}%`;

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

// ── Data fetching ─────────────────────────────────────────────────
function useDashboardData(empresaId: string) {
  return useQuery({
    queryKey: ["dashboard", empresaId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [
        { data: prestamos }, { data: amort }, { data: pagos },
        { data: cajas }, { data: cobradores }, { data: rutas },
        { data: clientes }, { data: promesas },
      ] = await Promise.all([
        supabase.from("prestamos").select("id, monto_solicitado, monto_total_pagar, estado, fecha_registro, cobrador_id, ruta_id, caja_id, frecuencia, num_cuotas, tasa_interes, clientes(nombre_completo)").eq("empresa_id", empresaId),
        supabase.from("amortizacion").select("prestamo_id, num_cuota, capital, interes, capital_interes, saldo_total, saldo_mora, saldo_capital, saldo_interes, status, fecha_vencimiento, mora, capital_pagado, interes_pagado, mora_pagada").eq("empresa_id", empresaId),
        supabase.from("pagos").select("id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, created_at, cobrador_id, prestamo_id, caja_id, ruta_id").eq("empresa_id", empresaId),
        supabase.from("cajas").select("id, nombre, saldo_actual").eq("empresa_id", empresaId),
        supabase.from("profiles").select("id, nombre_completo, efectivo_en_mano, activo, porcentaje_comision").eq("empresa_id", empresaId),
        supabase.from("rutas").select("id, nombre, cobrador_id").eq("empresa_id", empresaId),
        supabase.from("clientes").select("id, estado, created_at").eq("empresa_id", empresaId),
        supabase.from("promesas_pago").select("id, monto_prometido, fecha_prometida, status").eq("empresa_id", empresaId),
      ]);
      return {
        prestamos: prestamos || [], amort: amort || [], pagos: pagos || [],
        cajas: cajas || [], cobradores: cobradores || [], rutas: rutas || [],
        clientes: clientes || [], promesas: promesas || [], today,
      };
    },
    refetchInterval: 60_000,
  });
}

const statusColor: Record<string, string> = {
  Pendiente: "bg-muted text-muted-foreground",
  Vencida: "bg-badge-vencido text-badge-vencido-foreground",
  Prometida: "bg-badge-prometido text-badge-prometido-foreground",
  Pagada: "bg-badge-activo text-badge-activo-foreground",
  Parcial: "bg-badge-aldia text-badge-aldia-foreground",
};

const PIE_COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))",
  "hsl(var(--destructive))", "hsl(217, 91%, 60%)", "hsl(280, 67%, 55%)",
  "hsl(32, 95%, 50%)",
];

function KPI({ title, value, icon: Icon, accent, sub, trend, large }: {
  title: string; value: string; icon: any; accent: string; sub?: string;
  trend?: "up" | "down" | null; large?: boolean;
}) {
  return (
    <div className={cn(
      "bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]",
      large ? "px-5 py-4" : "px-4 py-3",
    )}>
      <div className="flex items-center justify-between">
        <p className={cn("font-medium text-muted-foreground uppercase tracking-wider", large ? "text-[12px]" : "text-[11px]")}>{title}</p>
        <Icon className={cn(large ? "h-5 w-5" : "h-4 w-4", accent)} />
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

// ── Sparkline mini component ──
function MiniSpark({ data, dataKey, color, height = 50 }: { data: any[]; dataKey: string; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Visual KPI with sparkline ──
function VisualKPI({ title, value, sub, data, dataKey, color, icon: Icon, accent }: {
  title: string; value: string; sub?: string; data: any[]; dataKey: string;
  color: string; icon: any; accent: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <Icon className={cn("h-4 w-4", accent)} />
          </div>
          <p className="text-xl font-bold mt-0.5">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        <MiniSpark data={data} dataKey={dataKey} color={color} height={55} />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const { data, isLoading } = useDashboardData(empresaId);

  const [fechaDesde, setFechaDesde] = useState<Date | undefined>();
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>();
  const [filtroRuta, setFiltroRuta] = useState<string>("__all__");
  const [filtroCobrador, setFiltroCobrador] = useState<string>("__all__");
  const [filtroCaja, setFiltroCaja] = useState<string>("__all__");

  const hasFilters = fechaDesde || fechaHasta || filtroRuta !== "__all__" || filtroCobrador !== "__all__" || filtroCaja !== "__all__";
  const clearFilters = () => { setFechaDesde(undefined); setFechaHasta(undefined); setFiltroRuta("__all__"); setFiltroCobrador("__all__"); setFiltroCaja("__all__"); };
  const setPreset = (days: number) => { const now = new Date(); const from = new Date(); from.setDate(now.getDate() - days); setFechaDesde(from); setFechaHasta(now); };

  const stats = useMemo(() => {
    if (!data) return null;
    const { prestamos: allPrestamos, amort: allAmort, pagos: allPagos, cajas, cobradores, rutas, clientes, promesas, today } = data;

    const desdeStr = fechaDesde ? fechaDesde.toISOString().slice(0, 10) : null;
    const hastaStr = fechaHasta ? fechaHasta.toISOString().slice(0, 10) : null;

    let prestamos = allPrestamos.filter(p => {
      if (filtroRuta !== "__all__" && p.ruta_id !== filtroRuta) return false;
      if (filtroCobrador !== "__all__" && p.cobrador_id !== filtroCobrador) return false;
      if (filtroCaja !== "__all__" && p.caja_id !== filtroCaja) return false;
      if (desdeStr && (p.fecha_registro || "") < desdeStr) return false;
      if (hastaStr && (p.fecha_registro || "") > hastaStr) return false;
      return true;
    });

    const prestamoIds = new Set(prestamos.map(p => p.id));
    let amort = allAmort.filter(a => prestamoIds.has(a.prestamo_id));
    let pagos = allPagos.filter(p => {
      if (!prestamoIds.has(p.prestamo_id)) return false;
      if (filtroCobrador !== "__all__" && p.cobrador_id !== filtroCobrador) return false;
      if (filtroCaja !== "__all__" && p.caja_id !== filtroCaja) return false;
      if (filtroRuta !== "__all__" && p.ruta_id !== filtroRuta) return false;
      const pDate = (p.created_at || "").slice(0, 10);
      if (desdeStr && pDate < desdeStr) return false;
      if (hastaStr && pDate > hastaStr) return false;
      return true;
    });

    const activos = prestamos.filter(p => ["Activo", "Al día", "Vencido"].includes(p.estado || ""));
    const liquidados = prestamos.filter(p => p.estado === "Liquidado");
    const juridicos = prestamos.filter(p => p.estado === "Juridico");

    const capitalColocado = activos.reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);
    const totalPagar = activos.reduce((s, p) => s + Number(p.monto_total_pagar || 0), 0);
    const interesEsperado = totalPagar - capitalColocado;

    const activeIds = new Set(activos.map(p => p.id));
    const amortActivos = amort.filter(a => activeIds.has(a.prestamo_id));

    const saldoPorCobrar = amortActivos.filter(a => a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);
    const saldoCapital = amortActivos.filter(a => a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_capital || 0), 0);
    const saldoInteres = amortActivos.filter(a => a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_interes || 0), 0);
    const moraTotal = amortActivos.reduce((s, a) => s + Number(a.saldo_mora || 0), 0);

    const capitalRecuperado = amortActivos.reduce((s, a) => s + Number(a.capital_pagado || 0), 0);
    const interesRecuperado = amortActivos.reduce((s, a) => s + Number(a.interes_pagado || 0), 0);
    const moraRecuperada = amortActivos.reduce((s, a) => s + Number(a.mora_pagada || 0), 0);

    const cuotasVencidas = amortActivos.filter(a => a.status === "Vencida" || (a.fecha_vencimiento < today && a.status !== "Pagada")).length;
    const cuotasPendientes = amortActivos.filter(a => a.status !== "Pagada").length;
    const cuotasPagadas = amortActivos.filter(a => a.status === "Pagada").length;
    const totalCuotas = amortActivos.length;
    const prestamosVencidos = prestamos.filter(p => p.estado === "Vencido").length;
    const montoVencido = amortActivos.filter(a => a.fecha_vencimiento < today && a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);

    const totalCobrado = pagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
    const capitalCobrado = pagos.reduce((s, p) => s + Number(p.aplicado_capital || 0), 0);
    const interesCobrado = pagos.reduce((s, p) => s + Number(p.aplicado_interes || 0), 0);
    const moraCobrada = pagos.reduce((s, p) => s + Number(p.aplicado_mora || 0), 0);

    const pagosHoy = pagos.filter(p => p.created_at?.startsWith(today));
    const cobradoHoy = pagosHoy.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
    const numPagosHoy = pagosHoy.length;

    const efectivoCalle = cobradores.reduce((s: number, c: any) => s + Number(c.efectivo_en_mano || 0), 0);
    const capitalCajas = cajas.reduce((s, c) => s + Number(c.saldo_actual || 0), 0);

    const tasaRecuperacion = capitalColocado > 0 ? (capitalRecuperado / capitalColocado) * 100 : 0;
    const tasaMorosidad = saldoPorCobrar > 0 ? (montoVencido / saldoPorCobrar) * 100 : 0;
    const eficienciaCobranza = totalPagar > 0 ? (totalCobrado / totalPagar) * 100 : 0;
    const indiceMora = capitalColocado > 0 ? (moraTotal / capitalColocado) * 100 : 0;
    const rendimientoCartera = capitalColocado > 0 ? (interesRecuperado / capitalColocado) * 100 : 0;
    const ticketPromedio = activos.length > 0 ? capitalColocado / activos.length : 0;
    const cuotaPromedio = cuotasPendientes > 0 ? saldoPorCobrar / cuotasPendientes : 0;
    const carteraVencidaPct = capitalColocado > 0 ? (montoVencido / capitalColocado) * 100 : 0;

    const promesasPendientes = promesas.filter(p => p.status === "Pendiente");
    const promesasHoy = promesasPendientes.filter(p => p.fecha_prometida <= today);
    const montoPromesasHoy = promesasHoy.reduce((s, p) => s + Number(p.monto_prometido || 0), 0);

    const clientesActivos = clientes.filter((c: any) => c.estado === "Activo").length;
    const clientesMora = clientes.filter((c: any) => c.estado === "En mora").length;
    const liquidezTotal = capitalCajas + efectivoCalle;
    const gananciaNeta = interesCobrado + moraCobrada;

    // Cuotas del día
    const cuotasHoy = amort
      .filter(a => prestamoIds.has(a.prestamo_id) && a.fecha_vencimiento <= today && a.status !== "Pagada")
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
      .slice(0, 12)
      .map(a => {
        const prest = allPrestamos.find(p => p.id === a.prestamo_id);
        return { id: a.prestamo_id, cliente: (prest?.clientes as any)?.nombre_completo || "—", monto: Number(a.saldo_total || 0), cuota: `${a.num_cuota}`, status: a.status || "Pendiente", vencimiento: a.fecha_vencimiento };
      });

    // Colocación por mes (6 meses)
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const colocacionMes: { mes: string; colocado: number; cobrado: number; mora: number; interes: number; capital: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - 5 + i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
      const col = prestamos.filter(p => (p.fecha_registro || "").startsWith(ym)).reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);
      const mesPagos = pagos.filter(p => (p.created_at || "").startsWith(ym));
      const cob = mesPagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      const mor = mesPagos.reduce((s, p) => s + Number(p.aplicado_mora || 0), 0);
      const int = mesPagos.reduce((s, p) => s + Number(p.aplicado_interes || 0), 0);
      const cap = mesPagos.reduce((s, p) => s + Number(p.aplicado_capital || 0), 0);
      colocacionMes.push({ mes: label, colocado: col, cobrado: cob, mora: mor, interes: int, capital: cap });
    }

    // Pies
    const estadoCount: Record<string, number> = {};
    for (const p of prestamos) { const e = p.estado || "Activo"; estadoCount[e] = (estadoCount[e] || 0) + 1; }
    const estadoPie = Object.entries(estadoCount).map(([name, value]) => ({ name, value }));
    const saldoPie = [{ name: "Capital", value: saldoCapital }, { name: "Interés", value: saldoInteres }, { name: "Mora", value: moraTotal }].filter(s => s.value > 0);
    const freqCount: Record<string, number> = {};
    for (const p of activos) { const f = p.frecuencia || "semanal"; freqCount[f] = (freqCount[f] || 0) + 1; }
    const freqPie = Object.entries(freqCount).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

    // Cuota status pie
    const cuotaStatusCount: Record<string, number> = {};
    for (const c of amortActivos) { const s = c.status || "Pendiente"; cuotaStatusCount[s] = (cuotaStatusCount[s] || 0) + 1; }
    const cuotaStatusPie = Object.entries(cuotaStatusCount).map(([name, value]) => ({ name, value }));

    // Cobradores
    const cobradorStats = cobradores.filter((c: any) => c.activo).map((c: any) => {
      const cobPagos = pagos.filter(p => p.cobrador_id === c.id);
      const totalCob2 = cobPagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      const prestamosAsignados = prestamos.filter(p => p.cobrador_id === c.id && ["Activo", "Al día", "Vencido"].includes(p.estado || "")).length;
      const saldoCob = amort.filter(a => { const pr = prestamos.find(p2 => p2.id === a.prestamo_id); return pr?.cobrador_id === c.id && a.status !== "Pagada"; }).reduce((s, a) => s + Number(a.saldo_total || 0), 0);
      const moraCob = amort.filter(a => { const pr = prestamos.find(p2 => p2.id === a.prestamo_id); return pr?.cobrador_id === c.id; }).reduce((s, a) => s + Number(a.saldo_mora || 0), 0);
      return { nombre: c.nombre_completo || c.nombre, cobrado: totalCob2, prestamos: prestamosAsignados, efectivo: Number(c.efectivo_en_mano || 0), saldo: saldoCob, mora: moraCob };
    }).sort((a: any, b: any) => b.cobrado - a.cobrado);

    const rutaStats = rutas.map((r: any) => {
      const prs = prestamos.filter(p => p.ruta_id === r.id && ["Activo", "Al día", "Vencido"].includes(p.estado || ""));
      const saldo = amort.filter(a => prs.some(p => p.id === a.prestamo_id) && a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);
      const mora = amort.filter(a => prs.some(p => p.id === a.prestamo_id)).reduce((s, a) => s + Number(a.saldo_mora || 0), 0);
      return { nombre: r.nombre, prestamos: prs.length, saldo, mora };
    }).sort((a: any, b: any) => b.saldo - a.saldo);

    const cajasData = cajas.map(c => ({ nombre: c.nombre, saldo: Number(c.saldo_actual || 0) }));
    const cobradoresChart = cobradorStats.slice(0, 8).map((c: any) => ({ nombre: c.nombre.split(" ")[0], cobrado: c.cobrado, saldo: c.saldo }));

    return {
      capitalColocado, totalPagar, interesEsperado, saldoPorCobrar, saldoCapital, saldoInteres, moraTotal,
      capitalRecuperado, interesRecuperado, moraRecuperada, montoVencido, cuotasVencidas, cuotasPendientes,
      cuotasPagadas, totalCuotas, prestamosVencidos, totalCobrado, capitalCobrado, interesCobrado, moraCobrada,
      cobradoHoy, numPagosHoy, efectivoCalle, capitalCajas, tasaRecuperacion, tasaMorosidad, eficienciaCobranza,
      indiceMora, rendimientoCartera, ticketPromedio, cuotaPromedio, promesasPendientes: promesasPendientes.length,
      montoPromesasHoy, clientesActivos, clientesMora, liquidezTotal, gananciaNeta, carteraVencidaPct,
      totalPrestamos: prestamos.length, totalActivos: activos.length, totalLiquidados: liquidados.length,
      totalJuridicos: juridicos.length, cuotasHoy, colocacionMes,
      estadoPie, saldoPie, freqPie, cuotaStatusPie,
      cobradorStats, rutaStats, cajasData, cobradoresChart,
    };
  }, [data, fechaDesde, fechaHasta, filtroRuta, filtroCobrador, filtroCaja]);

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
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-[13px]">Panel de control — toma decisiones inteligentes</p>
        </div>
      </div>

      {/* ── FILTROS ─────────────────────────────────────────── */}
      {/* Desktop filters */}
      <div className="hidden md:block bg-card rounded-lg border border-border p-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mr-1">Filtros:</span>
          <div className="flex items-center gap-1">
            {[{ label: "Hoy", days: 0 }, { label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }].map(p => (
              <Button key={p.label} variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => p.days === 0 ? (() => { const t = new Date(); setFechaDesde(t); setFechaHasta(t); })() : setPreset(p.days)}>
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
              {(data?.rutas || []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroCobrador} onValueChange={setFiltroCobrador}>
            <SelectTrigger className="h-8 w-[140px] text-[12px]"><SelectValue placeholder="Cobrador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(data?.cobradores || []).filter((c: any) => c.activo).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre_completo}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroCaja} onValueChange={setFiltroCaja}>
            <SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue placeholder="Caja" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas cajas</SelectItem>
              {(data?.cajas || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
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
            <Button key={p.label} variant="outline" size="sm" className="h-7 text-[11px] px-2.5 shrink-0" onClick={() => p.days === 0 ? (() => { const t = new Date(); setFechaDesde(t); setFechaHasta(t); })() : setPreset(p.days)}>
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
              {(data?.rutas || []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroCobrador} onValueChange={setFiltroCobrador}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Cobrador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(data?.cobradores || []).filter((c: any) => c.activo).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre_completo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

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
            TAB PRINCIPAL — Super visual, sparklines
            ════════════════════════════════════════════════════ */}
        <TabsContent value="principal" className="mt-4 space-y-4">
          {/* Hero KPIs with sparklines */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <VisualKPI title="Colocación" value={$$(stats.capitalColocado)} sub={`${stats.totalActivos} préstamos activos`}
              data={stats.colocacionMes} dataKey="colocado" color="hsl(var(--primary))" icon={DollarSign} accent="text-primary" />
            <VisualKPI title="Recuperación" value={$$(stats.totalCobrado)} sub={`Hoy: ${$$(stats.cobradoHoy)} (${stats.numPagosHoy} pagos)`}
              data={stats.colocacionMes} dataKey="cobrado" color="hsl(var(--success))" icon={TrendingUp} accent="text-success" />
            <VisualKPI title="Mora Acumulada" value={$$(stats.moraTotal)} sub={`${stats.cuotasVencidas} cuotas vencidas`}
              data={stats.colocacionMes} dataKey="mora" color="hsl(var(--destructive))" icon={AlertTriangle} accent="text-destructive" />
            <VisualKPI title="Interés Ganado" value={$$(stats.interesCobrado)} sub={`Rendimiento: ${pct(stats.rendimientoCartera)}`}
              data={stats.colocacionMes} dataKey="interes" color="hsl(217, 91%, 60%)" icon={Percent} accent="text-[hsl(217,91%,60%)]" />
          </div>

          {/* Colocación vs Cobranza — big chart */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colocación vs Recuperación vs Mora (6 meses)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.colocacionMes} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="colocado" name="Colocado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cobrado" name="Cobrado" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="mora" name="Mora" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gauges row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Tasa Recuperación", pct: stats.tasaRecuperacion, color: "text-success" },
              { label: "Eficiencia Cobranza", pct: stats.eficienciaCobranza, color: "text-[hsl(217,91%,60%)]" },
              { label: "Tasa Morosidad", pct: stats.tasaMorosidad, color: stats.tasaMorosidad > 20 ? "text-destructive" : "text-warning" },
              { label: "Cuotas Cobradas", pct: stats.totalCuotas > 0 ? (stats.cuotasPagadas / stats.totalCuotas) * 100 : 0, color: "text-primary", extra: `${stats.cuotasPagadas}/${stats.totalCuotas}` },
            ].map(item => (
              <Card key={item.label}>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{item.label}</p>
                  <p className={cn("text-2xl font-bold mt-1", item.color)}>{(item as any).extra || pct(item.pct)}</p>
                  <Progress value={Math.min(item.pct, 100)} className="h-2 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cuotas Pendientes / Vencidas</CardTitle>
                  <button onClick={() => navigate("/pagos")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver pagos <ArrowRight className="h-3 w-3" /></button>
                </div>
              </CardHeader>
              <CardContent>
                {stats.cuotasHoy.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No hay cuotas pendientes</p> : (
                  <div className="space-y-2">
                    {stats.cuotasHoy.map((c, i) => (
                      <div key={`${c.id}-${i}`} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/30 px-1 rounded" onClick={() => navigate(`/prestamos/${c.id}`)}>
                        <div><p className="text-[13px] font-medium">{c.cliente}</p><p className="text-[11px] text-muted-foreground">Cuota #{c.cuota} · {c.vencimiento}</p></div>
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold">{$$(c.monto)}</p>
                          <Badge className={cn("text-[10px]", statusColor[c.status] || statusColor.Pendiente)}>{c.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumen Rápido</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Total Préstamos", value: stats.totalPrestamos.toString() },
                  { label: "Activos", value: stats.totalActivos.toString(), color: "text-success" },
                  { label: "Vencidos", value: stats.prestamosVencidos.toString(), color: "text-destructive" },
                  { label: "Liquidados", value: stats.totalLiquidados.toString(), color: "text-[hsl(217,91%,60%)]" },
                  { label: "Jurídicos", value: stats.totalJuridicos.toString(), color: "text-warning" },
                  { label: "Clientes Activos", value: stats.clientesActivos.toString() },
                  { label: "Clientes en Mora", value: stats.clientesMora.toString(), color: "text-destructive" },
                  { label: "Promesas Hoy", value: `${$$(stats.montoPromesasHoy)} (${stats.promesasPendientes})`, color: "text-warning" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                    <p className="text-[12px] text-muted-foreground">{item.label}</p>
                    <p className={cn("text-[13px] font-semibold", (item as any).color)}>{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB FINANCIERO — Indicadores, recuperación, rendimiento
            ════════════════════════════════════════════════════ */}
        <TabsContent value="financiero" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI large title="Capital Colocado" value={$$(stats.capitalColocado)} icon={DollarSign} accent="text-primary" sub={`${stats.totalActivos} préstamos`} />
            <KPI large title="Saldo por Cobrar" value={$$(stats.saldoPorCobrar)} icon={Wallet} accent="text-[hsl(217,91%,60%)]" sub={`${stats.cuotasPendientes} cuotas`} />
            <KPI large title="Total Cobrado" value={$$(stats.totalCobrado)} icon={TrendingUp} accent="text-success" sub={`Hoy: ${$$(stats.cobradoHoy)}`} />
            <KPI large title="Ganancia Neta" value={$$(stats.gananciaNeta)} icon={CircleDollarSign} accent="text-success" sub="Interés + mora cobrados" />
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
                    <div className="flex justify-between text-[12px] mb-1"><span className="text-muted-foreground">{item.label}</span><span className="font-medium">{(item as any).extra || pct(item.pct)}</span></div>
                    <Progress value={Math.min(item.pct, 100)} className="h-2.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Comparativa mensual interés vs capital */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Capital vs Interés Cobrado (6 meses)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.colocacionMes} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="capital" name="Capital" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="interes" name="Interés" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="mora" name="Mora" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
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
                    {stats.cajasData.map((c: any) => (
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
                    {stats.cobradorStats.slice(0, 8).map((c: any) => (
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
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cobrado por Cobrador</CardTitle></CardHeader>
            <CardContent>
              {stats.cobradoresChart.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.cobradoresChart} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="nombre" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={70} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="cobrado" name="Cobrado" fill="hsl(var(--success))" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="saldo" name="Saldo" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Cobranza mensual trend */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tendencia de Cobranza (6 meses)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.colocacionMes}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                  <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
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
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estado de Cartera</CardTitle></CardHeader>
              <CardContent>
                {stats.estadoPie.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={stats.estadoPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={10}>
                        {stats.estadoPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Composición del Saldo</CardTitle></CardHeader>
              <CardContent>
                {stats.saldoPie.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={stats.saldoPie} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={80} label={({ name, value }) => `${name}: ${$$(value)}`} labelLine={false} fontSize={10}>
                        {stats.saldoPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estado de Cuotas</CardTitle></CardHeader>
              <CardContent>
                {stats.cuotaStatusPie.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={stats.cuotaStatusPie} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={75} label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={10}>
                        {stats.cuotaStatusPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Frecuencia + Mora trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Frecuencia de Pago</CardTitle></CardHeader>
              <CardContent>
                {stats.freqPie.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={stats.freqPie} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={10}>
                        {stats.freqPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tendencia de Mora</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stats.colocacionMes}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                    <Area type="monotone" dataKey="mora" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
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
                  {stats.rutaStats.map((r: any) => (
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
