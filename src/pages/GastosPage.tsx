import { useState, useMemo } from "react";
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
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Receipt, TrendingDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { $$ } from "@/lib/utils";
const CATEGORIAS_GASTO = [
  "Oficina",
  "Transporte",
  "Servicios",
  "Salarios",
  "Comisiones",
  "Papelería",
  "Mantenimiento",
  "Marketing",
  "Legal",
  "Impuestos",
  "Otros",
];

// ── Data hooks ────────────────────────────────────────────────────
function useGastos(empresaId: string) {
  return useQuery({
    queryKey: ["gastos", empresaId],
    queryFn: async () => {
      const data = await fetchAllRows(supabase
        .from("movimientos_caja")
        .select("*, cajas ( nombre )")
        .eq("empresa_id", empresaId)
        .eq("tipo", "salida")
        .order("created_at", { ascending: false }));
      return (data || []).map((m: any) => ({
        id: m.id,
        fecha: m.created_at,
        concepto: m.concepto || "",
        monto: Number(m.monto || 0),
        caja: (m.cajas as any)?.nombre || "—",
        cajaId: m.caja_id,
        categoria: extractCategoria(m.concepto || ""),
      }));
    },
  });
}

function extractCategoria(concepto: string): string {
  const lower = concepto.toLowerCase();
  // Try to detect known categories from concepto
  if (lower.includes("[oficina]")) return "Oficina";
  if (lower.includes("[transporte]")) return "Transporte";
  if (lower.includes("[servicios]")) return "Servicios";
  if (lower.includes("[salarios]")) return "Salarios";
  if (lower.includes("[comisiones]") || lower.includes("comisión cobrador")) return "Comisiones";
  if (lower.includes("[papelería]")) return "Papelería";
  if (lower.includes("[mantenimiento]")) return "Mantenimiento";
  if (lower.includes("[marketing]")) return "Marketing";
  if (lower.includes("[legal]")) return "Legal";
  if (lower.includes("[impuestos]")) return "Impuestos";
  if (lower.includes("[otros]")) return "Otros";
  if (lower.includes("desembolso") || lower.includes("préstamo")) return "Desembolso";
  if (lower.includes("corte") || lower.includes("comisión")) return "Comisiones";
  return "Otros";
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

// ── Component ─────────────────────────────────────────────────────
export default function GastosPage() {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: gastos = [], isLoading } = useGastos(empresaId);
  const { data: cajas = [] } = useCajas(empresaId);

  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [categoria, setCategoria] = useState("Otros");
  const [notas, setNotas] = useState("");

  const resetForm = () => {
    setConcepto("");
    setMonto("");
    setCajaId("");
    setCategoria("Otros");
    setNotas("");
    setModalOpen(false);
  };

  const handleRegistrar = async () => {
    const montoNum = parseFloat(monto);
    if (!concepto.trim() || !montoNum || montoNum <= 0 || !cajaId) {
      toast.error("Completa todos los campos requeridos");
      return;
    }

    // Check caja balance
    const caja = cajas.find((c) => c.id === cajaId);
    if (caja && montoNum > Number(caja.saldo_actual || 0)) {
      toast.error("Saldo insuficiente en la caja seleccionada");
      return;
    }

    setSaving(true);
    try {
      const conceptoFull = `[${categoria}] ${concepto.trim()}${notas ? ` — ${notas.trim()}` : ""}`;

      // 1) Create movimiento de salida
      const { error } = await supabase.from("movimientos_caja").insert({
        caja_id: cajaId,
        tipo: "salida" as const,
        monto: montoNum,
        concepto: conceptoFull,
        empresa_id: empresaId,
      });
      if (error) throw error;

      // saldo_actual se sincroniza automáticamente via trigger

      toast.success(`Gasto de ${$$(montoNum)} registrado`);
      invalidateFinanceQueries(queryClient);
      resetForm();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtered
  const filtered = useMemo(() => {
    return gastos.filter((g) => {
      const matchSearch = !search || g.concepto.toLowerCase().includes(search.toLowerCase()) || g.caja.toLowerCase().includes(search.toLowerCase());
      const matchCat = filtroCategoria === "todos" || g.categoria === filtroCategoria;
      // Exclude desembolsos from gastos view
      if (g.categoria === "Desembolso") return false;
      return matchSearch && matchCat;
    });
  }, [gastos, search, filtroCategoria]);

  const totalGastos = filtered.reduce((s, g) => s + g.monto, 0);
  const gastosMes = filtered.filter((g) => {
    const d = new Date(g.fecha);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalMes = gastosMes.reduce((s, g) => s + g.monto, 0);

  // Category breakdown
  const porCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of filtered) {
      map[g.categoria] = (map[g.categoria] || 0) + g.monto;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro y control de egresos por caja</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar Gasto
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Gastos</p>
          <p className="text-2xl font-bold mt-1">{$$(totalGastos)}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gastos del Mes</p>
          <p className="text-2xl font-bold mt-1 text-destructive">{$$(totalMes)}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Registros</p>
          <p className="text-2xl font-bold mt-1">{filtered.length}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Categorías</p>
          <p className="text-2xl font-bold mt-1">{porCategoria.length}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {porCategoria.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porCategoria.map(([cat, total]) => (
            <div key={cat} className="flex items-center gap-1.5 border rounded-md px-2.5 py-1 bg-card text-[12px]">
              <span className="font-medium">{cat}</span>
              <span className="text-muted-foreground">{$$(total)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar gasto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <SearchableSelect
          options={[{ value: "todos", label: "Todas" }, ...CATEGORIAS_GASTO.map((c) => ({ value: c, label: c }))]}
          value={filtroCategoria}
          onValueChange={setFiltroCategoria}
          placeholder="Categoría"
          searchPlaceholder="Buscar categoría..."
          triggerClassName="w-40"
        />
      </div>

      {/* Table / Cards */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <>
          {/* MOBILE Cards */}
          <div className="md:hidden space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron gastos</p>
            ) : filtered.map((g) => (
              <div key={g.id} className="bg-card rounded-lg border border-border p-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-[13px] truncate">{g.concepto.replace(/\[.*?\]\s*/, "")}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{g.categoria}</Badge>
                      <span className="text-[11px] text-muted-foreground">{g.caja}</span>
                    </div>
                  </div>
                  <p className="font-semibold text-destructive text-[13px] shrink-0 ml-2">-{$$(g.monto)}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(g.fecha), "dd/MM/yyyy HH:mm", { locale: es })}</p>
              </div>
            ))}
          </div>

          {/* DESKTOP Table */}
          <div className="hidden md:block bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header hover:bg-table-header border-b">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Categoría</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Concepto</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Caja</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-[13px]">
                      No se encontraron gastos
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filtered.map((g) => (
                      <TableRow key={g.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                        <TableCell className="text-[13px] px-3">
                          {format(new Date(g.fecha), "dd/MM/yyyy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell className="px-3">
                          <Badge variant="outline" className="text-[11px]">{g.categoria}</Badge>
                        </TableCell>
                        <TableCell className="text-[13px] px-3 max-w-[300px] truncate">
                          {g.concepto.replace(/\[.*?\]\s*/, "")}
                        </TableCell>
                        <TableCell className="text-[13px] px-3">{g.caja}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive text-[13px] px-3">
                          -{$$(g.monto)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length > 0 && (
                      <TableRow className="bg-muted/40 border-t-2 border-border font-bold">
                        <TableCell className="px-3 text-[11px] uppercase text-muted-foreground font-bold" colSpan={4}>Totales</TableCell>
                        <TableCell className="text-right font-bold text-destructive text-[13px] px-3">
                          -{$$(filtered.reduce((s, g) => s + g.monto, 0))}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Modal: Registrar Gasto */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Registrar Gasto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Caja de origen *</Label>
              <SearchableSelect
                options={cajas.map((c) => ({ value: c.id, label: c.nombre, subtitle: $$(Number(c.saldo_actual || 0)) }))}
                value={cajaId}
                onValueChange={setCajaId}
                placeholder="Seleccionar caja"
                searchPlaceholder="Buscar caja..."
              />
            </div>
            <div>
              <Label>Categoría *</Label>
              <SearchableSelect
                options={CATEGORIAS_GASTO.map((c) => ({ value: c, label: c }))}
                value={categoria}
                onValueChange={setCategoria}
                placeholder="Seleccionar categoría"
                searchPlaceholder="Buscar categoría..."
              />
            </div>
            <div>
              <Label>Concepto *</Label>
              <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Pago de luz, gasolina..." />
            </div>
            <div>
              <Label>Monto *</Label>
              <Input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalle adicional..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleRegistrar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingDown className="h-4 w-4 mr-2" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
