import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { QuickCreateDialog, EntityType } from "@/components/shared/QuickCreateDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Route, UserCheck } from "lucide-react";

interface ReasignarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  currentRutaId: string | null;
  currentCobradorId: string | null;
  rutas: { id: string; nombre: string }[];
}

function useCobradoresOptions() {
  return useQuery({
    queryKey: ["cobradores-options-reasignar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .eq("activo", true)
        .order("nombre_completo");
      if (error) throw error;
      return (data || []).map((p) => ({ id: p.id, nombre: p.nombre_completo }));
    },
  });
}

export function ReasignarModal({ open, onOpenChange, prestamoId, currentRutaId, currentCobradorId, rutas }: ReasignarModalProps) {
  const queryClient = useQueryClient();
  const { data: cobradores = [] } = useCobradoresOptions();
  const [rutaId, setRutaId] = useState(currentRutaId || "__none__");
  const [cobradorId, setCobradorId] = useState(currentCobradorId || "__none__");
  const [saving, setSaving] = useState(false);
  const [quickCreate, setQuickCreate] = useState<EntityType | null>(null);

  const handleSave = async () => {
    setSaving(true);
    const update: Record<string, any> = {};
    update.ruta_id = rutaId === "__none__" ? null : rutaId;
    update.cobrador_id = cobradorId === "__none__" ? null : cobradorId;

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
                <SelectItem value="__none__">Sin ruta</SelectItem>
                {rutas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QuickCreateButton entityType="ruta" onCreated={(id) => setRutaId(id)} />
          </div>

          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Cobrador</Label>
            <Select value={cobradorId} onValueChange={setCobradorId}>
              <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Sin cobrador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin cobrador</SelectItem>
                {cobradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
