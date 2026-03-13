import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

      await supabase.from("prestamos").update({
        estado: "Cancelado" as any,
        cancelado_por: user?.id || null,
        cancelado_en: new Date().toISOString(),
        motivo_cancelacion: motivo.trim(),
      } as any).eq("id", prestamoId);

      // Mark remaining cuotas as cancelled (set saldo to 0)
      await supabase.from("amortizacion").update({
        status: "Pagada" as any,
        saldo_capital: 0,
        saldo_interes: 0,
        saldo_mora: 0,
        saldo_total: 0,
      }).eq("prestamo_id", prestamoId).not("status", "eq", "Pagada");

      queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", prestamoId] });
      queryClient.invalidateQueries({ queryKey: ["amortizacion", prestamoId] });
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });

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
