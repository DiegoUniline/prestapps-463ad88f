import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, AlertTriangle, Clock, Users, Wallet,
  CalendarClock, Landmark, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const $$ = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

      // Parallel fetches
      const [
        { data: prestamos },
        { data: amort },
        { data: pagos },
        { data: cajas },
        { data: cobradores },
        { data: rutas },
      ] = await Promise.all([
        supabase.from("prestamos").select("id, monto_solicitado, monto_total_pagar, estado, fecha_registro, cobrador_id, ruta_id, caja_id, clientes(nombre_completo)"),
        supabase.from("amortizacion").select("prestamo_id, num_cuota, capital, interes, capital_interes, saldo_total, saldo_mora, saldo_capital, saldo_interes, status, fecha_vencimiento, mora"),
        supabase.from("pagos").select("id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, created_at, cobrador_id, prestamo_id"),
        supabase.from("cajas").select("id, nombre, saldo_actual"),
        (supabase.from as any)("cobradores").select("id, nombre, efectivo_en_mano, activo, porcentaje_comision"),
        supabase.from("rutas").select("id, nombre, cobrador_id"),
      ]);

      return {
        prestamos: prestamos || [],
        amort: amort || [],
        pagos: pagos || [],
        cajas: cajas || [],
        cobradores: cobradores || [],
        rutas: rutas || [],
        today,
      };
    },
    refetchInterval: 60_000,
  });
}

// ── Status badge colors ───────────────────────────────────────────
const statusColor: Record<string, string> = {
  Pendiente: "bg-muted text-muted-foreground",
  Vencida: "bg-badge-vencido text-badge-vencido-foreground",
  Prometida: "bg-badge-prometido text-badge-prometido-foreground",
  Pagada: "bg-badge-activo text-badge-activo-foreground",
  Parcial: "bg-badge-aldia text-badge-aldia-foreground",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(217, 91%, 60%)",
  "hsl(280, 67%, 55%)",
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useDashboardData();

  const stats = useMemo(() => {
    if (!data) return null;
    const { prestamos, amort, pagos, cajas, cobradores, rutas, today } = data;

    // ── KPIs ──────────────────────────────────────────────────────
    const activos = prestamos.filter(p => p.estado === "Activo" || p.estado === "Al día" || p.estado === "Vencido");
    const capitalColocado = activos.reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);
    const totalPagar = activos.reduce((s, p) => s + Number(p.monto_total_pagar || 0), 0);

    // Saldo por cobrar (sum of saldo_total for non-Pagada cuotas of active loans)
    const activeIds = new Set(activos.map(p => p.id));
    const amortActivos = amort.filter(a => activeIds.has(a.prestamo_id));
    const saldoPorCobrar = amortActivos.filter(a => a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);
    const moraTotal = amortActivos.reduce((s, a) => s + Number(a.saldo_mora || 0), 0);

    const cuotasVencidas = amortActivos.filter(a => a.status === "Vencida" || (a.fecha_vencimiento < today && a.status !== "Pagada")).length;
    const prestamosVencidos = prestamos.filter(p => p.estado === "Vencido").length;

    // Cobrado total
    const totalCobrado = pagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);

    // Cobrado hoy
    const cobradoHoy = pagos.filter(p => p.created_at?.startsWith(today)).reduce((s, p) => s + Number(p.monto_recibido || 0), 0);

    // Efectivo en calle
    const efectivoCalle = cobradores.reduce((s: number, c: any) => s + Number(c.efectivo_en_mano || 0), 0);

    // Capital en cajas
    const capitalCajas = cajas.reduce((s, c) => s + Number(c.saldo_actual || 0), 0);

    // ── Cuotas del día ────────────────────────────────────────────
    const cuotasHoy = amort
      .filter(a => a.fecha_vencimiento === today || (a.fecha_vencimiento <= today && a.status !== "Pagada"))
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
      .slice(0, 10)
      .map(a => {
        const prest = prestamos.find(p => p.id === a.prestamo_id);
        return {
          id: a.prestamo_id,
          cliente: (prest?.clientes as any)?.nombre_completo || "—",
          monto: Number(a.saldo_total || 0),
          cuota: `${a.num_cuota}`,
          status: a.status || "Pendiente",
          vencimiento: a.fecha_vencimiento,
        };
      });

    // ── Colocación por mes (últimos 6 meses) ──────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const colocacionMes: { mes: string; colocado: number; cobrado: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - 5 + i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
      const col = prestamos.filter(p => (p.fecha_registro || "").startsWith(ym)).reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);
      const cob = pagos.filter(p => (p.created_at || "").startsWith(ym)).reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      colocacionMes.push({ mes: label, colocado: col, cobrado: cob });
    }

    // ── Estado de cartera (pie) ───────────────────────────────────
    const estadoCount: Record<string, number> = {};
    for (const p of prestamos) {
      const e = p.estado || "Activo";
      estadoCount[e] = (estadoCount[e] || 0) + 1;
    }
    const estadoPie = Object.entries(estadoCount).map(([name, value]) => ({ name, value }));

    // ── Cobradores rendimiento ────────────────────────────────────
    const cobradorStats = cobradores.filter((c: any) => c.activo).map((c: any) => {
      const cobPagos = pagos.filter(p => p.cobrador_id === c.id);
      const totalCob = cobPagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      const prestamosAsignados = prestamos.filter(p => p.cobrador_id === c.id && (p.estado === "Activo" || p.estado === "Al día" || p.estado === "Vencido")).length;
      return { nombre: c.nombre, cobrado: totalCob, prestamos: prestamosAsignados, efectivo: Number(c.efectivo_en_mano || 0) };
    }).sort((a: any, b: any) => b.cobrado - a.cobrado);

    // ── Rutas resumen ─────────────────────────────────────────────
    const rutaStats = rutas.map((r: any) => {
      const prs = prestamos.filter(p => p.ruta_id === r.id && (p.estado === "Activo" || p.estado === "Al día" || p.estado === "Vencido"));
      const saldo = amort.filter(a => prs.some(p => p.id === a.prestamo_id) && a.status !== "Pagada").reduce((s, a) => s + Number(a.saldo_total || 0), 0);
      return { nombre: r.nombre, prestamos: prs.length, saldo };
    }).sort((a: any, b: any) => b.saldo - a.saldo);

    // ── Cajas resumen ─────────────────────────────────────────────
    const cajasData = cajas.map(c => ({ nombre: c.nombre, saldo: Number(c.saldo_actual || 0) }));

    return {
      capitalColocado, totalPagar, saldoPorCobrar, moraTotal,
      cuotasVencidas, prestamosVencidos, totalCobrado, cobradoHoy,
      efectivoCalle, capitalCajas,
      totalPrestamos: prestamos.length,
      totalActivos: activos.length,
      cuotasHoy, colocacionMes, estadoPie, cobradorStats, rutaStats, cajasData,
    };
  }, [data]);

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-muted-foreground text-sm">Cargando datos...</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-5 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    { title: "Capital Colocado", value: $$(stats.capitalColocado), icon: DollarSign, accent: "text-primary" },
    { title: "Saldo por Cobrar", value: $$(stats.saldoPorCobrar), icon: Wallet, accent: "text-[hsl(217,91%,60%)]" },
    { title: "Mora Acumulada", value: $$(stats.moraTotal), icon: AlertTriangle, accent: "text-destructive" },
    { title: "Total Cobrado", value: $$(stats.totalCobrado), icon: TrendingUp, accent: "text-success" },
    { title: "Cobrado Hoy", value: $$(stats.cobradoHoy), icon: CalendarClock, accent: "text-primary" },
    { title: "Efectivo en Calle", value: $$(stats.efectivoCalle), icon: Clock, accent: "text-warning" },
    { title: "Capital en Cajas", value: $$(stats.capitalCajas), icon: Landmark, accent: "text-success" },
    { title: "Préstamos Activos", value: String(stats.totalActivos), sub: `${stats.cuotasVencidas} cuotas vencidas`, icon: Users, accent: "text-[hsl(217,91%,60%)]" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-[13px]">Resumen general del sistema</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.title} className="bg-card rounded-lg border border-border px-4 py-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.title}</p>
              <k.icon className={cn("h-4 w-4", k.accent)} />
            </div>
            <p className="text-lg font-semibold mt-1">{k.value}</p>
            {(k as any).sub && <p className="text-[11px] text-muted-foreground">{(k as any).sub}</p>}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Colocación vs Cobranza */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colocación vs Cobranza (6 meses)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.colocacionMes} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => $$(v)} />
                <Bar dataKey="colocado" name="Colocado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cobrado" name="Cobrado" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Estado de cartera (pie) */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estado de Cartera</CardTitle></CardHeader>
          <CardContent>
            {stats.estadoPie.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin préstamos</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
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

      {/* Second Row: Cobradores + Cuotas del día */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Rendimiento cobradores */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Rendimiento por Cobrador</CardTitle>
              <button onClick={() => navigate("/cobradores")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver todos <ArrowRight className="h-3 w-3" /></button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.cobradorStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin cobradores</p>
            ) : (
              <div className="space-y-3">
                {stats.cobradorStats.slice(0, 6).map((c: any) => (
                  <div key={c.nombre} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-[13px] font-medium">{c.nombre}</p>
                      <p className="text-[11px] text-muted-foreground">{c.prestamos} préstamos · Efectivo: {$$(c.efectivo)}</p>
                    </div>
                    <p className="text-[13px] font-semibold text-success">{$$(c.cobrado)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cuotas del día / vencidas */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cuotas Pendientes Hoy</CardTitle>
              <button onClick={() => navigate("/pagos")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver pagos <ArrowRight className="h-3 w-3" /></button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.cuotasHoy.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No hay cuotas pendientes para hoy</p>
            ) : (
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

      {/* Third Row: Rutas + Cajas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Rutas */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo por Ruta</CardTitle>
              <button onClick={() => navigate("/rutas")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver rutas <ArrowRight className="h-3 w-3" /></button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.rutaStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin rutas</p>
            ) : (
              <div className="space-y-3">
                {stats.rutaStats.map((r: any) => (
                  <div key={r.nombre} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-[13px] font-medium">{r.nombre}</p>
                      <p className="text-[11px] text-muted-foreground">{r.prestamos} préstamos activos</p>
                    </div>
                    <p className="text-[13px] font-semibold">{$$(r.saldo)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cajas */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo en Cajas</CardTitle>
              <button onClick={() => navigate("/cajas")} className="text-[11px] text-primary flex items-center gap-1 hover:underline">Ver cajas <ArrowRight className="h-3 w-3" /></button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.cajasData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin cajas</p>
            ) : (
              <div className="space-y-3">
                {stats.cajasData.map((c: any) => (
                  <div key={c.nombre} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                      <p className="text-[13px] font-medium">{c.nombre}</p>
                    </div>
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
      </div>
    </div>
  );
}
