import { useState } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet, HandCoins, Receipt, CreditCard, Loader2, UserCheck,
  ArrowDownToLine, MinusCircle, ClipboardList, Users, DollarSign,
  MapPin, Eye, ChevronRight, FileText, TrendingUp, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$ } from "@/lib/utils";

interface Cobrador {
  id: string;
  nombre: string;
  telefono: string | null;
  porcentaje_comision: number;
  efectivo_en_mano: number;
  activo: boolean;
}

function useCobradores(empresaId: string) {
  return useQuery({
    queryKey: ["cobradores", empresaId],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "cobrador");
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nombre_completo, telefono, porcentaje_comision, efectivo_en_mano, activo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .in("id", userIds)
        .order("nombre_completo");
      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id,
        nombre: p.nombre_completo,
        telefono: p.telefono,
        porcentaje_comision: Number(p.porcentaje_comision || 0),
        efectivo_en_mano: Number(p.efectivo_en_mano || 0),
        activo: p.activo,
      })) as Cobrador[];
    },
  });
}

function useCajas(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-all", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre, saldo_actual").eq("empresa_id", empresaId).order("nombre");
      return data || [];
    },
  });
}

function useLiquidaciones(empresaId: string) {
  return useQuery({
    queryKey: ["liquidaciones", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cortes")
        .select("*, cajas ( nombre )")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!data?.length) return [];

      const cobIds = [...new Set(data.map((d: any) => d.cobrador_id).filter(Boolean))];
      let cobMap: Record<string, string> = {};
      if (cobIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nombre_completo")
          .in("id", cobIds);
        for (const p of profiles || []) cobMap[p.id] = p.nombre_completo;
      }

      return data.map((l: any) => ({ ...l, cobrador_nombre: cobMap[l.cobrador_id] || "—" }));
    },
  });
}

/** Daily report data for a specific cobrador */
function useDailyReport(empresaId: string, cobradorId: string | null) {
  return useQuery({
    queryKey: ["daily-report", empresaId, cobradorId],
    queryFn: async () => {
      if (!cobradorId) return null;
      const today = format(new Date(), "yyyy-MM-dd");

      // 1) Pagos del día hechos por este cobrador
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, monto_recibido, metodo_pago, prestamo_id, fecha_pago, anulado, aplicado_capital, aplicado_interes, aplicado_mora, created_at")
        .eq("empresa_id", empresaId)
        .eq("cobrador_id", cobradorId)
        .eq("fecha_pago", today)
        .eq("anulado", false)
        .order("created_at", { ascending: true });

      const pagosList = pagos || [];

      // 2) Get unique prestamo_ids to fetch client info
      const prestamoIds = [...new Set(pagosList.map((p) => p.prestamo_id))];
      let prestamoClientes: Record<string, { cliente_nombre: string; id_prestamo: string; ruta_nombre: string }> = {};
      if (prestamoIds.length) {
        const { data: prestamos } = await supabase
          .from("prestamos")
          .select("id, id_prestamo, cliente_id, ruta_id, clientes ( nombre_completo ), rutas ( nombre )")
          .in("id", prestamoIds);
        for (const pr of (prestamos || []) as any[]) {
          prestamoClientes[pr.id] = {
            cliente_nombre: pr.clientes?.nombre_completo || "—",
            id_prestamo: pr.id_prestamo || "—",
            ruta_nombre: pr.rutas?.nombre || "—",
          };
        }
      }

      // 3) Visitas del día (from crm_gestiones)
      const { data: visitas } = await supabase
        .from("crm_gestiones")
        .select("id, tipo_gestion, resultado, notas, cliente_id, created_at, clientes ( nombre_completo )")
        .eq("empresa_id", empresaId)
        .eq("registrado_por", cobradorId)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .order("created_at", { ascending: true });

      // 4) Promesas registradas hoy
      const { data: promesas } = await supabase
        .from("promesas_pago")
        .select("id, monto_prometido, fecha_prometida, prestamo_id, created_at")
        .eq("empresa_id", empresaId)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);

      // 5) Cuotas que debían cobrarse hoy para este cobrador (expected)
      // First get prestamo IDs for this cobrador
      const { data: cobPrestamos } = await supabase
        .from("prestamos")
        .select("id, id_prestamo, cliente_id, clientes ( nombre_completo )")
        .eq("cobrador_id", cobradorId)
        .eq("empresa_id", empresaId)
        .in("estado", ["Activo", "Vencido"]);

      const cobPrestamoIds = (cobPrestamos || []).map((p: any) => p.id);
      let cuotasHoy: any[] = [];
      if (cobPrestamoIds.length) {
        const { data } = await supabase
          .from("amortizacion")
          .select("id, num_cuota, capital_interes, saldo_total, status, prestamo_id")
          .eq("fecha_vencimiento", today)
          .eq("empresa_id", empresaId)
          .in("prestamo_id", cobPrestamoIds);
        cuotasHoy = data || [];
      }
      const cobPrestamoMap: Record<string, any> = {};
      for (const p of (cobPrestamos || []) as any[]) cobPrestamoMap[p.id] = p;

      // 6) Gastos del cobrador hoy (from movimientos_caja)
      const { data: movimientos } = await supabase
        .from("movimientos_caja")
        .select("id, monto, concepto, tipo, created_at")
        .eq("empresa_id", empresaId)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .like("concepto", `%${cobradorId}%`);

      // Build enriched pagos
      const pagosEnriched = pagosList.map((p) => ({
        ...p,
        ...(prestamoClientes[p.prestamo_id] || { cliente_nombre: "—", id_prestamo: "—", ruta_nombre: "—" }),
      }));

      // Totals
      const totalCobrado = pagosList.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
      const totalCapital = pagosList.reduce((s, p) => s + Number(p.aplicado_capital || 0), 0);
      const totalInteres = pagosList.reduce((s, p) => s + Number(p.aplicado_interes || 0), 0);
      const totalMora = pagosList.reduce((s, p) => s + Number(p.aplicado_mora || 0), 0);

      // By payment method
      const porMetodo: Record<string, number> = {};
      for (const p of pagosList) {
        const m = p.metodo_pago || "Efectivo";
        porMetodo[m] = (porMetodo[m] || 0) + Number(p.monto_recibido || 0);
      }

      // Expected today
      const cuotasExpected = (cuotasHoy || []).map((c: any) => {
        const pr = cobPrestamoMap[c.prestamo_id];
        return {
          id: c.id,
          num_cuota: c.num_cuota,
          monto: Number(c.capital_interes || 0),
          saldo: Number(c.saldo_total || 0),
          status: c.status,
          id_prestamo: pr?.id_prestamo || "—",
          cliente: pr?.clientes?.nombre_completo || "—",
        };
      });
      const totalEsperado = cuotasExpected.reduce((s, c) => s + c.monto, 0);

      // Unique clients visited (from pagos + visitas)
      const clientesAtendidos = new Set<string>();
      for (const p of pagosEnriched) clientesAtendidos.add(p.cliente_nombre);
      for (const v of (visitas || []) as any[]) {
        if (v.clientes?.nombre_completo) clientesAtendidos.add(v.clientes.nombre_completo);
      }

      return {
        pagos: pagosEnriched,
        visitas: visitas || [],
        promesas: promesas || [],
        cuotasExpected,
        totalCobrado,
        totalCapital,
        totalInteres,
        totalMora,
        porMetodo,
        totalEsperado,
        clientesAtendidos: clientesAtendidos.size,
        numPagos: pagosList.length,
        numVisitas: (visitas || []).length,
      };
    },
    enabled: !!cobradorId && !!empresaId,
  });
}

type ModalType = "depositar" | "gasto" | "prestamo_entregado" | null;

export default function LiquidarRutaPage() {
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();
  const { data: cobradores = [], isLoading } = useCobradores(empresaId);
  const { data: cajas = [] } = useCajas(empresaId);
  const { data: liquidaciones = [] } = useLiquidaciones(empresaId);

  const [selectedCobrador, setSelectedCobrador] = useState<Cobrador | null>(null);
  const [reportCobrador, setReportCobrador] = useState<Cobrador | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [monto, setMonto] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [concepto, setConcepto] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: dailyReport, isLoading: reportLoading } = useDailyReport(empresaId, reportCobrador?.id || null);

  const totalEfectivo = cobradores.reduce((s, c) => s + c.efectivo_en_mano, 0);

  const resetModal = () => {
    setModal(null);
    setMonto("");
    setCajaId(cajas[0]?.id || "");
    setConcepto("");
  };

  const openModal = (cobrador: Cobrador, tipo: ModalType) => {
    setSelectedCobrador(cobrador);
    setCajaId(cajas[0]?.id || "");
    setModal(tipo);
  };

  const handleDepositar = async () => {
    if (!selectedCobrador || !cajaId) return;
    const montoNum = parseFloat(monto) || 0;
    if (montoNum <= 0) return toast.error("Ingresa un monto válido");
    if (montoNum > selectedCobrador.efectivo_en_mano) return toast.error("El monto excede el efectivo en mano");

    setSaving(true);
    try {
      await supabase.from("profiles")
        .update({ efectivo_en_mano: selectedCobrador.efectivo_en_mano - montoNum })
        .eq("id", selectedCobrador.id);

      await supabase.from("movimientos_caja").insert({
        caja_id: cajaId,
        tipo: "entrada" as any,
        monto: montoNum,
        concepto: `Depósito cobrador ${selectedCobrador.nombre}`,
        empresa_id: empresaId,
      });

      const comision = montoNum * (selectedCobrador.porcentaje_comision / 100);
      await supabase.from("cortes").insert({
        cobrador_id: selectedCobrador.id,
        caja_id: cajaId,
        total_cobrado: montoNum,
        monto_efectivo: selectedCobrador.efectivo_en_mano,
        monto_depositado: montoNum,
        monto_comision: comision,
        porcentaje_usado: selectedCobrador.porcentaje_comision,
        empresa_id: empresaId,
        periodo_desde: new Date().toISOString(),
        periodo_hasta: new Date().toISOString(),
      });

      invalidateFinanceQueries(queryClient);
      toast.success(`Depósito de ${$$(montoNum)} registrado. Comisión: ${$$(comision)}`);
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleGasto = async () => {
    if (!selectedCobrador) return;
    const montoNum = parseFloat(monto) || 0;
    if (montoNum <= 0) return toast.error("Ingresa un monto válido");
    if (montoNum > selectedCobrador.efectivo_en_mano) return toast.error("El monto excede el efectivo en mano");
    if (!concepto.trim()) return toast.error("Ingresa un concepto");

    setSaving(true);
    try {
      await supabase.from("profiles")
        .update({ efectivo_en_mano: selectedCobrador.efectivo_en_mano - montoNum })
        .eq("id", selectedCobrador.id);

      const targetCaja = cajaId || cajas[0]?.id;
      if (targetCaja) {
        await supabase.from("movimientos_caja").insert({
          caja_id: targetCaja,
          tipo: "salida" as any,
          monto: montoNum,
          concepto: `Gasto cobrador ${selectedCobrador.nombre}: ${concepto}`,
          empresa_id: empresaId,
        });
      }

      invalidateFinanceQueries(queryClient);
      toast.success(`Gasto de ${$$(montoNum)} registrado para ${selectedCobrador.nombre}`);
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handlePrestamoEntregado = async () => {
    if (!selectedCobrador) return;
    const montoNum = parseFloat(monto) || 0;
    if (montoNum <= 0) return toast.error("Ingresa un monto válido");
    if (montoNum > selectedCobrador.efectivo_en_mano) return toast.error("El monto excede el efectivo en mano");

    setSaving(true);
    try {
      await supabase.from("profiles")
        .update({ efectivo_en_mano: selectedCobrador.efectivo_en_mano - montoNum })
        .eq("id", selectedCobrador.id);

      const targetCaja = cajaId || cajas[0]?.id;
      if (targetCaja) {
        await supabase.from("movimientos_caja").insert({
          caja_id: targetCaja,
          tipo: "salida" as any,
          monto: montoNum,
          concepto: `Préstamo entregado en ruta por ${selectedCobrador.nombre}${concepto ? `: ${concepto}` : ""}`,
          empresa_id: empresaId,
        });
      }

      invalidateFinanceQueries(queryClient);
      toast.success(`Préstamo entregado de ${$$(montoNum)} registrado`);
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    if (modal === "depositar") handleDepositar();
    else if (modal === "gasto") handleGasto();
    else if (modal === "prestamo_entregado") handlePrestamoEntregado();
  };

  const modalConfig = {
    depositar: { title: "Depositar a Caja", icon: ArrowDownToLine, showCaja: true, submitLabel: "Depositar", conceptoLabel: "" },
    gasto: { title: "Registrar Gasto de Ruta", icon: MinusCircle, showCaja: false, submitLabel: "Registrar Gasto", conceptoLabel: "Concepto del gasto *" },
    prestamo_entregado: { title: "Préstamo Entregado en Ruta", icon: CreditCard, showCaja: false, submitLabel: "Registrar", conceptoLabel: "Cliente / Referencia" },
  };

  const cfg = modal ? modalConfig[modal] : null;

  const eficiencia = dailyReport && dailyReport.totalEsperado > 0
    ? Math.round((dailyReport.totalCobrado / dailyReport.totalEsperado) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          Liquidar Ruta
        </h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Cobradores</p>
              <p className="text-xl font-bold">{cobradores.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Efectivo en Calle</p>
              <p className="text-xl font-bold">{$$(totalEfectivo)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
              <Receipt className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Liquidaciones Hoy</p>
              <p className="text-xl font-bold">
                {liquidaciones.filter((l: any) => new Date(l.created_at).toDateString() === new Date().toDateString()).length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Cobrado Hoy (Equipo)</p>
              <p className="text-xl font-bold">{$$(cobradores.reduce((s, c) => s + c.efectivo_en_mano, 0))}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Cobradores — each one is a card with report + actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobradores — Reporte del Día</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <div className="h-10 bg-muted rounded animate-pulse" />
              <div className="h-10 bg-muted rounded animate-pulse" />
            </div>
          ) : cobradores.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No hay cobradores activos</div>
          ) : (
            <div className="divide-y divide-border">
              {cobradores.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {c.nombre.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{c.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          Efectivo: <span className={cn("font-semibold", c.efectivo_en_mano > 0 ? "text-destructive" : "text-muted-foreground")}>{$$(c.efectivo_en_mano)}</span>
                          {" · "}Comisión: {c.porcentaje_comision}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5" onClick={() => setReportCobrador(reportCobrador?.id === c.id ? null : c)}>
                        <Eye className="h-3 w-3 mr-1" />Reporte
                      </Button>
                      <Button size="sm" variant="default" className="h-7 text-[11px] px-2.5" disabled={c.efectivo_en_mano <= 0} onClick={() => openModal(c, "depositar")}>
                        <ArrowDownToLine className="h-3 w-3 mr-1" />Depositar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5" disabled={c.efectivo_en_mano <= 0} onClick={() => openModal(c, "gasto")}>
                        <MinusCircle className="h-3 w-3 mr-1" />Gasto
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5" disabled={c.efectivo_en_mano <= 0} onClick={() => openModal(c, "prestamo_entregado")}>
                        <CreditCard className="h-3 w-3 mr-1" />Préstamo
                      </Button>
                    </div>
                  </div>

                  {/* Inline daily report */}
                  {reportCobrador?.id === c.id && (
                    <div className="mt-4 border border-border rounded-lg overflow-hidden">
                      {reportLoading ? (
                        <div className="p-6 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : dailyReport ? (
                        <DailyReportPanel report={dailyReport} cobrador={c} />
                      ) : (
                        <div className="p-6 text-center text-muted-foreground text-sm">Sin datos</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historial de liquidaciones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de Liquidaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {liquidaciones.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No hay liquidaciones registradas</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Fecha</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Cobrador</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Depositado</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Comisión</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Caja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidaciones.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-[12px]">{format(new Date(l.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="text-[13px] font-medium">{l.cobrador_nombre || "—"}</TableCell>
                    <TableCell className="text-right text-[13px] font-semibold">{$$(l.monto_depositado)}</TableCell>
                    <TableCell className="text-right text-[13px]">{$$(l.monto_comision)}</TableCell>
                    <TableCell className="text-[12px]">{l.cajas?.nombre || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal for all actions */}
      <Dialog open={!!modal} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px]">
          {cfg && selectedCobrador && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <cfg.icon className="h-4 w-4 text-primary" />
                  {cfg.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="bg-secondary rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">Cobrador</p>
                    <p className="font-semibold text-sm">{selectedCobrador.nombre}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground uppercase">Efectivo en Mano</p>
                    <p className="font-semibold text-sm text-destructive">{$$(selectedCobrador.efectivo_en_mano)}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label>
                  <Input
                    type="number" step="0.01" min="0" max={selectedCobrador.efectivo_en_mano}
                    placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)}
                    className="mt-1 h-9 text-[13px]" autoFocus
                  />
                  {modal === "depositar" && (
                    <Button variant="link" className="text-[11px] p-0 h-auto mt-1"
                      onClick={() => setMonto(selectedCobrador.efectivo_en_mano.toFixed(2))}>
                      Depositar todo ({$$(selectedCobrador.efectivo_en_mano)})
                    </Button>
                  )}
                </div>

                {cfg.showCaja && (
                  <div>
                    <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
                    <Select value={cajaId} onValueChange={setCajaId}>
                      <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {cajas.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {cfg.conceptoLabel && (
                  <div>
                    <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">{cfg.conceptoLabel}</Label>
                    <Textarea value={concepto} onChange={(e) => setConcepto(e.target.value)}
                      className="mt-1 text-[13px] min-h-[60px]"
                      placeholder={modal === "gasto" ? "Ej: Gasolina, comida, taxi..." : "Ej: Cliente Juan Pérez, préstamo rápido..."} />
                  </div>
                )}

                {modal === "depositar" && parseFloat(monto) > 0 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 text-[12px] space-y-1">
                    <div className="flex justify-between">
                      <span>Monto a depositar:</span>
                      <span className="font-semibold">{$$(parseFloat(monto) || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Comisión ({selectedCobrador.porcentaje_comision}%):</span>
                      <span className="font-semibold text-primary">
                        {$$((parseFloat(monto) || 0) * selectedCobrador.porcentaje_comision / 100)}
                      </span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between font-semibold">
                      <span>Saldo restante:</span>
                      <span>{$$(selectedCobrador.efectivo_en_mano - (parseFloat(monto) || 0))}</span>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" size="sm" onClick={resetModal} disabled={saving}>Cancelar</Button>
                <Button size="sm" onClick={handleSubmit} disabled={saving || !monto || parseFloat(monto) <= 0}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <cfg.icon className="h-3.5 w-3.5 mr-1.5" />}
                  {saving ? "Procesando..." : cfg.submitLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Daily Report Panel ─── */

interface DailyReportProps {
  report: NonNullable<ReturnType<typeof useDailyReport>["data"]>;
  cobrador: Cobrador;
}

function DailyReportPanel({ report, cobrador }: DailyReportProps) {
  const eficiencia = report.totalEsperado > 0
    ? Math.round((report.totalCobrado / report.totalEsperado) * 100)
    : report.totalCobrado > 0 ? 100 : 0;

  const efColor = eficiencia >= 100 ? "text-success" : eficiencia >= 70 ? "text-warning" : "text-destructive";
  const efEmoji = eficiencia >= 100 ? "🎉" : eficiencia >= 70 ? "😊" : eficiencia >= 40 ? "😐" : "😟";

  return (
    <div>
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 border-b border-border">
        {[
          { label: "Clientes Atendidos", value: String(report.clientesAtendidos), icon: Users, color: "text-primary" },
          { label: "Cobros Realizados", value: String(report.numPagos), icon: HandCoins, color: "text-success" },
          { label: "Total Cobrado", value: $$(report.totalCobrado), icon: DollarSign, color: "text-success" },
          { label: "Esperado Hoy", value: $$(report.totalEsperado), icon: FileText, color: "text-foreground" },
          { label: "Eficiencia", value: `${eficiencia}% ${efEmoji}`, icon: TrendingUp, color: efColor },
        ].map((k, i) => (
          <div key={i} className={cn("p-3 text-center", i < 4 && "border-r border-border last:border-r-0")}>
            <k.icon className={cn("h-4 w-4 mx-auto mb-1", k.color)} />
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{k.label}</p>
            <p className={cn("text-sm font-bold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Efectivo esperado vs entregado */}
      <div className="p-4 border-b border-border bg-secondary/30">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Conciliación de Efectivo</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Total Cobrado</p>
            <p className="text-sm font-bold text-success">{$$(report.totalCobrado)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Efectivo en Mano</p>
            <p className="text-sm font-bold text-destructive">{$$(cobrador.efectivo_en_mano)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Diferencia</p>
            <p className={cn("text-sm font-bold", cobrador.efectivo_en_mano === report.totalCobrado ? "text-success" : "text-warning")}>
              {$$(cobrador.efectivo_en_mano - report.totalCobrado)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Por Método</p>
            <div className="text-[11px] space-y-0.5">
              {Object.entries(report.porMetodo).map(([m, v]) => (
                <p key={m}><span className="text-muted-foreground">{m}:</span> <span className="font-semibold">{$$(v)}</span></p>
              ))}
              {Object.keys(report.porMetodo).length === 0 && <p className="text-muted-foreground">—</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: Cobros | Esperado | Visitas */}
      <Tabs defaultValue="cobros" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-9 px-4">
          <TabsTrigger value="cobros" className="text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            Cobros ({report.numPagos})
          </TabsTrigger>
          <TabsTrigger value="esperado" className="text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            Cuotas del Día ({report.cuotasExpected.length})
          </TabsTrigger>
          <TabsTrigger value="visitas" className="text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            Gestiones ({report.numVisitas})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cobros" className="mt-0">
          {report.pagos.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">Sin cobros hoy</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[10px] uppercase">Hora</TableHead>
                  <TableHead className="text-[10px] uppercase">Préstamo</TableHead>
                  <TableHead className="text-[10px] uppercase">Cliente</TableHead>
                  <TableHead className="text-[10px] uppercase text-right">Monto</TableHead>
                  <TableHead className="text-[10px] uppercase">Método</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.pagos.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[11px]">{format(new Date(p.created_at), "HH:mm")}</TableCell>
                    <TableCell className="text-[11px] font-mono">{p.id_prestamo}</TableCell>
                    <TableCell className="text-[11px] font-medium max-w-[120px] truncate">{p.cliente_nombre}</TableCell>
                    <TableCell className="text-[11px] text-right font-semibold">{$$(p.monto_recibido)}</TableCell>
                    <TableCell className="text-[11px]">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.metodo_pago || "Efectivo"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={3} className="text-[11px]">TOTAL</TableCell>
                  <TableCell className="text-[11px] text-right">{$$(report.totalCobrado)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
          {/* Desglose */}
          {report.pagos.length > 0 && (
            <div className="px-4 py-2 bg-muted/30 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
              <span>Capital: <strong className="text-foreground">{$$(report.totalCapital)}</strong></span>
              <span>Interés: <strong className="text-foreground">{$$(report.totalInteres)}</strong></span>
              <span>Mora: <strong className="text-foreground">{$$(report.totalMora)}</strong></span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="esperado" className="mt-0">
          {report.cuotasExpected.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">Sin cuotas programadas para hoy</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[10px] uppercase">Préstamo</TableHead>
                  <TableHead className="text-[10px] uppercase">Cliente</TableHead>
                  <TableHead className="text-[10px] uppercase text-center">Cuota</TableHead>
                  <TableHead className="text-[10px] uppercase text-right">Monto</TableHead>
                  <TableHead className="text-[10px] uppercase text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.cuotasExpected.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-[11px] font-mono">{c.id_prestamo}</TableCell>
                    <TableCell className="text-[11px] font-medium max-w-[120px] truncate">{c.cliente}</TableCell>
                    <TableCell className="text-[11px] text-center">#{c.num_cuota}</TableCell>
                    <TableCell className="text-[11px] text-right font-semibold">{$$(c.monto)}</TableCell>
                    <TableCell className="text-center">
                      {c.status === "Pagada" ? (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-success text-success-foreground">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" /> Pagada
                        </Badge>
                      ) : c.status === "Parcial" ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-warning border-warning">
                          <Clock className="h-3 w-3 mr-0.5" /> Parcial
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive">
                          <AlertTriangle className="h-3 w-3 mr-0.5" /> Pendiente
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={3} className="text-[11px]">TOTAL ESPERADO</TableCell>
                  <TableCell className="text-[11px] text-right">{$$(report.totalEsperado)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="visitas" className="mt-0">
          {report.visitas.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">Sin gestiones registradas hoy</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[10px] uppercase">Hora</TableHead>
                  <TableHead className="text-[10px] uppercase">Cliente</TableHead>
                  <TableHead className="text-[10px] uppercase">Tipo</TableHead>
                  <TableHead className="text-[10px] uppercase">Resultado</TableHead>
                  <TableHead className="text-[10px] uppercase">Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.visitas.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-[11px]">{format(new Date(v.created_at), "HH:mm")}</TableCell>
                    <TableCell className="text-[11px] font-medium max-w-[100px] truncate">{v.clientes?.nombre_completo || "—"}</TableCell>
                    <TableCell className="text-[11px]">{v.tipo_gestion}</TableCell>
                    <TableCell className="text-[11px]">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{v.resultado}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[100px] truncate">{v.notas || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
