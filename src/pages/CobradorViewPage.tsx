import { lazy, Suspense, useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { cn, $$ } from "@/lib/utils";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PagoModal } from "@/components/PagoModal";
import { VisitaModal } from "@/components/VisitaModal";
import { PromesaModal } from "@/components/PromesaModal";
import { HistorialPagosModal } from "@/components/cobranza/HistorialPagosModal";
import { PrestamoQuickDrawer } from "@/components/cobranza/PrestamoQuickDrawer";
import type { RouteStop } from "@/components/cobranza/MiRutaMap";
import { resendReceiptForPrestamo } from "@/lib/resendReceipt";
import { Search, CheckCircle2, Clock, AlertTriangle, TrendingUp, X, Receipt, History, Navigation } from "lucide-react";
import type { CuotaCobrador, RangePreset, PendienteGrupo } from "@/pages/cobrador-view/types";
import {
  useCobranzaRango, usePagosCobrador, useEmpresaSemana, useResumenSemanal, useCajasAll,
  usePerfilCobrador, useProfileEmpresa,
} from "@/pages/cobrador-view/hooks";
import { KPICard, CuotaCard, PagoCard, EmptyCard, LoadingCards, ResumenSemanalCard } from "@/pages/cobrador-view/cards";
import { TabCobranza } from "@/pages/cobrador-view/TabCobranza";
import { TabCartera } from "@/pages/cobrador-view/TabCartera";
import { TabResumen } from "@/pages/cobrador-view/TabResumen";
import { TabPerfil } from "@/pages/cobrador-view/TabPerfil";
import { MobileBottomNav } from "@/pages/cobrador-view/MobileBottomNav";
import { RangoFechas } from "@/pages/cobrador-view/RangoFechas";

const MiRutaMap = lazy(() => import("@/components/cobranza/MiRutaMap").then((module) => ({ default: module.MiRutaMap })));

export default function CobradorViewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { cobradorId, role, profileId } = useCurrentUserRole();
  const { user } = useAuth();
  const { data: profileEmpresaId } = useProfileEmpresa(user?.id);
  const activeEmpresaId = profileEmpresaId || empresaId;

  // Use the logged-in user's ID as cobrador — if they're assigned as cobrador on any loan, they'll see it
  const effectiveCobradorId = role === "admin" ? null : (cobradorId || profileId || user?.id || null);

  // Empresa week config
  const { data: weekStartsOn = 1 } = useEmpresaSemana(activeEmpresaId);

  // Date range state
  const today = new Date();
  const [rangePreset, setRangePreset] = useState<RangePreset>("semana");
  const [fechaDesde, setFechaDesde] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [fechaHasta, setFechaHasta] = useState(() => endOfWeek(new Date(), { weekStartsOn: 1 }));
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (["resumen", "ruta", "cobranza", "cartera", "historial", "pagos", "perfil"].includes(requested || "")) return requested!;
    return window.matchMedia("(max-width: 639px)").matches ? "resumen" : "cobranza";
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Payment modal
  const [pagoOpen, setPagoOpen] = useState(false);
  const [pagoPrestamoId, setPagoPrestamoId] = useState("");
  const [pagoCuotas, setPagoCuotas] = useState<any[]>([]);
  const [pagoRutaId, setPagoRutaId] = useState<string | null>(null);
  const [pagoCobradorId, setPagoCobradorId] = useState<string | null>(null);
  const [pagoMontoInicial, setPagoMontoInicial] = useState<number | undefined>();

  // Sub-tab dentro de "Cobrar": por-cobrar | cobradas
  const [cobranzaSubTab, setCobranzaSubTab] = useState<"por-cobrar" | "cobradas">("por-cobrar");

  // Visita + Promesa modals
  const [visitaOpen, setVisitaOpen] = useState(false);
  const [visitaItem, setVisitaItem] = useState<CuotaCobrador | null>(null);
  const [promesaOpen, setPromesaOpen] = useState(false);
  const [promesaItem, setPromesaItem] = useState<CuotaCobrador | null>(null);

  // Historial pagos + Drawer préstamo (in-page navigation)
  const [historialOpen, setHistorialOpen] = useState(false);
  const [historialPrestamoId, setHistorialPrestamoId] = useState("");
  const [historialNombre, setHistorialNombre] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPrestamoId, setDrawerPrestamoId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resending, setResending] = useState<string | null>(null);

  const toggleExpand = useCallback((cuotaId: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(cuotaId)) n.delete(cuotaId); else n.add(cuotaId);
      return n;
    });
  }, []);

  const openHistorial = useCallback((item: CuotaCobrador) => {
    setHistorialPrestamoId(item.prestamoId);
    setHistorialNombre(item.clienteNombre);
    setHistorialOpen(true);
  }, []);

  const openDrawer = useCallback((item: CuotaCobrador) => {
    setDrawerPrestamoId(item.prestamoId);
    setDrawerOpen(true);
  }, []);

  const handleResend = useCallback(async (item: CuotaCobrador) => {
    setResending(item.prestamoId);
    try {
      const res = await resendReceiptForPrestamo({ empresaId: activeEmpresaId, prestamoId: item.prestamoId });
      if (res.success) toast.success("Ticket reenviado por WhatsApp");
      else toast.error(res.error || "No se pudo reenviar");
    } finally {
      setResending(null);
    }
  }, [activeEmpresaId]);

  const fechaDesdeStr = format(fechaDesde, "yyyy-MM-dd");
  const fechaHastaStr = format(fechaHasta, "yyyy-MM-dd");

  const { data: cuotas, isLoading: loadingCuotas } = useCobranzaRango(fechaDesdeStr, fechaHastaStr, activeEmpresaId, effectiveCobradorId, role === "admin" || !!effectiveCobradorId);
  const { data: pagos, isLoading: loadingPagos } = usePagosCobrador(fechaDesdeStr, fechaHastaStr, activeEmpresaId, effectiveCobradorId, role === "admin" || !!effectiveCobradorId);
  const { data: cajas } = useCajasAll(activeEmpresaId);
  const { data: perfil, isLoading: loadingPerfil } = usePerfilCobrador(effectiveCobradorId, activeEmpresaId, role !== "admin" && !!effectiveCobradorId);
  const { data: resumenSemanal, isLoading: loadingResumen } = useResumenSemanal(activeEmpresaId, effectiveCobradorId, weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6, role === "admin" || !!effectiveCobradorId);
  
  // Preset handlers
  const setHoy = useCallback(() => {
    setRangePreset("hoy");
    setFechaDesde(new Date());
    setFechaHasta(new Date());
  }, []);

  const setSemana = useCallback(() => {
    setRangePreset("semana");
    const ws = (weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6) ?? 1;
    const start = startOfWeek(new Date(), { weekStartsOn: ws });
    const end = endOfWeek(new Date(), { weekStartsOn: ws });
    setFechaDesde(start);
    setFechaHasta(end);
  }, [weekStartsOn]);

  // Filter cuotas
  const filtered = useMemo(() => {
    if (!cuotas) return [];
    if (!search) return cuotas;
    const q = search.toLowerCase();
    return cuotas.filter((c) => c.clienteNombre.toLowerCase().includes(q));
  }, [cuotas, search]);

  // Split into pendientes and cobradas del rango elegido
  const pendientes = useMemo(() => filtered.filter((c) => !c.pagada), [filtered]);
  const cobradas = useMemo(() => filtered.filter((c) => c.cobradaEnRango), [filtered]);

  // Group "por cobrar" by préstamo (= por cliente con su crédito)
  const pendientesGrupos = useMemo(() => {
    const groups = new Map<string, PendienteGrupo>();
    for (const c of pendientes) {
      let g = groups.get(c.prestamoId);
      if (!g) {
        g = {
          prestamoId: c.prestamoId,
          clienteNombre: c.clienteNombre,
          clienteId: c.clienteId,
          clienteTelefono: c.clienteTelefono,
          clienteDireccion: c.clienteDireccion,
          gpsLat: c.gpsLat,
          gpsLng: c.gpsLng,
          ruta: c.ruta,
          rutaId: c.rutaId,
          cobradorId: c.cobradorId,
          cuotas: [],
          saldoTotal: 0,
          saldoMora: 0,
          diasAtrasoMax: 0,
          proximaCuota: c.numCuota,
          totalCuotas: c.totalCuotas,
        };
        groups.set(c.prestamoId, g);
      }
      g.cuotas.push(c);
      g.saldoTotal += c.saldoTotal;
      g.saldoMora += c.saldoMora;
      if (c.diasAtraso > g.diasAtrasoMax) g.diasAtrasoMax = c.diasAtraso;
      if (c.numCuota < g.proximaCuota) g.proximaCuota = c.numCuota;
    }
    return Array.from(groups.values()).sort((a, b) => b.diasAtrasoMax - a.diasAtrasoMax);
  }, [pendientes]);

  const routeStops = useMemo<RouteStop[]>(() => pendientesGrupos.map((group) => ({
    prestamoId: group.prestamoId,
    clienteNombre: group.clienteNombre,
    clienteTelefono: group.clienteTelefono,
    clienteDireccion: group.clienteDireccion,
    gpsLat: group.gpsLat,
    gpsLng: group.gpsLng,
    ruta: group.ruta,
    saldoTotal: group.saldoTotal,
    saldoMora: group.saldoMora,
    diasAtrasoMax: group.diasAtrasoMax,
  })), [pendientesGrupos]);


  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const cobradasCount = cobradas.length;
    const pendientesCount = pendientes.length;
    const porCobrar = pendientes.reduce((s, c) => s + c.saldoTotal, 0);
    const cobrado = cobradas.reduce((s, c) => s + (c.montoPagado || c.capitalInteres), 0);
    const mora = filtered.reduce((s, c) => s + c.saldoMora, 0);
    const pct = (porCobrar + cobrado) > 0 ? (cobrado / (porCobrar + cobrado)) * 100 : 0;
    return { total, cobradas: cobradasCount, pendientes: pendientesCount, porCobrar, cobrado, mora, pct };
  }, [filtered, pendientes, cobradas]);

  const collectedStopsCount = useMemo(() => new Set(cobradas.map((item) => item.prestamoId)).size, [cobradas]);

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

  // Group expand state + handler for grouped "por cobrar" cards
  const [grupoExpanded, setGrupoExpanded] = useState<Set<string>>(new Set());
  const toggleGrupo = useCallback((prestamoId: string) => {
    setGrupoExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(prestamoId)) n.delete(prestamoId); else n.add(prestamoId);
      return n;
    });
  }, []);
  const openPagoGrupo = useCallback((g: { cuotas: CuotaCobrador[]; saldoTotal: number }) => {
    const firstCuota = g.cuotas[0];
    if (!firstCuota) return;
    openPago({ ...firstCuota, saldoTotal: g.saldoTotal });
  }, [openPago]);

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

  if (role !== "admin" && !effectiveCobradorId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-3" />
            <p className="font-semibold">Sin sesión activa</p>
            <p className="text-sm text-muted-foreground mt-1">Inicia sesión para ver tu cobranza.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20 overflow-x-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h1 className="hidden text-2xl font-bold sm:block">Mi Cobranza</h1>

        {/* Date range controls */}
        <RangoFechas
          activeTab={activeTab}
          rangePreset={rangePreset}
          setRangePreset={setRangePreset}
          setHoy={setHoy}
          setSemana={setSemana}
          fechaDesde={fechaDesde}
          setFechaDesde={setFechaDesde}
          fechaHasta={fechaHasta}
          setFechaHasta={setFechaHasta}
        />
      </div>

      {/* ── Resumen Semanal ────────────────────────────────── */}
      <ResumenSemanalCard
        resumenSemanal={resumenSemanal}
        loadingResumen={loadingResumen}
        className="hidden sm:block border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
      />


      {/* ── KPI Cards (mobile: 2 cols) ─────────────────────── */}
      <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPICard label="Pendientes" value={kpis.pendientes.toString()} sub={$$(kpis.porCobrar)} icon={Clock} color="text-warning" />
        <KPICard label="Cobradas" value={kpis.cobradas.toString()} sub={$$(kpis.cobrado)} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
        <KPICard label="Mora" value={$$(kpis.mora)} icon={AlertTriangle} color="text-destructive" />
        <KPICard label="Eficiencia" value={`${kpis.pct.toFixed(0)}%`} icon={TrendingUp} color="text-primary" />
      </div>

      {/* ── Search ─────────────────────────────────────────── */}
      {["cobranza", "cartera", "historial", "pagos"].includes(activeTab) && (
        <div className={cn("relative", activeTab === "cobranza" && "hidden sm:block")}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border-border/70 bg-card pl-9 shadow-sm"
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="hidden w-full grid-cols-7 p-1 sm:grid">
          <TabsTrigger value="ruta" className="text-sm px-1 gap-1">
            <Navigation className="h-3.5 w-3.5" />Ruta
          </TabsTrigger>
          <TabsTrigger value="cobranza" className="text-[11px] sm:text-sm px-1 gap-0.5">
            Cobrar
            {kpis.pendientes > 0 && (
              <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 text-[9px] px-1">{kpis.pendientes}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cartera" className="text-[11px] sm:text-sm px-1">
            Cartera
          </TabsTrigger>
          <TabsTrigger value="historial" className="text-[11px] sm:text-sm px-1">
            Historial
          </TabsTrigger>
          <TabsTrigger value="pagos" className="text-[11px] sm:text-sm px-1">
            Pagos
          </TabsTrigger>
          <TabsTrigger value="resumen" className="hidden sm:flex text-[10px] sm:text-sm px-1">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="perfil" className="hidden sm:flex text-[10px] sm:text-sm px-1">
            Perfil
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Mi Ruta ─────────────────────────────────── */}
        <TabsContent value="ruta" className="mt-3">
          {loadingCuotas ? (
            <LoadingCards />
          ) : (
            <Suspense fallback={<LoadingCards />}>
              <MiRutaMap
                stops={routeStops}
                collectedCount={collectedStopsCount}
                collectedAmount={kpis.cobrado}
                onCollect={(stop) => {
                  const group = pendientesGrupos.find((item) => item.prestamoId === stop.prestamoId);
                  if (group) openPagoGrupo(group);
                }}
                onVisit={(stop) => {
                  const group = pendientesGrupos.find((item) => item.prestamoId === stop.prestamoId);
                  if (group?.cuotas[0]) {
                    setVisitaItem(group.cuotas[0]);
                    setVisitaOpen(true);
                  }
                }}
              />
            </Suspense>
          )}
        </TabsContent>

        {/* ── Tab: Cobranza ─────────────────────────────────── */}
        <TabsContent value="cobranza" className="mt-3 space-y-3">
          <TabCobranza
            kpis={kpis}
            pendientesGrupos={pendientesGrupos}
            search={search}
            setSearch={setSearch}
            loadingCuotas={loadingCuotas}
            filtered={filtered}
            cobranzaSubTab={cobranzaSubTab}
            setCobranzaSubTab={setCobranzaSubTab}
            collectedStopsCount={collectedStopsCount}
            grupoExpanded={grupoExpanded}
            toggleGrupo={toggleGrupo}
            openPagoGrupo={openPagoGrupo}
            navigate={navigate}
            setDrawerPrestamoId={setDrawerPrestamoId}
            setDrawerOpen={setDrawerOpen}
            setHistorialPrestamoId={setHistorialPrestamoId}
            setHistorialNombre={setHistorialNombre}
            setHistorialOpen={setHistorialOpen}
            setVisitaItem={setVisitaItem}
            setVisitaOpen={setVisitaOpen}
            setPromesaItem={setPromesaItem}
            setPromesaOpen={setPromesaOpen}
            cobradas={cobradas}
            expanded={expanded}
            toggleExpand={toggleExpand}
            openPago={openPago}
            openHistorial={openHistorial}
            openDrawer={openDrawer}
            handleResend={handleResend}
            resending={resending}
          />
        </TabsContent>

        {/* ── Tab: Cartera (todos los préstamos asignados) ──── */}
        <TabsContent value="cartera" className="mt-3 space-y-2">
          <TabCartera loadingPerfil={loadingPerfil} perfil={perfil} search={search} navigate={navigate} />
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

        {/* ── Tab: Resumen (mobile) ───────────────────────── */}
        <TabsContent value="resumen" className="mt-3 space-y-3">
          <TabResumen
            perfil={perfil}
            pendientesGrupos={pendientesGrupos}
            kpis={kpis}
            setHoy={setHoy}
            setActiveTab={setActiveTab}
            resumenSemanal={resumenSemanal}
            loadingResumen={loadingResumen}
          />
        </TabsContent>

        {/* ── Tab: Perfil ─────────────────────────────────── */}
        <TabsContent value="perfil" className="mt-3 space-y-4">
          <TabPerfil
            loadingPerfil={loadingPerfil}
            perfil={perfil}
            userEmail={user?.email}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            changingPw={changingPw}
            setChangingPw={setChangingPw}
            navigate={navigate}
          />
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
      {historialOpen && (
        <HistorialPagosModal
          open={historialOpen}
          onOpenChange={setHistorialOpen}
          prestamoId={historialPrestamoId}
          clienteNombre={historialNombre}
        />
      )}
      {drawerOpen && (
        <PrestamoQuickDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          prestamoId={drawerPrestamoId}
        />
      )}

      {/* ── Mobile bottom nav ── */}
      <MobileBottomNav activeTab={activeTab} setHoy={setHoy} setActiveTab={setActiveTab} />
    </div>
  );
}
