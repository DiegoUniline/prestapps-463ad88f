import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, $$ } from "@/lib/utils";
import {
  User, Phone, MapPin, HandCoins, ChevronDown, ChevronUp,
  CreditCard, ShieldCheck, Package, Wrench, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { PagoModal } from "@/components/PagoModal";

interface ClienteEstadoCuentaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  clienteNombre: string;
  empresaId: string;
  cajas: { id: string; nombre: string }[];
  fechaCobranza: string;
}

interface CuentaCliente {
  prestamoId: string;
  idPrestamo: string;
  tipoCuenta: string;
  montoSolicitado: number;
  montoTotalPagar: number;
  estado: string;
  rutaId: string | null;
  cobradorId: string | null;
  cajaId: string | null;
  rutaNombre: string;
  cajaNombre: string;
  cuotasPendientes: CuotaPendiente[];
  totalSaldo: number;
  totalMora: number;
  cuotasTotales: number;
  cuotasPagadas: number;
  proximaCuota: CuotaPendiente | null;
}

interface CuotaPendiente {
  id: string;
  numCuota: number;
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
}

const TIPO_ICONS: Record<string, React.ReactNode> = {
  prestamo: <CreditCard className="h-4 w-4" />,
  venta_seguro: <ShieldCheck className="h-4 w-4" />,
  venta_producto: <Package className="h-4 w-4" />,
  venta_servicio: <Wrench className="h-4 w-4" />,
};
const TIPO_LABELS: Record<string, string> = {
  prestamo: "Préstamo",
  venta_seguro: "Seguro",
  venta_producto: "Producto",
  venta_servicio: "Servicio",
};

function useEstadoCuentaCliente(clienteId: string, empresaId: string) {
  return useQuery({
    queryKey: ["estado-cuenta", clienteId, empresaId],
    queryFn: async () => {
      // Get all active prestamos for this client
      const { data: prestamos, error } = await (supabase.from as any)("prestamos")
        .select(`
          id, id_prestamo, tipo_cuenta, monto_solicitado, monto_total_pagar,
          estado, num_cuotas, ruta_id, cobrador_id, caja_id,
          rutas ( nombre ),
          cajas ( nombre )
        `)
        .eq("cliente_id", clienteId)
        .eq("empresa_id", empresaId)
        .in("estado", ["Activo", "Al día", "Vencido"]);

      if (error) throw error;
      if (!prestamos || prestamos.length === 0) return [];

      const prestamoIds = prestamos.map((p: any) => p.id);

      // Get all cuotas for these prestamos
      const { data: cuotas } = await supabase
        .from("amortizacion")
        .select(`
          id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
          saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
          fecha_vencimiento, status, dias_atraso
        `)
        .in("prestamo_id", prestamoIds)
        .order("num_cuota", { ascending: true });

      const cuotasByPrestamo: Record<string, any[]> = {};
      for (const c of cuotas || []) {
        if (!cuotasByPrestamo[c.prestamo_id]) cuotasByPrestamo[c.prestamo_id] = [];
        cuotasByPrestamo[c.prestamo_id].push(c);
      }

      return prestamos.map((p: any): CuentaCliente => {
        const allCuotas = cuotasByPrestamo[p.id] || [];
        const pendientes = allCuotas.filter((c: any) => c.status !== "Pagada");
        const pagadas = allCuotas.filter((c: any) => c.status === "Pagada");

        return {
          prestamoId: p.id,
          idPrestamo: p.id_prestamo,
          tipoCuenta: p.tipo_cuenta || "prestamo",
          montoSolicitado: Number(p.monto_solicitado),
          montoTotalPagar: Number(p.monto_total_pagar || 0),
          estado: p.estado,
          rutaId: p.ruta_id,
          cobradorId: p.cobrador_id,
          cajaId: p.caja_id,
          rutaNombre: p.rutas?.nombre || "Sin ruta",
          cajaNombre: p.cajas?.nombre || "—",
          cuotasPendientes: pendientes.map((c: any): CuotaPendiente => ({
            id: c.id,
            numCuota: c.num_cuota,
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
          })),
          totalSaldo: pendientes.reduce((s: number, c: any) => s + Number(c.saldo_total || 0), 0),
          totalMora: pendientes.reduce((s: number, c: any) => s + Number(c.saldo_mora || 0), 0),
          cuotasTotales: allCuotas.length,
          cuotasPagadas: pagadas.length,
          proximaCuota: pendientes.length > 0 ? {
            id: pendientes[0].id,
            numCuota: pendientes[0].num_cuota,
            capitalInteres: Number(pendientes[0].capital_interes || 0),
            saldoTotal: Number(pendientes[0].saldo_total || 0),
            saldoMora: Number(pendientes[0].saldo_mora || 0),
            saldoCapital: Number(pendientes[0].saldo_capital || 0),
            saldoInteres: Number(pendientes[0].saldo_interes || 0),
            moraPagada: Number(pendientes[0].mora_pagada || 0),
            interesPagado: Number(pendientes[0].interes_pagado || 0),
            capitalPagado: Number(pendientes[0].capital_pagado || 0),
            fechaVencimiento: pendientes[0].fecha_vencimiento,
            status: pendientes[0].status || "Pendiente",
            diasAtraso: Number(pendientes[0].dias_atraso || 0),
          } : null,
        };
      });
    },
    enabled: !!clienteId,
    staleTime: 15 * 1000,
  });
}

export function ClienteEstadoCuentaSheet({
  open, onOpenChange, clienteId, clienteNombre, empresaId, cajas, fechaCobranza,
}: ClienteEstadoCuentaSheetProps) {
  const queryClient = useQueryClient();
  const { data: cuentas, isLoading } = useEstadoCuentaCliente(clienteId, empresaId);
  const [expandedCuenta, setExpandedCuenta] = useState<string | null>(null);

  // Pago modal state
  const [pagoOpen, setPagoOpen] = useState(false);
  const [pagoPrestamoId, setPagoPrestamoId] = useState("");
  const [pagoCuotas, setPagoCuotas] = useState<any[]>([]);
  const [pagoRutaId, setPagoRutaId] = useState<string | null>(null);
  const [pagoCobradorId, setPagoCobradorId] = useState<string | null>(null);
  const [pagoMontoInicial, setPagoMontoInicial] = useState<number | undefined>();

  // Totals
  const totales = useMemo(() => {
    if (!cuentas) return { saldo: 0, mora: 0, cuentas: 0 };
    return {
      saldo: cuentas.reduce((s, c) => s + c.totalSaldo, 0),
      mora: cuentas.reduce((s, c) => s + c.totalMora, 0),
      cuentas: cuentas.length,
    };
  }, [cuentas]);

  const openPagoCuenta = (cuenta: CuentaCliente) => {
    setPagoPrestamoId(cuenta.prestamoId);
    setPagoCuotas(cuenta.cuotasPendientes.map((c) => ({
      id: c.id,
      num_cuota: c.numCuota,
      saldo_mora: c.saldoMora,
      saldo_interes: c.saldoInteres,
      saldo_capital: c.saldoCapital,
      saldo_total: c.saldoTotal,
      mora_pagada: c.moraPagada,
      interes_pagado: c.interesPagado,
      capital_pagado: c.capitalPagado,
      status: c.status,
      fecha_vencimiento: c.fechaVencimiento,
    })));
    setPagoRutaId(cuenta.rutaId);
    setPagoCobradorId(cuenta.cobradorId);
    setPagoMontoInicial(cuenta.proximaCuota?.saldoTotal);
    setPagoOpen(true);
  };

  const handlePagoClose = (open: boolean) => {
    setPagoOpen(open);
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["estado-cuenta", clienteId] });
      queryClient.invalidateQueries({ queryKey: ["cobranza-diaria", fechaCobranza] });
    }
  };

  const toggleExpand = (prestamoId: string) => {
    setExpandedCuenta((prev) => (prev === prestamoId ? null : prestamoId));
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[540px] p-0 flex flex-col">
          {/* Header */}
          <SheetHeader className="px-5 pt-5 pb-4 border-b bg-secondary/30">
            <SheetTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Estado de Cuenta
            </SheetTitle>
            <p className="text-lg font-bold mt-1">{clienteNombre}</p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : !cuentas || cuentas.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
                <p className="font-medium">Sin cuentas pendientes</p>
                <p className="text-sm text-muted-foreground">Este cliente no tiene créditos activos.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Resumen General */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="border-border/60">
                    <CardContent className="p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cuentas</p>
                      <p className="text-xl font-bold">{totales.cuentas}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Saldo Total</p>
                      <p className="text-xl font-bold text-destructive">{$$(totales.saldo)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Mora</p>
                      <p className={cn("text-xl font-bold", totales.mora > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {$$(totales.mora)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                {/* Lista de Cuentas */}
                <div className="space-y-3">
                  {cuentas.map((cuenta) => {
                    const isExpanded = expandedCuenta === cuenta.prestamoId;
                    const progreso = cuenta.cuotasTotales > 0
                      ? (cuenta.cuotasPagadas / cuenta.cuotasTotales) * 100 : 0;
                    const tieneVencidas = cuenta.cuotasPendientes.some((c) => c.diasAtraso > 0);

                    return (
                      <Card
                        key={cuenta.prestamoId}
                        className={cn(
                          "border-border/60 overflow-hidden",
                          tieneVencidas && "border-destructive/30",
                        )}
                      >
                        <CardContent className="p-0">
                          {/* Cuenta Header - clickable */}
                          <button
                            className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                            onClick={() => toggleExpand(cuenta.prestamoId)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-primary">
                                  {TIPO_ICONS[cuenta.tipoCuenta] || TIPO_ICONS.prestamo}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-semibold">{cuenta.idPrestamo}</span>
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                      {TIPO_LABELS[cuenta.tipoCuenta] || "Préstamo"}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {$$(cuenta.montoSolicitado)} · {cuenta.cuotasPagadas}/{cuenta.cuotasTotales} cuotas · {cuenta.rutaNombre}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <p className="text-[14px] font-bold">{$$(cuenta.totalSaldo)}</p>
                                  {cuenta.totalMora > 0 && (
                                    <p className="text-[10px] text-destructive font-medium">+{$$(cuenta.totalMora)} mora</p>
                                  )}
                                </div>
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 bg-secondary rounded-full h-1.5">
                                <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${progreso}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground font-medium shrink-0">{progreso.toFixed(0)}%</span>
                            </div>
                          </button>

                          {/* Expanded: cuotas detail */}
                          {isExpanded && (
                            <div className="border-t bg-muted/20">
                              <div className="max-h-[240px] overflow-y-auto">
                                <table className="w-full text-[11px]">
                                  <thead className="sticky top-0 bg-table-header">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider">Cuota</th>
                                      <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider">Vence</th>
                                      <th className="px-3 py-1.5 text-right font-semibold text-[10px] uppercase tracking-wider">Monto</th>
                                      <th className="px-3 py-1.5 text-right font-semibold text-[10px] uppercase tracking-wider">Mora</th>
                                      <th className="px-3 py-1.5 text-right font-semibold text-[10px] uppercase tracking-wider">Saldo</th>
                                      <th className="px-3 py-1.5 text-center font-semibold text-[10px] uppercase tracking-wider">Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cuenta.cuotasPendientes.map((c) => (
                                      <tr key={c.id} className={cn("border-t border-border/30", c.diasAtraso > 0 && "bg-destructive/5")}>
                                        <td className="px-3 py-1.5 font-medium">#{c.numCuota}</td>
                                        <td className="px-3 py-1.5 text-muted-foreground">
                                          {format(parseISO(c.fechaVencimiento), "dd/MM/yy")}
                                        </td>
                                        <td className="px-3 py-1.5 text-right">{$$(c.capitalInteres)}</td>
                                        <td className={cn("px-3 py-1.5 text-right", c.saldoMora > 0 ? "text-destructive font-medium" : "text-muted-foreground/50")}>
                                          {c.saldoMora > 0 ? $$(c.saldoMora) : "—"}
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-medium">{$$(c.saldoTotal)}</td>
                                        <td className="px-3 py-1.5 text-center">
                                          {c.diasAtraso > 0 ? (
                                            <span className="text-destructive text-[9px] font-medium">{c.diasAtraso}d</span>
                                          ) : c.status === "Parcial" ? (
                                            <span className="text-warning text-[9px] font-medium">Parcial</span>
                                          ) : (
                                            <span className="text-muted-foreground text-[9px]">Pte</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Action bar */}
                              <div className="p-3 border-t flex items-center justify-between bg-secondary/30">
                                <div className="text-[11px] text-muted-foreground">
                                  {cuenta.cuotasPendientes.length} cuota{cuenta.cuotasPendientes.length !== 1 ? "s" : ""} pendiente{cuenta.cuotasPendientes.length !== 1 ? "s" : ""}
                                  {cuenta.proximaCuota && (
                                    <span> · Próxima: <strong>{$$(cuenta.proximaCuota.saldoTotal)}</strong></span>
                                  )}
                                </div>
                                <Button size="sm" className="h-7 text-[11px] px-3" onClick={() => openPagoCuenta(cuenta)}>
                                  <HandCoins className="h-3 w-3 mr-1" />Abonar
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer: total and CTA */}
          {cuentas && cuentas.length > 0 && (
            <div className="border-t bg-secondary/30 px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Deuda Total</p>
                <p className="text-lg font-bold text-destructive">{$$(totales.saldo)}</p>
              </div>
              {cuentas.length === 1 ? (
                <Button size="sm" className="h-9 text-[12px] px-4" onClick={() => openPagoCuenta(cuentas[0])}>
                  <HandCoins className="h-3.5 w-3.5 mr-1.5" />Registrar Pago
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground max-w-[160px] text-right">
                  Selecciona una cuenta arriba para abonar
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Pago Modal */}
      {pagoOpen && (
        <PagoModal
          open={pagoOpen}
          onOpenChange={handlePagoClose}
          prestamoId={pagoPrestamoId}
          cuotasPendientes={pagoCuotas}
          cajas={cajas}
          rutaId={pagoRutaId}
          cobradorId={pagoCobradorId}
          montoInicial={pagoMontoInicial}
        />
      )}
    </>
  );
}
