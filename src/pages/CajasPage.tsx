import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, DollarSign, Wallet, TrendingUp, TrendingDown, Loader2, FileText, AlertTriangle, PiggyBank, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Data hooks ────────────────────────────────────────────────────
function useCajas() {
  return useQuery({
    queryKey: ["cajas-page"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cajas").select("*").order("nombre");
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
      // 1) Movimientos de caja (depósitos, retiros, transferencias, desembolsos)
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

      const entries: KardexEntry[] = [];

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

      // Map pagos as cobros (entrada)
      for (const p of pagos || []) {
        const prestamo = p.prestamos as any;
        const cliente = prestamo?.clientes as any;
        // Skip if a matching movimiento_caja already exists for this pago
        const alreadyInMovs = entries.some(e => e.concepto.includes(prestamo?.id?.slice(0, 8) || "NONE") && e.categoria !== "Desembolso" && Math.abs(e.monto - Number(p.monto_recibido)) < 0.01);
        if (alreadyInMovs) continue;

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

      // Sort by date descending
      entries.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      return entries;
    },
  });
}

// Stats from prestamos + amortizacion per caja
function usePrestamosByCaja() {
  return useQuery({
    queryKey: ["prestamos-by-caja"],
    queryFn: async () => {
      const { data: prestamos, error } = await supabase
        .from("prestamos")
        .select("id, caja_id, monto_solicitado, monto_total_pagar, estado")
        .not("estado", "in", '("Cancelado")');
      if (error) throw error;
      if (!prestamos || prestamos.length === 0) return { global: { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 }, byCaja: {} as Record<string, any> };

      const ids = prestamos.map((p) => p.id);
      const { data: amortData } = await supabase
        .from("amortizacion")
        .select("prestamo_id, saldo_total, saldo_mora, saldo_capital, saldo_interes, status, fecha_vencimiento")
        .in("prestamo_id", ids);

      const today = new Date().toISOString().slice(0, 10);

      // Per-prestamo aggregation
      const prestamoAgg: Record<string, { saldo: number; mora: number; tieneAtraso: boolean }> = {};
      for (const a of amortData || []) {
        if (!prestamoAgg[a.prestamo_id]) prestamoAgg[a.prestamo_id] = { saldo: 0, mora: 0, tieneAtraso: false };
        prestamoAgg[a.prestamo_id].saldo += Number(a.saldo_total || 0);
        prestamoAgg[a.prestamo_id].mora += Number(a.saldo_mora || 0);
        if (a.fecha_vencimiento < today && Number(a.saldo_total || 0) > 0) {
          prestamoAgg[a.prestamo_id].tieneAtraso = true;
        }
      }

      // Global + per-caja stats
      const byCaja: Record<string, { activos: number; colocado: number; totalPagar: number; porCobrar: number; gananciaProyectada: number; enMora: number; moraTotal: number }> = {};
      let global = { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 };

      for (const p of prestamos) {
        const cajaKey = p.caja_id || "sin-caja";
        if (!byCaja[cajaKey]) byCaja[cajaKey] = { activos: 0, colocado: 0, totalPagar: 0, porCobrar: 0, gananciaProyectada: 0, enMora: 0, moraTotal: 0 };
        const agg = prestamoAgg[p.id] || { saldo: 0, mora: 0, tieneAtraso: false };
        const isActive = p.estado !== "Liquidado";
        const monto = Number(p.monto_solicitado || 0);
        const totalPagar = Number(p.monto_total_pagar || 0);
        const ganancia = totalPagar - monto;

        if (isActive) {
          global.activos++; byCaja[cajaKey].activos++;
        }
        global.colocado += monto; byCaja[cajaKey].colocado += monto;
        global.totalPagar += totalPagar; byCaja[cajaKey].totalPagar += totalPagar;
        global.porCobrar += agg.saldo; byCaja[cajaKey].porCobrar += agg.saldo;
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
  const queryClient = useQueryClient();
  const { data: cajas = [], isLoading } = useCajas();
  const { data: kardex = [] } = useKardex();
  const { data: prestamoStats } = usePrestamosByCaja();
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

  const resetModal = () => {
    setModal(null); setCajaId(""); setCajaDestinoId(""); setMonto(""); setConcepto("");
    setNombreCaja(""); setDescCaja("");
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cajas-page"] });
    queryClient.invalidateQueries({ queryKey: ["movimientos-all"] });
    queryClient.invalidateQueries({ queryKey: ["cajas-all"] });
  };

  // ── Create caja ─────────────────────────────────────────────────
  const handleCrearCaja = async () => {
    if (!nombreCaja.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("cajas").insert({ nombre: nombreCaja.trim(), descripcion: descCaja.trim() || null });
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
    });
    if (movErr) { toast.error("Error: " + movErr.message); setSaving(false); return; }

    const saldoActual = Number(caja?.saldo_actual || 0);
    await supabase.from("cajas").update({ saldo_actual: tipo === "entrada" ? saldoActual + m : saldoActual - m }).eq("id", cajaId);

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

    // Salida de origen
    await supabase.from("movimientos_caja").insert({ caja_id: cajaId, tipo: "salida", monto: m, concepto: nota });
    await supabase.from("cajas").update({ saldo_actual: (Number(origen?.saldo_actual) || 0) - m }).eq("id", cajaId);

    // Entrada en destino
    await supabase.from("movimientos_caja").insert({ caja_id: cajaDestinoId, tipo: "entrada", monto: m, concepto: nota });
    await supabase.from("cajas").update({ saldo_actual: (Number(destino?.saldo_actual) || 0) + m }).eq("id", cajaDestinoId);

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

  // Filter kardex by selected caja
  const filteredMov = selectedCaja
    ? kardex.filter((m) => m.cajaId === selectedCaja)
    : kardex;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cajas</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="h-8 text-[13px]" onClick={() => setModal("depositar")}>
            <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5" />Depositar
          </Button>
          <Button variant="secondary" size="sm" className="h-8 text-[13px]" onClick={() => setModal("retirar")}>
            <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Retirar
          </Button>
          <Button variant="secondary" size="sm" className="h-8 text-[13px]" onClick={() => setModal("transferir")}>
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />Transferir
          </Button>
          <Button size="sm" className="h-8 text-[13px]" onClick={() => setModal("nueva-caja")}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Nueva Caja
          </Button>
        </div>
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

      {/* Cajas cards with per-caja stats */}
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
              onClick={() => setSelectedCaja(selectedCaja === c.id ? null : c.id)}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-[14px]">{c.nombre}</p>
                <Wallet className="h-4 w-4 text-muted-foreground" />
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

      {/* Movimientos table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[14px] font-semibold">
            Movimientos {selectedCaja ? `— ${cajas.find(c => c.id === selectedCaja)?.nombre}` : ""}
          </h2>
          {selectedCaja && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedCaja(null)}>
              Ver todos
            </Button>
          )}
        </div>
        <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header border-b">
                <TableHead className="w-10 text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Tipo</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Concepto</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Caja</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMov.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-[13px]">Sin movimientos</TableCell></TableRow>
              ) : filteredMov.map((m) => (
                <TableRow key={m.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                  <TableCell className="px-3">
                    <div className={cn("h-6 w-6 rounded-full flex items-center justify-center", m.tipo === "entrada" ? "bg-success/10" : "bg-destructive/10")}>
                      {m.tipo === "entrada" ? <ArrowDownLeft className="h-3 w-3 text-success" /> : <ArrowUpRight className="h-3 w-3 text-destructive" />}
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] px-3">{m.concepto || "—"}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground px-3">{(m.cajas as any)?.nombre || "—"}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground px-3 whitespace-nowrap">
                    {m.created_at ? format(new Date(m.created_at), "dd/MM/yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell className={cn("text-right font-medium text-[13px] px-3", m.tipo === "entrada" ? "text-success" : "text-destructive")}>
                    {m.tipo === "entrada" ? "+" : "-"}{$$(Number(m.monto))}
                  </TableCell>
                </TableRow>
              ))}
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
    </div>
  );
}
