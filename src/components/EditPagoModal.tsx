import { useState, useMemo } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useMetodosPagoActivos } from "@/hooks/useCatalogos";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Loader2, Pencil } from "lucide-react";
import { $$ } from "@/lib/utils";

interface EditPagoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pago: {
    id: string;
    prestamo_id: string;
    cuota_id: string | null;
    monto_recibido: number;
    aplicado_mora: number;
    aplicado_interes: number;
    aplicado_capital: number;
    metodo_pago: string;
    caja_id: string | null;
    cobrador_id: string | null;
    fecha_pago: string | null;
  } | null;
  cajas: { id: string; nombre: string }[];
}

export function EditPagoModal({ open, onOpenChange, pago, cajas }: EditPagoModalProps) {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: metodosPago = [] } = useMetodosPagoActivos();
  const { role } = useCurrentUserRole();
  const isAdmin = role === "admin";

  const { data: cobradores = [] } = useQuery({
    queryKey: ["profiles-cobradores-edit", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre_completo");
      return data || [];
    },
    enabled: isAdmin && open,
  });

  const [montoRecibido, setMontoRecibido] = useState("");
  const [metodo, setMetodo] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [cobradorId, setCobradorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Init fields when modal opens
  if (open && pago && !initialized) {
    setMontoRecibido(pago.monto_recibido.toFixed(2));
    setMetodo(pago.metodo_pago || "Efectivo");
    setCajaId(pago.caja_id || cajas[0]?.id || "");
    setCobradorId(pago.cobrador_id || "");
    setInitialized(true);
  }
  if (!open && initialized) {
    setInitialized(false);
  }

  if (!pago) return null;

  const nuevoMonto = parseFloat(montoRecibido) || 0;
  const montoOriginal = pago.monto_recibido;
  const diferencia = nuevoMonto - montoOriginal;
  const cajaChanged = cajaId !== (pago.caja_id || "");

  const handleSave = async () => {
    if (nuevoMonto <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    setSaving(true);
    try {
      const montoChanged = Math.abs(diferencia) > 0.001;

      // If monto changed, we need to recalculate the waterfall for all cuotas this payment touches
      if (montoChanged) {
        // Step 1: Reverse the original payment from amortizacion
        // We need to fetch ALL cuotas for this prestamo to redistribute
        const { data: allCuotas } = await supabase
          .from("amortizacion")
          .select("id, num_cuota, capital, interes, capital_interes, capital_pagado, interes_pagado, mora_pagada, saldo_capital, saldo_interes, saldo_mora, saldo_total, mora, status, fecha_vencimiento")
          .eq("prestamo_id", pago.prestamo_id)
          .order("num_cuota");

        if (!allCuotas) throw new Error("No se pudieron obtener las cuotas");

        // Reverse original payment on the cuota it was linked to
        if (pago.cuota_id) {
          const cuota = allCuotas.find(c => c.id === pago.cuota_id);
          if (cuota) {
            cuota.capital_pagado = Math.max(0, Number(cuota.capital_pagado || 0) - pago.aplicado_capital);
            cuota.interes_pagado = Math.max(0, Number(cuota.interes_pagado || 0) - pago.aplicado_interes);
            cuota.mora_pagada = Math.max(0, Number(cuota.mora_pagada || 0) - pago.aplicado_mora);
            cuota.saldo_capital = Number(cuota.capital || 0) - cuota.capital_pagado;
            cuota.saldo_interes = Number(cuota.interes || 0) - cuota.interes_pagado;
            cuota.saldo_mora = Math.max(0, Number(cuota.mora || 0) - cuota.mora_pagada);
            cuota.saldo_total = cuota.saldo_capital + cuota.saldo_interes + cuota.saldo_mora;
          }
        }

        // Now redistribute the new monto using waterfall across pending cuotas
        let remaining = nuevoMonto;
        let firstCuotaId: string | null = null;
        let totalApMora = 0, totalApInteres = 0, totalApCapital = 0;
        const updates: { id: string; data: Record<string, any> }[] = [];

        const pendientes = allCuotas.filter(c => c.saldo_total > 0.001).sort((a, b) => a.num_cuota - b.num_cuota);

        for (const c of pendientes) {
          if (remaining <= 0) break;

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
            if (!firstCuotaId) firstCuotaId = c.id;
            totalApMora += mora;
            totalApInteres += interes;
            totalApCapital += capital;

            const newSaldoMora = Math.max(0, c.saldo_mora - mora);
            const newSaldoInteres = Math.max(0, c.saldo_interes - interes);
            const newSaldoCapital = Math.max(0, c.saldo_capital - capital);
            const newSaldoTotal = newSaldoMora + newSaldoInteres + newSaldoCapital;
            const fullPaid = newSaldoTotal < 0.01;

            updates.push({
              id: c.id,
              data: {
                mora_pagada: Number(c.mora_pagada || 0) + mora,
                interes_pagado: Number(c.interes_pagado || 0) + interes,
                capital_pagado: Number(c.capital_pagado || 0) + capital,
                saldo_mora: newSaldoMora,
                saldo_interes: newSaldoInteres,
                saldo_capital: newSaldoCapital,
                saldo_total: newSaldoTotal,
                status: fullPaid ? "Pagada" : (Number(c.capital_pagado || 0) + capital > 0 ? "Parcial" : c.status),
                ...(fullPaid ? { fecha_pagada: new Date().toISOString().slice(0, 10) } : {}),
              },
            });
          }
        }

        // Also reset cuotas that were previously touched but won't be now
        if (pago.cuota_id) {
          const alreadyUpdated = updates.find(u => u.id === pago.cuota_id);
          if (!alreadyUpdated) {
            const cuota = allCuotas.find(c => c.id === pago.cuota_id);
            if (cuota) {
              const venc = new Date(cuota.fecha_vencimiento);
              const isOverdue = venc < new Date();
              updates.push({
                id: cuota.id,
                data: {
                  capital_pagado: cuota.capital_pagado,
                  interes_pagado: cuota.interes_pagado,
                  mora_pagada: cuota.mora_pagada,
                  saldo_capital: cuota.saldo_capital,
                  saldo_interes: cuota.saldo_interes,
                  saldo_mora: cuota.saldo_mora,
                  saldo_total: cuota.saldo_total,
                  status: cuota.saldo_total > 0.01
                    ? (cuota.capital_pagado > 0 ? "Parcial" : (isOverdue ? "Vencida" : "Pendiente"))
                    : "Pagada",
                  fecha_pagada: cuota.saldo_total < 0.01 ? new Date().toISOString().slice(0, 10) : null,
                },
              });
            }
          }
        }

        // Apply all amortizacion updates
        for (const u of updates) {
          await supabase.from("amortizacion").update(u.data).eq("id", u.id);
        }

        // Update pago record
        await supabase.from("pagos").update({
          monto_recibido: nuevoMonto,
          aplicado_mora: totalApMora,
          aplicado_interes: totalApInteres,
          aplicado_capital: totalApCapital,
          metodo_pago: metodo as any,
          caja_id: cajaId,
          cobrador_id: cobradorId || pago.cobrador_id || null,
          cuota_id: firstCuotaId || pago.cuota_id,
        } as any).eq("id", pago.id);

        // Update caja balance (adjust by difference)
        if (pago.caja_id === cajaId) {
          // Same caja - just adjust difference
          const { data: cajaData } = await supabase.from("cajas").select("saldo_actual").eq("id", cajaId).single();
          if (cajaData) {
            await supabase.from("cajas").update({
              saldo_actual: Number(cajaData.saldo_actual || 0) + diferencia,
            }).eq("id", cajaId);
          }
        } else {
          // Different caja - remove from old, add to new
          if (pago.caja_id) {
            const { data: oldCaja } = await supabase.from("cajas").select("saldo_actual").eq("id", pago.caja_id).single();
            if (oldCaja) {
              await supabase.from("cajas").update({
                saldo_actual: Math.max(0, Number(oldCaja.saldo_actual || 0) - montoOriginal),
              }).eq("id", pago.caja_id);
            }
          }
          const { data: newCaja } = await supabase.from("cajas").select("saldo_actual").eq("id", cajaId).single();
          if (newCaja) {
            await supabase.from("cajas").update({
              saldo_actual: Number(newCaja.saldo_actual || 0) + nuevoMonto,
            }).eq("id", cajaId);
          }
        }

        // Update cobrador efectivo if changed
        if (pago.cobrador_id && pago.cobrador_id !== cobradorId) {
          const { data: oldCob } = await supabase.from("profiles").select("efectivo_en_mano").eq("id", pago.cobrador_id).single();
          if (oldCob) {
            await supabase.from("profiles").update({
              efectivo_en_mano: Math.max(0, Number(oldCob.efectivo_en_mano || 0) - montoOriginal),
            }).eq("id", pago.cobrador_id);
          }
        }
        if (cobradorId) {
          const { data: newCob } = await supabase.from("profiles").select("efectivo_en_mano").eq("id", cobradorId).single();
          if (newCob && cobradorId !== pago.cobrador_id) {
            await supabase.from("profiles").update({
              efectivo_en_mano: Number(newCob.efectivo_en_mano || 0) + nuevoMonto,
            }).eq("id", cobradorId);
          } else if (newCob && cobradorId === pago.cobrador_id) {
            await supabase.from("profiles").update({
              efectivo_en_mano: Number(newCob.efectivo_en_mano || 0) + diferencia,
            }).eq("id", cobradorId);
          }
        }

      } else {
        // Only metadata changed (method, caja, cobrador) — no balance recalc needed
        const updateData: Record<string, any> = {
          metodo_pago: metodo as any,
          caja_id: cajaId,
        };
        if (isAdmin && cobradorId) updateData.cobrador_id = cobradorId;

        await supabase.from("pagos").update(updateData as any).eq("id", pago.id);

        // Handle caja transfer if changed
        if (cajaChanged && pago.caja_id) {
          const { data: oldCaja } = await supabase.from("cajas").select("saldo_actual").eq("id", pago.caja_id).single();
          if (oldCaja) {
            await supabase.from("cajas").update({
              saldo_actual: Math.max(0, Number(oldCaja.saldo_actual || 0) - montoOriginal),
            }).eq("id", pago.caja_id);
          }
          const { data: newCaja } = await supabase.from("cajas").select("saldo_actual").eq("id", cajaId).single();
          if (newCaja) {
            await supabase.from("cajas").update({
              saldo_actual: Number(newCaja.saldo_actual || 0) + montoOriginal,
            }).eq("id", cajaId);
          }
        }
      }

      // Check liquidado status
      const { data: remaining } = await supabase
        .from("amortizacion")
        .select("id")
        .eq("prestamo_id", pago.prestamo_id)
        .not("status", "eq", "Pagada");

      if (remaining && remaining.length === 0) {
        await supabase.from("prestamos").update({ estado: "Liquidado" as any }).eq("id", pago.prestamo_id);
      } else {
        const { data: prest } = await supabase.from("prestamos").select("estado").eq("id", pago.prestamo_id).single();
        if (prest?.estado === "Liquidado") {
          await supabase.from("prestamos").update({ estado: "Activo" as any }).eq("id", pago.prestamo_id);
        }
      }

      invalidateFinanceQueries(queryClient, { prestamoId: pago.prestamo_id });

      toast.success("Pago actualizado correctamente");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al editar pago: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" />
            Editar Pago
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-secondary rounded-lg px-4 py-3 text-[13px]">
            <p className="text-muted-foreground">Pago original: <strong className="text-foreground">{$$(montoOriginal)}</strong></p>
            <p className="text-muted-foreground text-[11px] mt-1">
              Mora: {$$(pago.aplicado_mora)} · Interés: {$$(pago.aplicado_interes)} · Capital: {$$(pago.aplicado_capital)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Nuevo Monto ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                className="mt-1 h-9 text-[13px]"
                autoFocus
              />
              {Math.abs(diferencia) > 0.001 && (
                <p className={`text-[11px] mt-1 ${diferencia > 0 ? "text-[hsl(142,72%,37%)]" : "text-destructive"}`}>
                  {diferencia > 0 ? "+" : ""}{$$(diferencia)} diferencia
                </p>
              )}
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Método de Pago</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metodosPago.map((m) => (
                    <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div>
                <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Cobrador</Label>
                <Select value={cobradorId} onValueChange={setCobradorId}>
                  <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    {cobradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre_completo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {Math.abs(diferencia) > 0.001 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-[12px] text-amber-800 dark:text-amber-200">
              ⚠️ Al cambiar el monto, se recalcularán los saldos de las cuotas usando la regla waterfall (Mora → Interés → Capital).
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || nuevoMonto <= 0}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
