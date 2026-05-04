import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCajaSaldoReal } from "@/hooks/useCajaSaldoReal";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { fetchAllRows } from "@/lib/supabaseQuery";
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
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, DollarSign, Wallet, TrendingUp, Loader2, FileText, AlertTriangle, PiggyBank, LayoutGrid, List, MoreHorizontal, Eye, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { cn, $$, parseLocalDate } from "@/lib/utils";
// ── Data hooks ────────────────────────────────────────────────────
function useCajas(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-page", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cajas").select("id, nombre, descripcion, saldo_actual, empresa_id, created_at, activo").eq("empresa_id", empresaId).order("nombre");
      if (error) throw error;
      return data || [];
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
          const diasAtraso = Math.max(0, Math.floor((parseLocalDate(today).getTime() - parseLocalDate(a.fecha_vencimiento).getTime()) / 86400000));
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
  const cajaIds = useMemo(() => cajas.map(c => c.id), [cajas]);
  const { data: saldosReales } = useCajaSaldoReal(cajaIds);
  const getSaldo = (cajaId: string) => saldosReales?.[cajaId] ?? Number(cajas.find(c => c.id === cajaId)?.saldo_actual || 0);
  
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

  const [cajasView, setCajasView] = useState<"table" | "cards">("table");
  const [tab, setTab] = useState<"activas" | "inactivas">("activas");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; nombre: string } | null>(null);
  const [confirmBaja, setConfirmBaja] = useState<{ id: string; nombre: string; activo: boolean } | null>(null);

  const cajasFiltradas = useMemo(
    () => cajas.filter((c) => (tab === "activas" ? c.activo !== false : c.activo === false)),
    [cajas, tab]
  );
  const countActivas = cajas.filter((c) => c.activo !== false).length;
  const countInactivas = cajas.filter((c) => c.activo === false).length;

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
    if (tipo === "salida" && caja && getSaldo(caja.id) < m) {
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
    if (origen && getSaldo(origen.id) < m) {
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

  // ── Toggle activo / Eliminar ────────────────────────────────────
  const handleToggleActivo = async () => {
    if (!confirmBaja) return;
    setSaving(true);
    const { error } = await supabase.from("cajas").update({ activo: !confirmBaja.activo }).eq("id", confirmBaja.id);
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success(confirmBaja.activo ? "Caja dada de baja" : "Caja reactivada");
    invalidate();
    setConfirmBaja(null);
  };

  const handleEliminar = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    // Verificar referencias
    const [{ count: pCount }, { count: pgCount }, { count: mCount }] = await Promise.all([
      supabase.from("prestamos").select("id", { count: "exact", head: true }).eq("caja_id", confirmDelete.id),
      supabase.from("pagos").select("id", { count: "exact", head: true }).eq("caja_id", confirmDelete.id),
      supabase.from("movimientos_caja").select("id", { count: "exact", head: true }).eq("caja_id", confirmDelete.id),
    ]);
    const total = (pCount || 0) + (pgCount || 0) + (mCount || 0);
    if (total > 0) {
      setSaving(false);
      toast.error(`No se puede eliminar: tiene ${total} registros relacionados. Mejor da de baja la caja.`);
      setConfirmDelete(null);
      return;
    }
    const { error } = await supabase.from("cajas").delete().eq("id", confirmDelete.id);
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Caja eliminada");
    invalidate();
    setConfirmDelete(null);
  };

  // ── KPIs ────────────────────────────────────────────────────────
  const totalSaldo = cajas.reduce((s, c) => s + getSaldo(c.id), 0);

  const kpis = [
    { label: "Saldo en Cajas", value: $$(totalSaldo), icon: Wallet, accent: "text-primary" },
    { label: "Préstamos Activos", value: String(g.activos), icon: FileText, accent: "text-[hsl(217,91%,60%)]" },
    { label: "Monto Colocado", value: $$(g.colocado), icon: DollarSign, accent: "text-foreground" },
    { label: "Por Cobrar", value: $$(g.porCobrar), icon: TrendingUp, accent: "text-warning" },
    { label: "Ganancia Proyectada", value: $$(g.gananciaProyectada), icon: PiggyBank, accent: "text-success" },
    { label: `En Mora (${g.enMora})`, value: $$(g.moraTotal), icon: AlertTriangle, accent: "text-destructive" },
  ];


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
        <Tabs value={tab} onValueChange={(v) => setTab(v as "activas" | "inactivas")}>
          <TabsList className="h-8">
            <TabsTrigger value="activas" className="text-[12px] h-7">Activas ({countActivas})</TabsTrigger>
            <TabsTrigger value="inactivas" className="text-[12px] h-7">Inactivas ({countInactivas})</TabsTrigger>
          </TabsList>
        </Tabs>
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
                    className="cursor-pointer hover:bg-table-hover"
                    onClick={() => navigate(`/cajas/${c.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-[13px]">{c.nombre}</p>
                        {c.descripcion && <p className="text-[11px] text-muted-foreground">{c.descripcion}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-[13px]">{$$(getSaldo(c.id))}</TableCell>
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
                  "border-border"
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
                <p className="text-2xl font-bold mt-1">{$$(getSaldo(c.id))}</p>
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
                <SelectContent>{cajas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(getSaldo(c.id))}</SelectItem>)}</SelectContent>
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
                <SelectContent>{cajas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(getSaldo(c.id))}</SelectItem>)}</SelectContent>
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
                <SelectContent>{cajas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(getSaldo(c.id))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
              <Select value={cajaDestinoId} onValueChange={setCajaDestinoId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar destino" /></SelectTrigger>
                <SelectContent>{cajas.filter(c => c.id !== cajaId).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(getSaldo(c.id))}</SelectItem>)}</SelectContent>
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

      </div>
  );
}
