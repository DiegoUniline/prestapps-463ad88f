import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGeoLocation } from "@/hooks/useGeoLocation";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useMetodosPagoActivos } from "@/hooks/useCatalogos";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn, $$ } from "@/lib/utils";
import { HandCoins, Info, Loader2, AlertTriangle } from "lucide-react";

interface Cuota {
  id: string;
  num_cuota: number;
  saldo_mora: number;
  saldo_interes: number;
  saldo_capital: number;
  saldo_total: number;
  mora_pagada: number;
  interes_pagado: number;
  capital_pagado: number;
  status: string;
  fecha_vencimiento: string;
}

interface PaymentDistribution {
  cuotaId: string;
  cuota: number;
  mora: number;
  interes: number;
  capital: number;
  total: number;
}

interface PagoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  cuotasPendientes: Cuota[];
  cajas: { id: string; nombre: string }[];
  rutaId?: string | null;
  cobradorId?: string | null;
  montoInicial?: number;
}

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PagoModal({ open, onOpenChange, prestamoId, cuotasPendientes, cajas, rutaId, cobradorId, montoInicial }: PagoModalProps) {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const geo = useGeoLocation();
  const { data: metodosPago = [] } = useMetodosPagoActivos();
  const [montoRecibido, setMontoRecibido] = useState("");
  const [descuento, setDescuento] = useState("");
  const [metodo, setMetodo] = useState("");
  const [cajaId, setCajaId] = useState(cajas[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Set default payment method when catalog loads
  if (metodosPago.length > 0 && !metodo) {
    setMetodo(metodosPago[0].nombre);
  }

  // Pre-fill monto when modal opens with montoInicial
  if (open && montoInicial && !initialized) {
    setMontoRecibido(montoInicial.toFixed(2));
    setInitialized(true);
  }
  if (!open && initialized) {
    setInitialized(false);
  }

  const totalAdeudado = cuotasPendientes.reduce((s, c) => s + c.saldo_total, 0);
  const montoNum = parseFloat(montoRecibido) || 0;
  const descuentoNum = parseFloat(descuento) || 0;
  const montoEfectivo = montoNum + descuentoNum;

  // Distribute payment across installments (mora → interés → capital order)
  const distribution = useMemo((): PaymentDistribution[] => {
    if (montoEfectivo <= 0) return [];
    let remaining = montoEfectivo;
    const result: PaymentDistribution[] = [];

    for (const c of cuotasPendientes) {
      if (remaining <= 0) break;
      if (c.saldo_total <= 0) continue;

      let mora = 0, interes = 0, capital = 0;

      if (c.saldo_mora > 0 && remaining > 0) {
        mora = Math.min(c.saldo_mora, remaining);
        remaining -= mora;
      }
      if (c.saldo_interes > 0 && remaining > 0) {
        interes = Math.min(c.saldo_interes, remaining);
        remaining -= interes;
      }
      if (c.saldo_capital > 0 && remaining > 0) {
        capital = Math.min(c.saldo_capital, remaining);
        remaining -= capital;
      }

      const total = mora + interes + capital;
      if (total > 0) {
        result.push({ cuotaId: c.id, cuota: c.num_cuota, mora, interes, capital, total });
      }
    }

    return result;
  }, [montoEfectivo, cuotasPendientes]);

  const totalAplicado = distribution.reduce((s, d) => s + d.total, 0);
  const sobrante = montoEfectivo - totalAplicado;
  const cuotasCubiertas = distribution.filter((d) => {
    const c = cuotasPendientes.find((q) => q.num_cuota === d.cuota);
    if (!c) return false;
    return Math.abs(d.total - c.saldo_total) < 0.01;
  }).length;

  const canSubmit = montoNum > 0 && cajaId && distribution.length > 0 && !saving;

  const sendWhatsAppReceipt = async (dist: PaymentDistribution[], monto: number, metodoPago: string, descuentoMonto: number) => {
    try {
      // Check if WhatsApp is configured and receipt sending is enabled
      const { data: waConfig } = await (supabase.from as any)("whatsapp_config")
        .select("activo, enviar_recibo_pago")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (!waConfig?.activo || !waConfig?.enviar_recibo_pago) return;

      // Get prestamo + cliente data
      const { data: prestamo } = await supabase
        .from("prestamos")
        .select("id, num_cuotas, monto_solicitado, clientes!inner(nombre_completo, telefono)")
        .eq("id", prestamoId)
        .single();

      const cliente = (prestamo as any)?.clientes;
      if (!cliente?.telefono) return;

      // Get empresa data
      const { data: empresa } = await supabase
        .from("empresas")
        .select("nombre, telefono, direccion")
        .eq("id", empresaId)
        .single();

      // Calculate remaining balance
      const { data: remainingCuotas } = await supabase
        .from("amortizacion")
        .select("saldo_total, num_cuota, fecha_vencimiento")
        .eq("prestamo_id", prestamoId)
        .neq("status", "Pagada")
        .order("num_cuota");

      const saldoRestante = (remainingCuotas || []).reduce((s: number, c: any) => s + (c.saldo_total || 0), 0);
      const proxima = remainingCuotas?.[0];

      const totalMora = dist.reduce((s, d) => s + d.mora, 0);
      const totalInteres = dist.reduce((s, d) => s + d.interes, 0);
      const totalCapital = dist.reduce((s, d) => s + d.capital, 0);

      await supabase.functions.invoke("whatsapp-sender", {
        body: {
          action: "send-receipt",
          empresa_id: empresaId,
          phone: cliente.telefono,
          pago_data: {
            monto_recibido: monto,
            aplicado_mora: totalMora,
            aplicado_interes: totalInteres,
            aplicado_capital: totalCapital,
            metodo_pago: metodoPago,
            descuento: descuentoMonto,
            cuota_num: dist[0]?.cuota || "",
            saldo_restante: saldoRestante,
            proxima_cuota: proxima?.fecha_vencimiento || "",
            monto_proxima: proxima?.saldo_total || 0,
            folio: `PAG-${prestamoId.slice(0, 8)}`,
          },
          empresa_data: empresa,
          cliente_data: { nombre: cliente.nombre_completo },
          prestamo_data: { num_cuotas: prestamo?.num_cuotas, folio: `PRE-${prestamoId.slice(0, 8)}` },
        },
      });
    } catch (e) {
      // Silent fail - don't interrupt payment flow
      console.error("WhatsApp receipt error:", e);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // 1) Insert one pago row per cuota touched
      for (const d of distribution) {
        const { error: pagoErr } = await supabase.from("pagos").insert({
          prestamo_id: prestamoId,
          cuota_id: d.cuotaId,
          monto_recibido: d.total,
          aplicado_mora: d.mora,
          aplicado_interes: d.interes,
          aplicado_capital: d.capital,
          metodo_pago: metodo as any,
          caja_id: cajaId,
          ruta_id: rutaId || null,
          cobrador_id: cobradorId || null,
          gps_lat: geo.lat,
          gps_lng: geo.lng,
        } as any);
        if (pagoErr) throw pagoErr;

        // 2) Update amortizacion saldos for this cuota
        const cuota = cuotasPendientes.find((c) => c.id === d.cuotaId)!;
        const newSaldoMora = Math.max(0, cuota.saldo_mora - d.mora);
        const newSaldoInteres = Math.max(0, cuota.saldo_interes - d.interes);
        const newSaldoCapital = Math.max(0, cuota.saldo_capital - d.capital);
        const newSaldoTotal = newSaldoMora + newSaldoInteres + newSaldoCapital;
        const fullPaid = newSaldoTotal < 0.01;

        const updateData: Record<string, any> = {
          mora_pagada: cuota.mora_pagada + d.mora,
          interes_pagado: cuota.interes_pagado + d.interes,
          capital_pagado: cuota.capital_pagado + d.capital,
          saldo_mora: newSaldoMora,
          saldo_interes: newSaldoInteres,
          saldo_capital: newSaldoCapital,
          saldo_total: newSaldoTotal,
          status: fullPaid ? "Pagada" : "Parcial",
        };
        if (fullPaid) updateData.fecha_pagada = new Date().toISOString().slice(0, 10);
        if (descuentoNum > 0) updateData.descuento_mora = descuentoNum;
        const { error: amortErr } = await supabase.from("amortizacion").update(updateData).eq("id", d.cuotaId);
        if (amortErr) throw amortErr;
      }

      // 3) Insert movimiento_caja (entrada)
      const { error: movErr } = await supabase.from("movimientos_caja").insert({
        caja_id: cajaId,
        tipo: "entrada",
        monto: montoNum,
        prestamo_id: prestamoId,
        concepto: `Pago préstamo PRE-${prestamoId.slice(0, 8)}`,
      });
      if (movErr) throw movErr;

      // 4) Update caja balance
      const { data: cajaData } = await supabase.from("cajas").select("saldo_actual").eq("id", cajaId).single();
      if (cajaData) {
        await supabase.from("cajas").update({
          saldo_actual: (Number(cajaData.saldo_actual) || 0) + montoNum,
        }).eq("id", cajaId);
      }

      // 5) Check if all cuotas are paid → update prestamo estado
      const { data: remaining } = await supabase
        .from("amortizacion")
        .select("id")
        .eq("prestamo_id", prestamoId)
        .not("status", "eq", "Pagada");
      
      if (remaining && remaining.length === 0) {
        await supabase.from("prestamos").update({ estado: "Liquidado" }).eq("id", prestamoId);
      }

      // 6) Increment cobrador efectivo_en_mano in profiles if cobrador is assigned
      if (cobradorId) {
        const { data: cobData } = await supabase.from("profiles").select("efectivo_en_mano").eq("id", cobradorId).single();
        if (cobData) {
          await supabase.from("profiles").update({
            efectivo_en_mano: Number(cobData.efectivo_en_mano || 0) + montoNum,
          }).eq("id", cobradorId);
        }
      }

      // Invalidate and force refetch queries to refresh UI
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["amortizacion", prestamoId], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["pagos", prestamoId], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", prestamoId], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["cajas-all"], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["cobradores"], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["prestamos-list"], refetchType: "all" }),
      ]);

      toast.success(`Pago de ${$$(montoNum)} registrado correctamente`);

      // Send WhatsApp receipt in background (don't block UI)
      sendWhatsAppReceipt(distribution, montoNum, metodo, descuentoNum);

      onOpenChange(false);
      setMontoRecibido("");
      setDescuento("");
    } catch (err: any) {
      toast.error("Error al registrar pago: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <HandCoins className="h-4 w-4 text-primary" />
            Registrar Pago
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 space-y-4 pb-4">
          {/* Summary bar */}
          <div className="bg-secondary rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Total Adeudado</p>
              <p className="text-lg font-semibold">{$$(totalAdeudado)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Cuotas Pendientes</p>
              <p className="text-lg font-semibold">{cuotasPendientes.filter(c => c.saldo_total > 0).length}</p>
            </div>
          </div>

          {/* Input fields — 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto Recibido ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                className="mt-1 h-9 text-[13px]"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Descuento ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
                className="mt-1 h-9 text-[13px]"
              />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Método de Pago</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {metodosPago.map((m) => (
                    <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {metodosPago.find((m) => m.nombre === metodo)?.requiere_validacion && (
                <div className="flex items-center gap-1.5 mt-1.5 text-amber-600 text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Este método requiere validación de comprobante</span>
                </div>
              )}
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payment summary: Monto a Pagar vs Monto Pagado */}
          {(montoNum > 0 || descuentoNum > 0) && (() => {
            // Monto a Pagar = valor de la cuota actual (saldo_capital + saldo_interes + saldo_mora)
            const cuotaActual = cuotasPendientes.find(c => c.saldo_total > 0);
            const montoCuota = cuotaActual ? cuotaActual.saldo_total : 0;
            const montoAPagar = Math.max(0, montoCuota - descuentoNum);
            const diferencia = montoNum - montoAPagar;
            const isDeMenos = diferencia < -0.01;
            const isExacto = Math.abs(diferencia) <= 0.01;
            const isDeMas = diferencia > 0.01;
            return (
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 space-y-2">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Monto a Pagar</p>
                    <p className="text-[15px] font-bold">{$$(montoAPagar)}</p>
                    {descuentoNum > 0 && (
                      <p className="text-[10px] text-muted-foreground">({$$(montoCuota)} - {$$(descuentoNum)} desc.)</p>
                    )}
                    {!descuentoNum && cuotaActual && (
                      <p className="text-[10px] text-muted-foreground">Cuota #{cuotaActual.num_cuota}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Monto Pagado</p>
                    <p className={cn("text-[15px] font-bold", isDeMenos && "text-destructive", isExacto && "text-green-600", isDeMas && "text-blue-600")}>{$$(montoNum)}</p>
                    <p className={cn("text-[10px] font-medium", isDeMenos && "text-destructive", isExacto && "text-green-600", isDeMas && "text-blue-600")}>
                      {isDeMenos && `▼ ${$$( Math.abs(diferencia))} de menos`}
                      {isExacto && "✓ Exacto"}
                      {isDeMas && `▲ ${$$(diferencia)} de más`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Monto a Aplicar</p>
                    <p className="text-[15px] font-bold text-primary">{$$(montoEfectivo)}</p>
                    {descuentoNum > 0 && (
                      <p className="text-[10px] text-muted-foreground">({$$(montoNum)} + {$$(descuentoNum)} desc.)</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Distribution preview */}
          {distribution.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  Distribución del pago
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-table-header text-table-header-foreground">
                        <th className="px-3 py-1.5 text-left font-semibold text-[11px] uppercase tracking-wider">Cuota</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">A Mora</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">A Interés</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">A Capital</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">Total</th>
                        <th className="px-3 py-1.5 text-center font-semibold text-[11px] uppercase tracking-wider">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distribution.map((d) => {
                        const c = cuotasPendientes.find((q) => q.num_cuota === d.cuota);
                        const fullPaid = c && Math.abs(d.total - c.saldo_total) < 0.01;
                        return (
                          <tr key={d.cuota} className="border-t border-border/50">
                            <td className="px-3 py-1.5 font-medium">#{d.cuota}</td>
                            <td className={cn("px-3 py-1.5 text-right", d.mora > 0 ? "text-destructive font-medium" : "text-muted-foreground/50")}>{$$(d.mora)}</td>
                            <td className={cn("px-3 py-1.5 text-right", d.interes === 0 && "text-muted-foreground/50")}>{$$(d.interes)}</td>
                            <td className={cn("px-3 py-1.5 text-right", d.capital === 0 && "text-muted-foreground/50")}>{$$(d.capital)}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{$$(d.total)}</td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={cn(
                                "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium",
                                fullPaid ? "bg-badge-activo text-badge-activo-foreground" : "bg-badge-aldia text-badge-aldia-foreground"
                              )}>
                                {fullPaid ? "Cubierta" : "Parcial"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-table-header font-semibold text-[12px]">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right">{$$(distribution.reduce((s, d) => s + d.mora, 0))}</td>
                        <td className="px-3 py-1.5 text-right">{$$(distribution.reduce((s, d) => s + d.interes, 0))}</td>
                        <td className="px-3 py-1.5 text-right">{$$(distribution.reduce((s, d) => s + d.capital, 0))}</td>
                        <td className="px-3 py-1.5 text-right">{$$(totalAplicado)}</td>
                        <td className="px-3 py-1.5 text-center text-muted-foreground">{cuotasCubiertas} cubierta{cuotasCubiertas !== 1 ? "s" : ""}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {sobrante > 0.01 && (
                <div className="bg-badge-juridico/30 border border-warning/30 rounded-lg px-4 py-2 text-[12px] text-warning-foreground flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" />
                  Sobrante de <strong>{$$(sobrante)}</strong> — se aplicará como abono al saldo.
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={!canSubmit} onClick={handleSubmit}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <HandCoins className="h-3.5 w-3.5 mr-1.5" />}
            {saving ? "Procesando..." : "Confirmar Pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
