import { useState, useEffect } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
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

export function AnularPagoModal({ open, onOpenChange, pago }: AnularPagoModalProps) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isLastPago, setIsLastPago] = useState<boolean | null>(null);

  // Validate that this is the last (most recent) active payment for the loan
  useEffect(() => {
    if (!open || !pago) {
      setIsLastPago(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const { data, error } = await supabase
          .from("pagos")
          .select("id")
          .eq("prestamo_id", pago.prestamo_id)
          .eq("anulado", false)
          .order("fecha_pago", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          setIsLastPago(!error && data?.id === pago.id);
        }
      } catch {
        if (!cancelled) setIsLastPago(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, pago?.id, pago?.prestamo_id]);

  if (!pago) return null;

  const handleAnular = async () => {
    if (!motivo.trim()) {
      toast.error("Debe indicar un motivo de anulación");
      return;
    }

    if (!isLastPago) {
      toast.error("No es posible anular este pago. Existen pagos posteriores registrados.");
      return;
    }

    setSaving(true);
    try {
      // Validate caja balance before calling the atomic function
      if (pago.caja_id) {
        const { data: cajaData } = await supabase
          .from("cajas")
          .select("saldo_actual, nombre")
          .eq("id", pago.caja_id)
          .single();
        if (cajaData && Number(cajaData.saldo_actual) < pago.monto_recibido) {
          toast.error(`Saldo insuficiente en caja "${cajaData.nombre}" (${$$(Number(cajaData.saldo_actual))}). No se puede anular un pago de ${$$(pago.monto_recibido)}`);
          setSaving(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Single atomic RPC: reverses cuotas, marks pago, creates caja movement, updates cobrador
      const { error: rpcErr } = await (supabase.rpc as any)("revertir_pago", {
        p_pago_id: pago.id,
        p_motivo: motivo.trim(),
        p_user_id: user?.id || null,
      });
      if (rpcErr) throw rpcErr;

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

  const blocked = isLastPago === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Anular Pago
          </DialogTitle>
        </DialogHeader>

        {checking ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando...
          </div>
        ) : blocked ? (
          <div className="space-y-4 py-2">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-4 text-[13px] flex gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">No es posible anular este pago</p>
                <p className="mt-1 text-muted-foreground">
                  Existen pagos posteriores registrados. Para anular este pago, primero debes anular los pagos más recientes.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Entendido</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-[13px]">
                <p className="font-medium text-destructive">¿Confirmas la anulación? Esta acción revertirá:</p>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
