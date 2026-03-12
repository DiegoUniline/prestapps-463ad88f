import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Route, UserCheck } from "lucide-react";

interface ReasignarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  currentRutaId: string | null;
  currentCobradorId: string | null;
  rutas: { id: string; nombre: string }[];
}

export function ReasignarModal({ open, onOpenChange, prestamoId, currentRutaId, currentCobradorId, rutas }: ReasignarModalProps) {
  const queryClient = useQueryClient();
  const [rutaId, setRutaId] = useState(currentRutaId || "none");
  const [cobradorId, setCobradorId] = useState(currentCobradorId || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const update: Record<string, any> = {};
    update.ruta_id = rutaId === "none" ? null : rutaId;
    update.cobrador_id = cobradorId || null;

    const { error } = await supabase.from("prestamos").update(update).eq("id", prestamoId);
    setSaving(false);

    if (error) {
      toast.error("Error al reasignar: " + error.message);
      return;
    }

    toast.success("Ruta / Cobrador reasignados correctamente");
    queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", prestamoId] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" />
            Reasignar Ruta / Cobrador
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 space-y-4 pb-4">
          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Ruta</Label>
            <Select value={rutaId} onValueChange={setRutaId}>
              <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Sin ruta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin ruta</SelectItem>
                {rutas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">ID Cobrador</Label>
            <input
              type="text"
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[13px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="UUID del cobrador (opcional)"
              value={cobradorId}
              onChange={(e) => setCobradorId(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={saving} onClick={handleSave}>
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
