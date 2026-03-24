import React, { useState, useMemo } from "react";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, $$ } from "@/lib/utils";
import { GroupByDropdown } from "@/components/shared/GroupByDropdown";
import { usePersistedGroupBy } from "@/hooks/usePersistedGroupBy";
import { format, isToday, parseISO, startOfDay, addDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarIcon, Search, CheckCircle2, Clock, AlertTriangle,
  XCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Users, DollarSign,
  TrendingUp, HandCoins, Eye, MapPin, CalendarCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { PagoModal } from "@/components/PagoModal";
import { PromesaModal } from "@/components/PromesaModal";
import { VisitaModal } from "@/components/VisitaModal";

// ── Weekly cut helpers ────────────────────────────────────────────
/** Get the start date of the current "week" based on the empresa's configured start day (0=Sun..6=Sat) */
function getWeekStart(today: Date, startDay: number): Date {
  const d = startOfDay(today);
  const currentDay = d.getDay(); // 0=Sun
  let diff = currentDay - startDay;
  if (diff < 0) diff += 7;
  return addDays(d, -diff);
}

function getWeekEnd(weekStart: Date): Date {
  return addDays(weekStart, 6);
}

// Hook to fetch empresa corte config
function useEmpresaCorteConfig(empresaId: string) {
  return useQuery({
    queryKey: ["empresa-corte", empresaId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("empresas")
        .select("corte_dia_semana, corte_color_cobrado")
        .eq("id", empresaId)
        .single();
      return {
        corteDiaSemana: (data?.corte_dia_semana ?? 1) as number,
        corteColor: (data?.corte_color_cobrado || "#22c55e") as string,
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Hook to check which clients have been "attended" (pago or visita) in the current week
function useClientesAtendidosSemana(empresaId: string, weekStartStr: string, weekEndStr: string) {
  return useQuery({
    queryKey: ["clientes-atendidos-semana", empresaId, weekStartStr, weekEndStr],
    queryFn: async () => {
      // Get payments in this week
      const { data: pagos } = await supabase
        .from("pagos")
        .select("prestamo_id")
        .eq("empresa_id", empresaId)
        .eq("anulado", false)
        .gte("created_at", weekStartStr + "T00:00:00")
        .lte("created_at", weekEndStr + "T23:59:59");

      // Get visits (gestiones) in this week
      const { data: gestiones } = await supabase
        .from("crm_gestiones")
        .select("cliente_id")
        .eq("empresa_id", empresaId)
        .gte("created_at", weekStartStr + "T00:00:00")
        .lte("created_at", weekEndStr + "T23:59:59");

      // Get cliente_ids from pagos via prestamos
      const prestamoIds = [...new Set((pagos || []).map((p: any) => p.prestamo_id))];
      const clienteIdsFromGestiones = new Set((gestiones || []).map((g: any) => g.cliente_id));

      let clienteIdsFromPagos = new Set<string>();
      if (prestamoIds.length > 0) {
        const { data: prestamos } = await supabase
          .from("prestamos")
          .select("cliente_id")
          .in("id", prestamoIds);
        for (const p of prestamos || []) {
          clienteIdsFromPagos.add(p.cliente_id);
        }
      }

      // Merge both sets
      const atendidos = new Set([...clienteIdsFromPagos, ...clienteIdsFromGestiones]);
      return atendidos;
    },
    staleTime: 1000 * 60 * 2,
  });
}

// ── Data Hook ────────────────────────────────────────────────────
interface CuotaDiaria {
  cuotaId: string;
  prestamoId: string;
  clienteNombre: string;
  clienteFoto: string | null;
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
  tipoCuenta: string;
}

function useCobranzaDiaria(fecha: string, empresaId: string) {
  return useQuery({
    queryKey: ["cobranza-diaria", fecha, empresaId],
    queryFn: async () => {
      // 1) Get cuotas: due today, overdue unpaid, OR paid on this date
      const cuotas = await fetchAllRows(supabase
        .from("amortizacion")
        .select(`
          id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
          saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
          fecha_vencimiento, status, dias_atraso, fecha_pagada
        `)
        .eq("empresa_id", empresaId)
        .or(`fecha_vencimiento.eq.${fecha},and(fecha_vencimiento.lt.${fecha},status.neq.Pagada),fecha_pagada.eq.${fecha}`)
        .order("fecha_vencimiento", { ascending: true }));

      if (!cuotas || cuotas.length === 0) return [];

      // 1b) Also get cuotas with promesas for this date (status=Prometida)
      const { data: promesas } = await supabase
        .from("promesas_pago")
        .select("cuota_id")
        .eq("empresa_id", empresaId)
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
      const { data: prestamos } = await (supabase.from as any)("prestamos")
        .select(`
          id, monto_solicitado, num_cuotas, cliente_id, ruta_id, cobrador_id, caja_id, tipo_cuenta,
          clientes ( nombre_completo, foto_cliente ),
          rutas ( nombre ),
          cajas ( nombre )
        `)
        .in("id", prestamoIds);

      // 3) Get cobradores names from profiles
      const cobIds = [...new Set((prestamos || []).map((p: any) => p.cobrador_id).filter(Boolean))] as string[];
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
          clienteFoto: cliente?.foto_cliente || null,
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
          tipoCuenta: pres.tipo_cuenta || "prestamo",
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
  const [showKpis, setShowKpis] = useState(false);

  // Grouping
  const [groupByKey, setGroupByKey] = usePersistedGroupBy("cobranza");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const groupByOptions = [
    { key: "ruta", label: "Ruta" },
    { key: "cobrador", label: "Cobrador" },
    { key: "estado", label: "Estado" },
  ];
  const toggleGroup = (g: string) => {
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  };
  const handleGroupByChange = (key: string | null) => {
    setGroupByKey(key);
    setExpandedGroups(new Set());
  };

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
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; alt: string } | null>(null);

  // Navigation to detail page

  const openEstadoCuenta = (clienteId: string, _clienteNombre: string) => {
    navigate(`/cobranza/cliente/${clienteId}?fecha=${fechaStr}`);
  };

  // Weekly cut indicator
  const { data: corteConfig } = useEmpresaCorteConfig(empresaId);
  const corteDia = corteConfig?.corteDiaSemana ?? 1;
  const corteColor = corteConfig?.corteColor ?? "#22c55e";
  const weekStart = useMemo(() => getWeekStart(new Date(), corteDia), [corteDia]);
  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart]);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");
  const { data: clientesAtendidos } = useClientesAtendidosSemana(empresaId, weekStartStr, weekEndStr);

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

  // Group by client for the main view
  interface ClienteAgrupado {
    clienteId: string;
    clienteNombre: string;
    clienteFoto: string | null;
    cuotas: CuotaDiaria[];
    totalSaldo: number;
    totalMora: number;
    cuotasPendientes: number;
    cuotasCobradas: number;
    cuentasActivas: number;
    ruta: string;
    tieneVencidas: boolean;
    todasCobradas: boolean;
    atendidoSemana: boolean;
  }
  const clientesAgrupados = useMemo((): ClienteAgrupado[] => {
    const map = new Map<string, CuotaDiaria[]>();
    for (const c of filtered) {
      if (!map.has(c.clienteId)) map.set(c.clienteId, []);
      map.get(c.clienteId)!.push(c);
    }
    return Array.from(map, ([clienteId, cuotas]) => {
      const pendientes = cuotas.filter((c) => !c.pagada);
      const cobradas = cuotas.filter((c) => c.pagada);
      const cuentasIds = new Set(cuotas.map((c) => c.prestamoId));
      return {
        clienteId,
        clienteNombre: cuotas[0].clienteNombre,
        clienteFoto: cuotas[0].clienteFoto,
        cuotas,
        totalSaldo: pendientes.reduce((s, c) => s + c.saldoTotal, 0),
        totalMora: pendientes.reduce((s, c) => s + c.saldoMora, 0),
        cuotasPendientes: pendientes.length,
        cuotasCobradas: cobradas.length,
        cuentasActivas: cuentasIds.size,
        ruta: cuotas[0].ruta,
        tieneVencidas: pendientes.some((c) => c.diasAtraso > 0),
        todasCobradas: pendientes.length === 0,
        atendidoSemana: clientesAtendidos?.has(clienteId) ?? false,
      };
    }).sort((a, b) => {
      // Pending first, then by saldo desc
      if (a.todasCobradas !== b.todasCobradas) return a.todasCobradas ? 1 : -1;
      return b.totalSaldo - a.totalSaldo;
    });
  }, [filtered, clientesAtendidos]);

  // Grouped clientesAgrupados by selected key
  const groupedClientes = useMemo(() => {
    if (!groupByKey) return null;
    const groups: Record<string, typeof clientesAgrupados> = {};
    for (const cli of clientesAgrupados) {
      let key: string;
      if (groupByKey === "ruta") key = cli.ruta;
      else if (groupByKey === "cobrador") {
        const cob = cli.cuotas[0]?.cobrador || "Sin asignar";
        key = cob;
      }
      else if (groupByKey === "estado") {
        key = cli.todasCobradas ? "Cobrado" : cli.tieneVencidas ? "Vencido" : "Pendiente";
      }
      else key = "—";
      if (!groups[key]) groups[key] = [];
      groups[key].push(cli);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [clientesAgrupados, groupByKey]);

  const renderClientRow = (cli: typeof clientesAgrupados[number]) => (
    <TableRow
      key={cli.clienteId}
      className={cn(
        "text-[13px] cursor-pointer hover:bg-muted/50 transition-colors",
        cli.todasCobradas && "bg-badge-activo/20",
        cli.tieneVencidas && !cli.todasCobradas && "bg-badge-vencido/10",
      )}
      onClick={() => openEstadoCuenta(cli.clienteId, cli.clienteNombre)}
    >
      <TableCell className="px-3">
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-block h-3 w-3 rounded-full shrink-0 border border-border/40"
                style={{ backgroundColor: cli.atendidoSemana ? corteColor : "transparent" }}
              />
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {cli.atendidoSemana
                ? `Atendido esta semana (${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM", { locale: es })})`
                : `Sin atender esta semana`}
            </TooltipContent>
          </Tooltip>
          {cli.todasCobradas ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : cli.tieneVencidas ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar
            className={cn("h-8 w-8 shrink-0 rounded-lg", cli.clienteFoto && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all")}
            onClick={(e) => { e.stopPropagation(); cli.clienteFoto && setLightboxPhoto({ src: cli.clienteFoto, alt: cli.clienteNombre }); }}
          >
            {cli.clienteFoto ? <AvatarImage src={cli.clienteFoto} alt={cli.clienteNombre} className="rounded-lg object-cover" /> : null}
            <AvatarFallback className="text-[11px] font-semibold bg-primary/10 text-primary rounded-lg">
              {cli.clienteNombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{cli.clienteNombre}</span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-[12px]">{cli.cuentasActivas}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-[12px]">
          {cli.cuotasCobradas > 0 && <span className="text-success">{cli.cuotasCobradas}✓ </span>}
          {cli.cuotasPendientes > 0 && <span className="text-muted-foreground">{cli.cuotasPendientes} pte</span>}
        </span>
      </TableCell>
      <TableCell className="text-[12px] text-muted-foreground">{cli.ruta}</TableCell>
      <TableCell className={cn("text-right", cli.totalMora > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
        {cli.totalMora > 0 ? $$(cli.totalMora) : "—"}
      </TableCell>
      <TableCell className="text-right font-semibold">{$$(cli.totalSaldo)}</TableCell>
      <TableCell className="text-center">
        {cli.todasCobradas ? (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium bg-badge-activo text-badge-activo-foreground">Al día</span>
        ) : cli.tieneVencidas ? (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium bg-badge-vencido text-badge-vencido-foreground">Vencido</span>
        ) : (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium bg-badge-liquidado text-badge-liquidado-foreground">Pendiente</span>
        )}
      </TableCell>
      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
        {!cli.todasCobradas ? (
          <div className="flex items-center justify-center gap-1">
            <Button size="sm" className="h-7 text-[11px] px-2.5" onClick={() => openEstadoCuenta(cli.clienteId, cli.clienteNombre)}>
              <HandCoins className="h-3 w-3 mr-1" />Cobrar
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" title="Visita" onClick={() => {
              const first = cli.cuotas.find((c) => !c.pagada) || cli.cuotas[0];
              setVisitaItem(first); setVisitaOpen(true);
            }}>
              <MapPin className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <span className="text-[11px] text-success font-medium">✓ Cobrado</span>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Control de Cobranza</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Vista diaria de cuotas por cobrar y cobradas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px] md:text-[13px]">
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{format(fecha, "EEEE, d 'de' MMMM", { locale: es })}</span>
                <span className="sm:hidden">{format(fecha, "d MMM yyyy", { locale: es })}</span>
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

      {/* Mobile KPI Strip — compact summary, tap to expand */}
      <div className="md:hidden">
        <button
          onClick={() => setShowKpis((v) => !v)}
          className="w-full flex items-center justify-between bg-card border rounded-lg px-3 py-2"
        >
          <div className="flex items-center gap-3 text-[12px]">
            <span className="font-semibold">{kpis.cobradas}/{kpis.total}</span>
            <span className="text-muted-foreground">cobradas</span>
            <span className="text-success font-semibold">{$$(kpis.cobrado)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-destructive font-semibold">{$$(kpis.porCobrar)}</span>
            <span className="text-muted-foreground">pte</span>
          </div>
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showKpis && "rotate-90")} />
        </button>
        {showKpis && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: "Cobrado", value: $$(kpis.cobrado), color: "text-success" },
              { label: "Por Cobrar", value: $$(kpis.porCobrar), color: "text-destructive" },
              { label: "Eficiencia", value: `${kpis.porcentaje.toFixed(1)}%`, color: "text-primary" },
              { label: "Pendientes", value: kpis.pendientes, color: "text-warning" },
              { label: "Mora", value: $$(kpis.mora), color: "text-destructive" },
              { label: "Cobradas", value: kpis.cobradas, color: "text-success" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-card border rounded-lg p-2 text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">{kpi.label}</p>
                <p className={cn("text-sm font-bold", kpi.color)}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop KPI Cards */}
      <div className="hidden md:grid grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3">
        {[
          { label: "Total Cuotas", value: kpis.total, icon: Users, color: "text-foreground" },
          { label: "Cobradas", value: kpis.cobradas, icon: CheckCircle2, color: "text-success" },
          { label: "Pendientes", value: kpis.pendientes, icon: Clock, color: "text-warning" },
          { label: "Por Cobrar", value: $$(kpis.porCobrar), icon: DollarSign, color: "text-destructive" },
          { label: "Cobrado", value: $$(kpis.cobrado), icon: HandCoins, color: "text-success" },
          { label: "Mora", value: $$(kpis.mora), icon: AlertTriangle, color: "text-destructive" },
          { label: "Eficiencia", value: `${kpis.porcentaje.toFixed(1)}%`, icon: TrendingUp, color: "text-primary" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border/60">
            <CardContent className="p-2.5 md:p-3">
              <div className="flex items-center justify-between mb-0.5 md:mb-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{kpi.label}</span>
                <kpi.icon className={cn("h-3.5 w-3.5", kpi.color)} />
              </div>
              <p className={cn("text-lg font-bold", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Filters */}
      <div className="hidden md:flex bg-filter-bar border border-filter-bar-border rounded-lg px-4 py-3 flex-wrap items-center gap-3">
        <GroupByDropdown options={groupByOptions} value={groupByKey} onChange={handleGroupByChange} />
        <div className="w-px h-5 bg-border" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-[13px]" />
        </div>
        <SearchableSelect
          options={[{ value: "todas", label: "Todas las rutas" }, ...rutas.map((r) => ({ value: r.id, label: r.nombre }))]}
          value={filtroRuta}
          onValueChange={setFiltroRuta}
          placeholder="Ruta"
          searchPlaceholder="Buscar ruta..."
          triggerClassName="w-[160px] h-8 text-[13px]"
        />
        <SearchableSelect
          options={[{ value: "todos", label: "Todos los cobradores" }, ...cobradoresUnicos.map((c) => ({ value: c.id, label: c.nombre }))]}
          value={filtroCobrador}
          onValueChange={setFiltroCobrador}
          placeholder="Cobrador"
          searchPlaceholder="Buscar cobrador..."
          triggerClassName="w-[160px] h-8 text-[13px]"
        />
        <SearchableSelect
          options={[
            { value: "todos", label: "Todos" },
            { value: "pendientes", label: "Pendientes" },
            { value: "cobradas", label: "Cobradas" },
            { value: "vencidas", label: "Vencidas" },
            { value: "prometidas", label: "Prometidas" },
          ]}
          value={filtroEstado}
          onValueChange={setFiltroEstado}
          placeholder="Estado"
          triggerClassName="w-[150px] h-8 text-[13px]"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={showVencidas} onChange={(e) => setShowVencidas(e.target.checked)} className="rounded border-border" />
          Incluir vencidas
        </label>
      </div>
      {/* Mobile Filters */}
      <div className="md:hidden space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-[13px]" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SearchableSelect
            options={[{ value: "todas", label: "Todas rutas" }, ...rutas.map((r) => ({ value: r.id, label: r.nombre }))]}
            value={filtroRuta}
            onValueChange={setFiltroRuta}
            placeholder="Ruta"
            searchPlaceholder="Buscar ruta..."
            triggerClassName="h-8 text-[12px]"
          />
          <SearchableSelect
            options={[
              { value: "todos", label: "Todos" },
              { value: "pendientes", label: "Pendientes" },
              { value: "cobradas", label: "Cobradas" },
              { value: "vencidas", label: "Vencidas" },
            ]}
            value={filtroEstado}
            onValueChange={setFiltroEstado}
            placeholder="Estado"
            triggerClassName="h-8 text-[12px]"
          />
        </div>
      </div>

      {/* Summary by Route */}
      {byRuta.length > 1 && (
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      {/* Main Client List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : clientesAgrupados.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
            <p className="text-lg font-semibold">Sin cuotas pendientes</p>
            <p className="text-sm text-muted-foreground">No hay cuotas programadas para esta fecha.</p>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Desktop Table — grouped by client */}
        <div className="hidden md:block border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header">
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold w-8"></TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Cliente</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Cuentas</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Cuotas Hoy</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Ruta</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Mora</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Saldo del Día</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Estado</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedClientes ? (
                <>
                  {groupedClientes.map(([groupName, items]) => {
                    const isExpanded = expandedGroups.has(groupName);
                    const sumSaldo = items.reduce((s, c) => s + c.totalSaldo, 0);
                    const sumMora = items.reduce((s, c) => s + c.totalMora, 0);
                    const totalClientes = items.length;
                    const totalCobradas = items.reduce((s, c) => s + c.cuotasCobradas, 0);
                    const totalPendientes = items.reduce((s, c) => s + c.cuotasPendientes, 0);
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
                            <span className="ml-2 text-[11px] text-muted-foreground font-medium">({totalClientes})</span>
                          </TableCell>
                          {/* Cuentas - empty */}
                          <TableCell className="px-3 py-2" />
                          {/* Cuotas Hoy */}
                          <TableCell className="text-center px-3 py-2">
                            <span className="text-[12px]">
                              <span className="text-success font-semibold">{totalCobradas}✓</span>
                              <span className="text-muted-foreground"> / {totalPendientes} pte</span>
                            </span>
                          </TableCell>
                          {/* Ruta - empty */}
                          <TableCell className="px-3 py-2" />
                          {/* Mora */}
                          <TableCell className="text-right px-3 py-2">
                            <span className={cn("font-semibold text-[12px]", sumMora > 0 ? "text-destructive" : "text-muted-foreground")}>{sumMora > 0 ? $$(sumMora) : "—"}</span>
                          </TableCell>
                          {/* Saldo */}
                          <TableCell className="text-right px-3 py-2">
                            <span className="font-semibold text-[12px]">{$$(sumSaldo)}</span>
                          </TableCell>
                          {/* Estado - empty */}
                          <TableCell className="px-3 py-2" />
                          {/* Acciones - empty */}
                          <TableCell className="px-3 py-2" />
                        </TableRow>
                        {isExpanded && items.map((cli) => renderClientRow(cli))}
                      </React.Fragment>
                    );
                  })}
                </>
              ) : (
                clientesAgrupados.map((cli) => renderClientRow(cli))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View — grouped by client */}
        <div className="md:hidden space-y-2">
          {clientesAgrupados.map((cli) => (
            <div
              key={cli.clienteId}
              className={cn(
                "bg-card border rounded-lg overflow-hidden",
                cli.todasCobradas && "border-success/30 bg-badge-activo/10",
                cli.tieneVencidas && !cli.todasCobradas && "border-destructive/30 bg-badge-vencido/5",
              )}
            >
              {/* Info row — tappable to go to estado de cuenta */}
              <div
                className="flex items-center gap-2.5 p-3 cursor-pointer active:bg-muted/40 transition-colors"
                onClick={() => openEstadoCuenta(cli.clienteId, cli.clienteNombre)}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0 border border-border/40"
                  style={{ backgroundColor: cli.atendidoSemana ? corteColor : "transparent" }}
                />
                {cli.tieneVencidas && !cli.todasCobradas && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                <Avatar
                  className="h-9 w-9 shrink-0 rounded-lg"
                  onClick={(e) => { e.stopPropagation(); cli.clienteFoto && setLightboxPhoto({ src: cli.clienteFoto, alt: cli.clienteNombre }); }}
                >
                  {cli.clienteFoto ? <AvatarImage src={cli.clienteFoto} alt={cli.clienteNombre} className="rounded-lg object-cover" /> : null}
                  <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary rounded-lg">
                    {cli.clienteNombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[13px] truncate uppercase">{cli.clienteNombre}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {cli.cuentasActivas} cuenta{cli.cuentasActivas !== 1 ? "s" : ""} · {cli.cuotasPendientes} cuota{cli.cuotasPendientes !== 1 ? "s" : ""} pte · {cli.ruta}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[15px]">{$$(cli.totalSaldo)}</p>
                  {cli.totalMora > 0 && <p className="text-[9px] text-destructive font-medium">+{$$(cli.totalMora)} mora</p>}
                </div>
              </div>

              {/* Action bar */}
              {!cli.todasCobradas ? (
                <div className="flex items-center gap-2 px-3 pb-3" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    className="h-9 text-[13px] flex-1 font-semibold gap-2"
                    onClick={() => {
                      const first = cli.cuotas.find((c) => !c.pagada);
                      if (first) openPago(first);
                    }}
                  >
                    <HandCoins className="h-4 w-4" />Cobrar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-[11px] gap-1"
                    onClick={() => openEstadoCuenta(cli.clienteId, cli.clienteNombre)}
                  >
                    <Eye className="h-3.5 w-3.5" />Detalle
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                    const first = cli.cuotas.find((c) => !c.pagada) || cli.cuotas[0];
                    setVisitaItem(first); setVisitaOpen(true);
                  }}>
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="px-3 pb-2.5">
                  <p className="text-[11px] text-success font-medium">✓ Todas las cuotas cobradas</p>
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {/* Payment Modal (direct from old flow, kept for backwards compat) */}
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
      {lightboxPhoto && (
        <PhotoLightbox open={!!lightboxPhoto} onOpenChange={(o) => !o && setLightboxPhoto(null)} src={lightboxPhoto.src} alt={lightboxPhoto.alt} />
      )}
    </div>
  );
}
