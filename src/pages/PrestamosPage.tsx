import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Prestamo {
  id: string;
  cliente: string;
  montoSolicitado: number;
  montoPagar: number;
  cuotasPagadas: number;
  totalCuotas: number;
  caja: string;
  ruta: string;
  cobrador: string;
  saldo: number;
  mora: number;
  estado: string;
  fechaRegistro: string;
  fechaPrimerPago: string;
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
type SortDir = "asc" | "desc" | null;

const uniqueValues = (key: keyof Prestamo) => [...new Set(mockPrestamos.map((p) => String(p[key])))];

function DateRangeFilter({ label, from, to, onFromChange, onToChange, onClear }: {
  label: string; from: Date | undefined; to: Date | undefined;
  onFromChange: (d: Date | undefined) => void; onToChange: (d: Date | undefined) => void; onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1", (from || to) && "border-primary text-primary")}>
            <CalendarIcon className="h-3 w-3" />
            {from && to ? `${format(from, "dd/MM")} - ${format(to, "dd/MM")}` : from ? `Desde ${format(from, "dd/MM")}` : to ? `Hasta ${format(to, "dd/MM")}` : label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 space-y-2" align="start">
          <p className="text-xs font-medium text-muted-foreground">Desde</p>
          <Calendar mode="single" selected={from} onSelect={onFromChange} className="p-0 pointer-events-auto" />
          <p className="text-xs font-medium text-muted-foreground">Hasta</p>
          <Calendar mode="single" selected={to} onSelect={onToChange} className="p-0 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      {(from || to) && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClear}><X className="h-3 w-3" /></Button>}
    </div>
  );
}

export default function PrestamosPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  // Column filters
  const [fEstado, setFEstado] = useState("todos");
  const [fCaja, setFCaja] = useState("todos");
  const [fRuta, setFRuta] = useState("todos");
  const [fCobrador, setFCobrador] = useState("todos");

  // Date range filters
  const [regDesde, setRegDesde] = useState<Date>();
  const [regHasta, setRegHasta] = useState<Date>();
  const [pagoDesde, setPagoDesde] = useState<Date>();
  const [pagoHasta, setPagoHasta] = useState<Date>();

  // Sort
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
    } else {
      setSortKey(key); setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const hasActiveFilters = fEstado !== "todos" || fCaja !== "todos" || fRuta !== "todos" || fCobrador !== "todos" || regDesde || regHasta || pagoDesde || pagoHasta || search;

  const clearAll = () => {
    setSearch(""); setFEstado("todos"); setFCaja("todos"); setFRuta("todos"); setFCobrador("todos");
    setRegDesde(undefined); setRegHasta(undefined); setPagoDesde(undefined); setPagoHasta(undefined);
    setSortKey(null); setSortDir(null);
  };

  const filtered = useMemo(() => {
    let data = mockPrestamos.filter((p) => {
      if (search && !p.cliente.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (fEstado !== "todos" && p.estado !== fEstado) return false;
      if (fCaja !== "todos" && p.caja !== fCaja) return false;
      if (fRuta !== "todos" && p.ruta !== fRuta) return false;
      if (fCobrador !== "todos" && p.cobrador !== fCobrador) return false;
      const reg = new Date(p.fechaRegistro);
      if (regDesde && reg < regDesde) return false;
      if (regHasta && reg > regHasta) return false;
      const pago = new Date(p.fechaPrimerPago);
      if (pagoDesde && pago < pagoDesde) return false;
      if (pagoHasta && pago > pagoHasta) return false;
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
  }, [search, fEstado, fCaja, fRuta, fCobrador, regDesde, regHasta, pagoDesde, pagoHasta, sortKey, sortDir]);

  const ColFilter = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-7 text-xs min-w-[90px]", value !== "todos" && "border-primary text-primary")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todos</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Préstamos</h1>
        <Button onClick={() => navigate("/prestamos/nuevo")}><Plus className="h-4 w-4 mr-2" />Nuevo</Button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente o ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <ColFilter value={fEstado} onChange={setFEstado} options={uniqueValues("estado")} placeholder="Estado" />
        <ColFilter value={fCaja} onChange={setFCaja} options={uniqueValues("caja")} placeholder="Caja" />
        <ColFilter value={fRuta} onChange={setFRuta} options={uniqueValues("ruta")} placeholder="Ruta" />
        <ColFilter value={fCobrador} onChange={setFCobrador} options={uniqueValues("cobrador")} placeholder="Cobrador" />
        <DateRangeFilter label="F. Registro" from={regDesde} to={regHasta} onFromChange={setRegDesde} onToChange={setRegHasta} onClear={() => { setRegDesde(undefined); setRegHasta(undefined); }} />
        <DateRangeFilter label="F. 1er Pago" from={pagoDesde} to={pagoHasta} onFromChange={setPagoDesde} onToChange={setPagoHasta} onClear={() => { setPagoDesde(undefined); setPagoHasta(undefined); }} />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}><X className="h-3 w-3 mr-1" />Limpiar</Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} préstamo{filtered.length !== 1 ? "s" : ""}</div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {([
                ["id", "ID"],
                ["cliente", "Cliente"],
                ["fechaRegistro", "F. Registro"],
                ["fechaPrimerPago", "F. 1er Pago"],
                ["montoSolicitado", "Prestado"],
                ["montoPagar", "A Pagar"],
                ["cuotasPagadas", "Cuotas"],
                ["caja", "Caja"],
                ["ruta", "Ruta"],
                ["cobrador", "Cobrador"],
                ["saldo", "Saldo"],
                ["mora", "Mora"],
                ["estado", "Estado"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableHead key={key} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(key)}>
                  <div className="flex items-center gap-1">
                    {label}
                    <SortIcon col={key} />
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">No se encontraron préstamos</TableCell></TableRow>
            ) : (
              filtered.map((p) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
