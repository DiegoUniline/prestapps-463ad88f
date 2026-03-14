import { useState, useMemo, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight as ChevronRightIcon, X, CalendarIcon, SlidersHorizontal, ChevronLeft, ChevronRight, DollarSign, FileText, TrendingUp, AlertTriangle, Columns3 } from "lucide-react";
import { GroupByDropdown } from "@/components/shared/GroupByDropdown";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { useNavigate } from "react-router-dom";
import { cn, $$, fmtDate } from "@/lib/utils";
import { usePrestamos, useCajasOptions, useRutasOptions, type PrestamoListItem } from "@/hooks/usePrestamos";

// ── Estado badge styles ───────────────────────────────────────────
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

// ── All available columns definition ──────────────────────────────
interface ColumnDef {
  key: string;
  label: string;
  sortKey?: SortKey;
  defaultVisible: boolean;
  render: (p: PrestamoListItem, helpers: { setLightboxPhoto: (v: { src: string; alt: string }) => void }) => React.ReactNode;
  className?: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    key: "codigoInterno", label: "Cód. Interno", sortKey: "codigoInterno", defaultVisible: true,
    render: (p) => <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">{p.codigoInterno || "—"}</span>,
  },
  {
    key: "idPrestamo", label: "Folio", sortKey: "idPrestamo", defaultVisible: true,
    render: (p) => (
      <span className="font-mono text-[12px] whitespace-nowrap">
        {p.idPrestamo}
        {p.tipoCuenta !== "prestamo" && (
          <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0 text-[9px] font-semibold bg-accent text-accent-foreground">
            {p.tipoCuenta === "venta_seguro" ? "Seguro" : p.tipoCuenta === "venta_producto" ? "Producto" : "Servicio"}
          </span>
        )}
      </span>
    ),
  },
  {
    key: "cliente", label: "Cliente", sortKey: "cliente", defaultVisible: true,
    render: (p, { setLightboxPhoto }) => (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <Avatar
          className={cn("h-6 w-6 shrink-0", p.clienteFoto && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all")}
          onClick={(e) => { if (p.clienteFoto) { e.stopPropagation(); setLightboxPhoto({ src: p.clienteFoto, alt: p.cliente }); } }}
        >
          {p.clienteFoto ? <AvatarImage src={p.clienteFoto} alt={p.cliente} /> : null}
          <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
            {p.cliente.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium text-[13px]">{p.cliente}</span>
      </div>
    ),
  },
  {
    key: "fechaRegistro", label: "F. Registro", sortKey: "fechaRegistro", defaultVisible: true,
    render: (p) => <span className="text-[12px] text-muted-foreground">{fmtDate(p.fechaRegistro)}</span>,
  },
  {
    key: "fechaPrimerPago", label: "F. 1er Pago", sortKey: "fechaPrimerPago", defaultVisible: false,
    render: (p) => <span className="text-[12px] text-muted-foreground">{fmtDate(p.fechaPrimerPago)}</span>,
  },
  {
    key: "montoSolicitado", label: "Prestado", sortKey: "montoSolicitado", defaultVisible: true,
    render: (p) => <span className="text-right text-[13px]">{$$(p.montoSolicitado)}</span>,
    className: "text-right",
  },
  {
    key: "montoPagar", label: "A Pagar", sortKey: "montoPagar", defaultVisible: false,
    render: (p) => <span className="text-right text-[13px]">{$$(p.montoPagar)}</span>,
    className: "text-right",
  },
  {
    key: "cuotasPagadas", label: "Cuotas", sortKey: "cuotasPagadas", defaultVisible: true,
    render: (p) => <span className="text-[13px]">{p.cuotasPagadas ?? 0}/{p.totalCuotas ?? 0}</span>,
  },
  {
    key: "cobrador", label: "Cobrador", sortKey: "cobrador", defaultVisible: false,
    render: (p) => <span className="text-muted-foreground text-[12px] whitespace-nowrap">{p.cobrador}</span>,
  },
  {
    key: "caja", label: "Caja", sortKey: "caja", defaultVisible: false,
    render: (p) => <span className="text-muted-foreground text-[12px] whitespace-nowrap">{p.caja}</span>,
  },
  {
    key: "ruta", label: "Ruta", sortKey: "ruta", defaultVisible: true,
    render: (p) => <span className="text-muted-foreground text-[12px] whitespace-nowrap">{p.ruta}</span>,
  },
  {
    key: "saldo", label: "Saldo", sortKey: "saldo", defaultVisible: true,
    render: (p) => <span className="text-right font-medium text-[13px]">{$$(p.saldo)}</span>,
    className: "text-right",
  },
  {
    key: "mora", label: "Mora", sortKey: "mora", defaultVisible: true,
    render: (p) => (
      <span className={cn("text-right font-bold text-[13px]", (p.mora ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")}>
        {(p.mora ?? 0) > 0 ? $$(p.mora) : "$0.00"}
      </span>
    ),
    className: "text-right",
  },
  {
    key: "diasAtraso", label: "Días Atraso", sortKey: "diasAtraso", defaultVisible: true,
    render: (p) => {
      const d = p.diasAtraso ?? 0;
      if (d === 0) return <span className="text-muted-foreground text-[12px]">—</span>;
      const color = d > 30 ? "bg-destructive text-destructive-foreground" : d > 7 ? "bg-warning text-warning-foreground" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      return (
        <span className={cn("inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold min-w-[32px]", color)}>
          {d}d
        </span>
      );
    },
  },
  {
    key: "estado", label: "Estado", sortKey: "estado", defaultVisible: true,
    render: (p) => (
      <span className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm border",
        estadoBadge[p.estado] || "bg-muted text-muted-foreground border-border"
      )}>
        <span className={cn(
          "w-1.5 h-1.5 rounded-full mr-1.5",
          p.estado === "Activo" ? "bg-emerald-500" :
          p.estado === "Vencido" ? "bg-red-500" :
          p.estado === "Liquidado" ? "bg-blue-500" :
          p.estado === "Cancelado" ? "bg-gray-500" :
          p.estado === "Juridico" ? "bg-purple-500" :
          "bg-current"
        )} />
        {p.estado}
      </span>
    ),
  },
];

// ── Column visibility persistence ─────────────────────────────────
const STORAGE_KEY_PREFIX = "prestamos-columns-v1-";

function useColumnVisibility(userId: string | undefined) {
  const storageKey = STORAGE_KEY_PREFIX + (userId || "anon");

  const [visible, setVisible] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...visible]));
    } catch {}
  }, [visible, storageKey]);

  const toggle = useCallback((key: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setVisible(new Set(ALL_COLUMNS.map(c => c.key)));
  }, []);

  const resetDefaults = useCallback(() => {
    setVisible(new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));
  }, []);

  return { visible, toggle, selectAll, resetDefaults };
}

// ── Multi-filter dropdown ─────────────────────────────────────────
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

// ── Column picker popover ─────────────────────────────────────────
function ColumnPicker({ visible, toggle, selectAll, resetDefaults }: ReturnType<typeof useColumnVisibility>) {
  const allChecked = visible.size === ALL_COLUMNS.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-filter-bar-border hover:bg-primary/5">
          <Columns3 className="h-3.5 w-3.5" />
          Columnas
          <span className="text-[10px] opacity-60">{visible.size}/{ALL_COLUMNS.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="end">
        <div className="space-y-0.5 max-h-[320px] overflow-y-auto">
          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px] font-semibold border-b border-border mb-1 pb-2">
            <Checkbox checked={allChecked} onCheckedChange={() => allChecked ? resetDefaults() : selectAll()} />
            <span>Todas las columnas</span>
          </label>
          {ALL_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
              <Checkbox checked={visible.has(col.key)} onCheckedChange={() => toggle(col.key)} />
              <span>{col.label}</span>
            </label>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="w-full mt-1.5 h-7 text-xs" onClick={resetDefaults}>
          Restaurar predeterminado
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ── Filters for mobile sheet ──────────────────────────────────────
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

// ── Main page ─────────────────────────────────────────────────────
export default function PrestamosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { role, rutaIds, cobradorId } = useCurrentUserRole();
  const { empresaId } = useEmpresa();
  const roleFilters = role === "admin" ? { empresaId } : { rutaIds: rutaIds.length > 0 ? rutaIds : undefined, cobradorId, empresaId };
  const { data: prestamos = [], isLoading, isError } = usePrestamos(roleFilters);
  const { data: cajasRaw = [] } = useCajasOptions(empresaId);
  const { data: rutasRaw = [] } = useRutasOptions(empresaId);

  const cajasOpts = cajasRaw.map((c) => c.nombre);
  const rutasOpts = rutasRaw.map((r) => r.nombre);

  const colVis = useColumnVisibility(user?.id);
  const visibleColumns = useMemo(() => ALL_COLUMNS.filter(c => colVis.visible.has(c.key)), [colVis.visible]);

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
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; alt: string } | null>(null);

  // Grouping
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const groupByOptions = [
    { key: "estado", label: "Estado" },
    { key: "cliente", label: "Cliente" },
    { key: "tipoCuenta", label: "Tipo de préstamo" },
    { key: "mesCreacion", label: "Mes de creación" },
  ];
  const toggleGroup = (g: string) => {
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  };
  const handleGroupByChange = (key: string | null) => {
    setGroupBy(key);
    setExpandedGroups(new Set());
  };

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

  // Grouped data computation
  const groupedData = useMemo(() => {
    if (!groupBy) return null;
    const groups: Record<string, PrestamoListItem[]> = {};
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    for (const p of filtered) {
      let key: string;
      if (groupBy === "estado") key = p.estado;
      else if (groupBy === "cliente") key = p.cliente;
      else if (groupBy === "tipoCuenta") key = p.tipoCuenta === "prestamo" ? "Préstamo" : p.tipoCuenta === "venta_seguro" ? "Seguro" : p.tipoCuenta === "venta_producto" ? "Producto" : "Servicio";
      else if (groupBy === "mesCreacion") {
        const d = p.fechaRegistro ? new Date(p.fechaRegistro) : null;
        key = d ? `${monthNames[d.getMonth()]} ${d.getFullYear()}` : "Sin fecha";
      } else key = "—";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupBy]);

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

  const colSpanTotal = visibleColumns.length + 1; // +1 for checkbox

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

      {/* Search bar */}
      <div className="hidden md:flex justify-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[13px] bg-card" />
        </div>
      </div>

      {/* DESKTOP filter bar */}
      <div className="hidden md:flex items-center gap-2 bg-filter-bar border border-filter-bar-border rounded-lg px-3 py-2">
        <GroupByDropdown options={groupByOptions} value={groupBy} onChange={handleGroupByChange} />
        <div className="w-px h-5 bg-border" />
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
        <ColumnPicker {...colVis} />
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
        <ColumnPicker {...colVis} />
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
              {visibleColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5",
                    col.className
                  )}
                  onClick={() => col.sortKey && toggleSort(col.sortKey)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortKey && <SortIcon col={col.sortKey} />}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colSpanTotal} className="px-3 py-3">
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow><TableCell colSpan={colSpanTotal} className="text-center py-8 text-destructive text-[13px]">Error al cargar préstamos</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={colSpanTotal} className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron préstamos</TableCell></TableRow>
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
                {visibleColumns.map((col) => (
                  <TableCell key={col.key} className={cn("px-3", col.className)}>
                    {col.render(p, { setLightboxPhoto })}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

        </TabsContent>
      </Tabs>
      {lightboxPhoto && (
        <PhotoLightbox open={!!lightboxPhoto} onOpenChange={(o) => !o && setLightboxPhoto(null)} src={lightboxPhoto.src} alt={lightboxPhoto.alt} />
      )}
    </div>
  );
}
