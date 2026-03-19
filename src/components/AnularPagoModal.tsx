import { useState } from "react";
import Decimal from "decimal.js";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import { $$ } from "@/lib/utils";

interface AnularPagoModalProps {
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
    caja_id: string | null;
    cobrador_id: string | null;
  } | null;
}

type CuotaRebuild = {
  id: string;
  num_cuota: number;
  fecha_vencimiento: string;
  original_status: string | null;
  capital_pagado: Decimal;
  interes_pagado: Decimal;
  mora_pagada: Decimal;
  saldo_capital: Decimal;
  saldo_interes: Decimal;
  saldo_mora: Decimal;
  saldo_total: Decimal;
};

const toMoney = (value: Decimal.Value) => new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

const applyWaterfall = (cuotas: CuotaRebuild[], monto: number) => {
  let restante = toMoney(monto);

  for (const cuota of cuotas) {
    if (restante.lte(0)) break;
    if (cuota.saldo_total.lte(0)) continue;

    const aplicadoMora = Decimal.min(restante, cuota.saldo_mora);
    cuota.mora_pagada = cuota.mora_pagada.plus(aplicadoMora);
    cuota.saldo_mora = cuota.saldo_mora.minus(aplicadoMora);
    restante = restante.minus(aplicadoMora);

    const aplicadoInteres = Decimal.min(restante, cuota.saldo_interes);
    cuota.interes_pagado = cuota.interes_pagado.plus(aplicadoInteres);
    cuota.saldo_interes = cuota.saldo_interes.minus(aplicadoInteres);
    restante = restante.minus(aplicadoInteres);

    const aplicadoCapital = Decimal.min(restante, cuota.saldo_capital);
    cuota.capital_pagado = cuota.capital_pagado.plus(aplicadoCapital);
    cuota.saldo_capital = cuota.saldo_capital.minus(aplicadoCapital);
    restante = restante.minus(aplicadoCapital);

    cuota.saldo_total = cuota.saldo_capital.plus(cuota.saldo_interes).plus(cuota.saldo_mora);
  }
};

const resolveStatus = (cuota: CuotaRebuild) => {
  if (cuota.saldo_total.lte(0.009)) return "Pagada";

  const totalPagado = cuota.capital_pagado.plus(cuota.interes_pagado).plus(cuota.mora_pagada);
  if (totalPagado.gt(0)) return "Parcial";

  if (cuota.original_status === "Prometida") return "Prometida";

  return new Date(cuota.fecha_vencimiento) < new Date() ? "Vencida" : "Pendiente";
};

export function AnularPagoModal({ open, onOpenChange, pago }: AnularPagoModalProps) {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  if (!pago) return null;

  const handleAnular = async () => {
    if (!motivo.trim()) {
      toast.error("Debe indicar un motivo de anulación");
      return;
    }

    setSaving(true);
    onOpenChange(false); // Close immediately to prevent double-clicks
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Mark payment as anulado first
      const { error: pagoErr } = await supabase
        .from("pagos")
        .update({
          anulado: true,
          anulado_por: user?.id || null,
          anulado_en: new Date().toISOString(),
          motivo_anulacion: motivo.trim(),
        } as any)
        .eq("id", pago.id);
      if (pagoErr) throw pagoErr;

      // Small delay to allow any concurrent annulments to mark their pagos first
      await new Promise((r) => setTimeout(r, 500));

      await (supabase.rpc as any)("recalcular_mora", { p_prestamo_id: pago.prestamo_id });

      const [cuotasRes, pagosRes] = await Promise.all([
        supabase
          .from("amortizacion")
          .select("id, num_cuota, fecha_vencimiento, status, capital, interes, mora")
          .eq("prestamo_id", pago.prestamo_id)
          .order("num_cuota", { ascending: true }),
        supabase
          .from("pagos")
          .select("monto_recibido, created_at")
          .eq("prestamo_id", pago.prestamo_id)
          .eq("anulado", false)
          .order("created_at", { ascending: true }),
      ]);

      if (cuotasRes.error) throw cuotasRes.error;
      if (pagosRes.error) throw pagosRes.error;

      const cuotas = (cuotasRes.data || []).map((c) => {
        const saldoCapital = toMoney(c.capital || 0);
        const saldoInteres = toMoney(c.interes || 0);
        const saldoMora = toMoney(c.mora || 0);
        return {
          id: c.id,
          num_cuota: c.num_cuota,
          fecha_vencimiento: c.fecha_vencimiento,
          original_status: c.status,
          capital_pagado: toMoney(0),
          interes_pagado: toMoney(0),
          mora_pagada: toMoney(0),
          saldo_capital: saldoCapital,
          saldo_interes: saldoInteres,
          saldo_mora: saldoMora,
          saldo_total: saldoCapital.plus(saldoInteres).plus(saldoMora),
        } as CuotaRebuild;
      });

      for (const pagoVigente of pagosRes.data || []) {
        applyWaterfall(cuotas, Number(pagoVigente.monto_recibido || 0));
      }

      await Promise.all(
        cuotas.map((cuota) => {
          const status = resolveStatus(cuota);
          return supabase
            .from("amortizacion")
            .update({
              capital_pagado: cuota.capital_pagado.toNumber(),
              interes_pagado: cuota.interes_pagado.toNumber(),
              mora_pagada: cuota.mora_pagada.toNumber(),
              saldo_capital: cuota.saldo_capital.toNumber(),
              saldo_interes: cuota.saldo_interes.toNumber(),
              saldo_mora: cuota.saldo_mora.toNumber(),
              saldo_total: cuota.saldo_total.toNumber(),
              status: status as any,
              fecha_pagada: status === "Pagada" ? new Date().toISOString().slice(0, 10) : null,
            })
            .eq("id", cuota.id);
        })
      );

      if (pago.caja_id) {
        const { data: cajaData } = await supabase
          .from("cajas")
          .select("saldo_actual")
          .eq("id", pago.caja_id)
          .single();

        await Promise.all([
          cajaData
            ? supabase
                .from("cajas")
                .update({
                  saldo_actual: Math.max(0, Number(cajaData.saldo_actual || 0) - pago.monto_recibido),
                })
                .eq("id", pago.caja_id)
            : Promise.resolve({ error: null }),
          supabase.from("movimientos_caja").insert({
            caja_id: pago.caja_id,
            tipo: "salida",
            monto: pago.monto_recibido,
            prestamo_id: pago.prestamo_id,
            concepto: `Anulación de pago — ${motivo.trim()}`,
            empresa_id: empresaId,
          }),
        ]);
      }

      if (pago.cobrador_id) {
        const { data: cobData } = await supabase
          .from("profiles")
          .select("efectivo_en_mano")
          .eq("id", pago.cobrador_id)
          .single();

        if (cobData) {
          await supabase
            .from("profiles")
            .update({
              efectivo_en_mano: Math.max(0, Number(cobData.efectivo_en_mano || 0) - pago.monto_recibido),
            })
            .eq("id", pago.cobrador_id);
        }
      }

      const cuotasPendientes = cuotas.filter((c) => c.saldo_total.gt(0.009)).length;
      if (cuotasPendientes === 0) {
        await supabase.from("prestamos").update({ estado: "Liquidado" as any }).eq("id", pago.prestamo_id);
      } else {
        const { data: prest } = await supabase
          .from("prestamos")
          .select("estado")
          .eq("id", pago.prestamo_id)
          .single();

        if (prest?.estado === "Liquidado") {
          await supabase.from("prestamos").update({ estado: "Activo" as any }).eq("id", pago.prestamo_id);
        }
      }

      invalidateFinanceQueries(queryClient, { prestamoId: pago.prestamo_id });
      toast.success("Pago anulado correctamente");
      onOpenChange(false);
      setMotivo("");
    } catch (err: any) {
      toast.error("Error al anular: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Anular Pago
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-[13px]">
            <p className="font-medium text-destructive">Esta acción revertirá:</p>
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              <li>• Monto recibido: <strong className="text-foreground">{$$(pago.monto_recibido)}</strong></li>
              {pago.aplicado_mora > 0 && <li>• Mora aplicada: {$$(pago.aplicado_mora)}</li>}
              {pago.aplicado_interes > 0 && <li>• Interés aplicado: {$$(pago.aplicado_interes)}</li>}
              {pago.aplicado_capital > 0 && <li>• Capital aplicado: {$$(pago.aplicado_capital)}</li>}
            </ul>
          </div>

          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Motivo de anulación *</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique el motivo de la anulación..."
              className="mt-1 text-[13px]"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button variant="destructive" onClick={handleAnular} disabled={saving || !motivo.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Confirmar Anulación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
