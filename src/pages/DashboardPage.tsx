import { useState, useMemo } from "react";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
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
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  DollarSign, TrendingUp, AlertTriangle, Clock, Users, Wallet,
  CalendarClock, Landmark, ArrowRight, Percent, ShieldAlert,
  Target, BarChart3, Activity, CircleDollarSign, Scale, TrendingDown,
  Banknote, PiggyBank, Receipt, ArrowUpRight, ArrowDownRight,
  CalendarIcon, Filter, X, Eye, CreditCard, BadgeDollarSign,
  MapPin, Phone, ChevronRight, HandCoins, Building2, CircleAlert,
  Plus, CheckCircle2,
} from "lucide-react";
import { cn, $$, fmtDate } from "@/lib/utils";

const pct = (n: number) => `${n.toFixed(1)}%`;

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

type DashboardMovimiento = {
  tipo?: string | null;
  monto?: number | null;
  concepto?: string | null;
  created_at?: string | null;
  caja_id?: string | null;
};

type DashboardRuta = { id: string; nombre: string };
type DashboardCobrador = { id: string; nombre_completo?: string | null; nombre?: string | null };
type DashboardCliente = {
  nombre_completo?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
};
type DashboardPrestamo = {
  id: string;
  ruta_id?: string | null;
  cobrador_id?: string | null;
  clientes?: DashboardCliente | DashboardCliente[] | null;
};

// ── Data fetching ─────────────────────────────────────────────────
function useDashboardData(empresaId: string) {
  return useQuery({
    queryKey: ["dashboard", empresaId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [
        prestamos, amort, pagos,
        { data: cajas }, { data: cobradores }, { data: rutas },
        clientes, promesas, movimientos,
      ] = await Promise.all([
        fetchAllRows(supabase.from("prestamos").select("id, cliente_id, monto_solicitado, monto_total_pagar, estado, fecha_registro, cobrador_id, ruta_id, caja_id, frecuencia, num_cuotas, tasa_interes, clientes(nombre_completo, telefono, direccion, gps_lat, gps_lng)").eq("empresa_id", empresaId)),
        fetchAllRows(supabase.from("amortizacion").select("prestamo_id, num_cuota, capital, interes, capital_interes, saldo_total, saldo_mora, saldo_capital, saldo_interes, status, fecha_vencimiento, mora, capital_pagado, interes_pagado, mora_pagada").eq("empresa_id", empresaId)),
        fetchAllRows(supabase.from("pagos").select("id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, created_at, cobrador_id, prestamo_id, caja_id, ruta_id").eq("empresa_id", empresaId)),
        supabase.from("cajas").select("id, nombre, saldo_actual").eq("empresa_id", empresaId),
        supabase.from("profiles").select("id, nombre_completo, efectivo_en_mano, activo, porcentaje_comision").eq("empresa_id", empresaId),
        supabase.from("rutas").select("id, nombre, cobrador_id").eq("empresa_id", empresaId),
        fetchAllRows(supabase.from("clientes").select("id, estado, created_at").eq("empresa_id", empresaId)),
        fetchAllRows(supabase.from("promesas_pago").select("id, monto_prometido, fecha_prometida, status").eq("empresa_id", empresaId)),
        fetchAllRows(supabase.from("movimientos_caja").select("id, tipo, monto, concepto, created_at, caja_id").eq("empresa_id", empresaId)),
      ]);
      return {
        prestamos: prestamos || [], amort: amort || [], pagos: pagos || [],
        cajas: cajas || [], cobradores: cobradores || [], rutas: rutas || [],
        clientes: clientes || [], promesas: promesas || [], movimientos: movimientos || [], today,
      };
    },
    staleTime: 1000 * 60 * 3, // 3 min cache
  });
}

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

export default function DashboardPage() {
  const navigate = useNavigate();
  const { empresaId, empresaNombre } = useEmpresa();
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
    const { prestamos: allPrestamos, amort: allAmort, pagos: allPagos, cajas, cobradores, rutas, clientes, promesas, movimientos, today } = data;

    const desdeStr = fechaDesde ? fechaDesde.toISOString().slice(0, 10) : null;
    const hastaStr = fechaHasta ? fechaHasta.toISOString().slice(0, 10) : null;

    const prestamos = allPrestamos.filter(p => {
      if (filtroRuta !== "__all__" && p.ruta_id !== filtroRuta) return false;
      if (filtroCobrador !== "__all__" && p.cobrador_id !== filtroCobrador) return false;
      if (filtroCaja !== "__all__" && p.caja_id !== filtroCaja) return false;
      if (desdeStr && (p.fecha_registro || "") < desdeStr) return false;
      if (hastaStr && (p.fecha_registro || "") > hastaStr) return false;
      return true;
    });

    const prestamoIds = new Set(prestamos.map(p => p.id));
    const amort = allAmort.filter(a => prestamoIds.has(a.prestamo_id));
    const pagos = allPagos.filter(p => {
      if (!prestamoIds.has(p.prestamo_id)) return false;
      if (filtroCobrador !== "__all__" && p.cobrador_id !== filtroCobrador) return false;
      if (filtroCaja !== "__all__" && p.caja_id !== filtroCaja) return false;
      if (filtroRuta !== "__all__" && p.ruta_id !== filtroRuta) return false;
      const pDate = (p.created_at || "").slice(0, 10);
      if (desdeStr && pDate < desdeStr) return false;
      if (hastaStr && pDate > hastaStr) return false;
      return true;
    });

    const movimientosFiltrados = (movimientos as DashboardMovimiento[]).filter(m => {
      if (filtroCaja !== "__all__" && m.caja_id !== filtroCaja) return false;
      const movimientoDate = (m.created_at || "").slice(0, 10);
      if (desdeStr && movimientoDate < desdeStr) return false;
      if (hastaStr && movimientoDate > hastaStr) return false;
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

    // Resumen ejecutivo: lo que el dueño necesita entender al entrar.
    const currentMonth = today.slice(0, 7);
    const cobradoMes = pagos
      .filter(p => (p.created_at || "").startsWith(currentMonth))
      .reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
    const ingresoFinancieroMes = pagos
      .filter(p => (p.created_at || "").startsWith(currentMonth))
      .reduce((s, p) => s + Number(p.aplicado_interes || 0) + Number(p.aplicado_mora || 0), 0);
    const gastosMes = movimientosFiltrados
      .filter(m => {
        if (m.tipo !== "salida" || !(m.created_at || "").startsWith(currentMonth)) return false;
        const concepto = (m.concepto || "").toLowerCase();
        return !["desembolso", "préstamo", "prestamo", "retiro", "transferencia", "recurso", "anulación", "anulacion", "corrección", "correccion"]
          .some(exclusion => concepto.includes(exclusion));
      })
      .reduce((s: number, m) => s + Number(m.monto || 0), 0);
    const gananciaMes = ingresoFinancieroMes - gastosMes;
    const cuotasVencenHoy = amortActivos.filter(a => a.fecha_vencimiento === today && a.status !== "Pagada");
    const montoVenceHoy = cuotasVencenHoy.reduce((s, a) => s + Number(a.saldo_total || 0), 0);
    const prestamosEnRiesgo = new Set(
      amortActivos
        .filter(a => a.fecha_vencimiento < today && a.status !== "Pagada")
        .map(a => a.prestamo_id),
    ).size;

    const rutaMap = new Map((rutas as DashboardRuta[]).map(r => [r.id, r.nombre]));
    const cobradorMap = new Map((cobradores as DashboardCobrador[]).map(c => [c.id, c.nombre_completo || c.nombre || "Sin cobrador"]));
    const topDeudores = (activos as DashboardPrestamo[])
      .map(prestamo => {
        const pendientes = amortActivos.filter(a => a.prestamo_id === prestamo.id && a.status !== "Pagada");
        const vencidas = pendientes.filter(a => a.fecha_vencimiento < today);
        const saldo = pendientes.reduce((s, a) => s + Number(a.saldo_total || 0), 0);
        const vencido = vencidas.reduce((s, a) => s + Number(a.saldo_total || 0), 0);
        const mora = pendientes.reduce((s, a) => s + Number(a.saldo_mora || 0), 0);
        const diasAtraso = vencidas.reduce((max, a) => {
          const diff = Math.floor((Date.now() - new Date(`${a.fecha_vencimiento}T00:00:00`).getTime()) / 86400000);
          return Math.max(max, diff);
        }, 0);
        const cliente = Array.isArray(prestamo.clientes) ? prestamo.clientes[0] : prestamo.clientes;
        return {
          id: prestamo.id,
          cliente: cliente?.nombre_completo || "Cliente sin nombre",
          telefono: cliente?.telefono || null,
          direccion: cliente?.direccion || null,
          gpsLat: cliente?.gps_lat || null,
          gpsLng: cliente?.gps_lng || null,
          saldo,
          vencido,
          mora,
          diasAtraso,
          ruta: rutaMap.get(prestamo.ruta_id) || "Sin ruta",
          cobrador: cobradorMap.get(prestamo.cobrador_id) || "Sin cobrador",
        };
      })
      .filter(cliente => cliente.saldo > 0)
      .sort((a, b) => {
        if (a.vencido > 0 || b.vencido > 0) return b.vencido - a.vencido;
        return b.saldo - a.saldo;
      })
      .slice(0, 8);

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
      promesasPorAtender: promesasHoy.length, montoPromesasHoy, clientesActivos, clientesMora, liquidezTotal, gananciaNeta, carteraVencidaPct,
      cobradoMes, ingresoFinancieroMes, gastosMes, gananciaMes, montoVenceHoy, cuotasVencenHoy: cuotasVencenHoy.length,
      prestamosEnRiesgo, topDeudores,
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

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Movimiento de los últimos 6 meses</CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Compara lo colocado, lo cobrado y la mora sin salir del resumen.</p>
                </div>
                <button onClick={() => navigate("/rentabilidad")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver rentabilidad <ArrowRight className="h-3 w-3" /></button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={stats.colocacionMes} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={48} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="colocado" name="Colocado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cobrado" name="Cobrado" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="mora" name="Mora" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
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
