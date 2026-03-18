import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight as ChevronRightIcon, X, CalendarIcon, SlidersHorizontal, ChevronLeft, ChevronRight, DollarSign, HandCoins, TrendingUp, Hash, MoreHorizontal, MessageCircle, Download, Pencil, XCircle } from "lucide-react";
import { GroupByDropdown } from "@/components/shared/GroupByDropdown";
import { format } from "date-fns";
import { cn, $$, fmtDate } from "@/lib/utils";
import { useCajasOptions, useRutasOptions } from "@/hooks/usePrestamos";
import { AnularPagoModal } from "@/components/AnularPagoModal";
import { EditPagoModal } from "@/components/EditPagoModal";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { generarReciboPagos } from "@/lib/pdfDocuments";
import { sendReceiptAsImage } from "@/lib/whatsappReceipt";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────
interface PagoListItem {
  id: string;
  cliente: string;
  clientePhone: string | null;
  prestamoId: string;
  shortId: string;
  fecha: string;
  montoRecibido: number;
  aplicadoMora: number;
  aplicadoInteres: number;
  aplicadoCapital: number;
  metodo: string;
  caja: string;
  cajaId: string | null;
  ruta: string;
  anulado: boolean;
  cuotaId: string | null;
  cobradorId: string | null;
  fechaPago: string | null;
  numCuotas: number;
  empresaNombre: string;
  empresaTelefono: string | null;
  empresaDireccion: string | null;
  empresaLogoUrl: string | null;
}

type SortKey = keyof PagoListItem;

// ── Data hook ─────────────────────────────────────────────────────
function usePagosAll(empresaId: string) {
  return useQuery({
    queryKey: ["pagos-all", empresaId],
    queryFn: async () => {
      const raw = await fetchAllRows<any>(
        supabase
          .from("pagos")
          .select(`
            id, monto_recibido, aplicado_mora, aplicado_interes, aplicado_capital,
            metodo_pago, created_at, prestamo_id, anulado, cuota_id, caja_id, cobrador_id, fecha_pago,
            cajas ( nombre ),
            prestamos!pagos_prestamo_id_fkey ( id, num_cuotas, clientes ( nombre_completo, telefono ), rutas ( nombre ), empresas ( nombre, telefono, direccion, logo_url ) )
          `)
          .eq("empresa_id", empresaId)
          .order("created_at", { ascending: false })
      );

      return (raw || []).map((p: any) => ({
        id: p.id,
        cliente: p.prestamos?.clientes?.nombre_completo || "—",
        clientePhone: p.prestamos?.clientes?.telefono || null,
        prestamoId: p.prestamo_id,
        shortId: `PRE-${(p.prestamo_id || "").slice(0, 8)}`,
        fecha: p.created_at || "",
        montoRecibido: Number(p.monto_recibido || 0),
        aplicadoMora: Number(p.aplicado_mora || 0),
        aplicadoInteres: Number(p.aplicado_interes || 0),
        aplicadoCapital: Number(p.aplicado_capital || 0),
        metodo: p.metodo_pago || "Efectivo",
        caja: (p.cajas as any)?.nombre || "—",
        cajaId: p.caja_id || null,
        ruta: p.prestamos?.rutas?.nombre || "—",
        anulado: p.anulado || false,
        cuotaId: p.cuota_id || null,
        cobradorId: p.cobrador_id || null,
        fechaPago: p.fecha_pago || null,
        numCuotas: p.prestamos?.num_cuotas || 0,
        empresaNombre: p.prestamos?.empresas?.nombre || "Empresa",
        empresaTelefono: p.prestamos?.empresas?.telefono || null,
        empresaDireccion: p.prestamos?.empresas?.direccion || null,
        empresaLogoUrl: p.prestamos?.empresas?.logo_url || null,
      })) as PagoListItem[];
    },
  });
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

const metodoOptions = ["Efectivo", "Transferencia", "Otro"];

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
  const queryClient = useQueryClient();
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

  // Grouping
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const groupByOptions = [
    { key: "anulado", label: "Estado del pago" },
    { key: "shortId", label: "Préstamo" },
    { key: "metodo", label: "Método de pago" },
    { key: "mesPago", label: "Mes de pago" },
  ];
  const toggleGroup = (g: string) => {
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  };
  const handleGroupByChange = (key: string | null) => {
    setGroupBy(key);
    setExpandedGroups(new Set());
  };

  // Modals
  const [anularPago, setAnularPago] = useState<any>(null);
  const [editPago, setEditPago] = useState<any>(null);
  const [docPreview, setDocPreview] = useState<{ open: boolean; pago: PagoListItem | null }>({ open: false, pago: null });

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

  // Grouped data computation
  const groupedData = useMemo(() => {
    if (!groupBy) return null;
    const groups: Record<string, typeof filtered> = {};
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    for (const p of filtered) {
      let key: string;
      if (groupBy === "anulado") key = p.anulado ? "Anulado" : "Válido";
      else if (groupBy === "shortId") key = `${p.shortId} — ${p.cliente}`;
      else if (groupBy === "metodo") key = p.metodo;
      else if (groupBy === "mesPago") {
        const d = p.fecha ? new Date(p.fecha) : null;
        key = d ? `${monthNames[d.getMonth()]} ${d.getFullYear()}` : "Sin fecha";
      } else key = "—";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupBy]);

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

  // ── Action handlers ──────────────────────────────────────────────
  const handleWhatsApp = async (p: PagoListItem) => {
    if (!p.clientePhone) { toast.error("Cliente sin teléfono registrado"); return; }
    const t = toast.loading("Enviando recibo por WhatsApp…");
    try {
      const result = await sendReceiptAsImage(
        empresaId,
        p.clientePhone,
        {
          pago: {
            folio: `PAG-${p.id.slice(0, 8)}`,
            monto_recibido: p.montoRecibido,
            aplicado_mora: p.aplicadoMora,
            aplicado_interes: p.aplicadoInteres,
            aplicado_capital: p.aplicadoCapital,
            metodo_pago: p.metodo,
            saldo_restante: 0,
          },
          empresa: {
            nombre: p.empresaNombre,
            telefono: p.empresaTelefono || undefined,
            direccion: p.empresaDireccion || undefined,
            logo_url: p.empresaLogoUrl,
          },
          cliente: { nombre: p.cliente },
          prestamo: { folio: p.shortId, num_cuotas: p.numCuotas },
        },
        `✅ *Comprobante de pago recibido*\n\n👤 *${p.cliente}*\n💰 Monto: *${$$(p.montoRecibido)}*\n📋 Préstamo: ${p.shortId}\n\n🙏 ¡Gracias por tu pago! Tu compromiso es muy importante para nosotros.`,
      );
      toast.dismiss(t);
      if (result.success) toast.success("Recibo enviado por WhatsApp");
      else toast.error("Error: " + (result.error || "desconocido"));
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(e.message || "Error al enviar");
    }
  };

  const handleDownloadTicket = (p: PagoListItem) => {
    setDocPreview({ open: true, pago: p });
  };

  const handleEdit = (p: PagoListItem) => {
    setEditPago({
      id: p.id,
      prestamo_id: p.prestamoId,
      cuota_id: p.cuotaId,
      monto_recibido: p.montoRecibido,
      aplicado_mora: p.aplicadoMora,
      aplicado_interes: p.aplicadoInteres,
      aplicado_capital: p.aplicadoCapital,
      metodo_pago: p.metodo,
      caja_id: p.cajaId,
      cobrador_id: p.cobradorId,
      fecha_pago: p.fechaPago,
    });
  };

  const handleAnular = (p: PagoListItem) => {
    setAnularPago({
      id: p.id,
      prestamo_id: p.prestamoId,
      cuota_id: p.cuotaId,
      monto_recibido: p.montoRecibido,
      aplicado_mora: p.aplicadoMora,
      aplicado_interes: p.aplicadoInteres,
      aplicado_capital: p.aplicadoCapital,
      caja_id: p.cajaId,
      cobrador_id: p.cobradorId,
    });
  };

  // ── Row actions dropdown ─────────────────────────────────────────
  const ActionsCell = ({ p }: { p: PagoListItem }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => handleWhatsApp(p)} disabled={p.anulado}>
          <MessageCircle className="h-3.5 w-3.5 mr-2 text-[hsl(142,72%,37%)]" />
          Enviar WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownloadTicket(p)}>
          <Download className="h-3.5 w-3.5 mr-2" />
          Descargar ticket
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleEdit(p)} disabled={p.anulado}>
          <Pencil className="h-3.5 w-3.5 mr-2" />
          Editar pago
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAnular(p)} disabled={p.anulado} className="text-destructive focus:text-destructive">
          <XCircle className="h-3.5 w-3.5 mr-2" />
          Anular pago
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ── Row render helper ────────────────────────────────────────────
  const renderRow = (p: PagoListItem) => (
    <TableRow
      key={p.id}
      className={cn("border-b border-border/50 transition-colors hover:bg-table-hover", p.anulado && "opacity-50")}
    >
      <TableCell className="text-[12px] text-muted-foreground px-3 whitespace-nowrap">{p.fecha ? fmtDate(p.fecha, "dd/MM/yyyy HH:mm") : "—"}</TableCell>
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
      <TableCell className="px-2">
        <ActionsCell p={p} />
      </TableCell>
    </TableRow>
  );

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
        <GroupByDropdown options={groupByOptions} value={groupBy} onChange={handleGroupByChange} />
        <div className="w-px h-5 bg-border" />
        <MultiFilterDropdown label="Método" options={metodoOptions} selected={selMetodo} onChange={setSelMetodo} />
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
              <TableHead className="w-10 px-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11} className="px-3 py-3">
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-destructive text-[13px]">Error al cargar pagos</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron pagos</TableCell></TableRow>
            ) : groupedData ? (
              <>
                {groupedData.map(([groupName, items]) => {
                  const isExpanded = expandedGroups.has(groupName);
                  const sumRecibido = items.reduce((s, p) => s + p.montoRecibido, 0);
                  const sumMora = items.reduce((s, p) => s + p.aplicadoMora, 0);
                  const sumInteres = items.reduce((s, p) => s + p.aplicadoInteres, 0);
                  const sumCapital = items.reduce((s, p) => s + p.aplicadoCapital, 0);
                  return (
                    <React.Fragment key={groupName}>
                      <TableRow
                        className="bg-muted/60 hover:bg-muted/80 cursor-pointer border-b border-border"
                        onClick={() => toggleGroup(groupName)}
                      >
                        <TableCell className="px-3 py-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell colSpan={2} className="px-3 py-2">
                          <span className="font-bold text-[13px]">{groupName}</span>
                          <span className="ml-2 text-[11px] text-muted-foreground font-medium">({items.length})</span>
                        </TableCell>
                        <TableCell className="text-right px-3 py-2"><span className="font-semibold text-[12px]">{$$(sumRecibido)}</span></TableCell>
                        <TableCell className="text-right px-3 py-2"><span className={cn("font-semibold text-[12px]", sumMora > 0 && "text-destructive")}>{$$(sumMora)}</span></TableCell>
                        <TableCell className="text-right px-3 py-2"><span className="font-semibold text-[12px]">{$$(sumInteres)}</span></TableCell>
                        <TableCell className="text-right px-3 py-2"><span className="font-semibold text-[12px]">{$$(sumCapital)}</span></TableCell>
                        <TableCell colSpan={4} />
                      </TableRow>
                      {isExpanded && items.map(renderRow)}
                    </React.Fragment>
                  );
                })}
                {/* Totals row */}
                <TableRow className="bg-muted/40 border-t-2 border-border font-bold">
                  <TableCell className="px-3 text-[11px] uppercase text-muted-foreground font-bold" colSpan={3}>Totales</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(filtered.reduce((s, p) => s + p.montoRecibido, 0))}</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(filtered.reduce((s, p) => s + p.aplicadoMora, 0))}</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(filtered.reduce((s, p) => s + p.aplicadoInteres, 0))}</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(filtered.reduce((s, p) => s + p.aplicadoCapital, 0))}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </>
            ) : filtered.map(renderRow)}
          </TableBody>
        </Table>
      </div>

      {/* Modals */}
      <AnularPagoModal
        open={!!anularPago}
        onOpenChange={(v) => !v && setAnularPago(null)}
        pago={anularPago}
      />
      <EditPagoModal
        open={!!editPago}
        onOpenChange={(v) => !v && setEditPago(null)}
        pago={editPago}
        cajas={cajasRaw}
      />
      {docPreview.pago && (
        <DocumentPreviewModal
          open={docPreview.open}
          onOpenChange={(v) => setDocPreview({ open: v, pago: v ? docPreview.pago : null })}
          title="Ticket de Pago"
          fileName={`ticket-PAG-${docPreview.pago.id.slice(0, 8)}.pdf`}
          generateDoc={() =>
            generarReciboPagos(
              {
                id: docPreview.pago!.prestamoId,
                id_prestamo: docPreview.pago!.shortId,
                cliente_nombre: docPreview.pago!.cliente,
                monto_solicitado: 0,
                num_cuotas: docPreview.pago!.numCuotas,
                frecuencia: "Diario",
                tasa_interes: 0,
                fecha_registro: "",
                estado: "Activo",
                cobrador_nombre: "",
              },
              [{
                id: docPreview.pago!.id,
                fecha_pago: docPreview.pago!.fechaPago || docPreview.pago!.fecha,
                monto_recibido: docPreview.pago!.montoRecibido,
                aplicado_mora: docPreview.pago!.aplicadoMora,
                aplicado_interes: docPreview.pago!.aplicadoInteres,
                aplicado_capital: docPreview.pago!.aplicadoCapital,
                metodo_pago: docPreview.pago!.metodo,
                anulado: docPreview.pago!.anulado,
              }]
            )
          }
          empresaId={empresaId}
          clientePhone={docPreview.pago.clientePhone || undefined}
          onWhatsApp={async (phone: string) => {
            const p = docPreview.pago!;
            const result = await sendReceiptAsImage(
              empresaId,
              phone,
              {
                pago: {
                  folio: `PAG-${p.id.slice(0, 8)}`,
                  monto_recibido: p.montoRecibido,
                  aplicado_mora: p.aplicadoMora,
                  aplicado_interes: p.aplicadoInteres,
                  aplicado_capital: p.aplicadoCapital,
                  metodo_pago: p.metodo,
                  saldo_restante: 0,
                },
                empresa: {
                  nombre: p.empresaNombre,
                  telefono: p.empresaTelefono || undefined,
                  direccion: p.empresaDireccion || undefined,
                  logo_url: p.empresaLogoUrl,
                },
                cliente: { nombre: p.cliente },
                prestamo: { folio: p.shortId, num_cuotas: p.numCuotas },
              },
              `✅ *Comprobante de pago recibido*\n\n👤 *${p.cliente}*\n💰 Monto: *${$$(p.montoRecibido)}*\n📋 Préstamo: ${p.shortId}\n\n🙏 ¡Gracias por tu pago!`,
            );
            if (result.success) toast.success("Recibo enviado por WhatsApp");
            else toast.error("Error: " + (result.error || "desconocido"));
          }}
        />
      )}
    </div>
  );
}
