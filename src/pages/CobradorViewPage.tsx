import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useCan } from "@/hooks/usePermisos";
import { useNavigate } from "react-router-dom";
import { format, parseISO, startOfDay, endOfDay, isToday, addDays, subDays, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$, fmtDate, fmtDateTime } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PagoModal } from "@/components/PagoModal";
import { VisitaModal } from "@/components/VisitaModal";
import { PromesaModal } from "@/components/PromesaModal";
import { HistorialPagosModal } from "@/components/cobranza/HistorialPagosModal";
import { PrestamoQuickDrawer } from "@/components/cobranza/PrestamoQuickDrawer";
import { resendReceiptForPrestamo } from "@/lib/resendReceipt";
import {
  CalendarIcon, Search, CheckCircle2, Clock, AlertTriangle,
  HandCoins, ChevronLeft, ChevronRight, DollarSign, TrendingUp,
  Eye, Phone, MapPin, Filter, X, Receipt, History, MessageSquare, CalendarCheck,
  User, Lock, Wallet, FileText, Briefcase, Send, ChevronDown, ChevronUp, Loader2,
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
function useCobranzaRango(fechaDesde: string, fechaHasta: string, empresaId: string, cobradorId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["cobrador-cobranza", fechaDesde, fechaHasta, empresaId, cobradorId],
    enabled: enabled && !!empresaId,
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
        .or(
          `and(fecha_vencimiento.gte.${fechaDesde},fecha_vencimiento.lte.${fechaHasta}),` +
          `and(fecha_vencimiento.lt.${fechaDesde},status.neq.Pagada),` +
          // Cuotas vencidas antes del rango pero PAGADAS dentro del rango
          `and(fecha_pagada.gte.${fechaDesde},fecha_pagada.lte.${fechaHasta})`
        )
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

function usePagosCobrador(fechaDesde: string, fechaHasta: string, empresaId: string, cobradorId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["cobrador-pagos", fechaDesde, fechaHasta, empresaId, cobradorId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      let pagosQuery = supabase
        .from("pagos")
        .select(`
          id, prestamo_id, monto_recibido, aplicado_capital, aplicado_interes,
          aplicado_mora, metodo_pago, created_at, anulado, cuota_id,
          prestamos!inner ( cliente_id, clientes ( nombre_completo ) ),
          amortizacion:cuota_id ( num_cuota )
        `)
        .eq("empresa_id", empresaId)
        .gte("created_at", `${fechaDesde}T00:00:00`)
        .lte("created_at", `${fechaHasta}T23:59:59`)
        .order("created_at", { ascending: false });

      if (cobradorId) {
        pagosQuery = pagosQuery.eq("cobrador_id", cobradorId);
      }

      const { data, error } = await pagosQuery;

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

// ── Get empresa week start day ──────────────────────────────────
function useEmpresaSemana(empresaId: string) {
  return useQuery({
    queryKey: ["empresa-semana", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("empresas")
        .select("corte_dia_semana")
        .eq("id", empresaId)
        .single();
      return (data?.corte_dia_semana ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    },
    staleTime: 10 * 60 * 1000,
  });
}

function getWeekRange(weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  const start = startOfWeek(new Date(), { weekStartsOn });
  const end = endOfWeek(new Date(), { weekStartsOn });
  return { start, end };
}

// ── Weekly summary hook ─────────────────────────────────────────
function useResumenSemanal(empresaId: string, cobradorId: string | null, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6, enabled = true) {
  const { start, end } = getWeekRange(weekStartsOn);
  const desde = format(start, "yyyy-MM-dd");
  const hasta = format(end, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["cobrador-resumen-semanal", desde, hasta, empresaId, cobradorId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      // Cuotas that fall in this week
      const { data: cuotas } = await supabase
        .from("amortizacion")
        .select("id, prestamo_id, capital_interes, saldo_total, status, fecha_vencimiento")
        .eq("empresa_id", empresaId)
        .gte("fecha_vencimiento", desde)
        .lte("fecha_vencimiento", hasta);

      if (!cuotas?.length) return { porCobrar: 0, cobrado: 0, total: 0, pct: 0, start, end };

      // Filter by cobrador
      const prestamoIds = [...new Set(cuotas.map((c) => c.prestamo_id))];
      let prestamosQuery = supabase
        .from("prestamos")
        .select("id")
        .in("id", prestamoIds);

      if (cobradorId) {
        prestamosQuery = prestamosQuery.eq("cobrador_id", cobradorId);
      }

      const { data: prestamos } = await prestamosQuery;

      const validIds = new Set((prestamos || []).map((p) => p.id));
      const filtered = cuotas.filter((c) => validIds.has(c.prestamo_id));

      // Payments received this week for these cuotas
      const cuotaIds = filtered.map((c) => c.id);
      let pagadoTotal = 0;
      if (cuotaIds.length > 0) {
        const { data: pagos } = await supabase
          .from("pagos")
          .select("monto_recibido")
          .in("cuota_id", cuotaIds)
          .eq("anulado", false)
          .eq("empresa_id", empresaId);
        pagadoTotal = (pagos || []).reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      }

      const totalEsperado = filtered.reduce((s, c) => s + Number(c.capital_interes || 0), 0);
      const porCobrar = Math.max(0, totalEsperado - pagadoTotal);
      const pct = totalEsperado > 0 ? Math.min(100, (pagadoTotal / totalEsperado) * 100) : 0;

      return { porCobrar, cobrado: pagadoTotal, total: totalEsperado, pct, start, end };
    },
    staleTime: 30 * 1000,
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

// Profile data for cobrador
function usePerfilCobrador(cobradorId: string | null, empresaId: string, enabled = true) {
  return useQuery({
    queryKey: ["cobrador-perfil", cobradorId, empresaId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      // Profile info
      const { data: profile } = await supabase
        .from("profiles")
        .select("nombre_completo, telefono, direccion, foto_url, porcentaje_comision, efectivo_en_mano, comision_tipo, comision_prestamos, comision_cobros_equipo, bono_meta_objetivo, bono_meta_monto")
        .eq("id", cobradorId!)
        .single();

      // Comisiones ganadas (cortes)
      const { data: cortes } = await supabase
        .from("cortes")
        .select("id, monto_comision, monto_efectivo, monto_depositado, total_cobrado, created_at")
        .eq("cobrador_id", cobradorId!)
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(50);

      const totalComisionesGanadas = (cortes || []).reduce((s, c) => s + Number(c.monto_comision || 0), 0);
      const totalCobrado = (cortes || []).reduce((s, c) => s + Number(c.total_cobrado || 0), 0);

      // All assigned loans (active)
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select(`
          id, monto_solicitado, monto_total_pagar, num_cuotas, estado, fecha_registro,
          frecuencia, fecha_primer_pago,
          clientes ( nombre_completo ),
          rutas ( nombre )
        `)
        .eq("cobrador_id", cobradorId!)
        .eq("empresa_id", empresaId)
        .in("estado", ["Activo", "Al día", "Vencido"])
        .order("created_at", { ascending: false });

      // Get amortization summary for each loan
      const prestamoIds = (prestamos || []).map(p => p.id);
      let amortSummary: Record<string, { pagadas: number; saldo: number; mora: number }> = {};
      if (prestamoIds.length > 0) {
        const { data: amort } = await supabase
          .from("amortizacion")
          .select("prestamo_id, status, saldo_total, saldo_mora")
          .in("prestamo_id", prestamoIds);
        for (const a of amort || []) {
          if (!amortSummary[a.prestamo_id]) amortSummary[a.prestamo_id] = { pagadas: 0, saldo: 0, mora: 0 };
          if (a.status === "Pagada") amortSummary[a.prestamo_id].pagadas += 1;
          amortSummary[a.prestamo_id].saldo += Number(a.saldo_total || 0);
          amortSummary[a.prestamo_id].mora += Number(a.saldo_mora || 0);
        }
      }

      return {
        profile,
        cortes: cortes || [],
        totalComisionesGanadas,
        totalCobrado,
        prestamos: (prestamos || []).map((p: any) => ({
          id: p.id,
          cliente: p.clientes?.nombre_completo || "—",
          ruta: p.rutas?.nombre || "Sin ruta",
          monto: Number(p.monto_solicitado || 0),
          montoPagar: Number(p.monto_total_pagar || 0),
          cuotas: p.num_cuotas,
          estado: p.estado,
          frecuencia: p.frecuencia,
          pagadas: amortSummary[p.id]?.pagadas || 0,
          saldo: amortSummary[p.id]?.saldo || 0,
          mora: amortSummary[p.id]?.mora || 0,
        })),
      };
    },
  });
}

function useProfileEmpresa(userId: string | undefined) {
  return useQuery({
    queryKey: ["current-profile-empresa", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", userId!)
        .single();
      return data?.empresa_id || "";
    },
    staleTime: 10 * 60 * 1000,
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
  const { cobradorId, role, profileId } = useCurrentUserRole();
  const { user } = useAuth();
  const canView = useCan("mi_cobranza", "ver");
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
  const [activeTab, setActiveTab] = useState("cobranza");
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

  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-3" />
            <p className="font-semibold">Acceso restringido</p>
            <p className="text-sm text-muted-foreground mt-1">No tienes permisos para ver Mi Cobranza.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

      {/* ── Resumen Semanal ────────────────────────────────── */}
      <Card className="hidden sm:block border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Resumen Semanal</span>
            </div>
            {resumenSemanal && (
              <span className="text-[10px] text-muted-foreground">
                {format(resumenSemanal.start, "dd/MM", { locale: es })} — {format(resumenSemanal.end, "dd/MM", { locale: es })}
              </span>
            )}
          </div>

          {loadingResumen ? (
            <Skeleton className="h-16 w-full" />
          ) : resumenSemanal ? (
            <>
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Cobrado</span>
                    <span className="font-bold text-primary">{$$(resumenSemanal.cobrado)}</span>
                  </div>
                  <Progress value={resumenSemanal.pct} className="h-3" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Meta semanal</span>
                    <span className="font-semibold">{$$(resumenSemanal.total)}</span>
                  </div>
                </div>
                <div className="text-center shrink-0">
                  <span className="text-3xl" role="img" aria-label="estado">
                    {resumenSemanal.pct >= 100 ? "🎉" : resumenSemanal.pct >= 70 ? "😊" : resumenSemanal.pct >= 40 ? "😐" : "😟"}
                  </span>
                  <p className="text-[10px] font-bold text-primary mt-0.5">{resumenSemanal.pct.toFixed(0)}%</p>
                </div>
              </div>
              {resumenSemanal.porCobrar > 0 && (
                <p className="text-xs text-muted-foreground">
                  Falta por cobrar: <span className="font-semibold text-foreground">{$$(resumenSemanal.porCobrar)}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Sin datos para esta semana</p>
          )}
        </CardContent>
      </Card>

      {/* ── KPI Cards (mobile: 2 cols) ─────────────────────── */}
      <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-2">
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
        <TabsList className="w-full grid grid-cols-6 h-10 p-1">
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
          <TabsTrigger value="resumen" className="text-[10px] sm:text-sm px-1">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="perfil" className="text-[10px] sm:text-sm px-1">
            Perfil
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Cobranza ─────────────────────────────────── */}
        <TabsContent value="cobranza" className="mt-3 space-y-2">
          {loadingCuotas ? (
            <LoadingCards />
          ) : filtered.length === 0 ? (
            <EmptyCard icon={CheckCircle2} title="Sin cuotas en este rango" subtitle="No hay cuotas asignadas para este periodo." />
          ) : (
            <Tabs value={cobranzaSubTab} onValueChange={(v) => setCobranzaSubTab(v as "por-cobrar" | "cobradas")} className="w-full">
              <TabsList className="w-full grid grid-cols-2 h-9 p-1">
                <TabsTrigger value="por-cobrar" className="text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  Por cobrar
                  {pendientes.length > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 text-[9px] px-1">{pendientes.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="cobradas" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Cobradas
                  {cobradas.length > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 text-[9px] px-1">{cobradas.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="por-cobrar" className="mt-3 space-y-2">
                {pendientes.length === 0 ? (
                  <EmptyCard icon={CheckCircle2} title="¡Todo cobrado!" subtitle="No tienes cuotas pendientes en este rango." />
                ) : pendientes.map((item) => (
                  <CuotaCard
                    key={item.cuotaId}
                    item={item}
                    expanded={expanded.has(item.cuotaId)}
                    onToggleExpand={() => toggleExpand(item.cuotaId)}
                    onCobrar={openPago}
                    onNavigate={navigate}
                    onVisita={(i) => { setVisitaItem(i); setVisitaOpen(true); }}
                    onPromesa={(i) => { setPromesaItem(i); setPromesaOpen(true); }}
                    onHistorial={openHistorial}
                    onDrawer={openDrawer}
                    onResend={handleResend}
                    resending={resending === item.prestamoId}
                  />
                ))}
              </TabsContent>

              <TabsContent value="cobradas" className="mt-3 space-y-2">
                {cobradas.length === 0 ? (
                  <EmptyCard icon={Clock} title="Aún no cobras nada" subtitle="Las cuotas que cobres aparecerán aquí." />
                ) : cobradas.map((item) => (
                  <CuotaCard
                    key={item.cuotaId}
                    item={item}
                    expanded={expanded.has(item.cuotaId)}
                    onToggleExpand={() => toggleExpand(item.cuotaId)}
                    onCobrar={openPago}
                    onNavigate={navigate}
                    onVisita={(i) => { setVisitaItem(i); setVisitaOpen(true); }}
                    onPromesa={(i) => { setPromesaItem(i); setPromesaOpen(true); }}
                    onHistorial={openHistorial}
                    onDrawer={openDrawer}
                    onResend={handleResend}
                  resending={resending === item.prestamoId}
                />
              ))}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        {/* ── Tab: Cartera (todos los préstamos asignados) ──── */}
        <TabsContent value="cartera" className="mt-3 space-y-2">
          {loadingPerfil ? (
            <LoadingCards />
          ) : (perfil?.prestamos || []).length === 0 ? (
            <EmptyCard icon={Briefcase} title="Sin préstamos" subtitle="No tienes préstamos asignados." />
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Préstamos</p>
                  <p className="text-lg font-bold text-primary">{perfil!.prestamos.length}</p>
                </div>
                <div className="bg-secondary rounded-lg p-3 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Saldo total</p>
                  <p className="text-lg font-bold">{$$(perfil!.prestamos.reduce((s: number, p: any) => s + p.saldo, 0))}</p>
                </div>
                <div className="bg-destructive/10 rounded-lg p-3 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mora total</p>
                  <p className="text-lg font-bold text-destructive">{$$(perfil!.prestamos.reduce((s: number, p: any) => s + p.mora, 0))}</p>
                </div>
              </div>

              {/* Loan cards */}
              {perfil!.prestamos
                .filter((p: any) => !search || p.cliente.toLowerCase().includes(search.toLowerCase()))
                .map((p: any) => (
                <Card key={p.id} className="border-border/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.cliente}</p>
                        <p className="text-[11px] text-muted-foreground">{p.ruta} • {p.frecuencia}</p>
                      </div>
                      <Badge variant={p.estado === "Vencido" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                        {p.estado}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center bg-secondary/50 rounded-md p-2">
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Monto</p>
                        <p className="text-xs font-semibold">{$$(p.monto)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Total</p>
                        <p className="text-xs font-semibold">{$$(p.montoPagar)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Saldo</p>
                        <p className="text-xs font-semibold">{$$(p.saldo)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Cuotas</p>
                        <p className="text-xs font-semibold">{p.pagadas}/{p.cuotas}</p>
                      </div>
                    </div>
                    {p.mora > 0 && (
                      <p className="text-[11px] text-destructive font-medium">Mora: {$$(p.mora)}</p>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => navigate(`/prestamos/${p.id}`)}>
                      <Eye className="h-3 w-3 mr-1" /> Ver detalle
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </>
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
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Resumen Semanal</span>
                </div>
                {resumenSemanal && (
                  <span className="text-[10px] text-muted-foreground">
                    {format(resumenSemanal.start, "dd/MM", { locale: es })} — {format(resumenSemanal.end, "dd/MM", { locale: es })}
                  </span>
                )}
              </div>
              {loadingResumen ? (
                <Skeleton className="h-16 w-full" />
              ) : resumenSemanal ? (
                <>
                  <div className="flex items-end justify-between gap-4">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Cobrado</span>
                        <span className="font-bold text-primary">{$$(resumenSemanal.cobrado)}</span>
                      </div>
                      <Progress value={resumenSemanal.pct} className="h-3" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Meta semanal</span>
                        <span className="font-semibold">{$$(resumenSemanal.total)}</span>
                      </div>
                    </div>
                    <div className="text-center shrink-0">
                      <span className="text-3xl" role="img" aria-label="estado">
                        {resumenSemanal.pct >= 100 ? "🎉" : resumenSemanal.pct >= 70 ? "😊" : resumenSemanal.pct >= 40 ? "😐" : "😟"}
                      </span>
                      <p className="text-[10px] font-bold text-primary mt-0.5">{resumenSemanal.pct.toFixed(0)}%</p>
                    </div>
                  </div>
                  {resumenSemanal.porCobrar > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Falta por cobrar: <span className="font-semibold text-foreground">{$$(resumenSemanal.porCobrar)}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">Sin datos para esta semana</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <KPICard label="Pendientes" value={kpis.pendientes.toString()} sub={$$(kpis.porCobrar)} icon={Clock} color="text-warning" />
            <KPICard label="Cobradas" value={kpis.cobradas.toString()} sub={$$(kpis.cobrado)} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
            <KPICard label="Mora" value={$$(kpis.mora)} icon={AlertTriangle} color="text-destructive" />
            <KPICard label="Eficiencia" value={`${kpis.pct.toFixed(0)}%`} icon={TrendingUp} color="text-primary" />
          </div>
        </TabsContent>

        {/* ── Tab: Perfil ─────────────────────────────────── */}
        <TabsContent value="perfil" className="mt-3 space-y-4">
          {loadingPerfil ? (
            <LoadingCards />
          ) : (
            <>
              {/* Profile info */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{perfil?.profile?.nombre_completo || "—"}</p>
                      <p className="text-xs text-muted-foreground">{user?.email || "—"}</p>
                      {perfil?.profile?.telefono && (
                        <p className="text-xs text-muted-foreground">{perfil.profile.telefono}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center bg-secondary/50 rounded-md p-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Comisión</p>
                      <p className="text-sm font-bold">{perfil?.profile?.porcentaje_comision || 0}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Efectivo en mano</p>
                      <p className="text-sm font-bold">{$$(Number(perfil?.profile?.efectivo_en_mano || 0))}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Commissions summary */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    Comisiones
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-primary/10 rounded-lg p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total ganadas</p>
                      <p className="text-lg font-bold text-primary">{$$(perfil?.totalComisionesGanadas || 0)}</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total cobrado</p>
                      <p className="text-lg font-bold">{$$(perfil?.totalCobrado || 0)}</p>
                    </div>
                  </div>

                  {/* Recent cortes */}
                  {(perfil?.cortes || []).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Últimos cortes</p>
                      <div className="space-y-1.5">
                        {perfil!.cortes.slice(0, 5).map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between bg-secondary/50 rounded-md px-3 py-2">
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(c.created_at)}
                            </span>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-primary">{$$(Number(c.monto_comision))}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">de {$$(Number(c.total_cobrado))}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Change password */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Cambiar contraseña
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nueva contraseña</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confirmar contraseña</Label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repetir contraseña" />
                  </div>
                  <Button
                    className="w-full"
                    disabled={changingPw || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                    onClick={async () => {
                      setChangingPw(true);
                      const { error } = await supabase.auth.updateUser({ password: newPassword });
                      setChangingPw(false);
                      if (error) {
                        toast.error("Error al cambiar contraseña: " + error.message);
                      } else {
                        toast.success("Contraseña actualizada correctamente");
                        setNewPassword("");
                        setConfirmPassword("");
                      }
                    }}
                  >
                    {changingPw ? "Guardando..." : "Actualizar contraseña"}
                  </Button>
                  {newPassword && newPassword.length < 6 && (
                    <p className="text-xs text-destructive">La contraseña debe tener al menos 6 caracteres</p>
                  )}
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
                  )}
                </CardContent>
              </Card>

              {/* Assigned loans */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Préstamos asignados ({perfil?.prestamos?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                  {(perfil?.prestamos || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Sin préstamos asignados</p>
                  ) : (
                    perfil!.prestamos.map((p: any) => (
                      <div key={p.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.cliente}</p>
                            <p className="text-[11px] text-muted-foreground">{p.ruta} • {p.frecuencia}</p>
                          </div>
                          <Badge variant={p.estado === "Vencido" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                            {p.estado}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center bg-secondary/50 rounded-md p-2">
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Monto</p>
                            <p className="text-xs font-semibold">{$$(p.monto)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Saldo</p>
                            <p className="text-xs font-semibold">{$$(p.saldo)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Cuotas</p>
                            <p className="text-xs font-semibold">{p.pagadas}/{p.cuotas}</p>
                          </div>
                        </div>
                        {p.mora > 0 && (
                          <p className="text-[11px] text-destructive font-medium">Mora: {$$(p.mora)}</p>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => navigate(`/prestamos/${p.id}`)}>
                          <Eye className="h-3 w-3 mr-1" /> Ver detalle
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
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

function CuotaCard({
  item, onCobrar, onNavigate, onVisita, onPromesa, showDate,
  expanded, onToggleExpand, onHistorial, onDrawer, onResend, resending,
}: {
  item: CuotaCobrador;
  onCobrar: (item: CuotaCobrador) => void;
  onNavigate: (path: string) => void;
  onVisita?: (item: CuotaCobrador) => void;
  onPromesa?: (item: CuotaCobrador) => void;
  showDate?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onHistorial?: (item: CuotaCobrador) => void;
  onDrawer?: (item: CuotaCobrador) => void;
  onResend?: (item: CuotaCobrador) => void;
  resending?: boolean;
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
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
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
        <div className="flex items-center gap-1.5 flex-wrap">
          {!item.pagada ? (
            <>
              <Button
                size="sm"
                className="h-8 text-[11px] font-medium min-w-0 flex-1"
                onClick={() => onCobrar(item)}
              >
                <HandCoins className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span className="truncate">Cobrar {$$(item.saldoTotal)}</span>
              </Button>
              <div className="flex items-center gap-1 shrink-0">
                {item.clienteTelefono && (
                  <>
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => window.open(`tel:${item.clienteTelefono}`, "_blank")}>
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-green-600"
                      onClick={() => window.open(`https://wa.me/${item.clienteTelefono?.replace(/\D/g, "")}`, "_blank")}>
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {onVisita && (
                  <Button variant="outline" size="icon" className="h-8 w-8" title="Registrar visita"
                    onClick={() => onVisita(item)}>
                    <MapPin className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onPromesa && item.status !== "Prometida" && (
                  <Button variant="outline" size="icon" className="h-8 w-8" title="Promesa de pago"
                    onClick={() => onPromesa(item)}>
                    <CalendarCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="outline" size="icon" className="h-8 w-8" title="Ver préstamo"
                  onClick={() => onDrawer ? onDrawer(item) : onNavigate(`/prestamos/${item.prestamoId}`)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {onToggleExpand && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Más"
                    onClick={onToggleExpand}>
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Cobrado {$$(item.montoPagado || item.capitalInteres)}
              </span>
              <div className="flex items-center gap-1">
                {onResend && (
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={resending}
                    onClick={() => onResend(item)} title="Reenviar último ticket">
                    {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    Reenviar
                  </Button>
                )}
                {onHistorial && (
                  <Button variant="outline" size="sm" className="h-7 text-[11px]"
                    onClick={() => onHistorial(item)}>
                    <Receipt className="h-3 w-3 mr-1" /> Pagos
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => onDrawer ? onDrawer(item) : onNavigate(`/prestamos/${item.prestamoId}`)}>
                  <Eye className="h-3 w-3 mr-1" /> Ver
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Expanded actions panel */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {onDrawer && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => onDrawer(item)}>
                <FileText className="h-3 w-3 mr-1" /> Préstamo
              </Button>
            )}
            {onHistorial && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => onHistorial(item)}>
                <Receipt className="h-3 w-3 mr-1" /> Pagos
              </Button>
            )}
            {onResend && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]" disabled={resending}
                onClick={() => onResend(item)}>
                {resending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                Reenviar ticket
              </Button>
            )}
            {item.clienteDireccion && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]"
                onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.clienteDireccion!)}`, "_blank")}>
                <MapPin className="h-3 w-3 mr-1" /> Mapa
              </Button>
            )}
          </div>
        )}

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
                {fmtDateTime(pago.fechaPago)}
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
