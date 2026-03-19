import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { toast } from "sonner";
import { cn, $$ } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  Wallet, DollarSign, FileText, TrendingUp, TrendingDown,
  PiggyBank, AlertTriangle, Loader2, BarChart3
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

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

function useCajaStats(cajaId: string) {
  return useQuery({
    queryKey: ["caja-stats", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select("id, monto_solicitado, monto_total_pagar, estado, tipo_mora, valor_mora")
        .eq("caja_id", cajaId)
        .not("estado", "in", '("Cancelado")');

      if (!prestamos?.length) return { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, capitalPorCobrar: 0, interesPorCobrar: 0, moraPorCobrar: 0, ganancia: 0, enMora: 0, moraTotal: 0, liquidados: 0, capitalRecuperado: 0 };

      const ids = prestamos.map(p => p.id);
      const prestamoMap = new Map(prestamos.map((p) => [p.id, p]));
      const { data: amortData } = await supabase
        .from("amortizacion")
        .select("prestamo_id, saldo_total, saldo_mora, saldo_capital, saldo_interes, capital_interes, mora_pagada, status, fecha_vencimiento")
        .in("prestamo_id", ids);

      const today = new Date().toISOString().slice(0, 10);
      const prestamoAgg: Record<string, { saldo: number; mora: number; capital: number; interes: number; tieneAtraso: boolean }> = {};

      for (const a of amortData || []) {
        const p = prestamoMap.get(a.prestamo_id);
        if (!prestamoAgg[a.prestamo_id]) {
          prestamoAgg[a.prestamo_id] = { saldo: 0, mora: 0, capital: 0, interes: 0, tieneAtraso: false };
        }

        const saldoCapital = Number(a.saldo_capital || 0);
        const saldoInteres = Number(a.saldo_interes || 0);
        const saldoMoraGuardada = Number(a.saldo_mora || 0);
        let moraPendiente = saldoMoraGuardada;

        const hayAtraso = !!a.fecha_vencimiento && a.fecha_vencimiento < today;
        if (hayAtraso && Number(a.saldo_total || 0) > 0 && Number(p?.valor_mora || 0) > 0) {
          const diasAtraso = Math.max(0, Math.floor((new Date(today).getTime() - new Date(a.fecha_vencimiento).getTime()) / 86400000));
          const baseMora = p?.tipo_mora === "porcentaje"
            ? Number(a.capital_interes || 0) * (Number(p?.valor_mora || 0) / 100) * diasAtraso
            : Number(p?.valor_mora || 0) * diasAtraso;
          const moraCalculada = Math.max(0, baseMora - Number(a.mora_pagada || 0));
          moraPendiente = Math.max(saldoMoraGuardada, moraCalculada);
        }

        prestamoAgg[a.prestamo_id].capital += saldoCapital;
        prestamoAgg[a.prestamo_id].interes += saldoInteres;
        prestamoAgg[a.prestamo_id].mora += moraPendiente;
        prestamoAgg[a.prestamo_id].saldo += saldoCapital + saldoInteres + moraPendiente;

        if (hayAtraso && (saldoCapital + saldoInteres + moraPendiente) > 0) {
          prestamoAgg[a.prestamo_id].tieneAtraso = true;
        }
      }

      let activos = 0, colocado = 0, totalPagar = 0, porCobrar = 0, capitalPorCobrar = 0, interesPorCobrar = 0, moraPorCobrar = 0, ganancia = 0, enMora = 0, moraTotal = 0, liquidados = 0, capitalRecuperado = 0;
      for (const p of prestamos) {
        const agg = prestamoAgg[p.id] || { saldo: 0, mora: 0, capital: 0, interes: 0, tieneAtraso: false };
        const monto = Number(p.monto_solicitado || 0);
        const total = Number(p.monto_total_pagar || 0);
        const isActive = p.estado !== "Liquidado";
        if (isActive) activos++; else { liquidados++; capitalRecuperado += monto; }
        colocado += monto;
        totalPagar += total;
        porCobrar += agg.saldo;
        capitalPorCobrar += agg.capital;
        interesPorCobrar += agg.interes;
        moraPorCobrar += agg.mora;
        ganancia += (total - monto) + agg.mora;
        if (agg.tieneAtraso) { enMora++; moraTotal += agg.mora; }
      }

      return { activos, colocado, totalPagar, porCobrar, capitalPorCobrar, interesPorCobrar, moraPorCobrar, ganancia, enMora, moraTotal, liquidados, capitalRecuperado };
    },
  });
}

interface KardexRow { id: string; fecha: string; tipo: "entrada" | "salida"; concepto: string; monto: number; categoria: string; }

function classifyConcepto(concepto: string, tipo: "entrada" | "salida"): string {
  const lower = concepto.toLowerCase();
  if (lower.includes("cobro") || lower.includes("pago cuota")) return "Cobros";
  if (lower.includes("desembolso") || lower.includes("préstamo")) return "Desembolsos";
  if (lower.includes("comisión") || lower.includes("comision") || lower.includes("corte")) return "Comisiones";
  if (lower.includes("transferencia")) return "Transferencias";
  if (lower.includes("[") || lower.includes("gasto")) return "Gastos";
  if (tipo === "entrada") return "Depósitos";
  return "Retiros";
}

function useCajaKardex(cajaId: string) {
  return useQuery({
    queryKey: ["caja-kardex", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const { data: movs } = await supabase.from("movimientos_caja").select("id, created_at, tipo, monto, concepto").eq("caja_id", cajaId).order("created_at", { ascending: true });

      const rows: KardexRow[] = [];
      for (const m of movs || []) {
        const concepto = m.concepto || (m.tipo === "entrada" ? "Depósito" : "Retiro");
        rows.push({ id: m.id, fecha: m.created_at || "", tipo: m.tipo as "entrada" | "salida", concepto, monto: Number(m.monto || 0), categoria: classifyConcepto(concepto, m.tipo as "entrada" | "salida") });
      }
      rows.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      return rows;
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

// ── Chart colors ──────────────────────────────────────────────
const COLORS = [
  "hsl(142, 71%, 45%)", "hsl(0, 84%, 60%)", "hsl(217, 91%, 60%)",
  "hsl(38, 92%, 50%)", "hsl(262, 83%, 58%)", "hsl(187, 85%, 43%)"
];

// ── Modal type ────────────────────────────────────────────────
type ModalType = "depositar" | "retirar" | "transferir" | null;

export default function CajaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: caja, isLoading: loadingCaja } = useCaja(id || "");
  const { data: stats, isLoading: loadingStats } = useCajaStats(id || "");
  const { data: rows = [], isLoading: loadingKardex } = useCajaKardex(id || "");
  const { data: allCajas = [] } = useAllCajas(empresaId);

  const [tab, setTab] = useState("resumen");
  const [modal, setModal] = useState<ModalType>(null);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [cajaDestinoId, setCajaDestinoId] = useState("");
  const [saving, setSaving] = useState(false);

  const saldoActual = Number(caja?.saldo_actual || 0);
  const invalidate = () => invalidateFinanceQueries(queryClient);
  const resetModal = () => { setModal(null); setMonto(""); setConcepto(""); setCajaDestinoId(""); };

  // ── Movimiento handler ────────────────────────────────────────
  const handleMovimiento = async (tipo: "entrada" | "salida") => {
    const m = parseFloat(monto);
    if (!id || !m || m <= 0) return;
    if (tipo === "salida" && saldoActual < m) { toast.error("Saldo insuficiente"); return; }
    setSaving(true);
    const { error } = await supabase.from("movimientos_caja").insert({ caja_id: id, tipo, monto: m, concepto: concepto.trim() || (tipo === "entrada" ? "Depósito manual" : "Retiro manual"), empresa_id: empresaId });
    if (error) { toast.error(error.message); setSaving(false); return; }
    await supabase.from("cajas").update({ saldo_actual: tipo === "entrada" ? saldoActual + m : saldoActual - m }).eq("id", id);
    setSaving(false);
    toast.success(tipo === "entrada" ? `Depósito de ${$$(m)}` : `Retiro de ${$$(m)}`);
    invalidate();
    queryClient.invalidateQueries({ queryKey: ["caja-detalle", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-stats", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-kardex", id] });
    resetModal();
  };

  const handleTransferir = async () => {
    const m = parseFloat(monto);
    if (!id || !cajaDestinoId || id === cajaDestinoId || !m || m <= 0) return;
    if (saldoActual < m) { toast.error("Saldo insuficiente"); return; }
    setSaving(true);
    const destino = allCajas.find(c => c.id === cajaDestinoId);
    const nota = concepto.trim() || `Transferencia ${caja?.nombre} → ${destino?.nombre}`;
    await supabase.from("movimientos_caja").insert({ caja_id: id, tipo: "salida", monto: m, concepto: nota, empresa_id: empresaId });
    await supabase.from("cajas").update({ saldo_actual: saldoActual - m }).eq("id", id);
    await supabase.from("movimientos_caja").insert({ caja_id: cajaDestinoId, tipo: "entrada", monto: m, concepto: nota, empresa_id: empresaId });
    await supabase.from("cajas").update({ saldo_actual: (Number(destino?.saldo_actual) || 0) + m }).eq("id", cajaDestinoId);
    setSaving(false);
    toast.success(`Transferencia de ${$$(m)} completada`);
    invalidate();
    queryClient.invalidateQueries({ queryKey: ["caja-detalle", id] });
    queryClient.invalidateQueries({ queryKey: ["caja-kardex", id] });
    resetModal();
  };

  // ── Computed data ──────────────────────────────────────────────
  const withBalance = useMemo(() => {
    let balance = 0;
    return rows.map(r => { balance += r.tipo === "entrada" ? r.monto : -r.monto; return { ...r, balance }; }).reverse();
  }, [rows]);

  const flujoData = useMemo(() => {
    const entradas: Record<string, number> = {};
    const salidas: Record<string, number> = {};
    let totalEntradas = 0, totalSalidas = 0;
    for (const r of rows) {
      if (r.tipo === "entrada") { entradas[r.categoria] = (entradas[r.categoria] || 0) + r.monto; totalEntradas += r.monto; }
      else { salidas[r.categoria] = (salidas[r.categoria] || 0) + r.monto; totalSalidas += r.monto; }
    }
    const saldoInicial = saldoActual - totalEntradas + totalSalidas;
    return { entradas, salidas, totalEntradas, totalSalidas, saldoInicial, flujoNeto: totalEntradas - totalSalidas };
  }, [rows, saldoActual]);

  // Pie chart data for entradas/salidas composition
  const pieEntradas = useMemo(() => Object.entries(flujoData.entradas).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), [flujoData]);
  const pieSalidas = useMemo(() => Object.entries(flujoData.salidas).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), [flujoData]);

  const s = stats || { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, capitalPorCobrar: 0, interesPorCobrar: 0, moraPorCobrar: 0, ganancia: 0, enMora: 0, moraTotal: 0, liquidados: 0, capitalRecuperado: 0 };

  const kpis = [
    { label: "Préstamos Activos", value: String(s.activos), icon: FileText, accent: "text-[hsl(217,91%,60%)]", bg: "bg-[hsl(217,91%,60%)]/10" },
    { label: "Monto Colocado", value: $$(s.colocado), icon: DollarSign, accent: "text-foreground", bg: "bg-muted" },
    { label: "Total a Cobrar", value: $$(s.totalPagar + s.moraPorCobrar), icon: TrendingUp, accent: "text-primary", bg: "bg-primary/10" },
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
            <p className="text-3xl font-extrabold tracking-tight mt-0.5">{$$(saldoActual)}</p>
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
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="text-lg font-bold tracking-tight">{loadingStats ? "—" : k.value}</p>
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
        <TabsList>
          <TabsTrigger value="resumen" className="text-[13px]">Resumen</TabsTrigger>
          <TabsTrigger value="kardex" className="text-[13px]">Kardex</TabsTrigger>
          <TabsTrigger value="flujo" className="text-[13px]">Flujo de Efectivo</TabsTrigger>
        </TabsList>

        {/* ── Resumen Tab ──────────────────────────────────────────── */}
        <TabsContent value="resumen" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Composición de Entradas */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ArrowDownLeft className="h-4 w-4 text-success" />Composición de Entradas
                </h3>
                {pieEntradas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin entradas</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={160}>
                      <PieChart>
                        <Pie data={pieEntradas} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" strokeWidth={2} stroke="hsl(var(--card))">
                          {pieEntradas.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => $$(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {pieEntradas.map((e, i) => (
                        <div key={e.name} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {e.name}
                          </span>
                          <span className="font-medium">{$$(e.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Composición de Salidas */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-destructive" />Composición de Salidas
                </h3>
                {pieSalidas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin salidas</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={160}>
                      <PieChart>
                        <Pie data={pieSalidas} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" strokeWidth={2} stroke="hsl(var(--card))">
                          {pieSalidas.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => $$(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {pieSalidas.map((e, i) => (
                        <div key={e.name} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {e.name}
                          </span>
                          <span className="font-medium">{$$(e.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bar chart: Entradas vs Salidas */}
            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />Entradas vs Salidas
                </h3>
                {flujoData.totalEntradas === 0 && flujoData.totalSalidas === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={[
                      { name: "Entradas", monto: flujoData.totalEntradas },
                      { name: "Salidas", monto: flujoData.totalSalidas },
                      { name: "Flujo Neto", monto: flujoData.flujoNeto },
                    ]} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => $$(v)} width={80} />
                      <Tooltip formatter={(v: number) => $$(v)} />
                      <Bar dataKey="monto" radius={[6, 6, 0, 0]}>
                        <Cell fill="hsl(142, 71%, 45%)" />
                        <Cell fill="hsl(0, 84%, 60%)" />
                        <Cell fill={flujoData.flujoNeto >= 0 ? "hsl(217, 91%, 60%)" : "hsl(38, 92%, 50%)"} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Summary card: Cartera */}
            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-4">Resumen de Cartera</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Capital Colocado", value: $$(s.colocado), color: "text-foreground" },
                    { label: "Total a Cobrar", value: $$(s.totalPagar), color: "text-foreground" },
                    { label: "Pendiente", value: $$(s.porCobrar), color: "text-warning" },
                    { label: "Ganancia", value: $$(s.ganancia), color: "text-success" },
                    { label: "Liquidados", value: String(s.liquidados), color: "text-muted-foreground" },
                    { label: "Capital Recuperado", value: $$(s.capitalRecuperado), color: "text-success" },
                    { label: "Mora Acumulada", value: $$(s.moraTotal), color: "text-destructive" },
                    { label: "Préstamos en Mora", value: String(s.enMora), color: "text-destructive" },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                      <p className={cn("text-lg font-bold mt-0.5", item.color)}>{loadingStats ? "—" : item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Kardex Tab ──────────────────────────────────────────── */}
        <TabsContent value="kardex" className="mt-4">
          {loadingKardex ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : withBalance.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin movimientos</p>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-border bg-card rounded-lg border">
                {withBalance.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{r.concepto}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{r.fecha ? format(new Date(r.fecha), "dd/MM/yy HH:mm", { locale: es }) : "—"}</p>
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
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Entrada</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Salida</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withBalance.map(r => (
                      <TableRow key={r.id} className="border-b border-border/50">
                        <TableCell className="text-[12px] px-3 whitespace-nowrap">{r.fecha ? format(new Date(r.fecha), "dd/MM/yy HH:mm", { locale: es }) : "—"}</TableCell>
                        <TableCell className="text-[13px] px-3 max-w-[250px] truncate">{r.concepto}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-success font-medium">{r.tipo === "entrada" ? $$(r.monto) : ""}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-destructive font-medium">{r.tipo === "salida" ? $$(r.monto) : ""}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 font-semibold">{$$(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Flujo de Efectivo Tab ────────────────────────────────── */}
        <TabsContent value="flujo" className="mt-4">
          {loadingKardex ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
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
              <Select value={cajaDestinoId} onValueChange={setCajaDestinoId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar destino" /></SelectTrigger>
                <SelectContent>{allCajas.filter(c => c.id !== id).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(Number(c.saldo_actual || 0))}</SelectItem>)}</SelectContent>
              </Select>
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
