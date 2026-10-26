import React, { useState, useMemo, useEffect, type ComponentProps } from "react";
import { usePersistedString, usePersistedSet, usePersistedDate } from "@/hooks/usePersistedFilters";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabaseQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
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
import { usePersistedGroupBy } from "@/hooks/usePersistedGroupBy";
import { format } from "date-fns";
import { cn, $$, fmtDate, parseLocalDate, errorMessage } from "@/lib/utils";
import { useCajasOptions, useRutasOptions } from "@/hooks/usePrestamos";
import { AnularPagoModal } from "@/components/AnularPagoModal";
import { EditPagoModal } from "@/components/EditPagoModal";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { WhatsAppPreviewModal } from "@/components/WhatsAppPreviewModal";
import { generarReciboPagos } from "@/lib/pdfDocuments";
import { sendReceiptAsImage } from "@/lib/whatsappReceipt";
import { toast } from "sonner";
import { useCan } from "@/hooks/usePermisos";

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
// Paginación, filtros, orden y totales en el servidor (rpc pagos_listado).
const PAGE_SIZE = 100;

interface PagosFiltros {
  search: string | null;
  metodos: string[];
  cajas: string[];
  rutas: string[];
  desde: string | null;
  hasta: string | null;
  sort_key: string | null;
  sort_dir: "asc" | "desc" | null;
}

type PagosNum = number | string | null;
interface PagosListadoRpc {
  total: PagosNum;
  total_validos?: PagosNum;
  sum_monto: PagosNum;
  sum_mora: PagosNum;
  sum_interes: PagosNum;
  sum_capital: PagosNum;
  empresa: { nombre: string | null; telefono: string | null; direccion: string | null; logo_url: string | null } | null;
  rows: {
    id: string; prestamo_id: string; created_at: string | null; anulado: boolean | null; cuota_id: string | null;
    caja_id: string | null; cobrador_id: string | null; fecha_pago: string | null; monto_recibido: PagosNum;
    aplicado_mora: PagosNum; aplicado_interes: PagosNum; aplicado_capital: PagosNum; metodo: string; cliente: string;
    cliente_telefono: string | null; short_id: string; caja: string; ruta: string; num_cuotas: PagosNum;
  }[];
}

function usePagosListado(empresaId: string, filtros: PagosFiltros, page: number, todos: boolean) {
  return useQuery({
    queryKey: ["pagos-all", empresaId, filtros, todos ? "todos" : page],
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await rpc<PagosListadoRpc>("pagos_listado", {
        p_filtros: filtros,
        p_limit: todos ? null : PAGE_SIZE,
        p_offset: todos ? 0 : page * PAGE_SIZE,
      });
      if (error) throw error;
      const empresa = data?.empresa;
      const rows: PagoListItem[] = (data?.rows || []).map((p) => ({
        id: p.id,
        cliente: p.cliente,
        clientePhone: p.cliente_telefono || null,
        prestamoId: p.prestamo_id,
        shortId: p.short_id,
        fecha: p.created_at || "",
        montoRecibido: Number(p.monto_recibido || 0),
        aplicadoMora: Number(p.aplicado_mora || 0),
        aplicadoInteres: Number(p.aplicado_interes || 0),
        aplicadoCapital: Number(p.aplicado_capital || 0),
        metodo: p.metodo,
        caja: p.caja,
        cajaId: p.caja_id || null,
        ruta: p.ruta,
        anulado: p.anulado || false,
        cuotaId: p.cuota_id || null,
        cobradorId: p.cobrador_id || null,
        fechaPago: p.fecha_pago || null,
        numCuotas: Number(p.num_cuotas || 0),
        empresaNombre: empresa?.nombre || "Empresa",
        empresaTelefono: empresa?.telefono || null,
        empresaDireccion: empresa?.direccion || null,
        empresaLogoUrl: empresa?.logo_url || null,
      }));
      return {
        rows,
        total: Number(data?.total || 0),
        totalValidos: Number(data?.total_validos ?? data?.total ?? 0),
        totales: {
          monto: Number(data?.sum_monto || 0),
          mora: Number(data?.sum_mora || 0),
          interes: Number(data?.sum_interes || 0),
          capital: Number(data?.sum_capital || 0),
        },
      };
    },
  });
}

// ── Multi-filter dropdown ─────────────────────────────────────────
function MultiFilterDropdown({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: Set<string>; onChange: (s: Set<string>) => void;
}) {
  const [search, setSearch] = React.useState("");
  const count = selected.size;
  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };
  const filtered = search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

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
      <PopoverContent className="w-56 p-0 overflow-hidden" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 && (
            <p className="py-3 text-center text-sm text-muted-foreground">Sin resultados</p>
          )}
          {filtered.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-[13px]">
              <Checkbox checked={selected.has(opt)} onCheckedChange={() => toggle(opt)} />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
        {count > 0 && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => onChange(new Set())}>
              Limpiar
            </Button>
          </div>
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
  const canAnularPago = useCan("pagos", "anular_pago");
  const canEditarPago = useCan("pagos", "editar");
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();
  const { data: cajasRaw = [] } = useCajasOptions(empresaId);
  const { data: rutasRaw = [] } = useRutasOptions(empresaId);

  const cajasOpts = cajasRaw.map((c) => c.nombre);
  const rutasOpts = rutasRaw.map((r) => r.nombre);

  const [search, setSearch] = usePersistedString("pagos", "search");
  const [selMetodo, setSelMetodo] = usePersistedSet("pagos", "selMetodo");
  const [selCaja, setSelCaja] = usePersistedSet("pagos", "selCaja");
  const [selRuta, setSelRuta] = usePersistedSet("pagos", "selRuta");
  const [regDesde, setRegDesde] = usePersistedDate("pagos", "regDesde");
  const [regHasta, setRegHasta] = usePersistedDate("pagos", "regHasta");

  const [sortKeyRaw, setSortKey] = usePersistedString("pagos", "sortKey");
  const [sortDirRaw, setSortDir] = usePersistedString("pagos", "sortDir");
  const sortKey = (sortKeyRaw || null) as SortKey | null;
  const sortDir = (sortDirRaw || null) as "asc" | "desc" | null;

  // Grouping
  const [groupBy, setGroupBy] = usePersistedGroupBy("pagos");
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
  const [anularPago, setAnularPago] = useState<ComponentProps<typeof AnularPagoModal>["pago"]>(null);
  const [editPago, setEditPago] = useState<ComponentProps<typeof EditPagoModal>["pago"]>(null);
  const [docPreview, setDocPreview] = useState<{ open: boolean; pago: PagoListItem | null }>({ open: false, pago: null });
  const [waPreview, setWaPreview] = useState<{ open: boolean; pago: PagoListItem | null }>({ open: false, pago: null });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(""); setSortDir(""); }
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
    setRegDesde(undefined); setRegHasta(undefined); setSortKey(""); setSortDir("");
  };

  const debouncedSearch = useDebouncedValue(search, 300);
  const filtros = useMemo<PagosFiltros>(() => ({
    search: debouncedSearch || null,
    metodos: [...selMetodo],
    cajas: [...selCaja],
    rutas: [...selRuta],
    // Días de negocio (México) inclusivos: el servidor filtra [desde 00:00, hasta + 1 día).
    desde: regDesde ? format(regDesde, "yyyy-MM-dd") : null,
    hasta: regHasta ? format(regHasta, "yyyy-MM-dd") : null,
    sort_key: sortKey && sortDir ? sortKey : null,
    sort_dir: sortKey && sortDir ? sortDir : null,
  }), [debouncedSearch, selMetodo, selCaja, selRuta, regDesde, regHasta, sortKey, sortDir]);
  const [page, setPage] = useState(0);
  const filtrosKey = JSON.stringify(filtros);
  useEffect(() => { setPage(0); }, [filtrosKey]);

  // Con agrupación se necesitan todas las filas filtradas; sin ella, una página de PAGE_SIZE.
  const { data: listado, isLoading, isError } = usePagosListado(empresaId, filtros, page, !!groupBy);
  const filtered = useMemo(() => listado?.rows ?? [], [listado]);
  const totalFiltrados = listado?.total ?? 0;
  const totalValidos = listado?.totalValidos ?? 0;
  const totales = useMemo(() => listado?.totales ?? { monto: 0, mora: 0, interes: 0, capital: 0 }, [listado]);
  const pageFrom = totalFiltrados === 0 ? 0 : groupBy ? 1 : page * PAGE_SIZE + 1;
  const pageTo = groupBy ? totalFiltrados : Math.min((page + 1) * PAGE_SIZE, totalFiltrados);

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
        const d = p.fecha ? parseLocalDate(p.fecha) : null;
        key = d ? `${monthNames[d.getMonth()]} ${d.getFullYear()}` : "Sin fecha";
      } else key = "—";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupBy]);

  const kpis = useMemo(() => {
    return [
      { label: "Total Pagos", value: String(totalValidos), icon: Hash, accent: "text-primary" },
      { label: "Total Recaudado", value: $$(totales.monto), icon: DollarSign, accent: "text-success" },
      { label: "Aplicado a Capital", value: $$(totales.capital), icon: TrendingUp, accent: "text-[hsl(217,91%,60%)]" },
      { label: "Aplicado a Mora", value: $$(totales.mora), icon: HandCoins, accent: "text-destructive" },
    ];
  }, [totalValidos, totales]);

  // ── Action handlers ──────────────────────────────────────────────
  const buildReceiptCaption = (p: PagoListItem) =>
    `✅ *Comprobante de pago recibido*\n\n👤 *${p.cliente}*\n💰 Monto: *${$$(p.montoRecibido)}*\n📋 Préstamo: ${p.shortId}\n\n🙏 ¡Gracias por tu pago! Tu compromiso es muy importante para nosotros.`;

  const handleWhatsApp = (p: PagoListItem) => {
    if (!p.clientePhone) { toast.error("Cliente sin teléfono registrado"); return; }
    setWaPreview({ open: true, pago: p });
  };

  const sendWhatsAppReceipt = async (p: PagoListItem, caption: string) => {
    const t = toast.loading("Enviando recibo por WhatsApp…");
    try {
      // Fetch current saldo for this prestamo
      const { data: cuotasData } = await supabase
        .from("amortizacion")
        .select("saldo_total, num_cuota, fecha_vencimiento, status")
        .eq("prestamo_id", p.prestamoId)
        .order("num_cuota");
      
      const saldoRestante = (cuotasData || []).reduce((s: number, c) => s + Number(c.saldo_total || 0), 0);
      const nextUnpaid = (cuotasData || []).find((c) => c.status !== "Pagada");

      const result = await sendReceiptAsImage(
        empresaId,
        p.clientePhone!,
        {
          pago: {
            folio: p.shortId,
            monto_recibido: p.montoRecibido,
            aplicado_mora: p.aplicadoMora,
            aplicado_interes: p.aplicadoInteres,
            aplicado_capital: p.aplicadoCapital,
            metodo_pago: p.metodo,
            saldo_restante: saldoRestante,
            cuota_num: undefined,
            proxima_cuota: nextUnpaid?.fecha_vencimiento || undefined,
            monto_proxima: nextUnpaid ? Number(nextUnpaid.saldo_total || 0) : undefined,
            fecha: p.fechaPago || undefined,
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
        caption,
      );
      toast.dismiss(t);
      if (result.success) toast.success("Recibo enviado por WhatsApp");
      else toast.error("No se pudo enviar el recibo por WhatsApp. Intenta de nuevo.");
    } catch (e) {
      toast.dismiss(t);
      toast.error(errorMessage(e) || "Error al enviar");
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
        <DropdownMenuItem onClick={() => handleEdit(p)} disabled={p.anulado || !canEditarPago}>
          <Pencil className="h-3.5 w-3.5 mr-2" />
          Editar pago
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAnular(p)} disabled={p.anulado || !canAnularPago} className="text-destructive focus:text-destructive">
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
            <p className="kpi-num text-lg font-semibold mt-1">{isLoading ? "—" : k.value}</p>
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
        <p className="text-[12px] text-muted-foreground">{totalFiltrados} pago{totalFiltrados !== 1 ? "s" : ""}</p>
        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <span>{pageFrom}-{pageTo} / {totalFiltrados}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!!groupBy || page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!!groupBy || pageTo >= totalFiltrados} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* MOBILE Cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron pagos</p>
        ) : filtered.map((p) => (
          <div
            key={p.id}
            className={cn(
              "bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)] overflow-hidden",
              p.anulado && "opacity-60"
            )}
          >
            {/* Card header */}
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-border/50">
              <div className="min-w-0">
                <p className={cn("font-semibold text-[13px] truncate", p.anulado && "line-through")}>{p.cliente}</p>
                <p className="text-[11px] text-muted-foreground">{p.shortId} · {p.fecha ? fmtDate(p.fecha, "dd/MM/yyyy HH:mm") : "—"}</p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={cn("font-bold text-[15px]", p.anulado ? "line-through text-muted-foreground" : "text-foreground")}>{$$(p.montoRecibido)}</p>
                {p.anulado && <span className="text-[10px] font-semibold text-destructive uppercase">Anulado</span>}
              </div>
            </div>

            {/* Card body — breakdown */}
            <div className="px-3 py-2 grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
              <div>
                <span className="text-muted-foreground">Capital</span>
                <p className={cn("font-medium", p.aplicadoCapital === 0 && "text-muted-foreground/50")}>{$$(p.aplicadoCapital)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Interés</span>
                <p className={cn("font-medium", p.aplicadoInteres === 0 && "text-muted-foreground/50")}>{$$(p.aplicadoInteres)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Mora</span>
                <p className={cn("font-medium", p.aplicadoMora > 0 ? "text-destructive" : "text-muted-foreground/50")}>{$$(p.aplicadoMora)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Método</span>
                <p><MetodoDot metodo={p.metodo} /></p>
              </div>
              <div>
                <span className="text-muted-foreground">Caja</span>
                <p className="font-medium truncate">{p.caja}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Ruta</span>
                <p className="font-medium truncate">{p.ruta}</p>
              </div>
            </div>

            {/* Card actions */}
            <div className="px-3 py-2 border-t border-border/50 flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 flex-1"
                onClick={() => handleWhatsApp(p)}
                disabled={p.anulado}
              >
                <MessageCircle className="h-3 w-3 text-[hsl(142,72%,37%)]" />
                WhatsApp
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 flex-1"
                onClick={() => handleDownloadTicket(p)}
              >
                <Download className="h-3 w-3" />
                Ticket
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={() => handleEdit(p)}
                disabled={p.anulado || !canEditarPago}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 text-destructive hover:text-destructive"
                onClick={() => handleAnular(p)}
                disabled={p.anulado || !canAnularPago}
              >
                <XCircle className="h-3 w-3" />
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
                  const validos = items.filter((p) => !p.anulado);
                  const sumRecibido = validos.reduce((s, p) => s + p.montoRecibido, 0);
                  const sumMora = validos.reduce((s, p) => s + p.aplicadoMora, 0);
                  const sumInteres = validos.reduce((s, p) => s + p.aplicadoInteres, 0);
                  const sumCapital = validos.reduce((s, p) => s + p.aplicadoCapital, 0);
                  return (
                    <React.Fragment key={groupName}>
                      <TableRow
                        className="bg-muted/60 hover:bg-muted/80 cursor-pointer border-b border-border"
                        onClick={() => toggleGroup(groupName)}
                      >
                        <TableCell className="px-3 py-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        {/* Group name */}
                        <TableCell className="px-3 py-2">
                          <span className="font-bold text-[13px]">{groupName}</span>
                          <span className="ml-2 text-[11px] text-muted-foreground font-medium">({items.length})</span>
                        </TableCell>
                        {/* Fecha - empty */}
                        <TableCell className="px-3 py-2" />
                        {/* Recibido */}
                        <TableCell className="text-right px-3 py-2"><span className="font-semibold text-[12px]">{$$(sumRecibido)}</span></TableCell>
                        {/* Mora */}
                        <TableCell className="text-right px-3 py-2"><span className={cn("font-semibold text-[12px]", sumMora > 0 && "text-destructive")}>{$$(sumMora)}</span></TableCell>
                        {/* Interés */}
                        <TableCell className="text-right px-3 py-2"><span className="font-semibold text-[12px]">{$$(sumInteres)}</span></TableCell>
                        {/* Capital */}
                        <TableCell className="text-right px-3 py-2"><span className="font-semibold text-[12px]">{$$(sumCapital)}</span></TableCell>
                        {/* Remaining cols empty */}
                        <TableCell colSpan={4} className="px-3 py-2" />
                      </TableRow>
                      {isExpanded && items.map(renderRow)}
                    </React.Fragment>
                  );
                })}
                {/* Totals row */}
                <TableRow className="bg-muted/40 border-t-2 border-border font-bold">
                  <TableCell className="px-3 text-[11px] uppercase text-muted-foreground font-bold" colSpan={3}>Totales</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(totales.monto)}</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(totales.mora)}</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(totales.interes)}</TableCell>
                  <TableCell className="text-right px-3 text-[12px]">{$$(totales.capital)}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </>
            ) : (
              <>
                {filtered.map(renderRow)}
                {filtered.length > 0 && (
                  <TableRow className="bg-muted/40 border-t-2 border-border font-bold">
                    <TableCell className="px-3 text-[11px] uppercase text-muted-foreground font-bold" colSpan={3}>Totales</TableCell>
                    <TableCell className="text-right px-3 text-[12px]">{$$(totales.monto)}</TableCell>
                    <TableCell className="text-right px-3 text-[12px]">{$$(totales.mora)}</TableCell>
                    <TableCell className="text-right px-3 text-[12px]">{$$(totales.interes)}</TableCell>
                    <TableCell className="text-right px-3 text-[12px]">{$$(totales.capital)}</TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                )}
              </>
            )}
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
          fileName={`ticket-${docPreview.pago.shortId}.pdf`}
          generateDoc={() =>
            generarReciboPagos(
              {
                id: docPreview.pago!.prestamoId,
                clienteNombre: docPreview.pago!.cliente,
                clienteDni: "",
                clienteDireccion: "",
                clienteTelefono: docPreview.pago!.clientePhone || "",
                empresa: docPreview.pago!.empresaNombre,
                modalidad: "",
                montoSolicitado: 0,
                montoTotalPagar: 0,
                numCuotas: docPreview.pago!.numCuotas,
                frecuencia: "Diario",
                tasaInteres: 0,
                cuotaCalculada: 0,
                cuotaRedondeada: 0,
                gastosLegales: 0,
                tipoMora: "",
                valorMora: 0,
                estado: "Activo",
                fechaRegistro: "",
                fechaPrimerPago: "",
                caja: docPreview.pago!.caja,
                ruta: docPreview.pago!.ruta,
                notas: "",
                empresaNombre: docPreview.pago!.empresaNombre,
                logoUrl: docPreview.pago!.empresaLogoUrl,
              },
              [{
                created_at: docPreview.pago!.fechaPago || docPreview.pago!.fecha,
                monto_recibido: docPreview.pago!.montoRecibido,
                aplicado_mora: docPreview.pago!.aplicadoMora,
                aplicado_interes: docPreview.pago!.aplicadoInteres,
                aplicado_capital: docPreview.pago!.aplicadoCapital,
                metodo_pago: docPreview.pago!.metodo,
                cajaNombre: docPreview.pago!.caja,
              }]
            )
          }
          empresaId={empresaId}
          clientePhone={docPreview.pago.clientePhone || undefined}
          clienteName={docPreview.pago.cliente}
          onWhatsApp={async (phone: string) => {
            const p = docPreview.pago!;
            const caption = buildReceiptCaption(p);

            // Fetch current saldo
            const { data: cuotasData } = await supabase
              .from("amortizacion")
              .select("saldo_total, num_cuota, fecha_vencimiento, status")
              .eq("prestamo_id", p.prestamoId)
              .order("num_cuota");
            const saldoRestante = (cuotasData || []).reduce((s: number, c) => s + Number(c.saldo_total || 0), 0);
            const nextUnpaid = (cuotasData || []).find((c) => c.status !== "Pagada");

            const result = await sendReceiptAsImage(
              empresaId,
              phone,
              {
                pago: {
                  folio: p.shortId,
                  monto_recibido: p.montoRecibido,
                  aplicado_mora: p.aplicadoMora,
                  aplicado_interes: p.aplicadoInteres,
                  aplicado_capital: p.aplicadoCapital,
                  metodo_pago: p.metodo,
                  saldo_restante: saldoRestante,
                  proxima_cuota: nextUnpaid?.fecha_vencimiento || undefined,
                  monto_proxima: nextUnpaid ? Number(nextUnpaid.saldo_total || 0) : undefined,
                  fecha: p.fechaPago || undefined,
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
              caption,
            );
            if (result.success) toast.success("Recibo enviado por WhatsApp");
            else toast.error("No se pudo enviar el recibo por WhatsApp. Intenta de nuevo.");
          }}
        />
      )}

      {/* WhatsApp Preview Modal */}
      {waPreview.pago && (
        <WhatsAppPreviewModal
          open={waPreview.open}
          onOpenChange={(open) => setWaPreview({ open, pago: open ? waPreview.pago : null })}
          phone={waPreview.pago.clientePhone || ""}
          message={buildReceiptCaption(waPreview.pago)}
          onSend={async (msg) => { await sendWhatsAppReceipt(waPreview.pago!, msg); }}
          clienteName={waPreview.pago.cliente}
        />
      )}
      </div>
  );
}
