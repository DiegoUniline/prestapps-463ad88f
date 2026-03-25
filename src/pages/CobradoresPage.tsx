import { useState, useMemo } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Search, UserCheck, Wallet, DollarSign, Percent, Scissors, ArrowUpDown, ArrowUp, ArrowDown, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn, $$ } from "@/lib/utils";
// ── Data hooks ────────────────────────────────────────────────────
interface Cobrador {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  porcentaje_comision: number;
  efectivo_en_mano: number;
  activo: boolean;
  created_at: string | null;
}

function useCobradores(empresaId: string) {
  return useQuery({
    queryKey: ["profiles-cobradores", empresaId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("profiles")
        .select("id, nombre_completo, telefono, porcentaje_comision, efectivo_en_mano, activo, created_at, empresa_id")
        .eq("empresa_id", empresaId)
        .order("nombre_completo");
      if (error) throw error;
      return (data || []) as Cobrador[];
    },
  });
}

function useCortes(empresaId: string) {
  return useQuery({
    queryKey: ["cortes", empresaId],
    queryFn: async () => {
      const { data: cortes, error } = await (supabase.from as any)("cortes")
        .select("*, cajas ( nombre )")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const cobIds: string[] = [...new Set((cortes || []).map((c: any) => c.cobrador_id).filter(Boolean))] as string[];
      let cobMap: Record<string, string> = {};
      if (cobIds.length) {
        const { data: profs } = await (supabase.from as any)("profiles").select("id, nombre_completo").in("id", cobIds);
        for (const p of profs || []) cobMap[p.id] = p.nombre_completo;
      }
      return (cortes || []).map((c: any) => ({ ...c, cobrador_nombre: cobMap[c.cobrador_id] || "—" }));
    },
  });
}

function useCajas(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-all", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre, saldo_actual").eq("empresa_id", empresaId).order("nombre");
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

type SortKey = "nombre_completo" | "porcentaje_comision" | "efectivo_en_mano" | "activo";
type ModalType = "corte" | null;

// ── Component ─────────────────────────────────────────────────────
export default function CobradoresPage() {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: cobradores = [], isLoading } = useCobradores(empresaId);
  const { data: cortes = [] } = useCortes(empresaId);
  const { data: cajas = [] } = useCajas(empresaId);

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [saving, setSaving] = useState(false);

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
    setModal(null);
    setSelectedCobrador(null); setCorteCajaId(""); setCorteTotal(0); setCorteComision(0); setCorteDeposito(0);
  };

  const invalidate = () => invalidateFinanceQueries(queryClient);

  // ── Filtered & sorted ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = cobradores.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.nombre_completo.toLowerCase().includes(q)) return false;
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

  // ── Prepare corte ───────────────────────────────────────────────
  const prepararCorte = async (cobrador: Cobrador) => {
    setSelectedCobrador(cobrador);
    setLoadingCorte(true);
    setModal("corte");

    try {
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
        empresa_id: empresaId,
      });
      if (corteErr) throw corteErr;

      // 2) Deposit into caja (full efectivo)
      await supabase.from("movimientos_caja").insert({
        caja_id: corteCajaId,
        tipo: "entrada",
        monto: corteDeposito,
        concepto: `Corte cobrador: ${selectedCobrador.nombre_completo}`,
        empresa_id: empresaId,
      });

      // saldo_actual se sincroniza automáticamente via trigger

      // 3) Pay commission as separate exit from same caja
      if (corteComision > 0) {
        await supabase.from("movimientos_caja").insert({
          caja_id: corteCajaId,
          tipo: "salida",
          monto: corteComision,
          concepto: `Comisión cobrador: ${selectedCobrador.nombre_completo} (${selectedCobrador.porcentaje_comision}%)`,
          empresa_id: empresaId,
        });
        // saldo_actual se sincroniza automáticamente via trigger
      }

      // 4) Reset cobrador cash to 0
      await supabase.from("profiles").update({ efectivo_en_mano: 0 } as any).eq("id", selectedCobrador.id);

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
    { label: "Usuarios Activos", value: String(totalCobradores), icon: UserCheck, accent: "text-primary" },
    { label: "Efectivo en Calle", value: $$(totalEfectivo), icon: Wallet, accent: "text-warning" },
    { label: "Cortes Realizados", value: String(totalCortes), icon: Scissors, accent: "text-[hsl(217,91%,60%)]" },
    { label: "Comisiones Pagadas", value: $$(totalComisiones), icon: DollarSign, accent: "text-success" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cobradores</h1>
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
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[13px] bg-card" />
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">{filtered.length} usuario{filtered.length !== 1 ? "s" : ""}</p>
        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <span>1-{filtered.length} / {filtered.length}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* MOBILE Cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-4"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
        )) : filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron usuarios</p>
        ) : filtered.map((c) => (
          <div key={c.id} className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)] overflow-hidden">
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-border/50">
              <div className="min-w-0">
                <p className="font-semibold text-[13px] truncate">{c.nombre_completo}</p>
                <p className="text-[11px] text-muted-foreground">{c.telefono || "Sin teléfono"}</p>
              </div>
              <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium shrink-0 ml-2", c.activo ? "bg-badge-activo text-badge-activo-foreground" : "bg-badge-liquidado text-badge-liquidado-foreground")}>
                {c.activo ? "Activo" : "Inactivo"}
              </span>
            </div>
            <div className="px-3 py-2 grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Comisión</span><p className="font-medium">{c.porcentaje_comision}%</p></div>
              <div><span className="text-muted-foreground">Efectivo en mano</span><p className={cn("font-semibold", c.efectivo_en_mano > 0 ? "text-warning" : "text-muted-foreground")}>{$$(c.efectivo_en_mano)}</p></div>
            </div>
            <div className="px-3 py-2 border-t border-border/50">
              <Button variant="secondary" size="sm" className="h-7 text-[11px] w-full" disabled={c.efectivo_en_mano <= 0} onClick={() => prepararCorte(c)}>
                <Scissors className="h-3 w-3 mr-1" />Hacer Corte
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP Table */}
      <div className="hidden md:block bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header border-b">
              {([
                ["nombre_completo", "Nombre"], ["porcentaje_comision", "% Comisión"], ["efectivo_en_mano", "Efectivo en Mano"], ["activo", "Estado"],
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
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron usuarios</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                <TableCell className="font-medium text-[13px] px-3">{c.nombre_completo}</TableCell>
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
      {cortes.length > 0 && (
        <div>
          <h2 className="text-[14px] font-semibold mb-2">Historial de Cortes</h2>
          {/* Mobile cortes cards */}
          <div className="md:hidden space-y-2">
            {cortes.map((ct: any) => (
              <div key={ct.id} className="bg-card rounded-lg border border-border p-3 text-[12px]">
                <div className="flex justify-between items-start">
                  <div><p className="font-medium text-[13px]">{ct.cobrador_nombre || "—"}</p><p className="text-muted-foreground">{ct.created_at ? fmtDateTime(ct.created_at) : "—"}</p></div>
                  <p className="font-semibold">{$$(Number(ct.monto_depositado))}</p>
                </div>
                <div className="flex justify-between mt-1.5 text-[11px]">
                  <span className="text-muted-foreground">Cobrado: {$$(Number(ct.total_cobrado))}</span>
                  <span className="text-success font-medium">Comisión: {$$(Number(ct.monto_comision))} ({ct.porcentaje_usado}%)</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop cortes table */}
          <div className="hidden md:block bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
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
                    <TableCell className="text-[12px] text-muted-foreground px-3 whitespace-nowrap">{ct.created_at ? fmtDateTime(ct.created_at) : "—"}</TableCell>
                    <TableCell className="font-medium text-[13px] px-3">{ct.cobrador_nombre || "—"}</TableCell>
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

      {/* ── CORTE MODAL ────────────────────────────────────────── */}
      <Dialog open={modal === "corte"} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Scissors className="h-4 w-4 text-primary" />
              Corte — {selectedCobrador?.nombre_completo}
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
