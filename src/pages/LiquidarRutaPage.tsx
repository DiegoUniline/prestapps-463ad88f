import { useState, useMemo } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Wallet, HandCoins, Loader2, UserCheck,
  ArrowDownToLine, ClipboardList, Users, DollarSign,
  CalendarIcon, CheckCircle2, AlertTriangle, Search, Lock
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$, parseLocalDate, fmtDateTime } from "@/lib/utils";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { fetchAllRows } from "@/lib/supabaseQuery";

/* ─── Types ─── */

interface Cobrador {
  id: string;
  nombre: string;
  telefono: string | null;
  porcentaje_comision: number;
  efectivo_en_mano: number;
}

interface PagoNoLiquidado {
  id: string;
  prestamo_id: string;
  id_prestamo: string;
  cliente_nombre: string;
  monto_recibido: number;
  metodo_pago: string;
  fecha_pago: string;
  aplicado_capital: number;
  aplicado_interes: number;
  aplicado_mora: number;
  created_at: string;
}

/* ─── Hooks ─── */

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
      const { data } = await supabase
        .from("profiles")
        .select("id, nombre_completo, telefono, porcentaje_comision, efectivo_en_mano, activo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .in("id", userIds)
        .order("nombre_completo");
      return (data || []).map((p) => ({
        id: p.id,
        nombre: p.nombre_completo,
        telefono: p.telefono,
        porcentaje_comision: Number(p.porcentaje_comision || 0),
        efectivo_en_mano: Number(p.efectivo_en_mano || 0),
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

/** Fetch pagos NOT yet settled (corte_id IS NULL) for a cobrador up to a date */
function usePagosNoLiquidados(empresaId: string, cobradorId: string | null, fechaHasta: string | null) {
  return useQuery({
    queryKey: ["pagos-no-liquidados", empresaId, cobradorId, fechaHasta],
    queryFn: async (): Promise<PagoNoLiquidado[]> => {
      if (!cobradorId || !fechaHasta) return [];

      const pagos = await fetchAllRows<any>(
        supabase
          .from("pagos")
          .select("id, prestamo_id, monto_recibido, metodo_pago, fecha_pago, aplicado_capital, aplicado_interes, aplicado_mora, created_at")
          .eq("empresa_id", empresaId)
          .eq("cobrador_id", cobradorId)
          .eq("anulado", false)
          .is("corte_id" as any, null)
          .lte("fecha_pago", fechaHasta)
          .order("fecha_pago", { ascending: true })
      );

      if (!pagos.length) return [];

      const prestamoIds = [...new Set(pagos.map((p: any) => p.prestamo_id))];
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select("id, id_prestamo, cliente_id, clientes ( nombre_completo )")
        .in("id", prestamoIds);

      const prMap: Record<string, { id_prestamo: string; cliente: string }> = {};
      for (const pr of (prestamos || []) as any[]) {
        prMap[pr.id] = {
          id_prestamo: pr.id_prestamo || pr.id.slice(0, 8),
          cliente: pr.clientes?.nombre_completo || "—",
        };
      }

      return pagos.map((p: any) => ({
        id: p.id,
        prestamo_id: p.prestamo_id,
        id_prestamo: prMap[p.prestamo_id]?.id_prestamo || "—",
        cliente_nombre: prMap[p.prestamo_id]?.cliente || "—",
        monto_recibido: Number(p.monto_recibido || 0),
        metodo_pago: p.metodo_pago || "Efectivo",
        fecha_pago: p.fecha_pago,
        aplicado_capital: Number(p.aplicado_capital || 0),
        aplicado_interes: Number(p.aplicado_interes || 0),
        aplicado_mora: Number(p.aplicado_mora || 0),
        created_at: p.created_at,
      }));
    },
    enabled: !!cobradorId && !!fechaHasta && !!empresaId,
  });
}

function useHistorialCortes(empresaId: string) {
  return useQuery({
    queryKey: ["historial-cortes", empresaId],
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
        const { data: profiles } = await supabase.from("profiles").select("id, nombre_completo").in("id", cobIds);
        for (const p of profiles || []) cobMap[p.id] = p.nombre_completo;
      }
      return data.map((l: any) => ({ ...l, cobrador_nombre: cobMap[l.cobrador_id] || "—" }));
    },
  });
}

/* ─── Page ─── */

export default function LiquidarRutaPage() {
  const { empresaId } = useEmpresa();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: cobradores = [], isLoading } = useCobradores(empresaId);
  const { data: cajas = [] } = useCajas(empresaId);
  const { data: historial = [] } = useHistorialCortes(empresaId);

  // Step-based flow
  const [cobradorId, setCobradorId] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>(new Date());
  const [consulted, setConsulted] = useState(false);

  const fechaStr = fechaHasta ? format(fechaHasta, "yyyy-MM-dd") : null;
  const { data: pagosRaw = [], isLoading: loadingPagos, refetch: refetchPagos } = usePagosNoLiquidados(
    empresaId, consulted ? cobradorId : null, consulted ? fechaStr : null
  );

  const cobrador = cobradores.find((c) => c.id === cobradorId);

  // Summaries
  const totals = useMemo(() => {
    const total = pagosRaw.reduce((s, p) => s + p.monto_recibido, 0);
    const capital = pagosRaw.reduce((s, p) => s + p.aplicado_capital, 0);
    const interes = pagosRaw.reduce((s, p) => s + p.aplicado_interes, 0);
    const mora = pagosRaw.reduce((s, p) => s + p.aplicado_mora, 0);
    const porMetodo: Record<string, number> = {};
    for (const p of pagosRaw) {
      porMetodo[p.metodo_pago] = (porMetodo[p.metodo_pago] || 0) + p.monto_recibido;
    }
    const efectivo = porMetodo["Efectivo"] || 0;
    const clientes = new Set(pagosRaw.map((p) => p.cliente_nombre)).size;
    const prestamos = new Set(pagosRaw.map((p) => p.prestamo_id)).size;
    return { total, capital, interes, mora, porMetodo, efectivo, clientes, prestamos };
  }, [pagosRaw]);

  // Liquidar state
  const [cajaId, setCajaId] = useState("");
  const [showLiquidar, setShowLiquidar] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConsultar = () => {
    if (!cobradorId) return toast.error("Selecciona un cobrador");
    if (!fechaHasta) return toast.error("Selecciona una fecha");
    setConsulted(true);
  };

  const handleLiquidar = async () => {
    if (!cobrador || !cajaId || pagosRaw.length === 0) return;
    setSaving(true);
    try {
      // 1. Create corte record
      const comision = totals.efectivo * (cobrador.porcentaje_comision / 100);
      const { data: corte, error: corteErr } = await supabase.from("cortes").insert({
        cobrador_id: cobrador.id,
        caja_id: cajaId,
        total_cobrado: totals.total,
        monto_efectivo: totals.efectivo,
        monto_depositado: totals.efectivo,
        monto_comision: comision,
        porcentaje_usado: cobrador.porcentaje_comision,
        empresa_id: empresaId,
        periodo_hasta: fechaHasta!.toISOString(),
      }).select("id").single();

      if (corteErr) throw corteErr;

      // 2. Mark all pagos as settled
      const pagoIds = pagosRaw.map((p) => p.id);
      // Update in batches of 100
      for (let i = 0; i < pagoIds.length; i += 100) {
        const batch = pagoIds.slice(i, i + 100);
        const { error } = await (supabase as any).from("pagos").update({ corte_id: corte.id }).in("id", batch);
        if (error) throw error;
      }

      // 3. Reset cobrador efectivo_en_mano (subtract what was settled as cash)
      if (totals.efectivo > 0) {
        await supabase.from("profiles")
          .update({ efectivo_en_mano: Math.max(0, cobrador.efectivo_en_mano - totals.efectivo) })
          .eq("id", cobrador.id);

        // Register caja movement
        await supabase.from("movimientos_caja").insert({
          caja_id: cajaId,
          tipo: "entrada" as any,
          monto: totals.efectivo,
          concepto: `Liquidación ruta ${cobrador.nombre} — ${pagosRaw.length} pagos hasta ${format(fechaHasta!, "dd/MM/yyyy")}`,
          empresa_id: empresaId,
          registrado_por: user?.id || null,
        });
      }

      invalidateFinanceQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["pagos-no-liquidados"] });
      queryClient.invalidateQueries({ queryKey: ["historial-cortes"] });
      queryClient.invalidateQueries({ queryKey: ["cobradores"] });

      toast.success(`Ruta liquidada: ${pagosRaw.length} pagos cerrados (${$$(totals.total)}). Comisión: ${$$(comision)}`);
      setShowLiquidar(false);
      setConsulted(false);
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          Liquidar Ruta
        </h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}</p>
      </div>

      {/* Step 1: Select cobrador + date */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consultar Pagos Pendientes de Liquidar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Cobrador</Label>
              <SearchableSelect
                options={cobradores.map((c) => ({ value: c.id, label: c.nombre }))}
                value={cobradorId}
                onValueChange={(v) => { setCobradorId(v); setConsulted(false); }}
                placeholder="Seleccionar cobrador..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Fecha de Corte (hasta)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9 text-[13px]", !fechaHasta && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {fechaHasta ? format(fechaHasta, "dd/MM/yyyy") : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaHasta}
                    onSelect={(d) => { setFechaHasta(d); setConsulted(false); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleConsultar} disabled={!cobradorId || !fechaHasta || loadingPagos} className="h-9">
              {loadingPagos ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Results */}
      {consulted && (
        <>
          {loadingPagos ? (
            <Card className="p-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Card>
          ) : pagosRaw.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-success mb-2" />
              <p className="text-sm font-medium">Sin pagos pendientes de liquidar</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todos los pagos de <strong>{cobrador?.nombre}</strong> hasta el <strong>{fechaHasta ? format(fechaHasta, "dd/MM/yyyy") : ""}</strong> ya fueron liquidados.
              </p>
            </Card>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <HandCoins className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Pagos</p>
                      <p className="text-lg font-bold">{pagosRaw.length}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Cobrado</p>
                      <p className="text-lg font-bold text-success">{$$(totals.total)}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <Wallet className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Efectivo</p>
                      <p className="text-lg font-bold">{$$(totals.efectivo)}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Clientes</p>
                      <p className="text-lg font-bold">{totals.clientes}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <UserCheck className="h-4 w-4 text-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Préstamos</p>
                      <p className="text-lg font-bold">{totals.prestamos}</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Desglose */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Desglose de Cobros</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Capital:</span><span className="font-semibold">{$$(totals.capital)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Interés:</span><span className="font-semibold">{$$(totals.interes)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Mora:</span><span className="font-semibold">{$$(totals.mora)}</span></div>
                    <Separator />
                    <div className="flex justify-between font-bold"><span>Total:</span><span className="text-success">{$$(totals.total)}</span></div>
                  </div>
                </Card>
                <Card className="p-4">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Método de Pago</h3>
                  <div className="space-y-2 text-sm">
                    {Object.entries(totals.porMetodo).map(([metodo, monto]) => (
                      <div key={metodo} className="flex justify-between">
                        <span className="text-muted-foreground">{metodo}:</span>
                        <span className="font-semibold">{$$(monto)}</span>
                      </div>
                    ))}
                    {Object.keys(totals.porMetodo).length === 0 && <p className="text-muted-foreground text-xs">—</p>}
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Efectivo en mano (sistema):</span>
                      <span className="font-semibold text-destructive">{$$(cobrador?.efectivo_en_mano || 0)}</span>
                    </div>
                    {cobrador && totals.efectivo !== cobrador.efectivo_en_mano && (
                      <div className="flex items-center gap-1.5 text-xs text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        Diferencia: {$$(cobrador.efectivo_en_mano - totals.efectivo)}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Payment table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Detalle de Pagos ({pagosRaw.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-table-header">
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Fecha</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Préstamo</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Cliente</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Monto</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Capital</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Interés</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Mora</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Método</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagosRaw.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-[11px]">{format(parseLocalDate(p.fecha_pago), "dd/MM/yyyy")}</TableCell>
                            <TableCell className="text-[11px] font-mono">{p.id_prestamo}</TableCell>
                            <TableCell className="text-[12px] font-medium max-w-[140px] truncate">{p.cliente_nombre}</TableCell>
                            <TableCell className="text-[12px] text-right font-semibold">{$$(p.monto_recibido)}</TableCell>
                            <TableCell className="text-[11px] text-right">{$$(p.aplicado_capital)}</TableCell>
                            <TableCell className="text-[11px] text-right">{$$(p.aplicado_interes)}</TableCell>
                            <TableCell className="text-[11px] text-right">{$$(p.aplicado_mora)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.metodo_pago}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell colSpan={3} className="text-[11px]">TOTAL</TableCell>
                          <TableCell className="text-[12px] text-right">{$$(totals.total)}</TableCell>
                          <TableCell className="text-[11px] text-right">{$$(totals.capital)}</TableCell>
                          <TableCell className="text-[11px] text-right">{$$(totals.interes)}</TableCell>
                          <TableCell className="text-[11px] text-right">{$$(totals.mora)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Liquidar button */}
              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={() => { setCajaId(cajas[0]?.id || ""); setShowLiquidar(true); }}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Liquidar {pagosRaw.length} pagos — {$$(totals.total)}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* Historial */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de Liquidaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historial.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No hay liquidaciones registradas</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Fecha</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Cobrador</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Total Cobrado</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Depositado</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Comisión</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Caja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-[12px]">{fmtDateTime(l.created_at)}</TableCell>
                    <TableCell className="text-[13px] font-medium">{l.cobrador_nombre || "—"}</TableCell>
                    <TableCell className="text-right text-[13px] font-semibold">{$$(l.total_cobrado)}</TableCell>
                    <TableCell className="text-right text-[13px]">{$$(l.monto_depositado)}</TableCell>
                    <TableCell className="text-right text-[13px]">{$$(l.monto_comision)}</TableCell>
                    <TableCell className="text-[12px]">{l.cajas?.nombre || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Liquidar confirmation dialog */}
      <Dialog open={showLiquidar} onOpenChange={setShowLiquidar}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-primary" />
              Confirmar Liquidación
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-secondary rounded-lg px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cobrador:</span>
                <span className="font-semibold">{cobrador?.nombre}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Corte hasta:</span>
                <span className="font-semibold">{fechaHasta ? format(fechaHasta, "dd/MM/yyyy") : ""}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Pagos a cerrar:</span>
                <span className="font-semibold">{pagosRaw.length}</span>
              </div>
            </div>

            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total cobrado:</span>
                <span className="font-bold text-lg text-success">{$$(totals.total)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Efectivo a depositar:</span>
                <span className="font-semibold">{$$(totals.efectivo)}</span>
              </div>
              {cobrador && cobrador.porcentaje_comision > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Comisión ({cobrador.porcentaje_comision}%):</span>
                  <span className="font-semibold text-primary">
                    {$$(totals.efectivo * cobrador.porcentaje_comision / 100)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino *</Label>
              <SearchableSelect
                options={cajas.map((c: any) => ({ value: c.id, label: c.nombre }))}
                value={cajaId}
                onValueChange={setCajaId}
                placeholder="Seleccionar caja"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowLiquidar(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleLiquidar} disabled={saving || !cajaId}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Lock className="h-4 w-4 mr-1.5" />}
              {saving ? "Procesando..." : "Liquidar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
