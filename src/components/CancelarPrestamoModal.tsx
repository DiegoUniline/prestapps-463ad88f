import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rpcCancelarPrestamo } from "@/lib/rpcIntegridad";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { $$, errorMessage } from "@/lib/utils";

interface CancelarPrestamoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  clienteNombre: string;
  saldoPendiente: number;
  cajaId?: string | null;
  montoDesembolso?: number;
  empresaId?: string;
  folioId?: string;
}

export function CancelarPrestamoModal({ open, onOpenChange, prestamoId, clienteNombre, saldoPendiente, cajaId, montoDesembolso }: CancelarPrestamoModalProps) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCancelar = async () => {
    if (!motivo.trim()) {
      toast.error("Debe indicar un motivo");
      return;
    }
    setSaving(true);
    try {
      // Cancelación + cuotas en cero + reintegro del desembolso en una sola transacción
      await rpcCancelarPrestamo(prestamoId, motivo.trim());

      invalidateFinanceQueries(queryClient, { prestamoId });

      toast.success("Préstamo cancelado correctamente");
      onOpenChange(false);
      setMotivo("");
    } catch (err) {
      toast.error("Error: " + String(errorMessage(err) || err));
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
            {cajaId && montoDesembolso && montoDesembolso > 0 && (
              <> El desembolso de <strong>{$$(montoDesembolso)}</strong> será reintegrado a la caja.</>
            )}
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
