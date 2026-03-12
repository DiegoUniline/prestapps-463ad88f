import { useState, useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Plus, Search, UserCheck, Wallet, DollarSign, Percent, Scissors, ArrowUpDown, ArrowUp, ArrowDown, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Data hooks ────────────────────────────────────────────────────
interface Cobrador {
  id: string;
  nombre: string;
  telefono: string | null;
  porcentaje_comision: number;
  efectivo_en_mano: number;
  activo: boolean;
  created_at: string | null;
}

function useCobradores() {
  return useQuery({
    queryKey: ["cobradores"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("cobradores").select("*").order("nombre");
      if (error) throw error;
      return (data || []) as Cobrador[];
    },
  });
}

function useCortes() {
  return useQuery({
    queryKey: ["cortes"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("cortes")
        .select("*, cobradores ( nombre ), cajas ( nombre )")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });
}

function useCajas() {
  return useQuery({
    queryKey: ["cajas-all"],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre, saldo_actual").order("nombre");
      return data || [];
    },
  });
}

// ── Cobrador pagos for corte calculation ──────────────────────────
async function fetchCobradorPagos(cobradorId: string, desde?: string) {
  let query = supabase
    .from("pagos")
    .select("monto_recibido, created_at")
    .eq("cobrador_id", cobradorId);
  
  if (desde) query = query.gte("created_at", desde);
  
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

type SortKey = "nombre" | "porcentaje_comision" | "efectivo_en_mano" | "activo";
type ModalType = "nuevo" | "corte" | null;

// ── Component ─────────────────────────────────────────────────────
export default function CobradoresPage() {
  const queryClient = useQueryClient();
  const { data: cobradores = [], isLoading } = useCobradores();
  const { data: cortes = [] } = useCortes();
  const { data: cajas = [] } = useCajas();

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [saving, setSaving] = useState(false);

  // New cobrador form
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [porcentaje, setPorcentaje] = useState("");

  // Corte form
  const [selectedCobrador, setSelectedCobrador] = useState<Cobrador | null>(null);
  const [corteCajaId, setCorteCajaId] = useState("");
  const [corteTotal, setCorteTotal] = useState(0);
  const [corteComision, setCorteComision] = useState(0);
  const [corteDeposito, setCorteDeposito] = useState(0);
  const [loadingCorte, setLoadingCorte] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir(null); }
    } else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const resetModal = () => {
    setModal(null); setNombre(""); setTelefono(""); setPorcentaje("");
    setSelectedCobrador(null); setCorteCajaId(""); setCorteTotal(0); setCorteComision(0); setCorteDeposito(0);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cobradores"] });
    queryClient.invalidateQueries({ queryKey: ["cortes"] });
    queryClient.invalidateQueries({ queryKey: ["cajas-all"] });
    queryClient.invalidateQueries({ queryKey: ["cajas-page"] });
    queryClient.invalidateQueries({ queryKey: ["movimientos-all"] });
  };

  // ── Filtered & sorted ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = cobradores.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.nombre.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    if (sortKey && sortDir) {
      data = [...data].sort((a, b) => {
        const av = a[sortKey] as any; const bv = b[sortKey] as any;
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        if (typeof av === "boolean") return sortDir === "asc" ? (av ? 1 : -1) - (bv ? 1 : -1) : (bv ? 1 : -1) - (av ? 1 : -1);
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return data;
  }, [cobradores, search, sortKey, sortDir]);

  // ── Create cobrador ─────────────────────────────────────────────
  const handleCrear = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    const { error } = await (supabase.from as any)("cobradores").insert({
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      porcentaje_comision: parseFloat(porcentaje) || 0,
    });
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Cobrador creado");
    invalidate();
    resetModal();
  };

  // ── Prepare corte ───────────────────────────────────────────────
  const prepararCorte = async (cobrador: Cobrador) => {
    setSelectedCobrador(cobrador);
    setLoadingCorte(true);
    setModal("corte");

    try {
      // Get last corte date for this cobrador
      const { data: lastCorte } = await (supabase.from as any)("cortes")
        .select("created_at")
        .eq("cobrador_id", cobrador.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const desde = lastCorte?.created_at || undefined;
      const pagos = await fetchCobradorPagos(cobrador.id, desde);

      const totalCobrado = pagos.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      const comision = totalCobrado * (cobrador.porcentaje_comision / 100);
      const efectivo = cobrador.efectivo_en_mano;

      setCorteTotal(totalCobrado);
      setCorteComision(comision);
      setCorteDeposito(efectivo);
    } catch (err: any) {
      toast.error("Error cargando datos: " + err.message);
    } finally {
      setLoadingCorte(false);
    }
  };

  // ── Execute corte ───────────────────────────────────────────────
  const handleCorte = async () => {
    if (!selectedCobrador || !corteCajaId || corteDeposito <= 0) return;
    setSaving(true);

    try {
      // 1) Insert corte record
      const { error: corteErr } = await (supabase.from as any)("cortes").insert({
        cobrador_id: selectedCobrador.id,
        caja_id: corteCajaId,
        monto_efectivo: selectedCobrador.efectivo_en_mano,
        monto_comision: corteComision,
        monto_depositado: corteDeposito,
        total_cobrado: corteTotal,
        porcentaje_usado: selectedCobrador.porcentaje_comision,
      });
      if (corteErr) throw corteErr;

      // 2) Deposit into caja (full efectivo)
      await supabase.from("movimientos_caja").insert({
        caja_id: corteCajaId,
        tipo: "entrada",
        monto: corteDeposito,
        concepto: `Corte cobrador: ${selectedCobrador.nombre}`,
      });

      const { data: cajaData } = await supabase.from("cajas").select("saldo_actual").eq("id", corteCajaId).single();
      if (cajaData) {
        await supabase.from("cajas").update({
          saldo_actual: Number(cajaData.saldo_actual || 0) + corteDeposito,
        }).eq("id", corteCajaId);
      }

      // 3) Pay commission as separate exit from same caja
      if (corteComision > 0) {
        await supabase.from("movimientos_caja").insert({
          caja_id: corteCajaId,
          tipo: "salida",
          monto: corteComision,
          concepto: `Comisión cobrador: ${selectedCobrador.nombre} (${selectedCobrador.porcentaje_comision}%)`,
        });

        const { data: cajaData2 } = await supabase.from("cajas").select("saldo_actual").eq("id", corteCajaId).single();
        if (cajaData2) {
          await supabase.from("cajas").update({
            saldo_actual: Number(cajaData2.saldo_actual || 0) - corteComision,
          }).eq("id", corteCajaId);
        }
      }

      // 4) Reset cobrador cash to 0
      await (supabase.from as any)("cobradores").update({ efectivo_en_mano: 0 }).eq("id", selectedCobrador.id);

      toast.success(`Corte realizado: ${$$(corteDeposito)} depositado, ${$$(corteComision)} comisión`);
      invalidate();
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── KPIs ────────────────────────────────────────────────────────
  const totalEfectivo = cobradores.reduce((s, c) => s + c.efectivo_en_mano, 0);
  const totalCobradores = cobradores.filter(c => c.activo).length;
  const totalCortes = cortes.length;
  const totalComisiones = cortes.reduce((s, c) => s + Number((c as any).monto_comision || 0), 0);

  const kpis = [
    { label: "Cobradores Activos", value: String(totalCobradores), icon: UserCheck, accent: "text-primary" },
    { label: "Efectivo en Calle", value: $$(totalEfectivo), icon: Wallet, accent: "text-warning" },
    { label: "Cortes Realizados", value: String(totalCortes), icon: Scissors, accent: "text-[hsl(217,91%,60%)]" },
    { label: "Comisiones Pagadas", value: $$(totalComisiones), icon: DollarSign, accent: "text-success" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cobradores</h1>
        <Button size="sm" className="h-8 text-[13px]" onClick={() => setModal("nuevo")}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo Cobrador
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

      {/* Search */}
      <div className="hidden md:flex justify-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cobrador..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[13px] bg-card" />
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">{filtered.length} cobrador{filtered.length !== 1 ? "es" : ""}</p>
        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <span>1-{filtered.length} / {filtered.length}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header border-b">
              {([
                ["nombre", "Nombre"], ["porcentaje_comision", "% Comisión"], ["efectivo_en_mano", "Efectivo en Mano"], ["activo", "Estado"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5"
                  onClick={() => toggleSort(key)}
                >
                  <div className="flex items-center gap-1">{label}<SortIcon col={key} /></div>
                </TableHead>
              ))}
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Teléfono</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6} className="px-3 py-3"><Skeleton className="h-4 w-full" /></TableCell></TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron cobradores</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                <TableCell className="font-medium text-[13px] px-3">{c.nombre}</TableCell>
                <TableCell className="text-[13px] px-3">
                  <span className="inline-flex items-center gap-1">
                    <Percent className="h-3 w-3 text-muted-foreground" />
                    {c.porcentaje_comision}%
                  </span>
                </TableCell>
                <TableCell className={cn("font-semibold text-[13px] px-3", c.efectivo_en_mano > 0 ? "text-warning" : "text-muted-foreground")}>
                  {$$(c.efectivo_en_mano)}
                </TableCell>
                <TableCell className="px-3">
                  <span className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                    c.activo ? "bg-badge-activo text-badge-activo-foreground" : "bg-badge-liquidado text-badge-liquidado-foreground"
                  )}>
                    {c.activo ? "Activo" : "Inactivo"}
                  </span>
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground px-3">{c.telefono || "—"}</TableCell>
                <TableCell className="px-3 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-[12px]"
                    disabled={c.efectivo_en_mano <= 0}
                    onClick={() => prepararCorte(c)}
                  >
                    <Scissors className="h-3 w-3 mr-1" />Hacer Corte
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Historial de Cortes */}
      {cortes.length > 0 && (
        <div>
          <h2 className="text-[14px] font-semibold mb-2">Historial de Cortes</h2>
          <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header hover:bg-table-header border-b">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cobrador</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Caja</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Total Cobrado</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Comisión</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Depositado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cortes.map((ct: any) => (
                  <TableRow key={ct.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                    <TableCell className="text-[12px] text-muted-foreground px-3 whitespace-nowrap">{ct.created_at ? format(new Date(ct.created_at), "dd/MM/yyyy HH:mm") : "—"}</TableCell>
                    <TableCell className="font-medium text-[13px] px-3">{ct.cobradores?.nombre || "—"}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground px-3">{ct.cajas?.nombre || "—"}</TableCell>
                    <TableCell className="text-right text-[13px] px-3">{$$(Number(ct.total_cobrado))}</TableCell>
                    <TableCell className="text-right text-[13px] text-success font-medium px-3">{$$(Number(ct.monto_comision))} <span className="text-muted-foreground text-[11px]">({ct.porcentaje_usado}%)</span></TableCell>
                    <TableCell className="text-right text-[13px] font-medium px-3">{$$(Number(ct.monto_depositado))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── NUEVO COBRADOR MODAL ───────────────────────────────── */}
      <Dialog open={modal === "nuevo"} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4 text-primary" />Nuevo Cobrador
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 space-y-3 pb-4">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" className="mt-1 h-9 text-[13px]" autoFocus />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Teléfono</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Opcional" className="mt-1 h-9 text-[13px]" />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">% Comisión</Label>
              <Input type="number" step="0.1" min="0" max="100" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} placeholder="Ej: 5" className="mt-1 h-9 text-[13px]" />
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px]" disabled={saving || !nombre.trim()} onClick={handleCrear}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CORTE MODAL ────────────────────────────────────────── */}
      <Dialog open={modal === "corte"} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Scissors className="h-4 w-4 text-primary" />
              Corte — {selectedCobrador?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 space-y-4 pb-4">
            {loadingCorte ? (
              <div className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Calculando...
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="bg-secondary rounded-lg px-4 py-3 space-y-2">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Total cobrado (período)</span>
                    <span className="font-semibold">{$$(corteTotal)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">% Comisión</span>
                    <span className="font-medium">{selectedCobrador?.porcentaje_comision}%</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Comisión ganada</span>
                    <span className="font-semibold text-success">{$$(corteComision)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Efectivo en mano</span>
                    <span className="font-bold text-lg">{$$(corteDeposito)}</span>
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 text-[13px]">
                  Se depositará <strong>{$$(corteDeposito)}</strong> a la caja. La comisión de <strong>{$$(corteComision)}</strong> se registrará como salida aparte.
                </div>

                <div>
                  <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
                  <Select value={corteCajaId} onValueChange={setCorteCajaId}>
                    <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                    <SelectContent>
                      {cajas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre} — {$$(Number(c.saldo_actual || 0))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetModal}>Cancelar</Button>
            <Button size="sm" className="h-8 text-[13px]" disabled={saving || loadingCorte || !corteCajaId || corteDeposito <= 0} onClick={handleCorte}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5 mr-1.5" />}
              Confirmar Corte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
