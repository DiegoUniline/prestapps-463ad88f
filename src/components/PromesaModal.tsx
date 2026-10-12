import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarCheck } from "lucide-react";
import { rpcRegistrarPromesaPago } from "@/lib/rpcIntegridad";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface PromesaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  cuotaNum: number;
  cuotaId: string;
  saldoTotal: number;
  fechaVencimiento: string;
}
import { $$, errorMessage } from "@/lib/utils";
export function PromesaModal({ open, onOpenChange, prestamoId, cuotaNum, cuotaId, saldoTotal, fechaVencimiento }: PromesaModalProps) {
  const [monto, setMonto] = useState(saldoTotal.toString());
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const montoNum = parseFloat(monto) || 0;
  const canSubmit = montoNum > 0 && fecha;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      // Promesa + cuota "Prometida" en una sola transacción
      await rpcRegistrarPromesaPago(prestamoId, cuotaId || null, montoNum, fecha, notas || null);

      toast.success(`Promesa registrada para cuota #${cuotaNum}`);
      queryClient.invalidateQueries({ queryKey: ["promesas"] });
      queryClient.invalidateQueries({ queryKey: ["amortizacion"] });
      onOpenChange(false);
      setMonto(saldoTotal.toString());
      setFecha("");
      setNotas("");
    } catch (err) {
      toast.error("Error al registrar promesa: " + errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Promesa de Pago — Cuota #{cuotaNum}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 space-y-4 pb-4">
          <div className="bg-secondary rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Saldo de la Cuota</p>
              <p className="text-lg font-semibold">{$$(saldoTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Vencimiento</p>
              <p className="text-sm font-medium">{fechaVencimiento}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto Prometido ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="mt-1 h-9 text-[13px]"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Fecha Prometida</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 h-9 text-[13px]"
              />
            </div>
          </div>

          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Notas (opcional)</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones..."
              className="mt-1 text-[13px] min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={!canSubmit || saving} onClick={handleSubmit}>
            <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Guardando..." : "Registrar Promesa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
