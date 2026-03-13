import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, X, CalendarIcon, SlidersHorizontal, ChevronLeft, ChevronRight, DollarSign, HandCoins, TrendingUp, Hash } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCajasOptions, useRutasOptions } from "@/hooks/usePrestamos";

// ── Types ─────────────────────────────────────────────────────────
interface PagoListItem {
  id: string;
  cliente: string;
  prestamoId: string;
  shortId: string;
  fecha: string;
  montoRecibido: number;
  aplicadoMora: number;
  aplicadoInteres: number;
  aplicadoCapital: number;
  metodo: string;
  caja: string;
  ruta: string;
  anulado: boolean;
}

type SortKey = keyof PagoListItem;

// ── Data hook ─────────────────────────────────────────────────────
function usePagosAll(empresaId: string) {
  return useQuery({
    queryKey: ["pagos-all", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select(`
          id, monto_recibido, aplicado_mora, aplicado_interes, aplicado_capital,
          metodo_pago, created_at, prestamo_id, anulado,
          cajas ( nombre ),
          prestamos!pagos_prestamo_id_fkey ( id, clientes ( nombre_completo ), rutas ( nombre ) )
        `)
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((p: any) => ({
        id: p.id,
        cliente: p.prestamos?.clientes?.nombre_completo || "—",
        prestamoId: p.prestamo_id,
        shortId: `PRE-${(p.prestamo_id || "").slice(0, 8)}`,
        fecha: p.created_at || "",
        montoRecibido: Number(p.monto_recibido || 0),
        aplicadoMora: Number(p.aplicado_mora || 0),
        aplicadoInteres: Number(p.aplicado_interes || 0),
        aplicadoCapital: Number(p.aplicado_capital || 0),
        metodo: p.metodo_pago || "Efectivo",
        caja: (p.cajas as any)?.nombre || "—",
        ruta: p.prestamos?.rutas?.nombre || "—",
        anulado: p.anulado || false,
      })) as PagoListItem[];
    },
  });
}

// ── Multi-filter dropdown (same as PrestamosPage) ─────────────────
function MultiFilterDropdown({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: Set<string>; onChange: (s: Set<string>) => void;
}) {
  const count = selected.size;
  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"
          className={cn(
            "h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-filter-bar-border hover:bg-primary/5",
            count > 0 && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
          )}>
          {label}
          {count > 0 && (
            <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold px-1">
              {count}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-0.5">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
              <Checkbox checked={selected.has(opt)} onCheckedChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1.5 h-7 text-xs" onClick={() => onChange(new Set())}>
            Limpiar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

const metodoOptions = ["Efectivo", "Transferencia", "Otro"];

import { $$ } from "@/lib/utils";

// ── Metodo dot ────────────────────────────────────────────────────
function MetodoDot({ metodo }: { metodo: string }) {
  const color = metodo === "Efectivo" ? "bg-success" : metodo === "Transferencia" ? "bg-[hsl(217,91%,60%)]" : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {metodo}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────
export default function PagosPage() {
  const { empresaId } = useEmpresa();
  const { data: pagos = [], isLoading, isError } = usePagosAll(empresaId);
  const { data: cajasRaw = [] } = useCajasOptions(empresaId);
  const { data: rutasRaw = [] } = useRutasOptions(empresaId);

  const cajasOpts = cajasRaw.map((c) => c.nombre);
  const rutasOpts = rutasRaw.map((r) => r.nombre);

  const [search, setSearch] = useState("");
  const [selMetodo, setSelMetodo] = useState<Set<string>>(new Set());
  const [selCaja, setSelCaja] = useState<Set<string>>(new Set());
  const [selRuta, setSelRuta] = useState<Set<string>>(new Set());
  const [regDesde, setRegDesde] = useState<Date>();
  const [regHasta, setRegHasta] = useState<Date>();

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

  const totalActiveFilters = selMetodo.size + selCaja.size + selRuta.size + (regDesde ? 1 : 0) + (regHasta ? 1 : 0);
  const hasFilters = totalActiveFilters > 0 || search;

  const clearAll = () => {
    setSearch(""); setSelMetodo(new Set()); setSelCaja(new Set()); setSelRuta(new Set());
    setRegDesde(undefined); setRegHasta(undefined); setSortKey(null); setSortDir(null);
  };

  const filtered = useMemo(() => {
    let data = pagos.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.cliente.toLowerCase().includes(q) && !p.shortId.toLowerCase().includes(q)) return false;
      }
      if (selMetodo.size > 0 && !selMetodo.has(p.metodo)) return false;
      if (selCaja.size > 0 && !selCaja.has(p.caja)) return false;
      if (selRuta.size > 0 && !selRuta.has(p.ruta)) return false;
      if (p.fecha) {
        const d = new Date(p.fecha);
        if (regDesde && d < regDesde) return false;
        if (regHasta && d > regHasta) return false;
      }
      return true;
    });
    if (sortKey && sortDir) {
      data = [...data].sort((a, b) => {
        const av = a[sortKey]; const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return data;
  }, [pagos, search, selMetodo, selCaja, selRuta, regDesde, regHasta, sortKey, sortDir]);

  // KPIs
  const totalPagos = pagos.length;
  const totalRecaudado = pagos.reduce((s, p) => s + p.montoRecibido, 0);
  const totalMora = pagos.reduce((s, p) => s + p.aplicadoMora, 0);
  const totalCapital = pagos.reduce((s, p) => s + p.aplicadoCapital, 0);

  const kpis = [
    { label: "Total Pagos", value: String(totalPagos), icon: Hash, accent: "text-primary" },
    { label: "Total Recaudado", value: $$(totalRecaudado), icon: DollarSign, accent: "text-success" },
    { label: "Aplicado a Capital", value: $$(totalCapital), icon: TrendingUp, accent: "text-[hsl(217,91%,60%)]" },
    { label: "Aplicado a Mora", value: $$(totalMora), icon: HandCoins, accent: "text-destructive" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pagos</h1>
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

      {/* Search bar centered */}
      <div className="hidden md:flex justify-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, préstamo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[13px] bg-card" />
        </div>
      </div>

      {/* DESKTOP filter bar */}
      <div className="hidden md:flex items-center gap-2 bg-filter-bar border border-filter-bar-border rounded-lg px-3 py-2">
        <MultiFilterDropdown label="Método" options={metodoOptions} selected={selMetodo} onChange={setSelMetodo} />
        <MultiFilterDropdown label="Caja" options={cajasOpts} selected={selCaja} onChange={setSelCaja} />
        <MultiFilterDropdown label="Ruta" options={rutasOpts} selected={selRuta} onChange={setSelRuta} />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"
              className={cn("h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-filter-bar-border hover:bg-primary/5",
                regDesde && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {regDesde ? format(regDesde, "dd/MM/yy") : "Desde"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={regDesde} onSelect={setRegDesde} className="p-3 pointer-events-auto" />
            {regDesde && <div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setRegDesde(undefined)}>Limpiar</Button></div>}
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"
              className={cn("h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-filter-bar-border hover:bg-primary/5",
                regHasta && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {regHasta ? format(regHasta, "dd/MM/yy") : "Hasta"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={regHasta} onSelect={setRegHasta} className="p-3 pointer-events-auto" />
            {regHasta && <div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setRegHasta(undefined)}>Limpiar</Button></div>}
          </PopoverContent>
        </Popover>
        <div className="flex-1" />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs whitespace-nowrap shrink-0 text-muted-foreground hover:text-foreground" onClick={clearAll}>
            <X className="h-3 w-3 mr-1" />Limpiar
          </Button>
        )}
      </div>

      {/* MOBILE filter bar */}
      <div className="flex md:hidden items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-[13px]", totalActiveFilters > 0 && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground")}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {totalActiveFilters > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold px-1">
                  {totalActiveFilters}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto">
            <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Método</p>
                {metodoOptions.map((o) => (
                  <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
                    <Checkbox checked={selMetodo.has(o)} onCheckedChange={() => { const n = new Set(selMetodo); n.has(o) ? n.delete(o) : n.add(o); setSelMetodo(n); }} />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Caja</p>
                {cajasOpts.map((o) => (
                  <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
                    <Checkbox checked={selCaja.has(o)} onCheckedChange={() => { const n = new Set(selCaja); n.has(o) ? n.delete(o) : n.add(o); setSelCaja(n); }} />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ruta</p>
                {rutasOpts.map((o) => (
                  <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
                    <Checkbox checked={selRuta.has(o)} onCheckedChange={() => { const n = new Set(selRuta); n.has(o) ? n.delete(o) : n.add(o); setSelRuta(n); }} />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={clearAll}>Limpiar todo</Button>
            </div>
          </SheetContent>
        </Sheet>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-[13px]" />
        </div>
      </div>

      {/* Count + pagination header */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">{filtered.length} pago{filtered.length !== 1 ? "s" : ""}</p>
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
                ["fecha", "Fecha"], ["cliente", "Cliente"], ["shortId", "Préstamo"],
                ["montoRecibido", "Recibido"], ["aplicadoMora", "A Mora"], ["aplicadoInteres", "A Interés"], ["aplicadoCapital", "A Capital"],
                ["metodo", "Método"], ["caja", "Caja"], ["ruta", "Ruta"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5"
                  onClick={() => toggleSort(key)}
                >
                  <div className="flex items-center gap-1">{label}<SortIcon col={key} /></div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={10} className="px-3 py-3">
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-destructive text-[13px]">Error al cargar pagos</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron pagos</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow
                key={p.id}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-table-hover",
                  p.anulado && "opacity-50"
                )}
              >
                <TableCell className="text-[12px] text-muted-foreground px-3 whitespace-nowrap">{p.fecha ? format(new Date(p.fecha), "dd/MM/yyyy HH:mm") : "—"}</TableCell>
                <TableCell className={cn("font-medium whitespace-nowrap text-[13px] px-3", p.anulado && "line-through")}>{p.cliente}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground px-3">{p.shortId}</TableCell>
                <TableCell className={cn("text-right font-medium text-[13px] px-3", p.anulado && "line-through")}>{$$(p.montoRecibido)}</TableCell>
                <TableCell className={cn("text-right text-[12px] px-3", p.aplicadoMora > 0 ? "text-destructive font-medium" : "text-muted-foreground/50")}>{$$(p.aplicadoMora)}</TableCell>
                <TableCell className={cn("text-right text-[12px] px-3", p.aplicadoInteres === 0 && "text-muted-foreground/50")}>{$$(p.aplicadoInteres)}</TableCell>
                <TableCell className={cn("text-right text-[12px] px-3", p.aplicadoCapital === 0 && "text-muted-foreground/50")}>{$$(p.aplicadoCapital)}</TableCell>
                <TableCell className="px-3"><MetodoDot metodo={p.metodo} /></TableCell>
                <TableCell className="text-muted-foreground text-[12px] whitespace-nowrap px-3">{p.caja}</TableCell>
                <TableCell className="text-muted-foreground text-[12px] whitespace-nowrap px-3">
                  {p.anulado ? <span className="text-destructive font-medium">Anulado</span> : p.ruta}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
