import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, $$ } from "@/lib/utils";
import { format, subDays, differenceInDays, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarIcon, TrendingUp, TrendingDown, Users, CreditCard, HandCoins,
  AlertTriangle, Eye, Clock, Target, Award, BarChart3, Minus,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────
interface AdvisorMetrics {
  id: string;
  nombre: string;
  // Portfolio
  prestamosActivos: number;
  prestamosCreados: number;
  montoColocado: number;
  // Recovery
  totalCobrado: number;
  pagosCuenta: number;
  // Mora
  clientesMorosos: number;
  clientesTotales: number;
  moraRate: number;
  montoMora: number;
  // Visits
  visitasRealizadas: number;
  visitasProgramadas: number;
  visitaRate: number;
  // Comparison
  moraRatePrev: number;
  cobradoPrev: number;
  prestamosCreatedPrev: number;
  // Client staleness
  clientesSinVisita: { clienteId: string; clienteNombre: string; diasSinVisita: number; ultimaVisita: string | null }[];
}

// ── Data hook ────────────────────────────────────────────────────
function useProductividadData(empresaId: string, desde: Date, hasta: Date) {
  const desdeStr = format(desde, "yyyy-MM-dd");
  const hastaStr = format(hasta, "yyyy-MM-dd");
  // Previous period (same duration)
  const duration = differenceInDays(hasta, desde) + 1;
  const prevDesde = format(subDays(desde, duration), "yyyy-MM-dd");
  const prevHasta = format(subDays(desde, 1), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["productividad", empresaId, desdeStr, hastaStr],
    queryFn: async () => {
      // 1. Profiles (advisors)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nombre_completo, activo")
        .eq("empresa_id", empresaId);

      // 2. Prestamos activos per cobrador
      const prestamos = await fetchAllRows(supabase
        .from("prestamos")
        .select("id, cobrador_id, generado_por, monto_solicitado, estado, created_at, fecha_registro, cliente_id")
        .eq("empresa_id", empresaId));

      // 3. Pagos in period & previous
      const pagos = await fetchAllRows(supabase
        .from("pagos")
        .select("id, cobrador_id, registrado_por, monto_recibido, created_at, prestamo_id, fecha_pago")
        .eq("empresa_id", empresaId)
        .eq("anulado", false)
        .gte("fecha_pago", prevDesde)
        .lte("fecha_pago", hastaStr));

      // 4. Amortizacion for mora
      const prestamoIds = (prestamos || [])
        .filter((p) => p.estado === "Activo" || p.estado === "Al día" || p.estado === "Vencido")
        .map((p) => p.id);

      let amortData: any[] = [];
      if (prestamoIds.length > 0) {
        amortData = await fetchAllRows(supabase
          .from("amortizacion")
          .select("prestamo_id, saldo_total, saldo_mora, status, fecha_vencimiento")
          .in("prestamo_id", prestamoIds));
      }

      // 5. CRM gestiones (visits) in period
      const gestiones = await fetchAllRows(supabase
        .from("crm_gestiones")
        .select("id, registrado_por, tipo_gestion, cliente_id, created_at")
        .eq("empresa_id", empresaId)
        .gte("created_at", `${prevDesde}T00:00:00`)
        .lte("created_at", `${hastaStr}T23:59:59`));

      // 6. All visitas ever for "last visit" tracking
      const allVisitas = await fetchAllRows(supabase
        .from("crm_gestiones")
        .select("cliente_id, created_at, registrado_por")
        .eq("empresa_id", empresaId)
        .eq("tipo_gestion", "Visita")
        .order("created_at", { ascending: false }));

      // 7. Clientes for name mapping
      const clientes = await fetchAllRows(supabase
        .from("clientes")
        .select("id, nombre_completo")
        .eq("empresa_id", empresaId));

      const clienteMap = new Map((clientes || []).map((c) => [c.id, c.nombre_completo]));
      const today = new Date().toISOString().slice(0, 10);

      // ── Build per-advisor metrics ──
      const advisorMap = new Map<string, AdvisorMetrics>();

      // Helper: resolve the effective advisor for a prestamo
      const resolveAdvisor = (cobrador_id: string | null, generado_por: string | null) =>
        cobrador_id || generado_por || null;

      // Collect all advisor IDs referenced in data (even if not in profiles)
      const allAdvisorIds = new Set<string>();
      for (const p of profiles || []) {
        if (p.activo) allAdvisorIds.add(p.id);
      }
      for (const pr of prestamos || []) {
        const adv = resolveAdvisor(pr.cobrador_id, pr.generado_por);
        if (adv) allAdvisorIds.add(adv);
      }
      for (const pg of pagos || []) {
        const adv = pg.cobrador_id || pg.registrado_por;
        if (adv) allAdvisorIds.add(adv);
      }

      const profileMap = new Map((profiles || []).map((p) => [p.id, p.nombre_completo || "Sin nombre"]));

      // Add "Sin asignar" for null cases
      const SIN_ASIGNAR = "__sin_asignar__";
      const initAdvisor = (id: string): AdvisorMetrics => ({
        id,
        nombre: id === SIN_ASIGNAR ? "Sin asignar" : (profileMap.get(id) || "Usuario " + id.slice(0, 6)),
        prestamosActivos: 0, prestamosCreados: 0, montoColocado: 0,
        totalCobrado: 0, pagosCuenta: 0,
        clientesMorosos: 0, clientesTotales: 0, moraRate: 0, montoMora: 0,
        visitasRealizadas: 0, visitasProgramadas: 0, visitaRate: 0,
        moraRatePrev: 0, cobradoPrev: 0, prestamosCreatedPrev: 0,
        clientesSinVisita: [],
      });

      for (const id of allAdvisorIds) advisorMap.set(id, initAdvisor(id));
      advisorMap.set(SIN_ASIGNAR, initAdvisor(SIN_ASIGNAR));

      // Prestamos
      const prestamosByAdvisor = new Map<string, Set<string>>();
      for (const pr of prestamos || []) {
        const adv = resolveAdvisor(pr.cobrador_id, pr.generado_por) || SIN_ASIGNAR;
        if (!advisorMap.has(adv)) advisorMap.set(adv, initAdvisor(adv));
        const m = advisorMap.get(adv)!;

        if (pr.estado !== "Liquidado" && pr.estado !== "Cancelado") {
          m.prestamosActivos++;
          if (!prestamosByAdvisor.has(adv)) prestamosByAdvisor.set(adv, new Set());
          prestamosByAdvisor.get(adv)!.add(pr.cliente_id);
        }

        const fechaCreacion = (pr.fecha_registro || pr.created_at || "").slice(0, 10);
        if (fechaCreacion >= desdeStr && fechaCreacion <= hastaStr) {
          m.prestamosCreados++;
          m.montoColocado += Number(pr.monto_solicitado || 0);
        }
        if (fechaCreacion >= prevDesde && fechaCreacion < desdeStr) {
          m.prestamosCreatedPrev++;
        }
      }

      // Set clientesTotales
      for (const [adv, clients] of prestamosByAdvisor) {
        const m = advisorMap.get(adv);
        if (m) m.clientesTotales = clients.size;
      }

      // Mora per prestamo → advisor
      const prestamoAdvisorMap = new Map<string, string>();
      for (const pr of prestamos || []) {
        const adv = resolveAdvisor(pr.cobrador_id, pr.generado_por) || SIN_ASIGNAR;
        prestamoAdvisorMap.set(pr.id, adv);
      }

      const morososByAdvisor = new Map<string, Set<string>>();
      for (const a of amortData) {
        const adv = prestamoAdvisorMap.get(a.prestamo_id);
        if (!adv || !advisorMap.has(adv)) continue;
        if (a.fecha_vencimiento < today && Number(a.saldo_total || 0) > 0) {
          if (!morososByAdvisor.has(adv)) morososByAdvisor.set(adv, new Set());
          // Find the client for this prestamo
          const pr = (prestamos || []).find((p) => p.id === a.prestamo_id);
          if (pr) morososByAdvisor.get(adv)!.add(pr.cliente_id);
          advisorMap.get(adv)!.montoMora += Number(a.saldo_mora || 0);
        }
      }
      for (const [adv, morosos] of morososByAdvisor) {
        const m = advisorMap.get(adv)!;
        m.clientesMorosos = morosos.size;
        m.moraRate = m.clientesTotales > 0 ? (m.clientesMorosos / m.clientesTotales) * 100 : 0;
      }

      // Pagos
      for (const pg of pagos || []) {
        const adv = pg.cobrador_id || pg.registrado_por || SIN_ASIGNAR;
        if (!advisorMap.has(adv)) advisorMap.set(adv, initAdvisor(adv));
        const fecha = (pg.fecha_pago || pg.created_at || "").slice(0, 10);
        if (fecha >= desdeStr && fecha <= hastaStr) {
          advisorMap.get(adv)!.totalCobrado += Number(pg.monto_recibido || 0);
          advisorMap.get(adv)!.pagosCuenta++;
        }
        if (fecha >= prevDesde && fecha < desdeStr) {
          advisorMap.get(adv)!.cobradoPrev += Number(pg.monto_recibido || 0);
        }
      }

      // Gestiones (visitas) in period
      for (const g of gestiones || []) {
        const adv = g.registrado_por;
        if (!adv || !advisorMap.has(adv)) continue;
        const fecha = (g.created_at || "").slice(0, 10);
        if (fecha >= desdeStr && fecha <= hastaStr) {
          advisorMap.get(adv)!.visitasRealizadas++;
        }
      }

      // Programadas = clientes activos (they should all be visited)
      for (const m of advisorMap.values()) {
        m.visitasProgramadas = m.clientesTotales;
        m.visitaRate = m.visitasProgramadas > 0 ? (m.visitasRealizadas / m.visitasProgramadas) * 100 : 0;
      }

      // Last visit per client per advisor
      const lastVisitMap = new Map<string, { fecha: string; advisor: string }>();
      for (const v of allVisitas || []) {
        if (!lastVisitMap.has(v.cliente_id)) {
          lastVisitMap.set(v.cliente_id, { fecha: v.created_at!, advisor: v.registrado_por || "" });
        }
      }

      // Build clientesSinVisita per advisor
      for (const [adv, clients] of prestamosByAdvisor) {
        const m = advisorMap.get(adv);
        if (!m) continue;
        for (const clienteId of clients) {
          const lastVisit = lastVisitMap.get(clienteId);
          const diasSinVisita = lastVisit
            ? differenceInDays(new Date(), new Date(lastVisit.fecha))
            : 9999;
          if (diasSinVisita > 3) {
            m.clientesSinVisita.push({
              clienteId,
              clienteNombre: clienteMap.get(clienteId) || "—",
              diasSinVisita: diasSinVisita === 9999 ? -1 : diasSinVisita,
              ultimaVisita: lastVisit?.fecha?.slice(0, 10) || null,
            });
          }
        }
        m.clientesSinVisita.sort((a, b) => (b.diasSinVisita === -1 ? 1 : 0) - (a.diasSinVisita === -1 ? 1 : 0) || b.diasSinVisita - a.diasSinVisita);
      }

      return Array.from(advisorMap.values()).filter(
        (m) => m.prestamosActivos > 0 || m.prestamosCreados > 0 || m.totalCobrado > 0 || m.visitasRealizadas > 0
      );
    },
    staleTime: 60_000,
  });
}

// ── Helpers ──────────────────────────────────────────────────────
function Delta({ current, previous, suffix = "", invert = false }: { current: number; previous: number; suffix?: string; invert?: boolean }) {
  if (previous === 0 && current === 0) return <span className="text-muted-foreground text-[11px]">—</span>;
  const diff = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const isPositive = invert ? diff < 0 : diff > 0;
  const isNeutral = diff === 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium",
      isNeutral ? "text-muted-foreground" : isPositive ? "text-success" : "text-destructive"
    )}>
      {isNeutral ? <Minus className="h-3 w-3" /> : isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(diff).toFixed(0)}%{suffix}
    </span>
  );
}

function staleBadge(dias: number) {
  if (dias === -1) return <Badge variant="destructive" className="text-[10px]">Nunca visitado</Badge>;
  if (dias > 30) return <Badge variant="destructive" className="text-[10px]">{dias}d</Badge>;
  if (dias > 14) return <Badge className="bg-warning text-warning-foreground text-[10px]">{dias}d</Badge>;
  if (dias > 7) return <Badge className="bg-[hsl(var(--badge-juridico))] text-[hsl(var(--badge-juridico-foreground))] text-[10px]">{dias}d</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{dias}d</Badge>;
}

// ── Component ────────────────────────────────────────────────────
export default function ProductividadPage() {
  const { empresaId } = useEmpresa();
  const [desde, setDesde] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [hasta, setHasta] = useState<Date>(endOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>("all");

  const { data: advisors = [], isLoading } = useProductividadData(empresaId, desde, hasta);

  const filtered = useMemo(() => {
    if (selectedAdvisor === "all") return advisors;
    return advisors.filter((a) => a.id === selectedAdvisor);
  }, [advisors, selectedAdvisor]);

  // Totals
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, a) => ({
        prestamosActivos: acc.prestamosActivos + a.prestamosActivos,
        prestamosCreados: acc.prestamosCreados + a.prestamosCreados,
        montoColocado: acc.montoColocado + a.montoColocado,
        totalCobrado: acc.totalCobrado + a.totalCobrado,
        pagosCuenta: acc.pagosCuenta + a.pagosCuenta,
        clientesMorosos: acc.clientesMorosos + a.clientesMorosos,
        clientesTotales: acc.clientesTotales + a.clientesTotales,
        montoMora: acc.montoMora + a.montoMora,
        visitasRealizadas: acc.visitasRealizadas + a.visitasRealizadas,
        visitasProgramadas: acc.visitasProgramadas + a.visitasProgramadas,
        cobradoPrev: acc.cobradoPrev + a.cobradoPrev,
        prestamosCreatedPrev: acc.prestamosCreatedPrev + a.prestamosCreatedPrev,
      }),
      { prestamosActivos: 0, prestamosCreados: 0, montoColocado: 0, totalCobrado: 0, pagosCuenta: 0, clientesMorosos: 0, clientesTotales: 0, montoMora: 0, visitasRealizadas: 0, visitasProgramadas: 0, cobradoPrev: 0, prestamosCreatedPrev: 0 }
    );
  }, [filtered]);

  const globalMoraRate = totals.clientesTotales > 0 ? (totals.clientesMorosos / totals.clientesTotales) * 100 : 0;
  const globalVisitRate = totals.visitasProgramadas > 0 ? (totals.visitasRealizadas / totals.visitasProgramadas) * 100 : 0;

  // Ranking
  const ranked = useMemo(() => {
    return [...advisors].sort((a, b) => {
      // Score: recovery weight + low mora + high visit rate
      const scoreA = a.totalCobrado * 0.4 + (100 - a.moraRate) * a.prestamosActivos * 0.3 + a.visitaRate * 0.3;
      const scoreB = b.totalCobrado * 0.4 + (100 - b.moraRate) * b.prestamosActivos * 0.3 + b.visitaRate * 0.3;
      return scoreB - scoreA;
    });
  }, [advisors]);

  // All stale clients
  const allStaleClients = useMemo(() => {
    return filtered.flatMap((a) =>
      a.clientesSinVisita.map((c) => ({ ...c, asesor: a.nombre, asesorId: a.id }))
    ).sort((a, b) => (b.diasSinVisita === -1 ? 9999 : b.diasSinVisita) - (a.diasSinVisita === -1 ? 9999 : a.diasSinVisita));
  }, [filtered]);

  const presetRange = (label: string) => {
    const now = new Date();
    if (label === "hoy") { setDesde(now); setHasta(now); }
    else if (label === "semana") { setDesde(startOfWeek(now, { weekStartsOn: 1 })); setHasta(endOfWeek(now, { weekStartsOn: 1 })); }
    else if (label === "semana-pasada") { const s = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); setDesde(s); setHasta(endOfWeek(s, { weekStartsOn: 1 })); }
    else if (label === "mes") { setDesde(new Date(now.getFullYear(), now.getMonth(), 1)); setHasta(now); }
    else if (label === "30d") { setDesde(subDays(now, 30)); setHasta(now); }
  };

  const kpis = [
    { label: "Cobrado", value: $$(totals.totalCobrado), icon: HandCoins, accent: "text-success", delta: <Delta current={totals.totalCobrado} previous={totals.cobradoPrev} /> },
    { label: "Préstamos Creados", value: String(totals.prestamosCreados), icon: CreditCard, accent: "text-primary", delta: <Delta current={totals.prestamosCreados} previous={totals.prestamosCreatedPrev} /> },
    { label: "Colocado", value: $$(totals.montoColocado), icon: TrendingUp, accent: "text-foreground", delta: null },
    { label: "Mora", value: `${globalMoraRate.toFixed(1)}%`, icon: AlertTriangle, accent: "text-destructive", delta: <span className="text-[11px] text-muted-foreground">{totals.clientesMorosos}/{totals.clientesTotales} clientes</span> },
    { label: "% Visitas", value: `${globalVisitRate.toFixed(0)}%`, icon: Eye, accent: globalVisitRate >= 80 ? "text-success" : globalVisitRate >= 50 ? "text-warning" : "text-destructive", delta: <span className="text-[11px] text-muted-foreground">{totals.visitasRealizadas}/{totals.visitasProgramadas}</span> },
    { label: "Pagos Registrados", value: String(totals.pagosCuenta), icon: Target, accent: "text-[hsl(217,91%,60%)]", delta: null },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Productividad
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets */}
          {[["hoy", "Hoy"], ["semana", "Esta semana"], ["semana-pasada", "Sem. pasada"], ["mes", "Este mes"], ["30d", "30 días"]] .map(([key, label]) => (
            <Button key={key} variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => presetRange(key)}>
              {label}
            </Button>
          ))}

          {/* Date pickers */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[12px] gap-1">
                <CalendarIcon className="h-3 w-3" />
                {format(desde, "dd/MM/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={desde} onSelect={(d) => d && setDesde(d)} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-xs">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[12px] gap-1">
                <CalendarIcon className="h-3 w-3" />
                {format(hasta, "dd/MM/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={hasta} onSelect={(d) => d && setHasta(d)} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {/* Advisor filter */}
          <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
            <SelectTrigger className="h-7 w-[180px] text-[12px]">
              <SelectValue placeholder="Todos los asesores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los asesores</SelectItem>
              {advisors.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card rounded-lg border border-border px-4 py-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
              <k.icon className={cn("h-4 w-4", k.accent)} />
            </div>
            <p className="text-lg font-semibold mt-1">{isLoading ? "—" : k.value}</p>
            {k.delta && <div className="mt-0.5">{k.delta}</div>}
          </div>
        ))}
      </div>

      <Tabs defaultValue="ranking" className="space-y-3">
        <TabsList>
          <TabsTrigger value="ranking"><Award className="h-3.5 w-3.5 mr-1.5" />Ranking</TabsTrigger>
          <TabsTrigger value="detalle"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Detalle</TabsTrigger>
          <TabsTrigger value="visitas"><Eye className="h-3.5 w-3.5 mr-1.5" />Clientes sin visitar</TabsTrigger>
        </TabsList>

        {/* ── Ranking Tab ── */}
        <TabsContent value="ranking">
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-[hsl(var(--table-header))]">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] w-10">#</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))]">Asesor</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Portafolio</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Cobrado</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">vs Anterior</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Colocado</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Mora %</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Mora $</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Visitas</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">% Visita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : ranked.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No hay datos en el periodo seleccionado</TableCell></TableRow>
                ) : ranked.map((a, i) => (
                  <TableRow key={a.id} className={cn(i === 0 && "bg-[hsl(var(--badge-activo))]")}>
                    <TableCell className="font-bold text-[13px]">
                      {i === 0 ? <Award className="h-4 w-4 text-warning inline" /> : i + 1}
                    </TableCell>
                    <TableCell className="font-medium text-[13px]">{a.nombre}</TableCell>
                    <TableCell className="text-right text-[13px]">{a.prestamosActivos}</TableCell>
                    <TableCell className="text-right text-[13px] font-semibold text-success">{$$(a.totalCobrado)}</TableCell>
                    <TableCell className="text-right"><Delta current={a.totalCobrado} previous={a.cobradoPrev} /></TableCell>
                    <TableCell className="text-right text-[13px]">{$$(a.montoColocado)}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("text-[13px] font-semibold",
                        a.moraRate > 30 ? "text-destructive" : a.moraRate > 15 ? "text-warning" : "text-success"
                      )}>
                        {a.moraRate.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">({a.clientesMorosos}/{a.clientesTotales})</span>
                    </TableCell>
                    <TableCell className={cn("text-right text-[13px]", a.montoMora > 0 && "text-destructive")}>{$$(a.montoMora)}</TableCell>
                    <TableCell className="text-right text-[13px]">{a.visitasRealizadas}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("text-[13px] font-semibold",
                        a.visitaRate >= 80 ? "text-success" : a.visitaRate >= 50 ? "text-warning" : "text-destructive"
                      )}>
                        {a.visitaRate.toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Detail Tab ── */}
        <TabsContent value="detalle">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)
            ) : filtered.map((a) => (
              <div key={a.id} className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-[14px]">{a.nombre}</p>
                  <Badge variant="secondary" className="text-[10px]">{a.prestamosActivos} activos</Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cobrado</span>
                    <span className="font-semibold text-success">{$$(a.totalCobrado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">vs Anterior</span>
                    <Delta current={a.totalCobrado} previous={a.cobradoPrev} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Colocado</span>
                    <span className="font-semibold">{$$(a.montoColocado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Préstamos</span>
                    <span className="font-semibold">{a.prestamosCreados} nuevos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mora</span>
                    <span className={cn("font-semibold", a.moraRate > 30 ? "text-destructive" : a.moraRate > 15 ? "text-warning" : "text-success")}>
                      {a.moraRate.toFixed(1)}% ({a.clientesMorosos}/{a.clientesTotales})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mora $</span>
                    <span className={cn("font-semibold", a.montoMora > 0 && "text-destructive")}>{$$(a.montoMora)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visitas</span>
                    <span className="font-semibold">{a.visitasRealizadas}/{a.visitasProgramadas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">% Visita</span>
                    <span className={cn("font-semibold", a.visitaRate >= 80 ? "text-success" : a.visitaRate >= 50 ? "text-warning" : "text-destructive")}>
                      {a.visitaRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Sin visitar (&gt;3d)</span>
                    <span className={cn("font-semibold", a.clientesSinVisita.length > 0 && "text-destructive")}>{a.clientesSinVisita.length} clientes</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Stale Clients Tab ── */}
        <TabsContent value="visitas">
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-[hsl(var(--table-header))]">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))]">Cliente</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))]">Asesor</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Última Visita</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--table-header-foreground))] text-right">Días sin visita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : allStaleClients.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Todos los clientes han sido visitados recientemente 🎉</TableCell></TableRow>
                ) : allStaleClients.map((c, i) => (
                  <TableRow key={`${c.clienteId}-${c.asesorId}-${i}`}>
                    <TableCell className="font-medium text-[13px]">{c.clienteNombre}</TableCell>
                    <TableCell className="text-[13px]">{c.asesor}</TableCell>
                    <TableCell className="text-right text-[13px]">
                      {c.ultimaVisita ? fmtDate(c.ultimaVisita) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{staleBadge(c.diasSinVisita)}</TableCell>
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
