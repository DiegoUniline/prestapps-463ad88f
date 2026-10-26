import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabaseQuery";
import { usePaginacion, PAGE_SIZE } from "@/hooks/usePaginacion";
import { PaginacionControles } from "@/components/PaginacionControles";
import { rpcRegistrarMovimientoCaja, rpcTransferirCaja } from "@/lib/rpcIntegridad";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { toast } from "sonner";
import { cn, $$, fmtDate, parseLocalDate, errorMessage } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  Wallet, DollarSign, FileText, TrendingUp, TrendingDown,
  PiggyBank, AlertTriangle, Loader2
} from "lucide-react";
import { useSingleCajaSaldoReal } from "@/hooks/useCajaSaldoReal";
import { PrestamosTab, PagosTab, TransferenciasTab } from "@/components/CajaSourceTabs";
import {
  Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import {
  ANALYTICS_COLORS,
  ANALYTICS_PALETTE,
  AnalyticsChartCard,
  AnalyticsTooltip,
  DonutBreakdown,
  TrendPill,
} from "@/components/analytics/ChartPrimitives";

// ── Data hooks ─────────────────────────────────────────────────
function useCaja(cajaId: string) {
  return useQuery({
    queryKey: ["caja-detalle", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cajas").select("*").eq("id", cajaId).single();
      if (error) throw error;
      return data;
    },
  });
}

type CajaStats = { activos: number; colocado: number; totalPagar: number; porCobrar: number; capitalPorCobrar: number; interesPorCobrar: number; moraPorCobrar: number; moraCobrada: number; ganancia: number; enMora: number; moraTotal: number; liquidados: number; capitalRecuperado: number };

// KPIs de cartera de la caja (incluye mora calculada al día) agregados en SQL: rpc caja_detalle_stats.
function useCajaStats(cajaId: string) {
  return useQuery({
    queryKey: ["caja-stats", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await rpc<Record<keyof CajaStats, number | string>>("caja_detalle_stats", { p_caja_id: cajaId, p_today: today });
      if (error) throw error;
      const out = {} as CajaStats;
      for (const k of ["activos", "colocado", "totalPagar", "porCobrar", "capitalPorCobrar", "interesPorCobrar", "moraPorCobrar", "moraCobrada", "ganancia", "enMora", "moraTotal", "liquidados", "capitalRecuperado"] as (keyof CajaStats)[]) {
        out[k] = Number(data?.[k] || 0);
      }
      return out;
    },
  });
}

// ── Source-based flujo (NOT from kardex) ──────────────────────
function useCajaFlujoReal(cajaId: string) {
  return useQuery({
    queryKey: ["caja-flujo-real", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      // Sumas por categoría en SQL (rpc caja_flujo), misma clasificación de movimientos manuales que antes.
      const { data, error } = await rpc<Record<string, number | string>>("caja_flujo", { p_caja_id: cajaId });
      if (error) throw error;
      const n = (k: string) => Number(data?.[k] || 0);
      const totalCobros = n("cobros");
      const totalDesembolsos = n("desembolsos");
      const depositos = n("depositos"), retiros = n("retiros"), transferenciasIn = n("transferencias_in"), transferenciasOut = n("transferencias_out"), gastos = n("gastos"), comisiones = n("comisiones");

      // NOTE: Anulaciones are NOT counted as salidas because the anulado pagos
      // are already excluded from cobros (entradas). Counting them as salida
      // would double-subtract and break the balance.

      const entradas: Record<string, number> = {};
      const salidas: Record<string, number> = {};
      if (totalCobros > 0) entradas["Cobros"] = totalCobros;
      if (depositos > 0) entradas["Depósitos"] = depositos;
      if (transferenciasIn > 0) entradas["Transferencias"] = transferenciasIn;
      if (totalDesembolsos > 0) salidas["Desembolsos"] = totalDesembolsos;
      if (retiros > 0) salidas["Retiros"] = retiros;
      if (transferenciasOut > 0) salidas["Transferencias"] = transferenciasOut;
      if (gastos > 0) salidas["Gastos"] = gastos;
      if (comisiones > 0) salidas["Comisiones"] = comisiones;

      const totalEntradas = totalCobros + depositos + transferenciasIn;
      const totalSalidas = totalDesembolsos + retiros + transferenciasOut + gastos + comisiones;
      return { entradas, salidas, totalEntradas, totalSalidas, flujoNeto: totalEntradas - totalSalidas };
    },
  });
}

interface KardexRow { id: string; fecha: string; tipo: "entrada" | "salida"; concepto: string; monto: number; categoria: string; balance: number; }

const KARDEX_CATEGORIES = ["Todos", "Pagos", "Desembolsos", "Anulaciones", "Correcciones", "Gastos", "Comisiones", "Depósitos", "Retiros", "Transferencias"] as const;
const MANUAL_CATEGORIES = new Set(["Depósitos", "Retiros", "Transferencias"]);

// Página del kardex con saldo corrido calculado en SQL (rpc caja_kardex), más reciente primero.
// modo "todos": saldo sobre todos los movimientos (la categoría solo filtra filas);
// modo "manual": solo depósitos/retiros/transferencias, con su propio saldo corrido.
function useCajaKardex(cajaId: string, modo: "todos" | "manual", categoria: string, page: number, enabled = true) {
  return useQuery({
    queryKey: ["caja-kardex", cajaId, "pagina", modo, categoria, page],
    enabled: !!cajaId && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await rpc<{ id: string; created_at: string | null; tipo: "entrada" | "salida"; monto: number | string; concepto: string; categoria: string; balance: number | string }[]>("caja_kardex", {
        p_caja_id: cajaId,
        p_modo: modo,
        p_categoria: categoria === "Todos" ? null : categoria,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data || []).map((m): KardexRow => ({
        id: m.id,
        fecha: m.created_at || "",
        tipo: m.tipo,
        concepto: m.concepto,
        monto: Number(m.monto || 0),
        categoria: m.categoria,
        balance: Number(m.balance || 0),
      }));
    },
  });
}

// Conteo y sumas por categoría del kardex (chips, totales de la pestaña Movimientos).
function useCajaKardexResumen(cajaId: string) {
  return useQuery({
    queryKey: ["caja-kardex", cajaId, "resumen"],
    enabled: !!cajaId,
    queryFn: async () => {
      const { data, error } = await rpc<{ categoria: string; n: number; entradas: number | string; salidas: number | string }[]>("caja_kardex_resumen", { p_caja_id: cajaId });
      if (error) throw error;
      const map: Record<string, { n: number; entradas: number; salidas: number }> = {};
      for (const r of data || []) map[r.categoria] = { n: Number(r.n || 0), entradas: Number(r.entradas || 0), salidas: Number(r.salidas || 0) };
      return map;
    },
  });
}

// ── All cajas (for transfer) ──────────────────────────────────
function useAllCajas(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-options", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre, saldo_actual").eq("empresa_id", empresaId).order("nombre");
      return data || [];
    },
  });
}

// ── Modal type ────────────────────────────────────────────────
type ModalType = "depositar" | "retirar" | "transferir" | null;

export default function CajaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: caja, isLoading: loadingCaja } = useCaja(id || "");
  const { data: stats, isLoading: loadingStats } = useCajaStats(id || "");
  const { data: allCajas = [] } = useAllCajas(empresaId);
  const { saldo: saldoReal } = useSingleCajaSaldoReal(id || "");
  const { data: flujoReal } = useCajaFlujoReal(id || "");

  const [tab, setTab] = useState("resumen");
  const [modal, setModal] = useState<ModalType>(null);
  const [kardexFilter, setKardexFilter] = useState("Todos");
  const [kardexPage, setKardexPage] = usePaginacion(`${id}|${kardexFilter}`);
  const [manualPage, setManualPage] = usePaginacion(`${id}`);
  const { data: kardexResumen = {}, isLoading: loadingKardex } = useCajaKardexResumen(id || "");
  const { data: filteredKardex = [], isLoading: loadingKardexPage, isFetching: fetchingKardex } = useCajaKardex(id || "", "todos", kardexFilter, kardexPage, tab === "kardex");
  const { data: manualRows = [], isLoading: loadingManualPage, isFetching: fetchingManual } = useCajaKardex(id || "", "manual", "Todos", manualPage, tab === "movimientos");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [cajaDestinoId, setCajaDestinoId] = useState("");
  const [saving, setSaving] = useState(false);

  const saldoActual = saldoReal ?? Number(caja?.saldo_actual || 0);
  const invalidate = () => invalidateFinanceQueries(queryClient);
  const resetModal = () => { setModal(null); setMonto(""); setConcepto(""); setCajaDestinoId(""); };

  // ── Movimiento handler ────────────────────────────────────────
  const handleMovimiento = async (tipo: "entrada" | "salida") => {
    const m = parseFloat(monto);
    if (!id || !m || m <= 0) return;
    if (tipo === "salida" && saldoActual < m) { toast.error("Saldo insuficiente"); return; }
    setSaving(true);
    try {
      await rpcRegistrarMovimientoCaja(id, tipo, m, concepto.trim() || (tipo === "entrada" ? "Depósito manual" : "Retiro manual"));
    } catch (err) {
      toast.error(errorMessage(err)); setSaving(false); return;
    }
    setSaving(false);
    toast.success(tipo === "entrada" ? `Depósito de ${$$(m)}` : `Retiro de ${$$(m)}`);
    invalidate();
    queryClient.invalidateQueries({ queryKey: ["caja-detalle", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-stats", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-kardex", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-saldo-real"] });
    queryClient.invalidateQueries({ queryKey: ["caja-flujo-real", id] });
    resetModal();
  };

  const handleTransferir = async () => {
    const m = parseFloat(monto);
    if (!id || !cajaDestinoId || id === cajaDestinoId || !m || m <= 0) return;
    if (saldoActual < m) { toast.error("Saldo insuficiente"); return; }
    setSaving(true);
    const destino = allCajas.find(c => c.id === cajaDestinoId);
    const nota = concepto.trim() || `Transferencia ${caja?.nombre} → ${destino?.nombre}`;
    try {
      await rpcTransferirCaja(id, cajaDestinoId, m, nota);
    } catch (err) {
      toast.error(errorMessage(err)); setSaving(false); return;
    }
    setSaving(false);
    toast.success(`Transferencia de ${$$(m)} completada`);
    invalidate();
    queryClient.invalidateQueries({ queryKey: ["caja-detalle", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-kardex", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-saldo-real"] });
    queryClient.invalidateQueries({ queryKey: ["caja-flujo-real", id] });
    resetModal();
  };

  // ── Computed data (totales por categoría desde rpc caja_kardex_resumen) ──
  const totalMovs = useMemo(() => Object.values(kardexResumen).reduce((s, c) => s + c.n, 0), [kardexResumen]);
  const manualTotals = useMemo(() => {
    let n = 0, entradas = 0, salidas = 0;
    for (const cat of MANUAL_CATEGORIES) {
      const c = kardexResumen[cat];
      if (c) { n += c.n; entradas += c.entradas; salidas += c.salidas; }
    }
    return { n, entradas, salidas, saldo: entradas - salidas };
  }, [kardexResumen]);
  const kardexFilterTotals = kardexResumen[kardexFilter] || { n: 0, entradas: 0, salidas: 0 };

  const availableCategories = useMemo(
    () => KARDEX_CATEGORIES.filter(c => c === "Todos" || (kardexResumen[c]?.n || 0) > 0),
    [kardexResumen]
  );

  const flujoData = useMemo(() => {
    if (!flujoReal) return { entradas: {} as Record<string, number>, salidas: {} as Record<string, number>, totalEntradas: 0, totalSalidas: 0, saldoInicial: saldoActual, flujoNeto: 0 };
    const saldoInicial = saldoActual - flujoReal.flujoNeto;
    return { ...flujoReal, saldoInicial };
  }, [flujoReal, saldoActual]);

  // Pie chart data for entradas/salidas composition
  const pieEntradas = useMemo(() => Object.entries(flujoData.entradas).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), [flujoData]);
  const pieSalidas = useMemo(() => Object.entries(flujoData.salidas).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), [flujoData]);

  const s = stats || { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, capitalPorCobrar: 0, interesPorCobrar: 0, moraPorCobrar: 0, moraCobrada: 0, ganancia: 0, enMora: 0, moraTotal: 0, liquidados: 0, capitalRecuperado: 0 };

  const kpis = [
    { label: "Préstamos Activos", value: String(s.activos), icon: FileText, accent: "text-[hsl(217,91%,60%)]", bg: "bg-[hsl(217,91%,60%)]/10" },
    { label: "Monto Colocado", value: $$(s.colocado), icon: DollarSign, accent: "text-foreground", bg: "bg-muted" },
    { label: "Total a Cobrar", value: $$(s.porCobrar), icon: TrendingUp, accent: "text-primary", bg: "bg-primary/10" },
    { label: "Capital por Cobrar", value: $$(s.capitalPorCobrar), icon: TrendingUp, accent: "text-primary", bg: "bg-primary/10" },
    { label: "Interés por Cobrar", value: $$(s.interesPorCobrar), icon: TrendingUp, accent: "text-warning", bg: "bg-warning/10" },
    { label: "Mora por Cobrar", value: $$(s.moraPorCobrar), icon: AlertTriangle, accent: "text-destructive", bg: "bg-destructive/10" },
    { label: "Ganancia Proyectada", value: $$(s.ganancia), icon: PiggyBank, accent: "text-success", bg: "bg-success/10" },
    { label: "Entradas Total", value: $$(flujoData.totalEntradas), icon: ArrowDownLeft, accent: "text-success", bg: "bg-success/10" },
    { label: "Salidas Total", value: $$(flujoData.totalSalidas), icon: ArrowUpRight, accent: "text-destructive", bg: "bg-destructive/10" },
  ];

  if (loadingCaja) return <div className="p-8 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!caja) return <div className="p-8 text-center text-muted-foreground">Caja no encontrada</div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/cajas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              {caja.nombre}
            </h1>
            <p className="kpi-num text-3xl font-extrabold tracking-tight mt-0.5">{$$(saldoActual)}</p>
            {caja.descripcion && <p className="text-sm text-muted-foreground mt-0.5">{caja.descripcion}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8 text-[13px] bg-success hover:bg-success/90" onClick={() => setModal("depositar")}>
            <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5" />Depositar
          </Button>
          <Button size="sm" variant="destructive" className="h-8 text-[13px]" onClick={() => setModal("retirar")}>
            <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Retirar
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-[13px]" onClick={() => setModal("transferir")}>
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />Transferir
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="kpi-num text-lg font-bold tracking-tight">{loadingStats ? "—" : k.value}</p>
                </div>
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", k.bg)}>
                  <k.icon className={cn("h-4 w-4", k.accent)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="resumen" className="text-[13px]">Resumen</TabsTrigger>
            <TabsTrigger value="prestamos" className="text-[13px]">Préstamos</TabsTrigger>
            <TabsTrigger value="pagos" className="text-[13px]">Pagos</TabsTrigger>
            <TabsTrigger value="transferencias" className="text-[13px]">Transferencias</TabsTrigger>
            <TabsTrigger value="movimientos" className="text-[13px]">Movimientos</TabsTrigger>
            <TabsTrigger value="kardex" className="text-[13px]">Kardex</TabsTrigger>
            <TabsTrigger value="flujo" className="text-[13px]">Flujo</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Resumen Tab ──────────────────────────────────────────── */}
        <TabsContent value="resumen" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Composición de Entradas */}
            <AnalyticsChartCard
              eyebrow="Origen del efectivo"
              title="Composición de entradas"
              description="Qué actividades están alimentando esta caja."
              meta={<ArrowDownLeft className="h-4 w-4 text-success" />}
            >
              <DonutBreakdown
                data={pieEntradas.map((item, index) => ({ ...item, color: [ANALYTICS_COLORS.success, ANALYTICS_COLORS.cyan, ANALYTICS_COLORS.blue, ...ANALYTICS_PALETTE][index] }))}
                centerLabel="Entradas"
                centerValue={$$(flujoData.totalEntradas)}
              />
            </AnalyticsChartCard>

            {/* Composición de Salidas */}
            <AnalyticsChartCard
              eyebrow="Uso del efectivo"
              title="Composición de salidas"
              description="Dónde se está utilizando el capital de esta caja."
              meta={<ArrowUpRight className="h-4 w-4 text-destructive" />}
            >
              <DonutBreakdown
                data={pieSalidas.map((item, index) => ({ ...item, color: [ANALYTICS_COLORS.danger, ANALYTICS_COLORS.warning, ANALYTICS_COLORS.primary, ANALYTICS_COLORS.violet, ANALYTICS_COLORS.slate][index] }))}
                centerLabel="Salidas"
                centerValue={$$(flujoData.totalSalidas)}
              />
            </AnalyticsChartCard>

            {/* Bar chart: Entradas vs Salidas */}
            <AnalyticsChartCard
              className="lg:col-span-2"
              eyebrow="Balance operativo"
              title="Entradas vs. salidas"
              description="Lectura rápida del movimiento acumulado y el efectivo neto."
              meta={<TrendPill value={$$(Math.abs(flujoData.flujoNeto))} label={flujoData.flujoNeto >= 0 ? "flujo positivo" : "flujo negativo"} tone={flujoData.flujoNeto >= 0 ? "positive" : "negative"} />}
            >
              {flujoData.totalEntradas === 0 && flujoData.totalSalidas === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={[
                    { name: "Entradas", monto: flujoData.totalEntradas },
                    { name: "Salidas", monto: flujoData.totalSalidas },
                    { name: "Flujo neto", monto: flujoData.flujoNeto },
                  ]} barSize={48} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={8} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`} width={52} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,.08)" }} content={<AnalyticsTooltip />} />
                    <Bar dataKey="monto" name="Monto" radius={[9, 9, 3, 3]}>
                      <Cell fill={ANALYTICS_COLORS.success} />
                      <Cell fill={ANALYTICS_COLORS.danger} />
                      <Cell fill={flujoData.flujoNeto >= 0 ? ANALYTICS_COLORS.blue : ANALYTICS_COLORS.warning} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </AnalyticsChartCard>

            {/* Summary card: Cartera */}
            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-4">Resumen de Cartera</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Capital Colocado", value: $$(s.colocado), color: "text-foreground" },
                    { label: "Total a Cobrar", value: $$(s.totalPagar + s.moraPorCobrar + s.moraCobrada), color: "text-foreground" },
                    { label: "Pendiente", value: $$(s.porCobrar), color: "text-warning" },
                    { label: "Ganancia", value: $$(s.ganancia), color: "text-success" },
                    { label: "Liquidados", value: String(s.liquidados), color: "text-muted-foreground" },
                    { label: "Capital Recuperado", value: $$(s.capitalRecuperado), color: "text-success" },
                    { label: "Mora Acumulada", value: $$(s.moraTotal), color: "text-destructive" },
                    { label: "Préstamos en Mora", value: String(s.enMora), color: "text-destructive" },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                      <p className={cn("kpi-num text-lg font-bold mt-0.5", item.color)}>{loadingStats ? "—" : item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Source-based tabs ── */}
        <TabsContent value="prestamos"><PrestamosTab cajaId={id!} /></TabsContent>
        <TabsContent value="pagos"><PagosTab cajaId={id!} /></TabsContent>
        <TabsContent value="transferencias"><TransferenciasTab cajaId={id!} /></TabsContent>

        {/* ── Movimientos Tab (solo depósitos, retiros, transferencias) ── */}
        <TabsContent value="movimientos" className="mt-4 space-y-3">
          {loadingKardex || loadingManualPage ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : manualTotals.n === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin depósitos, retiros ni transferencias</p>
          ) : (
            <>
              <div className="flex items-center gap-4 text-[12px] px-1">
                <span className="text-muted-foreground">{manualTotals.n} movimientos</span>
                <span className="text-success font-medium">
                  +{$$(manualTotals.entradas)}
                </span>
                <span className="text-destructive font-medium">
                  -{$$(manualTotals.salidas)}
                </span>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-border bg-card rounded-lg border">
                {manualRows.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{r.concepto}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {r.fecha ? fmtDate(r.fecha, "dd/MM/yy HH:mm") : "—"}
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{r.categoria}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-[13px] font-semibold", r.tipo === "entrada" ? "text-success" : "text-destructive")}>{r.tipo === "entrada" ? "+" : "-"}{$$(r.monto)}</p>
                        <p className="text-[11px] text-muted-foreground">{$$(r.balance)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-3 bg-muted/50 border-t-2 border-border flex items-center justify-between font-bold text-[13px]">
                  <span>Totales</span>
                  <div className="flex gap-4">
                    <span className="text-success">+{$$(manualTotals.entradas)}</span>
                    <span className="text-destructive">-{$$(manualTotals.salidas)}</span>
                  </div>
                </div>
              </div>

              {/* Desktop */}
              <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Fecha</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Concepto</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Tipo</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Entrada</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Salida</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualRows.map(r => (
                      <TableRow key={r.id} className="border-b border-border/50">
                        <TableCell className="text-[12px] px-3 whitespace-nowrap">{r.fecha ? fmtDate(r.fecha, "dd/MM/yy HH:mm") : "—"}</TableCell>
                        <TableCell className="text-[13px] px-3 max-w-[250px] truncate">{r.concepto}</TableCell>
                        <TableCell className="text-[12px] px-3">
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">{r.categoria}</span>
                        </TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-success font-medium">{r.tipo === "entrada" ? $$(r.monto) : ""}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-destructive font-medium">{r.tipo === "salida" ? $$(r.monto) : ""}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 font-semibold">{$$(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 border-t-2 border-border font-bold">
                      <TableCell className="px-3 text-[12px]" colSpan={3}>Totales</TableCell>
                      <TableCell className="text-right text-[13px] px-3 text-success font-bold">
                        {$$(manualTotals.entradas)}
                      </TableCell>
                      <TableCell className="text-right text-[13px] px-3 text-destructive font-bold">
                        {$$(manualTotals.salidas)}
                      </TableCell>
                      <TableCell className="text-right text-[13px] px-3 font-bold">{$$(manualTotals.saldo)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <PaginacionControles page={manualPage} pageSize={PAGE_SIZE} total={manualTotals.n} onPageChange={setManualPage} isFetching={fetchingManual} />
            </>
          )}
        </TabsContent>

        {/* ── Kardex Tab ──────────────────────────────────────────── */}
        <TabsContent value="kardex" className="mt-4 space-y-3">
          {/* Category filter chips */}
          {!loadingKardex && totalMovs > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setKardexFilter(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border",
                    kardexFilter === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {cat}
                  {cat !== "Todos" && (
                    <span className="ml-1 opacity-70">
                      ({kardexResumen[cat]?.n || 0})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {loadingKardex || loadingKardexPage ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : totalMovs === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin movimientos</p>
          ) : filteredKardex.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin movimientos en "{kardexFilter}"</p>
          ) : (
            <>
              {/* Summary for filtered view */}
              {kardexFilter !== "Todos" && (
                <div className="flex items-center gap-4 text-[12px] px-1">
                  <span className="text-muted-foreground">{kardexFilterTotals.n} movimientos</span>
                  <span className="text-success font-medium">
                    +{$$(kardexFilterTotals.entradas)}
                  </span>
                  <span className="text-destructive font-medium">
                    -{$$(kardexFilterTotals.salidas)}
                  </span>
                </div>
              )}

              {/* Mobile */}
              <div className="md:hidden divide-y divide-border bg-card rounded-lg border">
                {filteredKardex.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{r.concepto}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {r.fecha ? fmtDate(r.fecha, "dd/MM/yy HH:mm") : "—"}
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{r.categoria}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-[13px] font-semibold", r.tipo === "entrada" ? "text-success" : "text-destructive")}>{r.tipo === "entrada" ? "+" : "-"}{$$(r.monto)}</p>
                        <p className="text-[11px] text-muted-foreground">{$$(r.balance)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Fecha</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Concepto</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Categoría</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Entrada</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Salida</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredKardex.map(r => (
                      <TableRow key={r.id} className="border-b border-border/50">
                        <TableCell className="text-[12px] px-3 whitespace-nowrap">{r.fecha ? fmtDate(r.fecha, "dd/MM/yy HH:mm") : "—"}</TableCell>
                        <TableCell className="text-[13px] px-3 max-w-[250px] truncate">{r.concepto}</TableCell>
                        <TableCell className="text-[12px] px-3">
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">{r.categoria}</span>
                        </TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-success font-medium">{r.tipo === "entrada" ? $$(r.monto) : ""}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-destructive font-medium">{r.tipo === "salida" ? $$(r.monto) : ""}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 font-semibold">{$$(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <PaginacionControles
                page={kardexPage}
                pageSize={PAGE_SIZE}
                total={kardexFilter === "Todos" ? totalMovs : kardexFilterTotals.n}
                onPageChange={setKardexPage}
                isFetching={fetchingKardex}
              />
            </>
          )}
        </TabsContent>

        {/* ── Flujo de Efectivo Tab ────────────────────────────────── */}
        <TabsContent value="flujo" className="mt-4">
          {loadingKardex ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : totalMovs === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin movimientos</p>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-border/50">
                {/* Saldo Inicial */}
                <div className="py-3">
                  <div className="flex items-center gap-2 px-4 py-2"><Wallet className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-semibold">Saldo Inicial</span></div>
                  <FlujoLine label="Saldo al inicio" monto={flujoData.saldoInicial} variant="total" />
                </div>
                {/* Entradas */}
                <div className="py-3">
                  <div className="flex items-center gap-2 px-4 py-2"><ArrowDownLeft className="h-4 w-4 text-success" /><span className="text-sm font-semibold text-success">Entradas de Efectivo</span></div>
                  {Object.entries(flujoData.entradas).sort(([, a], [, b]) => b - a).map(([cat, m]) => <FlujoLine key={cat} label={cat} monto={m} />)}
                  {Object.keys(flujoData.entradas).length === 0 && <p className="text-[12px] text-muted-foreground px-7 py-2">Sin entradas</p>}
                  <FlujoLine label="Total Entradas" monto={flujoData.totalEntradas} variant="total" />
                </div>
                {/* Salidas */}
                <div className="py-3">
                  <div className="flex items-center gap-2 px-4 py-2"><ArrowUpRight className="h-4 w-4 text-destructive" /><span className="text-sm font-semibold text-destructive">Salidas de Efectivo</span></div>
                  {Object.entries(flujoData.salidas).sort(([, a], [, b]) => b - a).map(([cat, m]) => <FlujoLine key={cat} label={cat} monto={m} />)}
                  {Object.keys(flujoData.salidas).length === 0 && <p className="text-[12px] text-muted-foreground px-7 py-2">Sin salidas</p>}
                  <FlujoLine label="Total Salidas" monto={flujoData.totalSalidas} variant="total" />
                </div>
                {/* Neto */}
                <div className="py-3">
                  <div className="flex items-center justify-between py-2.5 px-4">
                    <span className="text-[13px] font-semibold flex items-center gap-1.5">
                      {flujoData.flujoNeto >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                      Flujo Neto
                    </span>
                    <span className={cn("text-[13px] tabular-nums font-semibold", flujoData.flujoNeto >= 0 ? "text-success" : "text-destructive")}>
                      {flujoData.flujoNeto >= 0 ? "+" : ""}{$$(flujoData.flujoNeto)}
                    </span>
                  </div>
                  <FlujoLine label="Saldo Final" monto={saldoActual} variant="saldo" />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {/* Depositar */}
      <Dialog open={modal === "depositar"} onOpenChange={o => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3"><DialogTitle className="flex items-center gap-2 text-base"><ArrowDownLeft className="h-4 w-4 text-success" />Depositar a {caja.nombre}</DialogTitle></DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div><Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label><Input type="number" step="0.01" min="0" placeholder="0.00" value={monto} onChange={e => setMonto(e.target.value)} className="mt-1 h-9 text-[13px]" autoFocus /></div>
            <div><Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Concepto</Label><Textarea value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Depósito manual" className="mt-1 text-[13px] min-h-[60px]" /></div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px] bg-success hover:bg-success/90" disabled={saving || !(parseFloat(monto) > 0)} onClick={() => handleMovimiento("entrada")}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5" />}Depositar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retirar */}
      <Dialog open={modal === "retirar"} onOpenChange={o => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3"><DialogTitle className="flex items-center gap-2 text-base"><ArrowUpRight className="h-4 w-4 text-destructive" />Retirar de {caja.nombre}</DialogTitle></DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div><Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label><Input type="number" step="0.01" min="0" placeholder="0.00" value={monto} onChange={e => setMonto(e.target.value)} className="mt-1 h-9 text-[13px]" autoFocus /></div>
            <div><Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Concepto</Label><Textarea value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Retiro manual" className="mt-1 text-[13px] min-h-[60px]" /></div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px] bg-destructive hover:bg-destructive/90" disabled={saving || !(parseFloat(monto) > 0)} onClick={() => handleMovimiento("salida")}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />}Retirar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transferir */}
      <Dialog open={modal === "transferir"} onOpenChange={o => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3"><DialogTitle className="flex items-center gap-2 text-base"><ArrowLeftRight className="h-4 w-4 text-primary" />Transferir desde {caja.nombre}</DialogTitle></DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
              <SearchableSelect
                options={allCajas.filter(c => c.id !== id).map(c => ({ value: c.id, label: c.nombre, subtitle: $$(Number(c.saldo_actual || 0)) }))}
                value={cajaDestinoId}
                onValueChange={setCajaDestinoId}
                placeholder="Seleccionar destino"
                searchPlaceholder="Buscar caja..."
                triggerClassName="mt-1"
              />
            </div>
            <div><Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label><Input type="number" step="0.01" min="0" placeholder="0.00" value={monto} onChange={e => setMonto(e.target.value)} className="mt-1 h-9 text-[13px]" /></div>
            <div><Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Concepto</Label><Textarea value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Transferencia" className="mt-1 text-[13px] min-h-[60px]" /></div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px]" disabled={saving || !cajaDestinoId || !(parseFloat(monto) > 0)} onClick={handleTransferir}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />}Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlujoLine({ label, monto, variant = "normal" }: { label: string; monto: number; variant?: "normal" | "total" | "saldo" }) {
  return (
    <div className={cn(
      "flex items-center justify-between py-2.5 px-4",
      variant === "total" && "border-t border-border font-semibold bg-muted/30",
      variant === "saldo" && "border-t-2 border-foreground font-bold text-base bg-muted/50 py-3",
    )}>
      <span className={cn("text-[13px]", variant === "normal" && "text-muted-foreground pl-3")}>{label}</span>
      <span className={cn("text-[13px] tabular-nums font-medium", variant === "saldo" && "text-base")}>{$$(monto)}</span>
    </div>
  );
}
