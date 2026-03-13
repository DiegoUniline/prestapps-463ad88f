import { useState, useMemo } from "react";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, isToday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarIcon, Search, CheckCircle2, Clock, AlertTriangle,
  XCircle, ChevronLeft, ChevronRight, Users, DollarSign,
  TrendingUp, HandCoins, Eye, MapPin, CalendarCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PagoModal } from "@/components/PagoModal";
import { PromesaModal } from "@/components/PromesaModal";
import { VisitaModal } from "@/components/VisitaModal";

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Data Hook ────────────────────────────────────────────────────
interface CuotaDiaria {
  cuotaId: string;
  prestamoId: string;
  clienteNombre: string;
  clienteId: string;
  numCuota: number;
  totalCuotas: number;
  montoSolicitado: number;
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
  cobrador: string;
  cobradorId: string | null;
  caja: string;
  cajaId: string | null;
  pagada: boolean;
  montoPagado: number;
  fechaPago: string | null;
  gestiones: number;
  ultimaGestion: string | null;
}

function useCobranzaDiaria(fecha: string, empresaId: string) {
  return useQuery({
    queryKey: ["cobranza-diaria", fecha, empresaId],
    queryFn: async () => {
      // 1) Get cuotas: due today, overdue unpaid, OR paid on this date
      const { data: cuotas, error } = await supabase
        .from("amortizacion")
        .select(`
          id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
          saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
          fecha_vencimiento, status, dias_atraso, fecha_pagada
        `)
        .eq("empresa_id", empresaId)
        .or(`fecha_vencimiento.eq.${fecha},and(fecha_vencimiento.lt.${fecha},status.neq.Pagada),fecha_pagada.eq.${fecha}`)
        .order("fecha_vencimiento", { ascending: true });

      if (error) throw error;
      if (!cuotas || cuotas.length === 0) return [];

      // 1b) Also get cuotas with promesas for this date (status=Prometida)
      const { data: promesas } = await supabase
        .from("promesas_pago")
        .select("cuota_id")
        .eq("fecha_prometida", fecha)
        .eq("status", "Pendiente");

      const promesaCuotaIds = new Set((promesas || []).map((p: any) => p.cuota_id));

      // Merge: add any promised cuotas not already in the list
      let allCuotaIds = new Set(cuotas.map((c) => c.id));
      const missingPromesaIds = [...promesaCuotaIds].filter((id) => !allCuotaIds.has(id));

      let extraCuotas: any[] = [];
      if (missingPromesaIds.length > 0) {
        const { data: extra } = await supabase
          .from("amortizacion")
          .select(`
            id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
            saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
            fecha_vencimiento, status, dias_atraso, fecha_pagada
          `)
          .in("id", missingPromesaIds);
        extraCuotas = extra || [];
      }

      const allCuotas = [...cuotas, ...extraCuotas];

      // 2) Get prestamos info
      const prestamoIds = [...new Set(allCuotas.map((c) => c.prestamo_id))];
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select(`
          id, monto_solicitado, num_cuotas, cliente_id, ruta_id, cobrador_id, caja_id,
          clientes ( nombre_completo ),
          rutas ( nombre ),
          cajas ( nombre )
        `)
        .in("id", prestamoIds);

      // 3) Get cobradores names from profiles
      const cobIds = [...new Set((prestamos || []).map((p: any) => p.cobrador_id).filter(Boolean))];
      const cobMap: Record<string, string> = {};
      if (cobIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, nombre_completo").in("id", cobIds);
        for (const c of profiles || []) cobMap[c.id] = c.nombre_completo;
      }

      // 4) Get payments for these cuotas to check if paid today
      const cuotaIds = allCuotas.map((c) => c.id);
      const { data: pagos } = await supabase
        .from("pagos")
        .select("cuota_id, monto_recibido, created_at")
        .in("cuota_id", cuotaIds);

      const pagosByCuota: Record<string, { total: number; fecha: string }> = {};
      for (const p of pagos || []) {
        if (!p.cuota_id) continue;
        if (!pagosByCuota[p.cuota_id]) pagosByCuota[p.cuota_id] = { total: 0, fecha: "" };
        pagosByCuota[p.cuota_id].total += Number(p.monto_recibido);
        pagosByCuota[p.cuota_id].fecha = p.created_at || "";
      }

      const presMap: Record<string, any> = {};
      for (const p of prestamos || []) presMap[p.id] = p;

      // 5) Get gestiones count per prestamo
      const { data: gestiones } = await supabase
        .from("crm_gestiones")
        .select("prestamo_id, created_at, resultado")
        .in("prestamo_id", prestamoIds)
        .order("created_at", { ascending: false });

      const gestionesByPrestamo: Record<string, { count: number; ultima: string | null }> = {};
      for (const g of gestiones || []) {
        if (!gestionesByPrestamo[g.prestamo_id]) {
          gestionesByPrestamo[g.prestamo_id] = { count: 0, ultima: g.created_at };
        }
        gestionesByPrestamo[g.prestamo_id].count++;
      }

      return allCuotas.map((c): CuotaDiaria => {
        const pres = presMap[c.prestamo_id] || {};
        const cliente = pres.clientes as any;
        const ruta = pres.rutas as any;
        const caja = pres.cajas as any;
        const pago = pagosByCuota[c.id];

        return {
          cuotaId: c.id,
          prestamoId: c.prestamo_id,
          clienteNombre: cliente?.nombre_completo || "—",
          clienteId: pres.cliente_id || "",
          numCuota: c.num_cuota,
          totalCuotas: pres.num_cuotas || 0,
          montoSolicitado: Number(pres.monto_solicitado || 0),
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
          cobrador: pres.cobrador_id ? (cobMap[pres.cobrador_id] || "—") : "Sin asignar",
          cobradorId: pres.cobrador_id || null,
          caja: caja?.nombre || "—",
          cajaId: pres.caja_id || null,
          pagada: c.status === "Pagada",
          montoPagado: pago?.total || 0,
          fechaPago: c.fecha_pagada || null,
          gestiones: gestionesByPrestamo[c.prestamo_id]?.count || 0,
          ultimaGestion: gestionesByPrestamo[c.prestamo_id]?.ultima || null,
        };
      });
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

// ── Status helpers ────────────────────────────────────────────────
function getStatusIcon(item: CuotaDiaria) {
  if (item.pagada) return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (item.status === "Prometida") return <CalendarIcon className="h-4 w-4 text-purple-500" />;
  if (item.status === "Parcial") return <Clock className="h-4 w-4 text-warning" />;
  if (item.diasAtraso > 0) return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function getStatusBadge(item: CuotaDiaria) {
  if (item.pagada) return { label: "Cobrada", className: "bg-badge-activo text-badge-activo-foreground" };
  if (item.status === "Prometida") return { label: "Prometida", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" };
  if (item.status === "Parcial") return { label: "Parcial", className: "bg-badge-aldia text-badge-aldia-foreground" };
  if (item.diasAtraso > 0) return { label: `Vencida (${item.diasAtraso}d)`, className: "bg-badge-vencido text-badge-vencido-foreground" };
  return { label: "Pendiente", className: "bg-badge-liquidado text-badge-liquidado-foreground" };
}

// ── Page Component ────────────────────────────────────────────────
export default function CobranzaDiariaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const [fecha, setFecha] = useState(new Date());
  const [search, setSearch] = useState("");
  const [filtroRuta, setFiltroRuta] = useState("todas");
  const [filtroCobrador, setFiltroCobrador] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [showVencidas, setShowVencidas] = useState(true);

  // Payment modal state
  const [pagoOpen, setPagoOpen] = useState(false);
  const [pagoPrestamoId, setPagoPrestamoId] = useState("");
  const [pagoCuotas, setPagoCuotas] = useState<any[]>([]);
  const [pagoRutaId, setPagoRutaId] = useState<string | null>(null);
  const [pagoCobradorId, setPagoCobradorId] = useState<string | null>(null);
  const [pagoMontoInicial, setPagoMontoInicial] = useState<number | undefined>();

  // Promesa modal state
  const [promesaOpen, setPromesaOpen] = useState(false);
  const [promesaItem, setPromesaItem] = useState<CuotaDiaria | null>(null);

  // Visita modal state
  const [visitaOpen, setVisitaOpen] = useState(false);
  const [visitaItem, setVisitaItem] = useState<CuotaDiaria | null>(null);

  const fechaStr = format(fecha, "yyyy-MM-dd");
  const { data: cuotas, isLoading } = useCobranzaDiaria(fechaStr, empresaId);
  const { data: cajas } = useCajasAll(empresaId);

  // Extract unique rutas and cobradores
  const rutas = useMemo(() => {
    if (!cuotas) return [];
    const map = new Map<string, string>();
    cuotas.forEach((c) => { if (c.rutaId) map.set(c.rutaId, c.ruta); });
    return Array.from(map, ([id, nombre]) => ({ id, nombre }));
  }, [cuotas]);

  const cobradoresUnicos = useMemo(() => {
    if (!cuotas) return [];
    const map = new Map<string, string>();
    cuotas.forEach((c) => { if (c.cobradorId) map.set(c.cobradorId, c.cobrador); });
    return Array.from(map, ([id, nombre]) => ({ id, nombre }));
  }, [cuotas]);

  // Role-based pre-filter
  const { role, rutaIds: roleRutaIds, cobradorId: roleCobradorId } = useCurrentUserRole();
  const roleCuotas = useMemo(() => {
    if (!cuotas) return [];
    if (role === "admin") return cuotas;
    if (role === "supervisor" && roleRutaIds.length > 0) {
      return cuotas.filter((c) => c.rutaId && roleRutaIds.includes(c.rutaId));
    }
    if (role === "cobrador" && roleCobradorId) {
      return cuotas.filter((c) => c.cobradorId === roleCobradorId);
    }
    return [];
  }, [cuotas, role, roleRutaIds, roleCobradorId]);

  // Filter
  const filtered = useMemo(() => {
    return roleCuotas.filter((c) => {
      if (!showVencidas && c.fechaVencimiento < fechaStr && !c.pagada) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.clienteNombre.toLowerCase().includes(q) && !c.prestamoId.slice(0, 8).includes(q)) return false;
      }
      if (filtroRuta !== "todas" && c.rutaId !== filtroRuta) return false;
      if (filtroCobrador !== "todos" && c.cobradorId !== filtroCobrador) return false;
      if (filtroEstado === "cobradas" && !c.pagada) return false;
      if (filtroEstado === "pendientes" && c.pagada) return false;
      if (filtroEstado === "vencidas" && (c.pagada || c.diasAtraso === 0)) return false;
      if (filtroEstado === "prometidas" && c.status !== "Prometida") return false;
      return true;
    });
  }, [roleCuotas, search, filtroRuta, filtroCobrador, filtroEstado, showVencidas, fechaStr]);

  // KPIs
  const kpis = useMemo(() => {
    if (!filtered.length) return { total: 0, cobradas: 0, pendientes: 0, porCobrar: 0, cobrado: 0, mora: 0, porcentaje: 0 };
    const cobradas = filtered.filter((c) => c.pagada).length;
    const pendientes = filtered.filter((c) => !c.pagada).length;
    const porCobrar = filtered.filter((c) => !c.pagada).reduce((s, c) => s + c.saldoTotal, 0);
    const cobrado = filtered.filter((c) => c.pagada).reduce((s, c) => s + c.capitalInteres, 0) +
      filtered.filter((c) => c.status === "Parcial").reduce((s, c) => s + c.montoPagado, 0);
    const mora = filtered.reduce((s, c) => s + c.saldoMora, 0);
    const totalEsperado = porCobrar + cobrado;
    const porcentaje = totalEsperado > 0 ? (cobrado / totalEsperado) * 100 : 0;
    return { total: filtered.length, cobradas, pendientes, porCobrar, cobrado, mora, porcentaje };
  }, [filtered]);

  // Open PagoModal for a specific cuota
  const openPago = async (item: CuotaDiaria) => {
    // Fetch all pending cuotas for this prestamo
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
  };

  const handlePagoClose = (open: boolean) => {
    setPagoOpen(open);
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["cobranza-diaria", fechaStr] });
    }
  };

  // Date navigation
  const prevDay = () => setFecha((d) => new Date(d.getTime() - 86400000));
  const nextDay = () => setFecha((d) => new Date(d.getTime() + 86400000));
  const goToday = () => setFecha(new Date());

  // Group by ruta for summary
  const byRuta = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; cobradas: number; pendientes: number; montoPendiente: number; montoCobrado: number }> = {};
    for (const c of filtered) {
      const key = c.rutaId || "sin-ruta";
      if (!map[key]) map[key] = { nombre: c.ruta, total: 0, cobradas: 0, pendientes: 0, montoPendiente: 0, montoCobrado: 0 };
      map[key].total++;
      if (c.pagada) { map[key].cobradas++; map[key].montoCobrado += c.capitalInteres; }
      else { map[key].pendientes++; map[key].montoPendiente += c.saldoTotal; }
    }
    return Object.values(map).sort((a, b) => b.montoPendiente - a.montoPendiente);
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Control de Cobranza</h1>
          <p className="text-muted-foreground text-sm">Vista diaria de cuotas por cobrar y cobradas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(fecha, "EEEE, d 'de' MMMM", { locale: es })}
                {isToday(fecha) && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">Hoy</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={fecha}
                onSelect={(d) => d && setFecha(d)}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday(fecha) && (
            <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={goToday}>Hoy</Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total Cuotas", value: kpis.total, icon: Users, color: "text-foreground" },
          { label: "Cobradas", value: kpis.cobradas, icon: CheckCircle2, color: "text-success" },
          { label: "Pendientes", value: kpis.pendientes, icon: Clock, color: "text-warning" },
          { label: "Por Cobrar", value: $$(kpis.porCobrar), icon: DollarSign, color: "text-destructive" },
          { label: "Cobrado", value: $$(kpis.cobrado), icon: HandCoins, color: "text-success" },
          { label: "Mora Acum.", value: $$(kpis.mora), icon: AlertTriangle, color: "text-destructive" },
          { label: "Eficiencia", value: `${kpis.porcentaje.toFixed(1)}%`, icon: TrendingUp, color: "text-primary" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border/60">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{kpi.label}</span>
                <kpi.icon className={cn("h-3.5 w-3.5", kpi.color)} />
              </div>
              <p className={cn("text-lg font-bold", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-filter-bar border border-filter-bar-border rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-[13px]"
          />
        </div>
        <Select value={filtroRuta} onValueChange={setFiltroRuta}>
          <SelectTrigger className="w-[160px] h-8 text-[13px]"><SelectValue placeholder="Ruta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las rutas</SelectItem>
            {rutas.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroCobrador} onValueChange={setFiltroCobrador}>
          <SelectTrigger className="w-[160px] h-8 text-[13px]"><SelectValue placeholder="Cobrador" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los cobradores</SelectItem>
            {cobradoresUnicos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-[150px] h-8 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendientes">Pendientes</SelectItem>
            <SelectItem value="cobradas">Cobradas</SelectItem>
            <SelectItem value="vencidas">Vencidas</SelectItem>
            <SelectItem value="prometidas">Prometidas</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showVencidas}
            onChange={(e) => setShowVencidas(e.target.checked)}
            className="rounded border-border"
          />
          Incluir vencidas anteriores
        </label>
      </div>

      {/* Summary by Route */}
      {byRuta.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {byRuta.map((r) => {
            const pct = r.total > 0 ? (r.cobradas / r.total) * 100 : 0;
            return (
              <Card key={r.nombre} className="border-border/60">
                <CardContent className="p-3">
                  <p className="text-[12px] font-semibold truncate">{r.nombre}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground">{r.cobradas}/{r.total} cobradas</span>
                    <span className="text-[11px] font-medium text-primary">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1.5 mt-1.5">
                    <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>Pendiente: {$$(r.montoPendiente)}</span>
                    <span>Cobrado: {$$(r.montoCobrado)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Main Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
            <p className="text-lg font-semibold">Sin cuotas pendientes</p>
            <p className="text-sm text-muted-foreground">No hay cuotas programadas para esta fecha.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header">
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold w-8"></TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Cliente</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Préstamo</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Cuota</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Ruta</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Monto Cuota</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Mora</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Total a Cobrar</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Estado</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Visitas</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const badge = getStatusBadge(item);
                const isOverdue = item.fechaVencimiento < fechaStr && !item.pagada;
                return (
                  <TableRow
                    key={item.cuotaId}
                    className={cn(
                      "text-[13px]",
                      item.pagada && "bg-badge-activo/20",
                      isOverdue && !item.pagada && "bg-badge-vencido/10",
                    )}
                  >
                    <TableCell className="px-3">{getStatusIcon(item)}</TableCell>
                    <TableCell>
                      <button
                        className="font-medium hover:text-primary hover:underline text-left"
                        onClick={() => navigate(`/clientes/${item.clienteId}`)}
                      >
                        {item.clienteNombre}
                      </button>
                    </TableCell>
                    <TableCell>
                      <button
                        className="text-muted-foreground hover:text-primary hover:underline font-mono text-[12px]"
                        onClick={() => navigate(`/prestamos/${item.prestamoId}`)}
                      >
                        {item.prestamoId.slice(0, 8)}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">#{item.numCuota}</span>
                      <span className="text-muted-foreground">/{item.totalCuotas}</span>
                      {isOverdue && (
                        <span className="ml-1 text-[10px] text-destructive font-medium">
                          ({format(parseISO(item.fechaVencimiento), "dd/MM")})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{item.ruta}</TableCell>
                    <TableCell className="text-right font-medium">{$$(item.capitalInteres)}</TableCell>
                    <TableCell className={cn("text-right", item.saldoMora > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {item.saldoMora > 0 ? $$(item.saldoMora) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{$$(item.saldoTotal)}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", badge.className)}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {!item.pagada ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            className="h-7 text-[11px] px-2.5"
                            onClick={() => openPago(item)}
                          >
                            <HandCoins className="h-3 w-3 mr-1" />
                            Cobrar
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Registrar visita"
                            onClick={() => { setVisitaItem(item); setVisitaOpen(true); }}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </Button>
                          {item.status !== "Prometida" && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              title="Promesa de pago"
                              onClick={() => { setPromesaItem(item); setPromesaOpen(true); }}
                            >
                              <CalendarCheck className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(`/prestamos/${item.prestamoId}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-success font-medium">✓ {$$(item.montoPagado || item.capitalInteres)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Payment Modal */}
      {pagoOpen && (
        <PagoModal
          open={pagoOpen}
          onOpenChange={handlePagoClose}
          prestamoId={pagoPrestamoId}
          cuotasPendientes={pagoCuotas}
          cajas={cajas || []}
          rutaId={pagoRutaId}
          cobradorId={pagoCobradorId}
          montoInicial={pagoMontoInicial}
        />
      )}

      {/* Promesa Modal */}
      {promesaOpen && promesaItem && (
        <PromesaModal
          open={promesaOpen}
          onOpenChange={(open) => {
            setPromesaOpen(open);
            if (!open) queryClient.invalidateQueries({ queryKey: ["cobranza-diaria", fechaStr] });
          }}
          prestamoId={promesaItem.prestamoId}
          cuotaNum={promesaItem.numCuota}
          cuotaId={promesaItem.cuotaId}
          saldoTotal={promesaItem.saldoTotal}
          fechaVencimiento={promesaItem.fechaVencimiento}
        />
      )}

      {/* Visita Modal */}
      {visitaOpen && visitaItem && (
        <VisitaModal
          open={visitaOpen}
          onOpenChange={(open) => {
            setVisitaOpen(open);
            if (!open) queryClient.invalidateQueries({ queryKey: ["cobranza-diaria", fechaStr] });
          }}
          prestamoId={visitaItem.prestamoId}
          clienteId={visitaItem.clienteId}
          clienteNombre={visitaItem.clienteNombre}
          cuotaId={visitaItem.cuotaId}
          cuotaNum={visitaItem.numCuota}
          saldoTotal={visitaItem.saldoTotal}
        />
      )}
    </div>
  );
}
