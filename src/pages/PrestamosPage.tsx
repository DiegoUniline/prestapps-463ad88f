import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, X, CalendarIcon, SlidersHorizontal, ChevronLeft, ChevronRight, DollarSign, FileText, TrendingUp, AlertTriangle, User } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn, $$, fmtDate } from "@/lib/utils";
import { usePrestamos, useCajasOptions, useRutasOptions, type PrestamoListItem } from "@/hooks/usePrestamos";

const estadoBadge: Record<string, string> = {
  Activo: "bg-badge-activo text-badge-activo-foreground",
  "Al día": "bg-badge-aldia text-badge-aldia-foreground",
  Vencido: "bg-badge-vencido text-badge-vencido-foreground",
  Liquidado: "bg-badge-liquidado text-badge-liquidado-foreground",
  Cancelado: "bg-badge-cancelado text-badge-cancelado-foreground",
  Juridico: "bg-badge-juridico text-badge-juridico-foreground",
};

type SortKey = keyof PrestamoListItem;
const estadoOptions = ["Activo", "Vencido", "Al día", "Liquidado", "Juridico", "Cancelado"];

// --- Multi-select dropdown filter ---
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

// --- Filters for mobile sheet ---
function FiltersContent({ selEstado, setSelEstado, selCaja, setSelCaja, selRuta, setSelRuta, cajasOpts, rutasOpts,
  regDesde, setRegDesde, regHasta, setRegHasta, clearAll }: any) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estado</p>
        {estadoOptions.map((o) => (
          <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
            <Checkbox checked={selEstado.has(o)} onCheckedChange={() => { const n = new Set(selEstado); n.has(o) ? n.delete(o) : n.add(o); setSelEstado(n); }} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Caja</p>
        {(cajasOpts || []).map((o: string) => (
          <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
            <Checkbox checked={selCaja.has(o)} onCheckedChange={() => { const n = new Set(selCaja); n.has(o) ? n.delete(o) : n.add(o); setSelCaja(n); }} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ruta</p>
        {(rutasOpts || []).map((o: string) => (
          <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
            <Checkbox checked={selRuta.has(o)} onCheckedChange={() => { const n = new Set(selRuta); n.has(o) ? n.delete(o) : n.add(o); setSelRuta(n); }} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Fecha Registro</p>
        <p className="text-xs text-muted-foreground mb-1">Desde</p>
        <Calendar mode="single" selected={regDesde} onSelect={setRegDesde} className="p-0 pointer-events-auto" />
        <p className="text-xs text-muted-foreground mb-1 mt-3">Hasta</p>
        <Calendar mode="single" selected={regHasta} onSelect={setRegHasta} className="p-0 pointer-events-auto" />
      </div>
      <Button variant="outline" className="w-full" onClick={clearAll}>Limpiar todo</Button>
    </div>
  );
}

export default function PrestamosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, rutaIds, cobradorId } = useCurrentUserRole();
  const { empresaId } = useEmpresa();
  const roleFilters = role === "admin" ? { empresaId } : { rutaIds: rutaIds.length > 0 ? rutaIds : undefined, cobradorId, empresaId };
  const { data: prestamos = [], isLoading, isError } = usePrestamos(roleFilters);
  const { data: cajasRaw = [] } = useCajasOptions(empresaId);
  const { data: rutasRaw = [] } = useRutasOptions(empresaId);

  const cajasOpts = cajasRaw.map((c) => c.nombre);
  const rutasOpts = rutasRaw.map((r) => r.nombre);

  const [search, setSearch] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("todos");

  const [selEstado, setSelEstado] = useState<Set<string>>(new Set());
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

  const totalActiveFilters = selEstado.size + selCaja.size + selRuta.size + (regDesde ? 1 : 0) + (regHasta ? 1 : 0);
  const hasFilters = totalActiveFilters > 0 || search;

  const clearAll = () => {
    setSearch(""); setSelEstado(new Set()); setSelCaja(new Set()); setSelRuta(new Set());
    setRegDesde(undefined); setRegHasta(undefined); setSortKey(null); setSortDir(null);
  };

  // Tab-based pre-filter
  const tabFiltered = useMemo(() => {
    if (activeTab === "todos") return prestamos;
    if (activeTab === "vigentes") return prestamos.filter((p) => !p.tieneAtraso && p.estado !== "Liquidado" && p.estado !== "Cancelado");
    if (activeTab === "atrasados") return prestamos.filter((p) => p.tieneAtraso && p.estado !== "Liquidado" && p.estado !== "Cancelado");
    if (activeTab === "liquidados") return prestamos.filter((p) => p.estado === "Liquidado" || p.estado === "Cancelado");
    return prestamos;
  }, [prestamos, activeTab]);

  const filtered = useMemo(() => {
    let data = tabFiltered.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.cliente.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !p.idPrestamo.toLowerCase().includes(q) && !p.codigoInterno.toLowerCase().includes(q)) return false;
      }
      if (selEstado.size > 0 && !selEstado.has(p.estado)) return false;
      if (selCaja.size > 0 && !selCaja.has(p.caja)) return false;
      if (selRuta.size > 0 && !selRuta.has(p.ruta)) return false;
      if (p.fechaRegistro) {
        const reg = new Date(p.fechaRegistro);
        if (regDesde && reg < regDesde) return false;
        if (regHasta && reg > regHasta) return false;
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
  }, [tabFiltered, search, selEstado, selCaja, selRuta, regDesde, regHasta, sortKey, sortDir]);

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedRows(next);
  };
  const allSelected = filtered.length > 0 && filtered.every((p) => selectedRows.has(p.id));
  const toggleAll = () => {
    if (allSelected) setSelectedRows(new Set());
    else setSelectedRows(new Set(filtered.map((p) => p.id)));
  };

  // KPI data from all prestamos (not just filtered)
  const totalPrestamos = prestamos.length;
  const montoColocado = prestamos.reduce((s, p) => s + p.montoSolicitado, 0);
  const porCobrar = prestamos.reduce((s, p) => s + p.saldo, 0);
  const morosos = prestamos.filter((p) => p.mora > 0);
  const totalMora = morosos.reduce((s, p) => s + p.mora, 0);

  const kpis = [
    { label: "Total Préstamos", value: String(totalPrestamos), icon: FileText, accent: "text-primary" },
    { label: "Monto Colocado", value: $$(montoColocado), icon: DollarSign, accent: "text-success" },
    { label: "Por Cobrar", value: $$(porCobrar), icon: TrendingUp, accent: "text-warning" },
    { label: `En Mora (${morosos.length})`, value: $$(totalMora), icon: AlertTriangle, accent: "text-destructive" },
  ];

  const tabCounts = useMemo(() => ({
    todos: prestamos.length,
    vigentes: prestamos.filter((p) => !p.tieneAtraso && p.estado !== "Liquidado" && p.estado !== "Cancelado").length,
    atrasados: prestamos.filter((p) => p.tieneAtraso && p.estado !== "Liquidado" && p.estado !== "Cancelado").length,
    liquidados: prestamos.filter((p) => p.estado === "Liquidado" || p.estado === "Cancelado").length,
  }), [prestamos]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Préstamos y Ventas</h1>
        <Button onClick={() => navigate("/prestamos/nuevo")} size="sm" className="h-8 text-[13px]">
          <Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="todos">Todos <span className="ml-1.5 text-[10px] opacity-70">({tabCounts.todos})</span></TabsTrigger>
          <TabsTrigger value="vigentes">Vigentes <span className="ml-1.5 text-[10px] opacity-70">({tabCounts.vigentes})</span></TabsTrigger>
          <TabsTrigger value="atrasados">Atrasados <span className="ml-1.5 text-[10px] opacity-70">({tabCounts.atrasados})</span></TabsTrigger>
          <TabsTrigger value="liquidados">Liquidados <span className="ml-1.5 text-[10px] opacity-70">({tabCounts.liquidados})</span></TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="space-y-5 mt-4">

      {/* Search bar centered — Odoo style */}
      <div className="hidden md:flex justify-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[13px] bg-card" />
        </div>
      </div>

      {/* DESKTOP filter bar */}
      <div className="hidden md:flex items-center gap-2 bg-filter-bar border border-filter-bar-border rounded-lg px-3 py-2">
        <MultiFilterDropdown label="Estado" options={estadoOptions} selected={selEstado} onChange={setSelEstado} />
        <MultiFilterDropdown label="Caja" options={cajasOpts} selected={selCaja} onChange={setSelCaja} />
        <MultiFilterDropdown label="Ruta" options={rutasOpts} selected={selRuta} onChange={setSelRuta} />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"
              className={cn("h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-filter-bar-border hover:bg-primary/5",
                regDesde && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {regDesde ? fmtDate(regDesde) : "Desde"}
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
              {regHasta ? fmtDate(regHasta) : "Hasta"}
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
            <div className="mt-4">
              <FiltersContent {...{ selEstado, setSelEstado, selCaja, setSelCaja, selRuta, setSelRuta, cajasOpts, rutasOpts, regDesde, setRegDesde, regHasta, setRegHasta, clearAll }} />
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
        <p className="text-[12px] text-muted-foreground">{filtered.length} préstamo{filtered.length !== 1 ? "s" : ""}</p>
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
              <TableHead className="w-10 px-3">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </TableHead>
              {([
                ["codigoInterno", "Cód."], ["idPrestamo", "Folio"], ["cliente", "Cliente"], ["fechaRegistro", "F. Registro"], ["fechaPrimerPago", "F. 1er Pago"],
                ["montoSolicitado", "Prestado"], ["montoPagar", "A Pagar"], ["cuotasPagadas", "Cuotas"],
                ["caja", "Caja"], ["ruta", "Ruta"],
                ["saldo", "Saldo"], ["mora", "Mora"], ["estado", "Estado"],
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
                  <TableCell colSpan={14} className="px-3 py-3">
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow><TableCell colSpan={14} className="text-center py-8 text-destructive text-[13px]">Error al cargar préstamos</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron préstamos</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow
                key={p.id}
                className={cn(
                  "cursor-pointer border-b border-border/50 transition-colors group",
                  selectedRows.has(p.id) ? "bg-table-selected" : "hover:bg-table-hover"
                )}
                onClick={() => navigate(`/prestamos/${p.id}`)}
                
              >
                <TableCell className="px-3 w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selectedRows.has(p.id)} onCheckedChange={() => toggleRow(p.id)} />
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground px-3 whitespace-nowrap">{p.codigoInterno || "—"}</TableCell>
                <TableCell className="font-mono text-[12px] px-3 whitespace-nowrap">
                  {p.idPrestamo}
                  {p.tipoCuenta !== "prestamo" && (
                    <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0 text-[9px] font-semibold bg-accent text-accent-foreground">
                      {p.tipoCuenta === "venta_seguro" ? "Seguro" : p.tipoCuenta === "venta_producto" ? "Producto" : "Servicio"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap text-[13px] px-3">
                  <div className="flex items-center gap-2">
                    <Avatar
                      className={cn("h-6 w-6 shrink-0", p.clienteFoto && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all")}
                      onClick={(e) => { if (p.clienteFoto) { e.stopPropagation(); setLightboxPhoto({ src: p.clienteFoto, alt: p.cliente }); } }}
                    >
                      {p.clienteFoto ? <AvatarImage src={p.clienteFoto} alt={p.cliente} /> : null}
                      <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                        {p.cliente.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {p.cliente}
                  </div>
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground px-3">{fmtDate(p.fechaRegistro)}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground px-3">{fmtDate(p.fechaPrimerPago)}</TableCell>
                <TableCell className="text-right text-[13px] px-3">{$$(p.montoSolicitado)}</TableCell>
                <TableCell className="text-right text-[13px] px-3">{$$(p.montoPagar)}</TableCell>
                <TableCell className="text-[13px] px-3">{p.cuotasPagadas ?? 0}/{p.totalCuotas ?? 0}</TableCell>
                <TableCell className="text-muted-foreground text-[12px] whitespace-nowrap px-3">{p.caja}</TableCell>
                <TableCell className="text-muted-foreground text-[12px] whitespace-nowrap px-3">{p.ruta}</TableCell>
                <TableCell className="text-right font-medium text-[13px] px-3">{$$(p.saldo)}</TableCell>
                <TableCell className={cn("text-right font-bold text-[13px] px-3", (p.mora ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {(p.mora ?? 0) > 0 ? $$(p.mora) : "$0.00"}
                </TableCell>
                <TableCell className="px-3">
                  <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium", estadoBadge[p.estado] || "bg-muted text-muted-foreground")}>
                    {p.estado}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

        </TabsContent>
      </Tabs>
    </div>
  );
}
