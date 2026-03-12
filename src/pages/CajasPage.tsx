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

function useMovimientos() {
  return useQuery({
    queryKey: ["movimientos-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimientos_caja")
        .select("*, cajas ( nombre )")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });
}

// ── Modal types ───────────────────────────────────────────────────
type ModalType = "depositar" | "retirar" | "transferir" | "nueva-caja" | null;

// ── Component ─────────────────────────────────────────────────────
export default function CajasPage() {
  const queryClient = useQueryClient();
  const { data: cajas = [], isLoading } = useCajas();
  const { data: movimientos = [] } = useMovimientos();

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
  const entradas = movimientos.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.monto), 0);
  const salidas = movimientos.filter((m) => m.tipo === "salida").reduce((s, m) => s + Number(m.monto), 0);

  const kpis = [
    { label: "Saldo Total", value: $$(totalSaldo), icon: Wallet, accent: "text-primary" },
    { label: "Cajas", value: String(cajas.length), icon: DollarSign, accent: "text-[hsl(217,91%,60%)]" },
    { label: "Entradas", value: $$(entradas), icon: TrendingUp, accent: "text-success" },
    { label: "Salidas", value: $$(salidas), icon: TrendingDown, accent: "text-destructive" },
  ];

  // Filter movimientos by selected caja
  const filteredMov = selectedCaja
    ? movimientos.filter((m) => m.caja_id === selectedCaja)
    : movimientos;

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

      {/* Cajas cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : cajas.map((c) => (
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
            {c.descripcion && <p className="text-[12px] text-muted-foreground mt-1">{c.descripcion}</p>}
          </div>
        ))}
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
