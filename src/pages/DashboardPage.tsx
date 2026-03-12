import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  DollarSign, TrendingUp, AlertTriangle, Clock, Users, Wallet,
  CalendarClock, Landmark, ArrowRight, Percent, ShieldAlert,
  Target, BarChart3, Activity, CircleDollarSign, Scale, TrendingDown,
  Banknote, PiggyBank, Receipt, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const $$ = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

// ── Data fetching ─────────────────────────────────────────────────
function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [
        { data: prestamos },
        { data: amort },
        { data: pagos },
        { data: cajas },
        { data: cobradores },
        { data: rutas },
        { data: clientes },
        { data: promesas },
      ] = await Promise.all([
        supabase.from("prestamos").select("id, monto_solicitado, monto_total_pagar, estado, fecha_registro, cobrador_id, ruta_id, caja_id, frecuencia, num_cuotas, tasa_interes, clientes(nombre_completo)"),
        supabase.from("amortizacion").select("prestamo_id, num_cuota, capital, interes, capital_interes, saldo_total, saldo_mora, saldo_capital, saldo_interes, status, fecha_vencimiento, mora, capital_pagado, interes_pagado, mora_pagada"),
        supabase.from("pagos").select("id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, created_at, cobrador_id, prestamo_id"),
        supabase.from("cajas").select("id, nombre, saldo_actual"),
        (supabase.from as any)("cobradores").select("id, nombre, efectivo_en_mano, activo, porcentaje_comision"),
        supabase.from("rutas").select("id, nombre, cobrador_id"),
        supabase.from("clientes").select("id, estado, created_at"),
        supabase.from("promesas_pago").select("id, monto_prometido, fecha_prometida, status"),
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
];

// ── KPI Card ──────────────────────────────────────────────────────
function KPI({ title, value, icon: Icon, accent, sub, trend }: {
  title: string; value: string; icon: any; accent: string; sub?: string; trend?: "up" | "down" | null;
}) {
  return (
    <div className="bg-card rounded-lg border border-border px-4 py-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <p className="text-lg font-semibold">{value}</p>
        {trend && (
          trend === "up"
            ? <ArrowUpRight className="h-3.5 w-3.5 text-success" />
            : <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
        )}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useDashboardData();

  const stats = useMemo(() => {
    if (!data) return null;
    const { prestamos, amort, pagos, cajas, cobradores, rutas, clientes, promesas, today } = data;

    // ── Categorías de préstamos ───────────────────────────────────
    const activos = prestamos.filter(p => ["Activo", "Al día", "Vencido"].includes(p.estado || ""));
    const liquidados = prestamos.filter(p => p.estado === "Liquidado");
    const cancelados = prestamos.filter(p => p.estado === "Cancelado");
    const juridicos = prestamos.filter(p => p.estado === "Juridico");

    const capitalColocado = activos.reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);
    const totalPagar = activos.reduce((s, p) => s + Number(p.monto_total_pagar || 0), 0);
    const interesEsperado = totalPagar - capitalColocado;

    // Capital total histórico colocado
    const capitalHistorico = prestamos.reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);

    const activeIds = new Set(activos.map(p => p.id));
    const amortActivos = amort.filter(a => activeIds.has(a.prestamo_id));

    // Saldo por cobrar
    const saldoPorCobrar = amortActivos.filter(a => a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);
    const saldoCapital = amortActivos.filter(a => a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_capital || 0), 0);
    const saldoInteres = amortActivos.filter(a => a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_interes || 0), 0);
    const moraTotal = amortActivos.reduce((s, a) => s + Number(a.saldo_mora || 0), 0);

    // Capital recuperado
    const capitalRecuperado = amortActivos.reduce((s, a) => s + Number(a.capital_pagado || 0), 0);
    const interesRecuperado = amortActivos.reduce((s, a) => s + Number(a.interes_pagado || 0), 0);
    const moraRecuperada = amortActivos.reduce((s, a) => s + Number(a.mora_pagada || 0), 0);

    const cuotasVencidas = amortActivos.filter(a => a.status === "Vencida" || (a.fecha_vencimiento < today && a.status !== "Pagada")).length;
    const cuotasPendientes = amortActivos.filter(a => a.status !== "Pagada").length;
    const cuotasPagadas = amortActivos.filter(a => a.status === "Pagada").length;
    const totalCuotas = amortActivos.length;
    const prestamosVencidos = prestamos.filter(p => p.estado === "Vencido").length;

    // Monto vencido (saldo de cuotas vencidas)
    const montoVencido = amortActivos.filter(a => a.fecha_vencimiento < today && a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);

    // Cobrado total
    const totalCobrado = pagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
    const capitalCobrado = pagos.reduce((s, p) => s + Number(p.aplicado_capital || 0), 0);
    const interesCobrado = pagos.reduce((s, p) => s + Number(p.aplicado_interes || 0), 0);
    const moraCobrada = pagos.reduce((s, p) => s + Number(p.aplicado_mora || 0), 0);

    // Cobrado hoy
    const pagosHoy = pagos.filter(p => p.created_at?.startsWith(today));
    const cobradoHoy = pagosHoy.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
    const numPagosHoy = pagosHoy.length;

    // Efectivo en calle & cajas
    const efectivoCalle = cobradores.reduce((s: number, c: any) => s + Number(c.efectivo_en_mano || 0), 0);
    const capitalCajas = cajas.reduce((s, c) => s + Number(c.saldo_actual || 0), 0);

    // ── Ratios financieros ────────────────────────────────────────
    const tasaRecuperacion = capitalColocado > 0 ? (capitalRecuperado / capitalColocado) * 100 : 0;
    const tasaMorosidad = saldoPorCobrar > 0 ? (montoVencido / saldoPorCobrar) * 100 : 0;
    const eficienciaCobranza = totalPagar > 0 ? (totalCobrado / totalPagar) * 100 : 0;
    const indiceMora = capitalColocado > 0 ? (moraTotal / capitalColocado) * 100 : 0;
    const rendimientoCartera = capitalColocado > 0 ? (interesRecuperado / capitalColocado) * 100 : 0;
    const ticketPromedio = activos.length > 0 ? capitalColocado / activos.length : 0;
    const cuotaPromedio = cuotasPendientes > 0 ? saldoPorCobrar / cuotasPendientes : 0;

    // Promesas de pago
    const promesasPendientes = promesas.filter(p => p.status === "Pendiente");
    const promesasHoy = promesasPendientes.filter(p => p.fecha_prometida <= today);
    const montoPromesasHoy = promesasHoy.reduce((s, p) => s + Number(p.monto_prometido || 0), 0);

    // Clientes
    const clientesActivos = clientes.filter((c: any) => c.estado === "Activo").length;
    const clientesMora = clientes.filter((c: any) => c.estado === "En mora").length;

    // Liquidez total = cajas + efectivo calle
    const liquidezTotal = capitalCajas + efectivoCalle;

    // Ganancia neta estimada = interés + mora cobrados
    const gananciaNeta = interesCobrado + moraCobrada;

    // Ratio cartera vencida
    const carteraVencidaPct = capitalColocado > 0 ? (montoVencido / capitalColocado) * 100 : 0;

    // ── Cuotas del día ────────────────────────────────────────────
    const cuotasHoy = amort
      .filter(a => a.fecha_vencimiento <= today && a.status !== "Pagada")
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
      .slice(0, 12)
      .map(a => {
        const prest = prestamos.find(p => p.id === a.prestamo_id);
        return {
          id: a.prestamo_id, cliente: (prest?.clientes as any)?.nombre_completo || "—",
          monto: Number(a.saldo_total || 0), cuota: `${a.num_cuota}`,
          status: a.status || "Pendiente", vencimiento: a.fecha_vencimiento,
        };
      });

    // ── Colocación por mes (últimos 6 meses) ──────────────────────
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const colocacionMes: { mes: string; colocado: number; cobrado: number; mora: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - 5 + i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
      const col = prestamos.filter(p => (p.fecha_registro || "").startsWith(ym)).reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);
      const cob = pagos.filter(p => (p.created_at || "").startsWith(ym)).reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      const mor = pagos.filter(p => (p.created_at || "").startsWith(ym)).reduce((s, p) => s + Number(p.aplicado_mora || 0), 0);
      colocacionMes.push({ mes: label, colocado: col, cobrado: cob, mora: mor });
    }

    // ── Mora por mes (area chart) ─────────────────────────────────
    const moraPorMes = colocacionMes.map(m => ({ mes: m.mes, mora: m.mora }));

    // ── Estado de cartera (pie) ───────────────────────────────────
    const estadoCount: Record<string, number> = {};
    for (const p of prestamos) { const e = p.estado || "Activo"; estadoCount[e] = (estadoCount[e] || 0) + 1; }
    const estadoPie = Object.entries(estadoCount).map(([name, value]) => ({ name, value }));

    // ── Composición del saldo (pie) ───────────────────────────────
    const saldoPie = [
      { name: "Capital", value: saldoCapital },
      { name: "Interés", value: saldoInteres },
      { name: "Mora", value: moraTotal },
    ].filter(s => s.value > 0);

    // ── Frecuencia de préstamos (pie) ─────────────────────────────
    const freqCount: Record<string, number> = {};
    for (const p of activos) { const f = p.frecuencia || "semanal"; freqCount[f] = (freqCount[f] || 0) + 1; }
    const freqPie = Object.entries(freqCount).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

    // ── Cobradores rendimiento ────────────────────────────────────
    const cobradorStats = cobradores.filter((c: any) => c.activo).map((c: any) => {
      const cobPagos = pagos.filter(p => p.cobrador_id === c.id);
      const totalCob = cobPagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      const prestamosAsignados = prestamos.filter(p => p.cobrador_id === c.id && ["Activo", "Al día", "Vencido"].includes(p.estado || "")).length;
      const saldoCob = amort.filter(a => {
        const pr = prestamos.find(p => p.id === a.prestamo_id);
        return pr?.cobrador_id === c.id && a.status !== "Pagada";
      }).reduce((s, a) => s + Number(a.saldo_total || 0), 0);
      const moraCob = amort.filter(a => {
        const pr = prestamos.find(p => p.id === a.prestamo_id);
        return pr?.cobrador_id === c.id;
      }).reduce((s, a) => s + Number(a.saldo_mora || 0), 0);
      return { nombre: c.nombre, cobrado: totalCob, prestamos: prestamosAsignados, efectivo: Number(c.efectivo_en_mano || 0), saldo: saldoCob, mora: moraCob };
    }).sort((a: any, b: any) => b.cobrado - a.cobrado);

    // ── Rutas resumen ─────────────────────────────────────────────
    const rutaStats = rutas.map((r: any) => {
      const prs = prestamos.filter(p => p.ruta_id === r.id && ["Activo", "Al día", "Vencido"].includes(p.estado || ""));
      const saldo = amort.filter(a => prs.some(p => p.id === a.prestamo_id) && a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);
      const mora = amort.filter(a => prs.some(p => p.id === a.prestamo_id)).reduce((s, a) => s + Number(a.saldo_mora || 0), 0);
      return { nombre: r.nombre, prestamos: prs.length, saldo, mora };
    }).sort((a: any, b: any) => b.saldo - a.saldo);

    const cajasData = cajas.map(c => ({ nombre: c.nombre, saldo: Number(c.saldo_actual || 0) }));

    // ── Cobradores bar chart ──────────────────────────────────────
    const cobradoresChart = cobradorStats.slice(0, 8).map((c: any) => ({ nombre: c.nombre.split(" ")[0], cobrado: c.cobrado, saldo: c.saldo }));

    return {
      capitalColocado, capitalHistorico, totalPagar, interesEsperado,
      saldoPorCobrar, saldoCapital, saldoInteres, moraTotal,
      capitalRecuperado, interesRecuperado, moraRecuperada,
      montoVencido, cuotasVencidas, cuotasPendientes, cuotasPagadas, totalCuotas,
      prestamosVencidos, totalCobrado, capitalCobrado, interesCobrado, moraCobrada,
      cobradoHoy, numPagosHoy, efectivoCalle, capitalCajas,
      tasaRecuperacion, tasaMorosidad, eficienciaCobranza, indiceMora,
      rendimientoCartera, ticketPromedio, cuotaPromedio,
      promesasPendientes: promesasPendientes.length, montoPromesasHoy,
      clientesActivos, clientesMora, liquidezTotal, gananciaNeta,
      carteraVencidaPct,
      totalPrestamos: prestamos.length, totalActivos: activos.length,
      totalLiquidados: liquidados.length, totalJuridicos: juridicos.length,
      cuotasHoy, colocacionMes, moraPorMes, estadoPie, saldoPie, freqPie,
      cobradorStats, rutaStats, cajasData, cobradoresChart,
    };
  }, [data]);

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-xl font-semibold">Dashboard</h1><p className="text-muted-foreground text-[13px]">Cargando datos...</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <Card key={i}><CardContent className="pt-5 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-[13px]">Panel de control financiero — toma decisiones inteligentes</p>
      </div>

      {/* ── SECCIÓN 1: KPIs Principales ──────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI title="Capital Colocado" value={$$(stats.capitalColocado)} icon={DollarSign} accent="text-primary" sub={`${stats.totalActivos} préstamos activos`} />
        <KPI title="Saldo por Cobrar" value={$$(stats.saldoPorCobrar)} icon={Wallet} accent="text-[hsl(217,91%,60%)]" sub={`${stats.cuotasPendientes} cuotas pendientes`} />
        <KPI title="Mora Acumulada" value={$$(stats.moraTotal)} icon={AlertTriangle} accent="text-destructive" sub={`${stats.cuotasVencidas} cuotas vencidas`} />
        <KPI title="Total Cobrado" value={$$(stats.totalCobrado)} icon={TrendingUp} accent="text-success" sub={`${stats.numPagosHoy} pagos hoy: ${$$(stats.cobradoHoy)}`} />
      </div>

      {/* ── SECCIÓN 2: Indicadores Financieros Clave ──────────────── */}
      <div>
        <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Indicadores Financieros</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI title="Tasa Recuperación" value={pct(stats.tasaRecuperacion)} icon={Target} accent="text-success" sub="Capital recuperado / colocado" />
          <KPI title="Tasa Morosidad" value={pct(stats.tasaMorosidad)} icon={ShieldAlert} accent={stats.tasaMorosidad > 20 ? "text-destructive" : "text-warning"} sub="Vencido / por cobrar" trend={stats.tasaMorosidad > 20 ? "down" : null} />
          <KPI title="Eficiencia Cobranza" value={pct(stats.eficienciaCobranza)} icon={Activity} accent="text-[hsl(217,91%,60%)]" sub="Cobrado / total a pagar" />
          <KPI title="Índice de Mora" value={pct(stats.indiceMora)} icon={TrendingDown} accent={stats.indiceMora > 5 ? "text-destructive" : "text-success"} sub="Mora / capital colocado" />
          <KPI title="Rendimiento Cartera" value={pct(stats.rendimientoCartera)} icon={BarChart3} accent="text-primary" sub="Interés cobrado / capital" />
          <KPI title="Cartera Vencida" value={pct(stats.carteraVencidaPct)} icon={AlertTriangle} accent={stats.carteraVencidaPct > 15 ? "text-destructive" : "text-warning"} sub="% del capital" />
        </div>
      </div>

      {/* ── SECCIÓN 3: Flujo de efectivo y montos ────────────────── */}
      <div>
        <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flujo de Efectivo</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI title="Capital en Cajas" value={$$(stats.capitalCajas)} icon={Landmark} accent="text-success" />
          <KPI title="Efectivo en Calle" value={$$(stats.efectivoCalle)} icon={Clock} accent="text-warning" />
          <KPI title="Liquidez Total" value={$$(stats.liquidezTotal)} icon={PiggyBank} accent="text-[hsl(217,91%,60%)]" sub="Cajas + calle" />
          <KPI title="Ganancia Neta" value={$$(stats.gananciaNeta)} icon={CircleDollarSign} accent="text-success" sub="Interés + mora cobrados" />
          <KPI title="Monto Vencido" value={$$(stats.montoVencido)} icon={ShieldAlert} accent="text-destructive" sub={`${stats.cuotasVencidas} cuotas`} />
          <KPI title="Ticket Promedio" value={$$(stats.ticketPromedio)} icon={Receipt} accent="text-primary" sub="Promedio por préstamo" />
        </div>
      </div>

      {/* ── SECCIÓN 4: Desglose de cobrado y pendiente ───────────── */}
      <div>
        <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Desglose del Portafolio</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <KPI title="Capital Recuperado" value={$$(stats.capitalRecuperado)} icon={Banknote} accent="text-success" />
          <KPI title="Interés Cobrado" value={$$(stats.interesCobrado)} icon={Percent} accent="text-success" />
          <KPI title="Mora Cobrada" value={$$(stats.moraCobrada)} icon={DollarSign} accent="text-warning" />
          <KPI title="Interés Esperado" value={$$(stats.interesEsperado)} icon={Target} accent="text-primary" />
          <KPI title="Saldo Capital" value={$$(stats.saldoCapital)} icon={Scale} accent="text-[hsl(217,91%,60%)]" />
          <KPI title="Saldo Interés" value={$$(stats.saldoInteres)} icon={Percent} accent="text-[hsl(217,91%,60%)]" />
          <KPI title="Cuota Promedio" value={$$(stats.cuotaPromedio)} icon={Receipt} accent="text-muted-foreground" />
          <KPI title="Promesas Hoy" value={$$(stats.montoPromesasHoy)} icon={CalendarClock} accent="text-warning" sub={`${stats.promesasPendientes} pendientes`} />
        </div>
      </div>

      {/* ── SECCIÓN 5: Resumen rápido con progress bars ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Progreso de Recuperación</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-[12px] mb-1"><span className="text-muted-foreground">Capital</span><span className="font-medium">{pct(stats.capitalColocado > 0 ? (stats.capitalRecuperado / stats.capitalColocado) * 100 : 0)}</span></div>
              <Progress value={stats.capitalColocado > 0 ? (stats.capitalRecuperado / stats.capitalColocado) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-[12px] mb-1"><span className="text-muted-foreground">Interés</span><span className="font-medium">{pct(stats.interesEsperado > 0 ? (stats.interesCobrado / stats.interesEsperado) * 100 : 0)}</span></div>
              <Progress value={stats.interesEsperado > 0 ? (stats.interesCobrado / stats.interesEsperado) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-[12px] mb-1"><span className="text-muted-foreground">Cuotas Pagadas</span><span className="font-medium">{stats.cuotasPagadas} / {stats.totalCuotas}</span></div>
              <Progress value={stats.totalCuotas > 0 ? (stats.cuotasPagadas / stats.totalCuotas) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-[12px] mb-1"><span className="text-muted-foreground">Eficiencia Cobranza</span><span className="font-medium">{pct(stats.eficienciaCobranza)}</span></div>
              <Progress value={stats.eficienciaCobranza} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumen de Cartera</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Total Préstamos", value: stats.totalPrestamos },
              { label: "Activos", value: stats.totalActivos, color: "text-success" },
              { label: "Vencidos", value: stats.prestamosVencidos, color: "text-destructive" },
              { label: "Liquidados", value: stats.totalLiquidados, color: "text-[hsl(217,91%,60%)]" },
              { label: "Jurídicos", value: stats.totalJuridicos, color: "text-warning" },
              { label: "Clientes Activos", value: stats.clientesActivos },
              { label: "Clientes en Mora", value: stats.clientesMora, color: "text-destructive" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                <p className="text-[12px] text-muted-foreground">{item.label}</p>
                <p className={cn("text-[13px] font-semibold", (item as any).color)}>{item.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Composición del saldo (pie) */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Composición del Saldo</CardTitle></CardHeader>
          <CardContent>
            {stats.saldoPie.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={stats.saldoPie} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} label={({ name, value }) => `${name}: ${$$(value)}`} labelLine={false} fontSize={10}>
                    {stats.saldoPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── SECCIÓN 6: Gráficas principales ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colocación vs Cobranza vs Mora (6 meses)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.colocacionMes} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                <Bar dataKey="colocado" name="Colocado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cobrado" name="Cobrado" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="mora" name="Mora" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estado de Cartera</CardTitle></CardHeader>
          <CardContent>
            {stats.estadoPie.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin préstamos</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={stats.estadoPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={11}>
                    {stats.estadoPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── SECCIÓN 7: Mora trend + Frecuencia + Cobradores bar ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tendencia de Mora</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.moraPorMes}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                <Area type="monotone" dataKey="mora" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

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
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cobrado por Cobrador</CardTitle></CardHeader>
          <CardContent>
            {stats.cobradoresChart.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.cobradoresChart} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="nombre" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={60} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                  <Bar dataKey="cobrado" name="Cobrado" fill="hsl(var(--success))" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── SECCIÓN 8: Cobradores detalle + Cuotas ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{c.nombre}</p>
                      <p className="text-[11px] text-muted-foreground">{c.prestamos} prést · Ef: {$$(c.efectivo)} · Mora: {$$(c.mora)}</p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-[13px] font-semibold text-success">{$$(c.cobrado)}</p>
                      <p className="text-[10px] text-muted-foreground">Saldo: {$$(c.saldo)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                    <div>
                      <p className="text-[13px] font-medium">{c.cliente}</p>
                      <p className="text-[11px] text-muted-foreground">Cuota #{c.cuota} · {c.vencimiento}</p>
                    </div>
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
      </div>

      {/* ── SECCIÓN 9: Rutas + Cajas ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo por Ruta</CardTitle>
              <button onClick={() => navigate("/rutas")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver rutas <ArrowRight className="h-3 w-3" /></button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.rutaStats.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Sin rutas</p> : (
              <div className="space-y-3">
                {stats.rutaStats.map((r: any) => (
                  <div key={r.nombre} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-[13px] font-medium">{r.nombre}</p>
                      <p className="text-[11px] text-muted-foreground">{r.prestamos} préstamos · Mora: {$$(r.mora)}</p>
                    </div>
                    <p className="text-[13px] font-semibold">{$$(r.saldo)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                  <p className="text-[12px] font-semibold text-muted-foreground">TOTAL LIQUIDEZ</p>
                  <p className="text-[14px] font-bold">{$$(stats.liquidezTotal)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
