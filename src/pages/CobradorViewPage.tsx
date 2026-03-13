import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useNavigate } from "react-router-dom";
import { format, parseISO, startOfDay, endOfDay, isToday, addDays, subDays, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$ } from "@/lib/utils";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PagoModal } from "@/components/PagoModal";
import { VisitaModal } from "@/components/VisitaModal";
import { PromesaModal } from "@/components/PromesaModal";
import {
  CalendarIcon, Search, CheckCircle2, Clock, AlertTriangle,
  HandCoins, ChevronLeft, ChevronRight, DollarSign, TrendingUp,
  Eye, Phone, MapPin, Filter, X, Receipt, History, MessageSquare, CalendarCheck,
} from "lucide-react";



// ── Types ───────────────────────────────────────────────────────
interface CuotaCobrador {
  cuotaId: string;
  prestamoId: string;
  clienteNombre: string;
  clienteId: string;
  clienteTelefono: string | null;
  clienteDireccion: string | null;
  numCuota: number;
  totalCuotas: number;
  capitalInteres: number;
  saldoTotal: number;
  saldoMora: number;
  saldoCapital: number;
  saldoInteres: number;
  moraPagada: number;
  interesPagado: number;
  capitalPagado: number;
  fechaVencimiento: string;
  status: string;
  diasAtraso: number;
  ruta: string;
  rutaId: string | null;
  cobradorId: string | null;
  cajaId: string | null;
  pagada: boolean;
  montoPagado: number;
}

interface PagoHistorial {
  id: string;
  prestamoId: string;
  clienteNombre: string;
  montoRecibido: number;
  aplicadoCapital: number;
  aplicadoInteres: number;
  aplicadoMora: number;
  metodoPago: string;
  fechaPago: string;
  anulado: boolean;
  numCuota: number | null;
}

// ── Hooks ───────────────────────────────────────────────────────
function useCobranzaRango(fechaDesde: string, fechaHasta: string, empresaId: string, cobradorId: string | null) {
  return useQuery({
    queryKey: ["cobrador-cobranza", fechaDesde, fechaHasta, empresaId, cobradorId],
    enabled: !!cobradorId,
    queryFn: async () => {
      // Get cuotas in date range + overdue (before range, not paid)
      const { data: cuotas, error } = await supabase
        .from("amortizacion")
        .select(`
          id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
          saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
          fecha_vencimiento, status, dias_atraso, fecha_pagada
        `)
        .eq("empresa_id", empresaId)
        .or(`and(fecha_vencimiento.gte.${fechaDesde},fecha_vencimiento.lte.${fechaHasta}),and(fecha_vencimiento.lt.${fechaDesde},status.neq.Pagada)`)
        .order("fecha_vencimiento", { ascending: true });

      if (error) throw error;
      if (!cuotas?.length) return [];

      const prestamoIds = [...new Set(cuotas.map((c) => c.prestamo_id))];

      // Filter by cobrador at prestamo level
      let presQuery = supabase
        .from("prestamos")
        .select(`
          id, num_cuotas, cliente_id, ruta_id, cobrador_id, caja_id,
          clientes ( nombre_completo, telefono, direccion ),
          rutas ( nombre )
        `)
        .in("id", prestamoIds);

      if (cobradorId) {
        presQuery = presQuery.eq("cobrador_id", cobradorId);
      }

      const { data: prestamos } = await presQuery;
      const presMap: Record<string, any> = {};
      for (const p of prestamos || []) presMap[p.id] = p;

      // Payments for these cuotas
      const cuotaIds = cuotas.map((c) => c.id);
      const { data: pagos } = await supabase
        .from("pagos")
        .select("cuota_id, monto_recibido")
        .in("cuota_id", cuotaIds)
        .eq("anulado", false);

      const pagosByCuota: Record<string, number> = {};
      for (const p of pagos || []) {
        if (!p.cuota_id) continue;
        pagosByCuota[p.cuota_id] = (pagosByCuota[p.cuota_id] || 0) + Number(p.monto_recibido);
      }

      return cuotas
        .filter((c) => presMap[c.prestamo_id]) // only cuotas belonging to this cobrador's prestamos
        .map((c): CuotaCobrador => {
          const pres = presMap[c.prestamo_id];
          const cliente = pres.clientes as any;
          const ruta = pres.rutas as any;
          return {
            cuotaId: c.id,
            prestamoId: c.prestamo_id,
            clienteNombre: cliente?.nombre_completo || "—",
            clienteId: pres.cliente_id || "",
            clienteTelefono: cliente?.telefono || null,
            clienteDireccion: cliente?.direccion || null,
            numCuota: c.num_cuota,
            totalCuotas: pres.num_cuotas || 0,
            capitalInteres: Number(c.capital_interes || 0),
            saldoTotal: Number(c.saldo_total || 0),
            saldoMora: Number(c.saldo_mora || 0),
            saldoCapital: Number(c.saldo_capital || 0),
            saldoInteres: Number(c.saldo_interes || 0),
            moraPagada: Number(c.mora_pagada || 0),
            interesPagado: Number(c.interes_pagado || 0),
            capitalPagado: Number(c.capital_pagado || 0),
            fechaVencimiento: c.fecha_vencimiento,
            status: c.status || "Pendiente",
            diasAtraso: Number(c.dias_atraso || 0),
            ruta: ruta?.nombre || "Sin ruta",
            rutaId: pres.ruta_id || null,
            cobradorId: pres.cobrador_id || null,
            cajaId: pres.caja_id || null,
            pagada: c.status === "Pagada",
            montoPagado: pagosByCuota[c.id] || 0,
          };
        });
    },
  });
}

function usePagosCobrador(fechaDesde: string, fechaHasta: string, empresaId: string, cobradorId: string | null) {
  return useQuery({
    queryKey: ["cobrador-pagos", fechaDesde, fechaHasta, empresaId, cobradorId],
    enabled: !!cobradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select(`
          id, prestamo_id, monto_recibido, aplicado_capital, aplicado_interes,
          aplicado_mora, metodo_pago, created_at, anulado, cuota_id,
          prestamos!inner ( cliente_id, clientes ( nombre_completo ) ),
          amortizacion:cuota_id ( num_cuota )
        `)
        .eq("empresa_id", empresaId)
        .eq("cobrador_id", cobradorId!)
        .gte("created_at", `${fechaDesde}T00:00:00`)
        .lte("created_at", `${fechaHasta}T23:59:59`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((p: any): PagoHistorial => ({
        id: p.id,
        prestamoId: p.prestamo_id,
        clienteNombre: p.prestamos?.clientes?.nombre_completo || "—",
        montoRecibido: Number(p.monto_recibido || 0),
        aplicadoCapital: Number(p.aplicado_capital || 0),
        aplicadoInteres: Number(p.aplicado_interes || 0),
        aplicadoMora: Number(p.aplicado_mora || 0),
        metodoPago: p.metodo_pago || "Efectivo",
        fechaPago: p.created_at || "",
        anulado: p.anulado || false,
        numCuota: (p.amortizacion as any)?.num_cuota || null,
      }));
    },
  });
}

function useCajasAll(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-all", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre").eq("empresa_id", empresaId).order("nombre");
      return data || [];
    },
  });
}

// ── Quick Date Range Presets ────────────────────────────────────
type RangePreset = "hoy" | "semana" | "custom";

// ── Status helpers ──────────────────────────────────────────────
function getStatusInfo(item: CuotaCobrador) {
  if (item.pagada) return { label: "Cobrada", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 };
  if (item.status === "Parcial") return { label: "Parcial", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Clock };
  if (item.diasAtraso > 0) return { label: `Vencida ${item.diasAtraso}d`, color: "bg-red-500/15 text-red-700 dark:text-red-400", icon: AlertTriangle };
  return { label: "Pendiente", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400", icon: Clock };
}

// ── Page Component ──────────────────────────────────────────────
export default function CobradorViewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { cobradorId, role } = useCurrentUserRole();

  // Effective cobrador id (admin can also use this page for testing)
  const effectiveCobradorId = cobradorId;

  // Date range state
  const today = new Date();
  const [rangePreset, setRangePreset] = useState<RangePreset>("hoy");
  const [fechaDesde, setFechaDesde] = useState(today);
  const [fechaHasta, setFechaHasta] = useState(today);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("cobranza");

  // Payment modal
  const [pagoOpen, setPagoOpen] = useState(false);
  const [pagoPrestamoId, setPagoPrestamoId] = useState("");
  const [pagoCuotas, setPagoCuotas] = useState<any[]>([]);
  const [pagoRutaId, setPagoRutaId] = useState<string | null>(null);
  const [pagoCobradorId, setPagoCobradorId] = useState<string | null>(null);
  const [pagoMontoInicial, setPagoMontoInicial] = useState<number | undefined>();

  // Visita + Promesa modals
  const [visitaOpen, setVisitaOpen] = useState(false);
  const [visitaItem, setVisitaItem] = useState<CuotaCobrador | null>(null);
  const [promesaOpen, setPromesaOpen] = useState(false);
  const [promesaItem, setPromesaItem] = useState<CuotaCobrador | null>(null);

  const fechaDesdeStr = format(fechaDesde, "yyyy-MM-dd");
  const fechaHastaStr = format(fechaHasta, "yyyy-MM-dd");

  const { data: cuotas, isLoading: loadingCuotas } = useCobranzaRango(fechaDesdeStr, fechaHastaStr, empresaId, effectiveCobradorId);
  const { data: pagos, isLoading: loadingPagos } = usePagosCobrador(fechaDesdeStr, fechaHastaStr, empresaId, effectiveCobradorId);
  const { data: cajas } = useCajasAll(empresaId);

  // Preset handlers
  const setHoy = useCallback(() => {
    setRangePreset("hoy");
    setFechaDesde(new Date());
    setFechaHasta(new Date());
  }, []);

  const setSemana = useCallback(() => {
    setRangePreset("semana");
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = endOfWeek(new Date(), { weekStartsOn: 1 });
    setFechaDesde(start);
    setFechaHasta(end);
  }, []);

  // Filter cuotas
  const filtered = useMemo(() => {
    if (!cuotas) return [];
    if (!search) return cuotas;
    const q = search.toLowerCase();
    return cuotas.filter((c) => c.clienteNombre.toLowerCase().includes(q));
  }, [cuotas, search]);

  // Split into pendientes and cobradas
  const pendientes = useMemo(() => filtered.filter((c) => !c.pagada), [filtered]);
  const cobradas = useMemo(() => filtered.filter((c) => c.pagada), [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const cobradasCount = cobradas.length;
    const pendientesCount = pendientes.length;
    const porCobrar = pendientes.reduce((s, c) => s + c.saldoTotal, 0);
    const cobrado = cobradas.reduce((s, c) => s + c.capitalInteres, 0);
    const mora = filtered.reduce((s, c) => s + c.saldoMora, 0);
    const pct = (porCobrar + cobrado) > 0 ? (cobrado / (porCobrar + cobrado)) * 100 : 0;
    return { total, cobradas: cobradasCount, pendientes: pendientesCount, porCobrar, cobrado, mora, pct };
  }, [filtered, pendientes, cobradas]);

  // Open PagoModal
  const openPago = useCallback(async (item: CuotaCobrador) => {
    const { data } = await supabase
      .from("amortizacion")
      .select("id, num_cuota, saldo_mora, saldo_interes, saldo_capital, saldo_total, mora_pagada, interes_pagado, capital_pagado, status, fecha_vencimiento")
      .eq("prestamo_id", item.prestamoId)
      .neq("status", "Pagada")
      .order("num_cuota");

    setPagoPrestamoId(item.prestamoId);
    setPagoCuotas((data || []).map((c: any) => ({
      id: c.id,
      num_cuota: c.num_cuota,
      saldo_mora: Number(c.saldo_mora || 0),
      saldo_interes: Number(c.saldo_interes || 0),
      saldo_capital: Number(c.saldo_capital || 0),
      saldo_total: Number(c.saldo_total || 0),
      mora_pagada: Number(c.mora_pagada || 0),
      interes_pagado: Number(c.interes_pagado || 0),
      capital_pagado: Number(c.capital_pagado || 0),
      status: c.status,
      fecha_vencimiento: c.fecha_vencimiento,
    })));
    setPagoRutaId(item.rutaId);
    setPagoCobradorId(item.cobradorId);
    setPagoMontoInicial(item.saldoTotal);
    setPagoOpen(true);
  }, []);

  const handlePagoClose = useCallback((open: boolean) => {
    setPagoOpen(open);
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["cobrador-cobranza"] });
      queryClient.invalidateQueries({ queryKey: ["cobrador-pagos"] });
    }
  }, [queryClient]);

  // Pagos filtered
  const filteredPagos = useMemo(() => {
    if (!pagos) return [];
    if (!search) return pagos;
    const q = search.toLowerCase();
    return pagos.filter((p) => p.clienteNombre.toLowerCase().includes(q));
  }, [pagos, search]);

  const totalPagosRecibidos = useMemo(() =>
    filteredPagos.filter((p) => !p.anulado).reduce((s, p) => s + p.montoRecibido, 0),
    [filteredPagos]
  );

  if (!effectiveCobradorId && role === "cobrador") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-3" />
            <p className="font-semibold">Sin cobrador asignado</p>
            <p className="text-sm text-muted-foreground mt-1">Tu usuario no tiene un cobrador vinculado. Contacta al administrador.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Mi Cobranza</h1>

        {/* Date range controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={rangePreset === "hoy" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={setHoy}
          >
            Hoy
          </Button>
          <Button
            variant={rangePreset === "semana" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={setSemana}
          >
            Esta semana
          </Button>

          {/* Custom range */}
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {format(fechaDesde, "dd/MM", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fechaDesde}
                  onSelect={(d) => { if (d) { setFechaDesde(d); setRangePreset("custom"); if (d > fechaHasta) setFechaHasta(d); } }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">—</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {format(fechaHasta, "dd/MM", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fechaHasta}
                  onSelect={(d) => { if (d) { setFechaHasta(d); setRangePreset("custom"); if (d < fechaDesde) setFechaDesde(d); } }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* ── KPI Cards (mobile: 2 cols) ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPICard label="Pendientes" value={kpis.pendientes.toString()} sub={$$(kpis.porCobrar)} icon={Clock} color="text-warning" />
        <KPICard label="Cobradas" value={kpis.cobradas.toString()} sub={$$(kpis.cobrado)} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
        <KPICard label="Mora" value={$$(kpis.mora)} icon={AlertTriangle} color="text-destructive" />
        <KPICard label="Eficiencia" value={`${kpis.pct.toFixed(0)}%`} icon={TrendingUp} color="text-primary" />
      </div>

      {/* ── Search ─────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-10">
          <TabsTrigger value="cobranza" className="text-xs sm:text-sm gap-1">
            <HandCoins className="h-3.5 w-3.5 hidden sm:inline" />
            Cobranza
            {kpis.pendientes > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-[10px] px-1">{kpis.pendientes}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial" className="text-xs sm:text-sm gap-1">
            <History className="h-3.5 w-3.5 hidden sm:inline" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="pagos" className="text-xs sm:text-sm gap-1">
            <Receipt className="h-3.5 w-3.5 hidden sm:inline" />
            Pagos
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Cobranza ─────────────────────────────────── */}
        <TabsContent value="cobranza" className="mt-3 space-y-2">
          {loadingCuotas ? (
            <LoadingCards />
          ) : pendientes.length === 0 ? (
            <EmptyCard icon={CheckCircle2} title="¡Todo cobrado!" subtitle="No hay cuotas pendientes para este periodo." />
          ) : (
            pendientes.map((item) => (
              <CuotaCard key={item.cuotaId} item={item} onCobrar={openPago} onNavigate={navigate} onVisita={(i) => { setVisitaItem(i); setVisitaOpen(true); }} onPromesa={(i) => { setPromesaItem(i); setPromesaOpen(true); }} />
            ))
          )}

          {/* Already collected section */}
          {cobradas.length > 0 && (
            <div className="pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Ya cobradas ({cobradas.length})
              </p>
              {cobradas.map((item) => (
                <CuotaCard key={item.cuotaId} item={item} onCobrar={openPago} onNavigate={navigate} onVisita={(i) => { setVisitaItem(i); setVisitaOpen(true); }} onPromesa={(i) => { setPromesaItem(i); setPromesaOpen(true); }} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Historial ─────────────────────────────────── */}
        <TabsContent value="historial" className="mt-3 space-y-2">
          {loadingCuotas ? (
            <LoadingCards />
          ) : filtered.length === 0 ? (
            <EmptyCard icon={History} title="Sin historial" subtitle="No hay cuotas en este rango de fechas." />
          ) : (
            filtered.map((item) => (
              <CuotaCard key={item.cuotaId} item={item} onCobrar={openPago} onNavigate={navigate} showDate />
            ))
          )}
        </TabsContent>

        {/* ── Tab: Pagos recibidos ───────────────────────────── */}
        <TabsContent value="pagos" className="mt-3 space-y-2">
          {/* Total bar */}
          <div className="bg-primary/10 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium">Total recaudado</span>
            <span className="text-lg font-bold text-primary">{$$(totalPagosRecibidos)}</span>
          </div>

          {loadingPagos ? (
            <LoadingCards />
          ) : filteredPagos.length === 0 ? (
            <EmptyCard icon={Receipt} title="Sin pagos" subtitle="No se han registrado pagos en este periodo." />
          ) : (
            filteredPagos.map((p) => (
              <PagoCard key={p.id} pago={p} onNavigate={navigate} />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* ── PagoModal ──────────────────────────────────────── */}
      {pagoOpen && (
        <PagoModal open={pagoOpen} onOpenChange={handlePagoClose} prestamoId={pagoPrestamoId}
          cuotasPendientes={pagoCuotas} cajas={cajas || []} rutaId={pagoRutaId}
          cobradorId={pagoCobradorId} montoInicial={pagoMontoInicial} />
      )}
      {visitaOpen && visitaItem && (
        <VisitaModal open={visitaOpen}
          onOpenChange={(o) => { setVisitaOpen(o); if (!o) queryClient.invalidateQueries({ queryKey: ["cobrador-cobranza"] }); }}
          prestamoId={visitaItem.prestamoId} clienteId={visitaItem.clienteId}
          clienteNombre={visitaItem.clienteNombre} cuotaId={visitaItem.cuotaId}
          cuotaNum={visitaItem.numCuota} saldoTotal={visitaItem.saldoTotal} />
      )}
      {promesaOpen && promesaItem && (
        <PromesaModal open={promesaOpen}
          onOpenChange={(o) => { setPromesaOpen(o); if (!o) queryClient.invalidateQueries({ queryKey: ["cobrador-cobranza"] }); }}
          prestamoId={promesaItem.prestamoId} cuotaNum={promesaItem.numCuota}
          cuotaId={promesaItem.cuotaId} saldoTotal={promesaItem.saldoTotal}
          fechaVencimiento={promesaItem.fechaVencimiento} />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
          <Icon className={cn("h-3.5 w-3.5", color)} />
        </div>
        <p className={cn("text-lg font-bold leading-tight", color)}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function CuotaCard({ item, onCobrar, onNavigate, onVisita, onPromesa, showDate }: {
  item: CuotaCobrador;
  onCobrar: (item: CuotaCobrador) => void;
  onNavigate: (path: string) => void;
  onVisita?: (item: CuotaCobrador) => void;
  onPromesa?: (item: CuotaCobrador) => void;
  showDate?: boolean;
}) {
  const status = getStatusInfo(item);
  const isOverdue = item.diasAtraso > 0 && !item.pagada;

  return (
    <Card className={cn(
      "border-border/50 transition-colors",
      item.pagada && "opacity-70",
      isOverdue && "border-destructive/30 bg-destructive/5",
    )}>
      <CardContent className="p-3">
        {/* Row 1: Client + Status */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <button
              className="font-semibold text-sm truncate hover:text-primary hover:underline text-left block w-full"
              onClick={() => onNavigate(`/clientes/${item.clienteId}`)}
            >
              {item.clienteNombre}
            </button>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-muted-foreground">
                Cuota <span className="font-medium">#{item.numCuota}</span>/{item.totalCuotas}
              </span>
              <span className="text-[11px] text-muted-foreground">• {item.ruta}</span>
              {showDate && (
                <span className="text-[11px] text-muted-foreground">
                  • {format(parseISO(item.fechaVencimiento), "dd/MM")}
                </span>
              )}
            </div>
          </div>
          <Badge className={cn("text-[10px] shrink-0 h-5", status.color)}>
            {status.label}
          </Badge>
        </div>

        {/* Row 2: Amounts */}
        <div className="grid grid-cols-3 gap-2 text-center bg-secondary/50 rounded-md p-2 mb-2">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Cuota</p>
            <p className="text-xs font-semibold">{$$(item.capitalInteres)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mora</p>
            <p className={cn("text-xs font-semibold", item.saldoMora > 0 ? "text-destructive" : "text-muted-foreground")}>
              {item.saldoMora > 0 ? $$(item.saldoMora) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-xs font-bold">{$$(item.saldoTotal)}</p>
          </div>
        </div>

        {/* Row 3: Actions */}
        <div className="flex items-center gap-2">
          {!item.pagada ? (
            <>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs font-medium"
                onClick={() => onCobrar(item)}
              >
                <HandCoins className="h-3.5 w-3.5 mr-1.5" />
                Cobrar {$$(item.saldoTotal)}
              </Button>
              {item.clienteTelefono && (
                <>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => window.open(`tel:${item.clienteTelefono}`, "_blank")}>
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 text-green-600"
                    onClick={() => window.open(`https://wa.me/${item.clienteTelefono?.replace(/\D/g, "")}`, "_blank")}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {onVisita && (
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Registrar visita"
                  onClick={() => onVisita(item)}>
                  <MapPin className="h-3.5 w-3.5" />
                </Button>
              )}
              {onPromesa && item.status !== "Prometida" && (
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Promesa de pago"
                  onClick={() => onPromesa(item)}>
                  <CalendarCheck className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                onClick={() => onNavigate(`/prestamos/${item.prestamoId}`)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Cobrado {$$(item.montoPagado || item.capitalInteres)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onNavigate(`/prestamos/${item.prestamoId}`)}
              >
                <Eye className="h-3 w-3 mr-1" /> Ver
              </Button>
            </div>
          )}
        </div>

        {/* Client address if available */}
        {item.clienteDireccion && !item.pagada && (
          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border/50">
            <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-tight">{item.clienteDireccion}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PagoCard({ pago, onNavigate }: { pago: PagoHistorial; onNavigate: (path: string) => void }) {
  return (
    <Card className={cn("border-border/50", pago.anulado && "opacity-50")}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{pago.clienteNombre}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {pago.numCuota && <span className="text-[11px] text-muted-foreground">Cuota #{pago.numCuota}</span>}
              <span className="text-[11px] text-muted-foreground">{pago.metodoPago}</span>
              <span className="text-[11px] text-muted-foreground">
                {format(new Date(pago.fechaPago), "dd/MM HH:mm", { locale: es })}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={cn("text-sm font-bold", pago.anulado ? "text-muted-foreground line-through" : "text-emerald-600 dark:text-emerald-400")}>
              {$$(pago.montoRecibido)}
            </p>
            {pago.anulado && <Badge variant="destructive" className="text-[9px] mt-0.5">Anulado</Badge>}
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/30 text-center">
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Capital</p>
            <p className="text-[11px] font-medium">{$$(pago.aplicadoCapital)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Interés</p>
            <p className="text-[11px] font-medium">{$$(pago.aplicadoInteres)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Mora</p>
            <p className="text-[11px] font-medium">{$$(pago.aplicadoMora)}</p>
          </div>
        </div>

        <button
          className="text-[11px] text-primary hover:underline mt-2 block"
          onClick={() => onNavigate(`/prestamos/${pago.prestamoId}`)}
        >
          Ver préstamo →
        </button>
      </CardContent>
    </Card>
  );
}

function EmptyCard({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-8 text-center">
        <Icon className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  );
}
