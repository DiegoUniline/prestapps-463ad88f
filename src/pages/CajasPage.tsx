import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CajaKardexSheet from "@/components/CajaKardexSheet";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, DollarSign, Wallet, TrendingUp, TrendingDown, Loader2, FileText, AlertTriangle, PiggyBank, BarChart3, CalendarIcon, X, LayoutGrid, List, MoreHorizontal, Eye } from "lucide-react";
import { format } from "date-fns";
import { cn, $$, fmtDate } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
// ── Data hooks ────────────────────────────────────────────────────
function useCajas(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-page", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cajas").select("id, nombre, descripcion, saldo_actual, empresa_id, created_at").eq("empresa_id", empresaId).order("nombre");
      if (error) throw error;
      return data || [];
    },
  });
}

interface KardexEntry {
  id: string;
  fecha: string;
  tipo: "entrada" | "salida";
  categoria: string; // Cobro, Desembolso, Depósito, Retiro, Transferencia
  concepto: string;
  cliente: string;
  prestamo: string;
  caja: string;
  cajaId: string;
  usuario: string;
  monto: number;
}

function useKardex() {
  return useQuery({
    queryKey: ["kardex-all"],
    queryFn: async () => {
      // 1) Movimientos de caja
      const { data: movs, error: movErr } = await supabase
        .from("movimientos_caja")
        .select("*, cajas ( nombre ), prestamos ( id, clientes ( nombre_completo ) )")
        .order("created_at", { ascending: false })
        .limit(500);
      if (movErr) throw movErr;

      // 2) Pagos (cobros)
      const { data: pagos, error: pagErr } = await supabase
        .from("pagos")
        .select("*, cajas ( nombre ), prestamos ( id, clientes ( nombre_completo ) )")
        .order("created_at", { ascending: false })
        .limit(500);
      if (pagErr) throw pagErr;

      // 3) Préstamos (desembolsos) — siempre mostrar como salida
      const { data: prestamos, error: preErr } = await supabase
        .from("prestamos")
        .select("id, monto_solicitado, created_at, fecha_registro, caja_id, cajas ( nombre ), clientes ( nombre_completo )")
        .order("created_at", { ascending: false })
        .limit(500);
      if (preErr) throw preErr;

      const entries: KardexEntry[] = [];

      // Track movimiento prestamo_ids to avoid duplicates
      const movPrestamoIds = new Set((movs || []).filter(m => m.prestamo_id).map(m => m.prestamo_id));

      // Map movimientos
      for (const m of movs || []) {
        const prestamo = m.prestamos as any;
        const cliente = prestamo?.clientes as any;
        const concepto = m.concepto || "";
        let categoria = m.tipo === "entrada" ? "Depósito" : "Retiro";
        if (concepto.toLowerCase().includes("transferencia")) categoria = "Transferencia";
        if (concepto.toLowerCase().includes("desembolso") || concepto.toLowerCase().includes("préstamo")) {
          categoria = m.tipo === "salida" ? "Desembolso" : "Cobro";
        }
        if (concepto.toLowerCase().includes("pago")) categoria = "Cobro";

        entries.push({
          id: `mov-${m.id}`,
          fecha: m.created_at || "",
          tipo: m.tipo as "entrada" | "salida",
          categoria,
          concepto: concepto || (m.tipo === "entrada" ? "Depósito" : "Retiro"),
          cliente: cliente?.nombre_completo || "",
          prestamo: prestamo?.id ? `PRE-${prestamo.id.slice(0, 8)}` : "",
          caja: (m.cajas as any)?.nombre || "—",
          cajaId: m.caja_id,
          usuario: "",
          monto: Number(m.monto || 0),
        });
      }

      // Map pagos as cobros — skip if already in movimientos
      const pagoPrestamoAmounts = new Set<string>();
      for (const p of pagos || []) {
        const prestamo = p.prestamos as any;
        const cliente = prestamo?.clientes as any;
        const key = `${p.prestamo_id}-${Number(p.monto_recibido).toFixed(2)}-${p.created_at}`;
        if (pagoPrestamoAmounts.has(key)) continue;
        pagoPrestamoAmounts.add(key);

        entries.push({
          id: `pago-${p.id}`,
          fecha: p.created_at || "",
          tipo: "entrada",
          categoria: "Cobro",
          concepto: `Cobro cuota — ${$$(Number(p.monto_recibido))}`,
          cliente: cliente?.nombre_completo || "",
          prestamo: prestamo?.id ? `PRE-${prestamo.id.slice(0, 8)}` : "",
          caja: (p.cajas as any)?.nombre || "—",
          cajaId: p.caja_id || "",
          usuario: "",
          monto: Number(p.monto_recibido || 0),
        });
      }

      // Map préstamos as desembolsos — skip if already tracked via movimientos_caja
      for (const pr of prestamos || []) {
        if (movPrestamoIds.has(pr.id)) continue; // already has a movimiento
        const cliente = (pr as any).clientes as any;
        const caja = (pr as any).cajas as any;

        entries.push({
          id: `pre-${pr.id}`,
          fecha: pr.created_at || pr.fecha_registro || "",
          tipo: "salida",
          categoria: "Desembolso",
          concepto: `Desembolso préstamo — ${$$(Number(pr.monto_solicitado))}`,
          cliente: cliente?.nombre_completo || "",
          prestamo: `PRE-${pr.id.slice(0, 8)}`,
          caja: caja?.nombre || "—",
          cajaId: pr.caja_id || "",
          usuario: "",
          monto: Number(pr.monto_solicitado || 0),
        });
      }

      // Sort by date descending
      entries.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      return entries;
    },
  });
}

// Stats from prestamos + amortizacion per caja
function usePrestamosByCaja(empresaId?: string) {
  return useQuery({
    queryKey: ["prestamos-by-caja", empresaId],
    queryFn: async () => {
      let q = supabase
        .from("prestamos")
        .select("id, caja_id, monto_solicitado, monto_total_pagar, estado, tipo_mora, valor_mora")
        .not("estado", "in", '("Cancelado")');
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data: prestamos, error } = await q;
      if (error) throw error;
      if (!prestamos || prestamos.length === 0) return { global: { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 }, byCaja: {} as Record<string, any> };

      const ids = prestamos.map((p) => p.id);
      const prestamoMap = new Map(prestamos.map((p) => [p.id, p]));
      const amortData = await fetchAllRows(
        supabase
          .from("amortizacion")
          .select("prestamo_id, saldo_total, saldo_mora, saldo_capital, saldo_interes, capital_interes, mora_pagada, status, fecha_vencimiento")
          .in("prestamo_id", ids)
      );

      const today = new Date().toISOString().slice(0, 10);

      // Per-prestamo aggregation
      const prestamoAgg: Record<string, { saldo: number; mora: number; moraCobrada: number; moraGuardada: number; capital: number; interes: number; tieneAtraso: boolean }> = {};
      for (const a of amortData) {
        const p = prestamoMap.get(a.prestamo_id);
        if (!prestamoAgg[a.prestamo_id]) prestamoAgg[a.prestamo_id] = { saldo: 0, mora: 0, moraCobrada: 0, moraGuardada: 0, capital: 0, interes: 0, tieneAtraso: false };

        const saldoMoraGuardada = Number(a.saldo_mora || 0);
        const moraPagada = Number(a.mora_pagada || 0);
        let moraPendiente = saldoMoraGuardada;

        const hayAtraso = !!a.fecha_vencimiento && a.fecha_vencimiento < today;
        if (hayAtraso && Number(a.saldo_total || 0) > 0 && Number(p?.valor_mora || 0) > 0) {
          const diasAtraso = Math.max(0, Math.floor((new Date(today).getTime() - new Date(a.fecha_vencimiento).getTime()) / 86400000));
          const baseMora = p?.tipo_mora === "porcentaje"
            ? Number(a.capital_interes || 0) * (Number(p?.valor_mora || 0) / 100) * diasAtraso
            : Number(p?.valor_mora || 0) * diasAtraso;
          moraPendiente = Math.max(saldoMoraGuardada, Math.max(0, baseMora - moraPagada));
        }

        prestamoAgg[a.prestamo_id].saldo += Number(a.saldo_total || 0);
        prestamoAgg[a.prestamo_id].capital += Number(a.saldo_capital || 0);
        prestamoAgg[a.prestamo_id].interes += Number(a.saldo_interes || 0);
        prestamoAgg[a.prestamo_id].mora += moraPendiente;
        prestamoAgg[a.prestamo_id].moraCobrada += moraPagada;
        prestamoAgg[a.prestamo_id].moraGuardada += saldoMoraGuardada;
        if (hayAtraso && Number(a.saldo_total || 0) > 0) {
          prestamoAgg[a.prestamo_id].tieneAtraso = true;
        }
      }

      // Global + per-caja stats
      const byCaja: Record<string, { activos: number; colocado: number; totalPagar: number; porCobrar: number; gananciaProyectada: number; enMora: number; moraTotal: number }> = {};
      let global = { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 };

      for (const p of prestamos) {
        const cajaKey = p.caja_id || "sin-caja";
        if (!byCaja[cajaKey]) byCaja[cajaKey] = { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 };
        const agg = prestamoAgg[p.id] || { saldo: 0, mora: 0, moraCobrada: 0, moraGuardada: 0, capital: 0, interes: 0, tieneAtraso: false };
        const isActive = p.estado !== "Liquidado";
        const monto = Number(p.monto_solicitado || 0);
        const totalPagar = Number(p.monto_total_pagar || 0);
        // Ganancia = interés original + mora cobrada + mora pendiente
        const ganancia = (totalPagar - monto) + agg.moraCobrada + agg.mora;
        // Por cobrar = saldo pendiente real (capital + interes + mora dinámica)
        const porCobrar = agg.capital + agg.interes + agg.mora;

        if (isActive) {
          global.activos++; byCaja[cajaKey].activos++;
        }
        global.colocado += monto; byCaja[cajaKey].colocado += monto;
        global.totalPagar += porCobrar; byCaja[cajaKey].totalPagar += porCobrar;
        global.porCobrar += porCobrar; byCaja[cajaKey].porCobrar += porCobrar;
        global.gananciaProyectada += ganancia; byCaja[cajaKey].gananciaProyectada += ganancia;
        if (agg.tieneAtraso) {
          global.enMora++; byCaja[cajaKey].enMora++;
          global.moraTotal += agg.mora; byCaja[cajaKey].moraTotal += agg.mora;
        }
      }

      return { global, byCaja };
    },
  });
}

// ── Modal types ───────────────────────────────────────────────────
type ModalType = "depositar" | "retirar" | "transferir" | "nueva-caja" | null;

// ── Component ─────────────────────────────────────────────────────
export default function CajasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: cajas = [], isLoading } = useCajas(empresaId);
  const { data: kardex = [] } = useKardex();
  const { data: prestamoStats } = usePrestamosByCaja(empresaId);
  const g = prestamoStats?.global || { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 };
  const byCaja = prestamoStats?.byCaja || {};

  const [modal, setModal] = useState<ModalType>(null);
  const [cajaId, setCajaId] = useState("");
  const [cajaDestinoId, setCajaDestinoId] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [nombreCaja, setNombreCaja] = useState("");
  const [descCaja, setDescCaja] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedCaja, setSelectedCaja] = useState<string | null>(null);
  const [cajasView, setCajasView] = useState<"table" | "cards">("table");
  const [kardexCaja, setKardexCaja] = useState<{ id: string; nombre: string; saldo: number } | null>(null);

  // Kardex filters
  const [selCategoria, setSelCategoria] = useState<Set<string>>(new Set());
  const [kardexDesde, setKardexDesde] = useState<Date>();
  const [kardexHasta, setKardexHasta] = useState<Date>();

  const resetModal = () => {
    setModal(null); setCajaId(""); setCajaDestinoId(""); setMonto(""); setConcepto("");
    setNombreCaja(""); setDescCaja("");
  };

  const openModalForCaja = (type: ModalType, id: string) => {
    setCajaId(id);
    setModal(type);
  };

  const invalidate = () => invalidateFinanceQueries(queryClient);

  // ── Create caja ─────────────────────────────────────────────────
  const handleCrearCaja = async () => {
    if (!nombreCaja.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("cajas").insert({ nombre: nombreCaja.trim(), descripcion: descCaja.trim() || null, empresa_id: empresaId });
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Caja creada");
    invalidate();
    resetModal();
  };

  // ── Deposit / Withdraw ──────────────────────────────────────────
  const handleMovimiento = async (tipo: "entrada" | "salida") => {
    const m = parseFloat(monto);
    if (!cajaId || !m || m <= 0) return;
    setSaving(true);

    const caja = cajas.find((c) => c.id === cajaId);
    if (tipo === "salida" && caja && (Number(caja.saldo_actual) || 0) < m) {
      toast.error("Saldo insuficiente");
      setSaving(false);
      return;
    }

    const { error: movErr } = await supabase.from("movimientos_caja").insert({
      caja_id: cajaId, tipo, monto: m,
      concepto: concepto.trim() || (tipo === "entrada" ? "Depósito manual" : "Retiro manual"),
      empresa_id: empresaId,
    });
    if (movErr) { toast.error("Error: " + movErr.message); setSaving(false); return; }
    // saldo_actual se sincroniza automáticamente via trigger

    setSaving(false);
    toast.success(tipo === "entrada" ? `Depósito de ${$$(m)} registrado` : `Retiro de ${$$(m)} registrado`);
    invalidate();
    resetModal();
  };

  // ── Transfer ────────────────────────────────────────────────────
  const handleTransferir = async () => {
    const m = parseFloat(monto);
    if (!cajaId || !cajaDestinoId || cajaId === cajaDestinoId || !m || m <= 0) return;
    setSaving(true);

    const origen = cajas.find((c) => c.id === cajaId);
    if (origen && (Number(origen.saldo_actual) || 0) < m) {
      toast.error("Saldo insuficiente en caja origen");
      setSaving(false);
      return;
    }

    const destino = cajas.find((c) => c.id === cajaDestinoId);
    const nota = concepto.trim() || `Transferencia ${origen?.nombre} → ${destino?.nombre}`;

    await supabase.from("movimientos_caja").insert({ caja_id: cajaId, tipo: "salida", monto: m, concepto: nota, empresa_id: empresaId });
    await supabase.from("movimientos_caja").insert({ caja_id: cajaDestinoId, tipo: "entrada", monto: m, concepto: nota, empresa_id: empresaId });
    // saldo_actual se sincroniza automáticamente via trigger

    setSaving(false);
    toast.success(`Transferencia de ${$$(m)} completada`);
    invalidate();
    resetModal();
  };

  // ── KPIs ────────────────────────────────────────────────────────
  const totalSaldo = cajas.reduce((s, c) => s + Number(c.saldo_actual || 0), 0);
  const entradas = kardex.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.monto, 0);
  const salidas = kardex.filter((m) => m.tipo === "salida").reduce((s, m) => s + m.monto, 0);

  const kpis = [
    { label: "Saldo en Cajas", value: $$(totalSaldo), icon: Wallet, accent: "text-primary" },
    { label: "Préstamos Activos", value: String(g.activos), icon: FileText, accent: "text-[hsl(217,91%,60%)]" },
    { label: "Monto Colocado", value: $$(g.colocado), icon: DollarSign, accent: "text-foreground" },
    { label: "Por Cobrar", value: $$(g.porCobrar), icon: TrendingUp, accent: "text-warning" },
    { label: "Ganancia Proyectada", value: $$(g.gananciaProyectada), icon: PiggyBank, accent: "text-success" },
    { label: `En Mora (${g.enMora})`, value: $$(g.moraTotal), icon: AlertTriangle, accent: "text-destructive" },
    { label: "Entradas", value: $$(entradas), icon: ArrowDownLeft, accent: "text-success" },
    { label: "Salidas", value: $$(salidas), icon: ArrowUpRight, accent: "text-destructive" },
  ];

  // Filter kardex
  const filteredMov = kardex.filter((m) => {
    if (selectedCaja && m.cajaId !== selectedCaja) return false;
    if (selCategoria.size > 0 && !selCategoria.has(m.categoria)) return false;
    if (kardexDesde && new Date(m.fecha) < kardexDesde) return false;
    if (kardexHasta) {
      const hasta = new Date(kardexHasta);
      hasta.setHours(23, 59, 59, 999);
      if (new Date(m.fecha) > hasta) return false;
    }
    return true;
  });

  const kardexCategories = ["Cobro", "Desembolso", "Depósito", "Retiro", "Transferencia"];
  const totalKardexFilters = selCategoria.size + (kardexDesde ? 1 : 0) + (kardexHasta ? 1 : 0);
  const clearKardexFilters = () => { setSelCategoria(new Set()); setKardexDesde(undefined); setKardexHasta(undefined); };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cajas</h1>
        <Button size="sm" className="h-8 text-[13px]" onClick={() => setModal("nueva-caja")}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Nueva Caja
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card rounded-lg border border-border px-4 py-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
              <k.icon className={cn("h-4 w-4", k.accent)} />
            </div>
            <p className="text-lg font-semibold mt-1">{isLoading ? "—" : k.value}</p>
          </div>
        ))}
      </div>

      {/* Cajas view toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Cajas ({cajas.length})</h2>
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          <Button variant={cajasView === "table" ? "default" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setCajasView("table")}>
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button variant={cajasView === "cards" ? "default" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setCajasView("cards")}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Cajas TABLE view */}
      {cajasView === "table" ? (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-[hsl(var(--table-header))]">
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))]">Caja</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Saldo</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Activos</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Colocado</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Por Cobrar</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Ganancia</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">En Mora</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Mora $</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ))
              ) : cajas.map((c) => {
                const cs = byCaja[c.id] || { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 };
                return (
                  <TableRow
                    key={c.id}
                    className={cn("cursor-pointer", selectedCaja === c.id && "bg-[hsl(var(--table-selected))]")}
                    onClick={() => navigate(`/cajas/${c.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-[13px]">{c.nombre}</p>
                        {c.descripcion && <p className="text-[11px] text-muted-foreground">{c.descripcion}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-[13px]">{$$(Number(c.saldo_actual || 0))}</TableCell>
                    <TableCell className="text-right text-[13px]">{cs.activos}</TableCell>
                    <TableCell className="text-right text-[13px]">{$$(cs.colocado)}</TableCell>
                    <TableCell className="text-right text-[13px]">{$$(cs.porCobrar)}</TableCell>
                    <TableCell className="text-right text-[13px] text-success">{$$(cs.gananciaProyectada)}</TableCell>
                    <TableCell className={cn("text-right text-[13px]", cs.enMora > 0 && "text-destructive")}>{cs.enMora}</TableCell>
                    <TableCell className={cn("text-right text-[13px]", cs.moraTotal > 0 && "text-destructive")}>{$$(cs.moraTotal)}</TableCell>
                    <TableCell className="px-1" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => navigate(`/cajas/${c.id}`)}>
                            <Eye className="h-3.5 w-3.5 mr-2" />Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openModalForCaja("depositar", c.id)}>
                            <ArrowDownLeft className="h-3.5 w-3.5 mr-2 text-success" />Depositar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openModalForCaja("retirar", c.id)}>
                            <ArrowUpRight className="h-3.5 w-3.5 mr-2 text-destructive" />Retirar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openModalForCaja("transferir", c.id)}>
                            <ArrowLeftRight className="h-3.5 w-3.5 mr-2 text-primary" />Transferir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Cajas CARDS view */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)
          ) : cajas.map((c) => {
            const cs = byCaja[c.id] || { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 };
            return (
              <div
                key={c.id}
                className={cn(
                  "bg-card rounded-lg border px-5 py-4 cursor-pointer transition-all hover:shadow-md",
                  selectedCaja === c.id ? "border-primary ring-1 ring-primary/30" : "border-border"
                )}
                onClick={() => navigate(`/cajas/${c.id}`)}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[14px]">{c.nombre}</p>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => navigate(`/cajas/${c.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-2" />Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openModalForCaja("depositar", c.id)}>
                          <ArrowDownLeft className="h-3.5 w-3.5 mr-2 text-success" />Depositar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openModalForCaja("retirar", c.id)}>
                          <ArrowUpRight className="h-3.5 w-3.5 mr-2 text-destructive" />Retirar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openModalForCaja("transferir", c.id)}>
                          <ArrowLeftRight className="h-3.5 w-3.5 mr-2 text-primary" />Transferir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <p className="text-2xl font-bold mt-1">{$$(Number(c.saldo_actual || 0))}</p>
                {c.descripcion && <p className="text-[12px] text-muted-foreground mt-0.5">{c.descripcion}</p>}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Activos</p>
                    <p className="text-[13px] font-semibold">{cs.activos}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Colocado</p>
                    <p className="text-[13px] font-semibold">{$$(cs.colocado)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Por Cobrar</p>
                    <p className="text-[13px] font-semibold">{$$(cs.porCobrar)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ganancia</p>
                    <p className="text-[13px] font-semibold text-success">{$$(cs.gananciaProyectada)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">En Mora</p>
                    <p className={cn("text-[13px] font-semibold", cs.enMora > 0 ? "text-destructive" : "")}>{cs.enMora}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mora $</p>
                    <p className={cn("text-[13px] font-semibold", cs.moraTotal > 0 ? "text-destructive" : "")}>{$$(cs.moraTotal)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Kardex table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[14px] font-semibold">
            Kardex {selectedCaja ? `— ${cajas.find(c => c.id === selectedCaja)?.nombre}` : "— Todos los movimientos"}
          </h2>
          <div className="flex items-center gap-1">
            {selectedCaja && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedCaja(null)}>
                Ver todos
              </Button>
            )}
          </div>
        </div>

        {/* Kardex filter bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Categoría dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(
                "h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-border hover:bg-primary/5",
                selCategoria.size > 0 && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
              )}>
                Categoría
                {selCategoria.size > 0 && (
                  <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold px-1">
                    {selCategoria.size}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-0.5">
                {kardexCategories.map((cat) => (
                  <label key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
                    <Checkbox checked={selCategoria.has(cat)} onCheckedChange={() => {
                      const next = new Set(selCategoria);
                      next.has(cat) ? next.delete(cat) : next.add(cat);
                      setSelCategoria(next);
                    }} />
                    <span>{cat}</span>
                  </label>
                ))}
              </div>
              {selCategoria.size > 0 && (
                <Button variant="ghost" size="sm" className="w-full mt-1.5 h-7 text-xs" onClick={() => setSelCategoria(new Set())}>Limpiar</Button>
              )}
            </PopoverContent>
          </Popover>

          {/* Fecha Desde */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(
                "h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-border hover:bg-primary/5",
                kardexDesde && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
              )}>
                <CalendarIcon className="h-3 w-3" />
                {kardexDesde ? fmtDate(kardexDesde) : "Desde"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={kardexDesde} onSelect={setKardexDesde} className="p-3 pointer-events-auto" />
              {kardexDesde && <div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setKardexDesde(undefined)}>Limpiar</Button></div>}
            </PopoverContent>
          </Popover>

          {/* Fecha Hasta */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(
                "h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-border hover:bg-primary/5",
                kardexHasta && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
              )}>
                <CalendarIcon className="h-3 w-3" />
                {kardexHasta ? fmtDate(kardexHasta) : "Hasta"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={kardexHasta} onSelect={setKardexHasta} className="p-3 pointer-events-auto" />
              {kardexHasta && <div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setKardexHasta(undefined)}>Limpiar</Button></div>}
            </PopoverContent>
          </Popover>

          <div className="flex-1" />
          <p className="text-[12px] text-muted-foreground">{filteredMov.length} movimiento{filteredMov.length !== 1 ? "s" : ""}</p>
          {totalKardexFilters > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={clearKardexFilters}>
              <X className="h-3 w-3 mr-1" />Limpiar
            </Button>
          )}
        </div>
        <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header border-b">
                {["", "Fecha", "Categoría", "Concepto", "Cliente", "Préstamo", "Caja"].map((h) => (
                  <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5 whitespace-nowrap">{h}</TableHead>
                ))}
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5 whitespace-nowrap">Entrada</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5 whitespace-nowrap">Salida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMov.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-[13px]">Sin movimientos</TableCell></TableRow>
              ) : filteredMov.map((m) => {
                const catColors: Record<string, string> = {
                  Cobro: "bg-success/10 text-success",
                  Desembolso: "bg-[hsl(217,91%,60%)]/10 text-[hsl(217,91%,60%)]",
                  "Depósito": "bg-primary/10 text-primary",
                  Retiro: "bg-destructive/10 text-destructive",
                  Transferencia: "bg-warning/10 text-warning",
                };
                return (
                  <TableRow key={m.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                    <TableCell className="px-3 w-10">
                      <div className={cn("h-6 w-6 rounded-full flex items-center justify-center", m.tipo === "entrada" ? "bg-success/10" : "bg-destructive/10")}>
                        {m.tipo === "entrada" ? <ArrowDownLeft className="h-3 w-3 text-success" /> : <ArrowUpRight className="h-3 w-3 text-destructive" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground px-3 whitespace-nowrap">
                      {m.fecha ? format(new Date(m.fecha), "dd/MM/yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="px-3">
                      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", catColors[m.categoria] || "bg-muted text-muted-foreground")}>
                        {m.categoria}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] px-3 max-w-[200px] truncate">{m.concepto}</TableCell>
                    <TableCell className="text-[13px] px-3 whitespace-nowrap">{m.cliente || <span className="text-muted-foreground/40">—</span>}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground px-3 font-mono">{m.prestamo || <span className="text-muted-foreground/40">—</span>}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground px-3 whitespace-nowrap">{m.caja}</TableCell>
                    <TableCell className="text-right font-medium text-[13px] px-3 text-success">
                      {m.tipo === "entrada" ? `+${$$(m.monto)}` : ""}
                    </TableCell>
                    <TableCell className="text-right font-medium text-[13px] px-3 text-destructive">
                      {m.tipo === "salida" ? `-${$$(m.monto)}` : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── MODALS ─────────────────────────────────────────────── */}

      {/* Depositar */}
      <Dialog open={modal === "depositar"} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowDownLeft className="h-4 w-4 text-success" />Depositar a Caja
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                <SelectContent>{cajas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(Number(c.saldo_actual || 0))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} className="mt-1 h-9 text-[13px]" autoFocus />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Concepto</Label>
              <Textarea value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Depósito manual" className="mt-1 text-[13px] min-h-[60px]" />
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px] bg-success hover:bg-success/90" disabled={saving || !cajaId || !(parseFloat(monto) > 0)} onClick={() => handleMovimiento("entrada")}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5" />}
              Depositar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retirar */}
      <Dialog open={modal === "retirar"} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowUpRight className="h-4 w-4 text-destructive" />Retirar de Caja
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                <SelectContent>{cajas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(Number(c.saldo_actual || 0))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} className="mt-1 h-9 text-[13px]" autoFocus />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Concepto</Label>
              <Textarea value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Retiro manual" className="mt-1 text-[13px] min-h-[60px]" />
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px] bg-destructive hover:bg-destructive/90" disabled={saving || !cajaId || !(parseFloat(monto) > 0)} onClick={() => handleMovimiento("salida")}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />}
              Retirar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transferir */}
      <Dialog open={modal === "transferir"} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="h-4 w-4 text-primary" />Transferir entre Cajas
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Origen</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar origen" /></SelectTrigger>
                <SelectContent>{cajas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(Number(c.saldo_actual || 0))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
              <Select value={cajaDestinoId} onValueChange={setCajaDestinoId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar destino" /></SelectTrigger>
                <SelectContent>{cajas.filter(c => c.id !== cajaId).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(Number(c.saldo_actual || 0))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} className="mt-1 h-9 text-[13px]" autoFocus />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Concepto</Label>
              <Textarea value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Transferencia entre cajas" className="mt-1 text-[13px] min-h-[60px]" />
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px]" disabled={saving || !cajaId || !cajaDestinoId || cajaId === cajaDestinoId || !(parseFloat(monto) > 0)} onClick={handleTransferir}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />}
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nueva Caja */}
      <Dialog open={modal === "nueva-caja"} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" />Nueva Caja
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Nombre</Label>
              <Input value={nombreCaja} onChange={(e) => setNombreCaja(e.target.value)} placeholder="Ej: Caja Principal" className="mt-1 h-9 text-[13px]" autoFocus />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Descripción</Label>
              <Textarea value={descCaja} onChange={(e) => setDescCaja(e.target.value)} placeholder="Opcional" className="mt-1 text-[13px] min-h-[60px]" />
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px]" disabled={saving || !nombreCaja.trim()} onClick={handleCrearCaja}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Crear Caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kardex Sheet */}
      <CajaKardexSheet
        open={!!kardexCaja}
        onOpenChange={(v) => !v && setKardexCaja(null)}
        cajaId={kardexCaja?.id || ""}
        cajaNombre={kardexCaja?.nombre || ""}
        saldoActual={kardexCaja?.saldo || 0}
      />
    </div>
  );
}
