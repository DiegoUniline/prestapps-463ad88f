import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";

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
import { $$ } from "@/lib/utils";
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
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Mark pago as anulado
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

      // 2) Reverse cuota saldos if cuota_id exists
      if (pago.cuota_id) {
        const { data: cuota } = await supabase
          .from("amortizacion")
          .select("id, capital, interes, capital_pagado, interes_pagado, mora_pagada, saldo_capital, saldo_interes, saldo_mora, saldo_total, status, fecha_vencimiento")
          .eq("id", pago.cuota_id)
          .single();

        if (cuota) {
          const originalCapital = Number(cuota.capital || 0);
          const originalInteres = Number(cuota.interes || 0);

          const newCapitalPagado = Math.max(0, Number(cuota.capital_pagado || 0) - pago.aplicado_capital);
          const newInteresPagado = Math.max(0, Number(cuota.interes_pagado || 0) - pago.aplicado_interes);
          const newMoraPagada = Math.max(0, Number(cuota.mora_pagada || 0) - pago.aplicado_mora);
          // Cap saldos at original cuota values to prevent inflation
          const newSaldoCapital = Math.min(originalCapital, Number(cuota.saldo_capital || 0) + pago.aplicado_capital);
          const newSaldoInteres = Math.min(originalInteres, Number(cuota.saldo_interes || 0) + pago.aplicado_interes);
          const newSaldoMora = Number(cuota.saldo_mora || 0) + pago.aplicado_mora;
          const newSaldoTotal = newSaldoCapital + newSaldoInteres + newSaldoMora;

          // Determine new status
          let newStatus: string = "Pendiente";
          if (newCapitalPagado > 0 || newInteresPagado > 0 || newMoraPagada > 0) {
            newStatus = "Parcial";
          }
          // Check if overdue
          const venc = new Date(cuota.fecha_vencimiento);
          if (venc < new Date() && newStatus === "Pendiente") {
            newStatus = "Vencida";
          }

          await supabase.from("amortizacion").update({
            capital_pagado: newCapitalPagado,
            interes_pagado: newInteresPagado,
            mora_pagada: newMoraPagada,
            saldo_capital: newSaldoCapital,
            saldo_interes: newSaldoInteres,
            saldo_mora: newSaldoMora,
            saldo_total: newSaldoTotal,
            status: newStatus as any,
            fecha_pagada: null,
          }).eq("id", pago.cuota_id);
        }
      }

      // 3) Reverse caja balance
      if (pago.caja_id) {
        const { data: cajaData } = await supabase
          .from("cajas")
          .select("saldo_actual")
          .eq("id", pago.caja_id)
          .single();

        if (cajaData) {
          await supabase.from("cajas").update({
            saldo_actual: Math.max(0, Number(cajaData.saldo_actual || 0) - pago.monto_recibido),
          }).eq("id", pago.caja_id);
        }

        // Insert reverse movimiento
        await supabase.from("movimientos_caja").insert({
          caja_id: pago.caja_id,
          tipo: "salida",
          monto: pago.monto_recibido,
          prestamo_id: pago.prestamo_id,
          concepto: `Anulación de pago — ${motivo.trim()}`,
          empresa_id: empresaId,
        });
      }

      // 4) Reverse cobrador efectivo in profiles
      if (pago.cobrador_id) {
        const { data: cobData } = await supabase.from("profiles")
          .select("efectivo_en_mano")
          .eq("id", pago.cobrador_id)
          .single();
        if (cobData) {
          await supabase.from("profiles").update({
            efectivo_en_mano: Math.max(0, Number(cobData.efectivo_en_mano || 0) - pago.monto_recibido),
          }).eq("id", pago.cobrador_id);
        }
      }

      // 5) Check if prestamo needs state change back from Liquidado
      const { data: remaining } = await supabase
        .from("amortizacion")
        .select("id")
        .eq("prestamo_id", pago.prestamo_id)
        .not("status", "eq", "Pagada");

      if (remaining && remaining.length > 0) {
        // Check current estado
        const { data: prest } = await supabase
          .from("prestamos")
          .select("estado")
          .eq("id", pago.prestamo_id)
          .single();
        if (prest?.estado === "Liquidado") {
          await supabase.from("prestamos").update({ estado: "Activo" as any }).eq("id", pago.prestamo_id);
        }
      }

      // Invalidate all finance-related queries
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
