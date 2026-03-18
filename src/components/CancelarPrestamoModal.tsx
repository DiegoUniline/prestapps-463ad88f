import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { $$ } from "@/lib/utils";

interface CancelarPrestamoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  clienteNombre: string;
  saldoPendiente: number;
}

export function CancelarPrestamoModal({ open, onOpenChange, prestamoId, clienteNombre, saldoPendiente }: CancelarPrestamoModalProps) {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCancelar = async () => {
    if (!motivo.trim()) {
      toast.error("Debe indicar un motivo");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Get prestamo info for caja reversal
      const { data: prestamo } = await supabase
        .from("prestamos")
        .select("id, monto_solicitado, caja_id, cobrador_id")
        .eq("id", prestamoId)
        .single();

      // 2) Get all valid (non-annulled) pagos for this prestamo to reverse them
      const { data: pagosValidos } = await supabase
        .from("pagos")
        .select("id, monto_recibido, caja_id, cobrador_id")
        .eq("prestamo_id", prestamoId)
        .eq("anulado", false);

      // 3) Mark prestamo as Cancelado
      await supabase.from("prestamos").update({
        estado: "Cancelado" as any,
        cancelado_por: user?.id || null,
        cancelado_en: new Date().toISOString(),
        motivo_cancelacion: motivo.trim(),
      } as any).eq("id", prestamoId);

      // 4) Mark remaining cuotas as cancelled (set saldo to 0)
      await supabase.from("amortizacion").update({
        status: "Pagada" as any,
        saldo_capital: 0,
        saldo_interes: 0,
        saldo_mora: 0,
        saldo_total: 0,
      }).eq("prestamo_id", prestamoId).not("status", "eq", "Pagada");

      // 5) Mark all valid pagos as anulado
      if (pagosValidos && pagosValidos.length > 0) {
        const pagoIds = pagosValidos.map(p => p.id);
        await supabase.from("pagos").update({
          anulado: true,
          anulado_por: user?.id || null,
          anulado_en: new Date().toISOString(),
          motivo_anulacion: `Cancelación de préstamo: ${motivo.trim()}`,
        } as any).in("id", pagoIds);
      }

      // 6) Reverse caja balances: subtract all cobros and return the desembolso
      // Group pago amounts by caja
      const cajaPagoTotals: Record<string, number> = {};
      for (const p of pagosValidos || []) {
        if (p.caja_id) {
          cajaPagoTotals[p.caja_id] = (cajaPagoTotals[p.caja_id] || 0) + Number(p.monto_recibido || 0);
        }
      }

      // For each caja that received pagos, subtract those amounts
      for (const [cajaId, totalPagos] of Object.entries(cajaPagoTotals)) {
        const { data: cajaData } = await supabase
          .from("cajas").select("saldo_actual").eq("id", cajaId).single();
        if (cajaData) {
          await supabase.from("cajas").update({
            saldo_actual: Math.max(0, Number(cajaData.saldo_actual || 0) - totalPagos),
          }).eq("id", cajaId);
        }
        await supabase.from("movimientos_caja").insert({
          caja_id: cajaId,
          tipo: "salida",
          monto: totalPagos,
          prestamo_id: prestamoId,
          concepto: `Cancelación de préstamo — reversión de cobros`,
          empresa_id: empresaId,
        });
      }

      // 7) Return desembolso to caja (the money that was lent out comes back)
      if (prestamo?.caja_id) {
        const { data: cajaDesembolso } = await supabase
          .from("cajas").select("saldo_actual").eq("id", prestamo.caja_id).single();
        if (cajaDesembolso) {
          await supabase.from("cajas").update({
            saldo_actual: Number(cajaDesembolso.saldo_actual || 0) + Number(prestamo.monto_solicitado || 0),
          }).eq("id", prestamo.caja_id);
        }
        await supabase.from("movimientos_caja").insert({
          caja_id: prestamo.caja_id,
          tipo: "entrada",
          monto: Number(prestamo.monto_solicitado || 0),
          prestamo_id: prestamoId,
          concepto: `Cancelación de préstamo — reversión de desembolso`,
          empresa_id: empresaId,
        });
      }

      // 8) Reverse cobrador efectivo_en_mano
      const cobradorPagoTotals: Record<string, number> = {};
      for (const p of pagosValidos || []) {
        if (p.cobrador_id) {
          cobradorPagoTotals[p.cobrador_id] = (cobradorPagoTotals[p.cobrador_id] || 0) + Number(p.monto_recibido || 0);
        }
      }
      for (const [cobradorId, totalPagos] of Object.entries(cobradorPagoTotals)) {
        const { data: cobData } = await supabase
          .from("profiles").select("efectivo_en_mano").eq("id", cobradorId).single();
        if (cobData) {
          await supabase.from("profiles").update({
            efectivo_en_mano: Math.max(0, Number(cobData.efectivo_en_mano || 0) - totalPagos),
          }).eq("id", cobradorId);
        }
      }

      invalidateFinanceQueries(queryClient, { prestamoId });
      toast.success("Préstamo cancelado correctamente");
      onOpenChange(false);
      setMotivo("");
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Cancelar Préstamo</AlertDialogTitle>
          <AlertDialogDescription>
            Está a punto de cancelar el préstamo de <strong>{clienteNombre}</strong>.
            {saldoPendiente > 0 && (
              <> Saldo pendiente: <strong className="text-destructive">{$$(saldoPendiente)}</strong>. Este saldo se perderá.</>
            )}
            <br /><br />
            <strong>Se revertirán:</strong> todos los cobros registrados, el desembolso volverá a la caja y los saldos de cobradores se ajustarán.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Motivo de cancelación *</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique el motivo..."
            className="mt-1 text-[13px]"
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleCancelar(); }}
            disabled={saving || !motivo.trim()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Confirmar Cancelación
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
