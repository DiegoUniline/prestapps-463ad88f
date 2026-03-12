import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, X, Check } from "lucide-react";
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

const estadoChipIdle: Record<string, string> = {
  Activo: "border-primary/40 text-primary hover:bg-primary/10",
  "Al día": "border-success/40 text-success hover:bg-success/10",
  Vencido: "border-destructive/40 text-destructive hover:bg-destructive/10",
  Liquidado: "border-muted-foreground/40 text-muted-foreground hover:bg-muted",
  Cancelado: "border-muted-foreground/40 text-muted-foreground hover:bg-muted",
  Juridico: "border-warning/40 text-warning hover:bg-warning/10",
};

type SortKey = keyof Prestamo;

const uniqueVals = (key: keyof Prestamo) => [...new Set(mockPrestamos.map((p) => String(p[key])))];

// Multi-select chip group
function ChipGroup({ label, options, selected, onChange, colorMap }: {
  label: string; options: string[]; selected: Set<string>;
  onChange: (s: Set<string>) => void; colorMap?: Record<string, string>;
}) {
  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground mr-1">{label}:</span>
      {options.map((o) => {
        const active = selected.has(o);
        const idleClass = colorMap?.[o] || "border-border text-foreground hover:bg-muted";
        return (
          <button key={o} onClick={() => toggle(o)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer",
              active ? (colorMap ? estadoColors[o] || "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground border-primary") : idleClass
            )}>
            {active && <Check className="h-3 w-3" />}
            {o}
          </button>
        );
      })}
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

  const hasFilters = selEstado.size > 0 || selCaja.size > 0 || selRuta.size > 0 || selCobrador.size > 0 || regDesde || regHasta || search;

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

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar cliente o ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
      </div>

      {/* Chip filters */}
      <div className="space-y-2">
        <ChipGroup label="Estado" options={uniqueVals("estado")} selected={selEstado} onChange={setSelEstado} colorMap={estadoChipIdle} />
        <ChipGroup label="Caja" options={uniqueVals("caja")} selected={selCaja} onChange={setSelCaja} />
        <ChipGroup label="Ruta" options={uniqueVals("ruta")} selected={selRuta} onChange={setSelRuta} />
        <ChipGroup label="Cobrador" options={uniqueVals("cobrador")} selected={selCobrador} onChange={setSelCobrador} />

        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">Fecha registro:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 rounded-full", regDesde && "border-primary text-primary")}>
                <CalendarIcon className="h-3 w-3" />
                {regDesde ? format(regDesde, "dd/MM/yyyy") : "Desde"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={regDesde} onSelect={setRegDesde} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 rounded-full", regHasta && "border-primary text-primary")}>
                <CalendarIcon className="h-3 w-3" />
                {regHasta ? format(regHasta, "dd/MM/yyyy") : "Hasta"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={regHasta} onSelect={setRegHasta} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {(regDesde || regHasta) && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full" onClick={() => { setRegDesde(undefined); setRegHasta(undefined); }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Counter + clear */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length} préstamo{filtered.length !== 1 ? "s" : ""}</span>
        {hasFilters && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAll}><X className="h-3 w-3 mr-1" />Limpiar filtros</Button>}
      </div>

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
