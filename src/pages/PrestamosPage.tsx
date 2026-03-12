import { useState, useMemo, useRef, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, X, CalendarIcon, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Prestamo {
  id: string; cliente: string; montoSolicitado: number; montoPagar: number;
  cuotasPagadas: number; totalCuotas: number; caja: string; ruta: string;
  cobrador: string; saldo: number; mora: number; estado: string;
  fechaRegistro: string; fechaPrimerPago: string;
}

const mockPrestamos: Prestamo[] = [
  { id: "PRE-0001", cliente: "María García", montoSolicitado: 10000, montoPagar: 12000, cuotasPagadas: 3, totalCuotas: 12, caja: "Caja Principal", ruta: "Ruta Centro", cobrador: "Pedro Ruiz", saldo: 9000, mora: 0, estado: "Activo", fechaRegistro: "2026-01-15", fechaPrimerPago: "2026-01-22" },
  { id: "PRE-0002", cliente: "Carlos López", montoSolicitado: 25000, montoPagar: 32500, cuotasPagadas: 7, totalCuotas: 24, caja: "Caja Principal", ruta: "Ruta Norte", cobrador: "Juan Torres", saldo: 21800, mora: 1200, estado: "Vencido", fechaRegistro: "2025-11-01", fechaPrimerPago: "2025-11-08" },
  { id: "PRE-0003", cliente: "Ana Martínez", montoSolicitado: 5000, montoPagar: 6000, cuotasPagadas: 1, totalCuotas: 6, caja: "Caja Secundaria", ruta: "Ruta Centro", cobrador: "Pedro Ruiz", saldo: 5000, mora: 0, estado: "Al día", fechaRegistro: "2026-03-01", fechaPrimerPago: "2026-03-08" },
  { id: "PRE-0004", cliente: "José Rodríguez", montoSolicitado: 15000, montoPagar: 19500, cuotasPagadas: 12, totalCuotas: 12, caja: "Caja Principal", ruta: "Ruta Sur", cobrador: "Miguel Ángel", saldo: 0, mora: 0, estado: "Liquidado", fechaRegistro: "2025-06-10", fechaPrimerPago: "2025-06-17" },
  { id: "PRE-0005", cliente: "Laura Sánchez", montoSolicitado: 8000, montoPagar: 10400, cuotasPagadas: 5, totalCuotas: 18, caja: "Caja Reserva", ruta: "Ruta Este", cobrador: "Pedro Ruiz", saldo: 7200, mora: 350, estado: "Activo", fechaRegistro: "2025-12-20", fechaPrimerPago: "2025-12-27" },
  { id: "PRE-0006", cliente: "Roberto Díaz", montoSolicitado: 12000, montoPagar: 15600, cuotasPagadas: 0, totalCuotas: 12, caja: "Caja Principal", ruta: "Ruta Norte", cobrador: "Juan Torres", saldo: 15600, mora: 2400, estado: "Juridico", fechaRegistro: "2025-09-05", fechaPrimerPago: "2025-09-12" },
];

const estadoColors: Record<string, string> = {
  Activo: "bg-primary text-primary-foreground",
  "Al día": "bg-success text-success-foreground",
  Vencido: "bg-destructive text-destructive-foreground",
  Liquidado: "bg-muted text-muted-foreground",
  Cancelado: "bg-muted text-muted-foreground",
  Juridico: "bg-warning text-warning-foreground",
};

type SortKey = keyof Prestamo;
const uniqueVals = (key: keyof Prestamo) => [...new Set(mockPrestamos.map((p) => String(p[key])))];

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
            "h-9 gap-1.5 text-sm font-medium whitespace-nowrap",
            count > 0 && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
          )}>
          {label}
          {count > 0 && (
            <span className={cn(
              "ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full text-xs font-bold px-1",
              "bg-primary-foreground/20"
            )}>
              {count}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm">
              <Checkbox checked={selected.has(opt)} onCheckedChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs" onClick={() => onChange(new Set())}>
            Limpiar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Date range dropdown ---
function DateRangeDropdown({ from, to, onFromChange, onToChange, onClear }: {
  from: Date | undefined; to: Date | undefined;
  onFromChange: (d: Date | undefined) => void; onToChange: (d: Date | undefined) => void; onClear: () => void;
}) {
  const hasValue = from || to;
  const label = from && to
    ? `${format(from, "dd/MM/yy")} – ${format(to, "dd/MM/yy")}`
    : from ? `Desde ${format(from, "dd/MM/yy")}` : to ? `Hasta ${format(to, "dd/MM/yy")}` : "Fecha Registro";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"
          className={cn(
            "h-9 gap-1.5 text-sm font-medium whitespace-nowrap",
            hasValue && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
          )}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Desde</p>
            <Calendar mode="single" selected={from} onSelect={onFromChange} className="p-0 pointer-events-auto" />
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Hasta</p>
            <Calendar mode="single" selected={to} onSelect={onToChange} className="p-0 pointer-events-auto" />
          </div>
          {hasValue && (
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={onClear}>Limpiar fechas</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Filters rendered inside mobile sheet ---
function FiltersContent({ selEstado, setSelEstado, selCaja, setSelCaja, selRuta, setSelRuta, selCobrador, setSelCobrador,
  regDesde, setRegDesde, regHasta, setRegHasta, clearAll }: any) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-2">Estado</p>
        {estadoOptions.map((o) => (
          <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm">
            <Checkbox checked={selEstado.has(o)} onCheckedChange={() => { const n = new Set(selEstado); n.has(o) ? n.delete(o) : n.add(o); setSelEstado(n); }} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Caja</p>
        {uniqueVals("caja").map((o) => (
          <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm">
            <Checkbox checked={selCaja.has(o)} onCheckedChange={() => { const n = new Set(selCaja); n.has(o) ? n.delete(o) : n.add(o); setSelCaja(n); }} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Ruta</p>
        {uniqueVals("ruta").map((o) => (
          <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm">
            <Checkbox checked={selRuta.has(o)} onCheckedChange={() => { const n = new Set(selRuta); n.has(o) ? n.delete(o) : n.add(o); setSelRuta(n); }} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Cobrador</p>
        {uniqueVals("cobrador").map((o) => (
          <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm">
            <Checkbox checked={selCobrador.has(o)} onCheckedChange={() => { const n = new Set(selCobrador); n.has(o) ? n.delete(o) : n.add(o); setSelCobrador(n); }} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Fecha Registro</p>
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
  const [search, setSearch] = useState("");

  const [selEstado, setSelEstado] = useState<Set<string>>(new Set());
  const [selCaja, setSelCaja] = useState<Set<string>>(new Set());
  const [selRuta, setSelRuta] = useState<Set<string>>(new Set());
  const [selCobrador, setSelCobrador] = useState<Set<string>>(new Set());
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

  const totalActiveFilters = selEstado.size + selCaja.size + selRuta.size + selCobrador.size + (regDesde ? 1 : 0) + (regHasta ? 1 : 0);
  const hasFilters = totalActiveFilters > 0 || search;

  const clearAll = () => {
    setSearch(""); setSelEstado(new Set()); setSelCaja(new Set()); setSelRuta(new Set()); setSelCobrador(new Set());
    setRegDesde(undefined); setRegHasta(undefined); setSortKey(null); setSortDir(null);
  };

  const filtered = useMemo(() => {
    let data = mockPrestamos.filter((p) => {
      if (search && !p.cliente.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (selEstado.size > 0 && !selEstado.has(p.estado)) return false;
      if (selCaja.size > 0 && !selCaja.has(p.caja)) return false;
      if (selRuta.size > 0 && !selRuta.has(p.ruta)) return false;
      if (selCobrador.size > 0 && !selCobrador.has(p.cobrador)) return false;
      const reg = new Date(p.fechaRegistro);
      if (regDesde && reg < regDesde) return false;
      if (regHasta && reg > regHasta) return false;
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
  }, [search, selEstado, selCaja, selRuta, selCobrador, regDesde, regHasta, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Préstamos</h1>
        <Button onClick={() => navigate("/prestamos/nuevo")}><Plus className="h-4 w-4 mr-2" />Nuevo</Button>
      </div>

      {/* Search bar centered — Odoo style */}
      <div className="hidden md:flex justify-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 text-sm" />
        </div>
      </div>

      {/* DESKTOP filter bar — single row */}
      <div className="hidden md:flex items-center gap-2 w-full">
        <MultiFilterDropdown label="Estado" options={estadoOptions} selected={selEstado} onChange={setSelEstado} />
        <MultiFilterDropdown label="Caja" options={uniqueVals("caja")} selected={selCaja} onChange={setSelCaja} />
        <MultiFilterDropdown label="Ruta" options={uniqueVals("ruta")} selected={selRuta} onChange={setSelRuta} />
        <MultiFilterDropdown label="Cobrador" options={uniqueVals("cobrador")} selected={selCobrador} onChange={setSelCobrador} />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"
              className={cn("h-9 gap-1.5 text-sm font-medium whitespace-nowrap", regDesde && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {regDesde ? format(regDesde, "dd/MM/yy") : "Desde"}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
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
              className={cn("h-9 gap-1.5 text-sm font-medium whitespace-nowrap", regHasta && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {regHasta ? format(regHasta, "dd/MM/yy") : "Hasta"}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={regHasta} onSelect={setRegHasta} className="p-3 pointer-events-auto" />
            {regHasta && <div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setRegHasta(undefined)}>Limpiar</Button></div>}
          </PopoverContent>
        </Popover>
        <div className="flex-1" />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs whitespace-nowrap shrink-0" onClick={clearAll}>
            <X className="h-3.5 w-3.5 mr-1" />Limpiar
          </Button>
        )}
      </div>

      {/* MOBILE filter bar */}
      <div className="flex md:hidden items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 gap-1.5", totalActiveFilters > 0 && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground")}>
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {totalActiveFilters > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-xs font-bold px-1">
                  {totalActiveFilters}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto">
            <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
            <div className="mt-4">
              <FiltersContent {...{ selEstado, setSelEstado, selCaja, setSelCaja, selRuta, setSelRuta, selCobrador, setSelCobrador, regDesde, setRegDesde, regHasta, setRegHasta, clearAll }} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} préstamo{filtered.length !== 1 ? "s" : ""}</div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {([
                ["id", "ID"], ["cliente", "Cliente"], ["fechaRegistro", "F. Registro"], ["fechaPrimerPago", "F. 1er Pago"],
                ["montoSolicitado", "Prestado"], ["montoPagar", "A Pagar"], ["cuotasPagadas", "Cuotas"],
                ["caja", "Caja"], ["ruta", "Ruta"], ["cobrador", "Cobrador"],
                ["saldo", "Saldo"], ["mora", "Mora"], ["estado", "Estado"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableHead key={key} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(key)}>
                  <div className="flex items-center gap-1">{label}<SortIcon col={key} /></div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">No se encontraron préstamos</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/prestamos/${p.id}`)}>
                <TableCell className="font-mono text-xs">{p.id}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{p.cliente}</TableCell>
                <TableCell className="text-xs">{format(new Date(p.fechaRegistro), "dd/MM/yyyy")}</TableCell>
                <TableCell className="text-xs">{format(new Date(p.fechaPrimerPago), "dd/MM/yyyy")}</TableCell>
                <TableCell className="text-right">${p.montoSolicitado.toLocaleString()}</TableCell>
                <TableCell className="text-right">${p.montoPagar.toLocaleString()}</TableCell>
                <TableCell>{p.cuotasPagadas}/{p.totalCuotas}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{p.caja}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{p.ruta}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{p.cobrador}</TableCell>
                <TableCell className="text-right font-medium">${p.saldo.toLocaleString()}</TableCell>
                <TableCell className={`text-right font-medium ${p.mora > 0 ? "text-destructive" : ""}`}>${p.mora.toLocaleString()}</TableCell>
                <TableCell><Badge className={estadoColors[p.estado]}>{p.estado}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
