import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { QuickCreateDialog, EntityType } from "@/components/shared/QuickCreateDialog";
import { Loader2, Pencil } from "lucide-react";

interface EditPrestamoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamo: {
    id: string;
    tasa_interes: number | null;
    tipo_mora: string | null;
    valor_mora: number | null;
    gastos_legales: number | null;
    caja_id: string | null;
    ruta_id: string | null;
    cobrador_id: string | null;
    notas: string | null;
    codigo_interno: string | null;
  };
  cajas: { id: string; nombre: string }[];
  rutas: { id: string; nombre: string }[];
  cobradores: { id: string; nombre: string }[];
}

export function EditPrestamoModal({ open, onOpenChange, prestamo, cajas, rutas, cobradores }: EditPrestamoModalProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [tasaInteres, setTasaInteres] = useState("");
  const [tipoMora, setTipoMora] = useState("");
  const [valorMora, setValorMora] = useState("");
  const [gastosLegales, setGastosLegales] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [cobradorId, setCobradorId] = useState("");
  const [notas, setNotas] = useState("");
  const [codigoInterno, setCodigoInterno] = useState("");
  const [quickCreate, setQuickCreate] = useState<EntityType | null>(null);

  useEffect(() => {
    if (open) {
      setTasaInteres(prestamo.tasa_interes?.toString() ?? "");
      setTipoMora(prestamo.tipo_mora ?? "porcentaje");
      setValorMora(prestamo.valor_mora?.toString() ?? "");
      setGastosLegales(prestamo.gastos_legales?.toString() ?? "");
      setCajaId(prestamo.caja_id ?? "");
      setRutaId(prestamo.ruta_id ?? "");
      setCobradorId(prestamo.cobrador_id ?? "");
      setNotas(prestamo.notas ?? "");
      setCodigoInterno((prestamo as any).codigo_interno ?? "");
    }
  }, [open, prestamo]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        tasa_interes: tasaInteres ? parseFloat(tasaInteres) : null,
        tipo_mora: tipoMora as any,
        valor_mora: valorMora ? parseFloat(valorMora) : 0,
        gastos_legales: gastosLegales ? parseFloat(gastosLegales) : 0,
        caja_id: cajaId || null,
        ruta_id: rutaId || null,
        cobrador_id: cobradorId || null,
        notas: notas || null,
        codigo_interno: codigoInterno || null,
      };

      const { error } = await supabase
        .from("prestamos")
        .update(updates)
        .eq("id", prestamo.id);

      if (error) throw error;

      invalidateFinanceQueries(queryClient, { prestamoId: prestamo.id });

      toast.success("Préstamo actualizado correctamente");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al actualizar: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" />
            Editar Préstamo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Asignación */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Asignación</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Ruta</Label>
                <SearchableSelect
                  options={rutas.map((r) => ({ value: r.id, label: r.nombre }))}
                  value={rutaId}
                  onValueChange={setRutaId}
                  placeholder="Sin ruta"
                  allowNone noneLabel="Sin ruta"
                  triggerClassName="mt-1"
                  onCreate={() => setQuickCreate("ruta")}
                  createLabel="Crear nueva ruta"
                />
              </div>
              <div>
                <Label className="text-xs">Cobrador</Label>
                <SearchableSelect
                  options={cobradores.map((c) => ({ value: c.id, label: c.nombre }))}
                  value={cobradorId}
                  onValueChange={setCobradorId}
                  placeholder="Sin cobrador"
                  allowNone noneLabel="Sin cobrador"
                  triggerClassName="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Caja</Label>
                <SearchableSelect
                  options={cajas.map((c) => ({ value: c.id, label: c.nombre }))}
                  value={cajaId}
                  onValueChange={setCajaId}
                  placeholder="Sin caja"
                  allowNone noneLabel="Sin caja"
                  triggerClassName="mt-1"
                  onCreate={() => setQuickCreate("caja")}
                  createLabel="Crear nueva caja"
                />
              </div>
            </div>
          </div>

          {/* Financiero */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Configuración Financiera</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tasa de Interés (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tasaInteres}
                  onChange={(e) => setTasaInteres(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Gastos Legales ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={gastosLegales}
                  onChange={(e) => setGastosLegales(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Tipo Mora</Label>
                <SearchableSelect
                  options={[
                    { value: "porcentaje", label: "Porcentaje" },
                    { value: "fijo", label: "Fijo" },
                  ]}
                  value={tipoMora}
                  onValueChange={setTipoMora}
                  placeholder="Tipo mora"
                  triggerClassName="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Valor Mora {tipoMora === "porcentaje" ? "(%)" : "($)"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorMora}
                  onChange={(e) => setValorMora(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Código Interno */}
          <div>
            <Label className="text-xs">Código Interno</Label>
            <Input
              value={codigoInterno}
              onChange={(e) => setCodigoInterno(e.target.value)}
              placeholder="Ej: CI-001, REF-2024..."
              className="mt-1 h-9 text-sm"
            />
          </div>

          {/* Notas */}
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas del préstamo..."
              className="mt-1 text-sm min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
      {quickCreate && (
        <QuickCreateDialog
          entityType={quickCreate}
          open={!!quickCreate}
          onOpenChange={(open) => { if (!open) setQuickCreate(null); }}
          onCreated={(id) => {
            if (quickCreate === "ruta") setRutaId(id);
            else if (quickCreate === "caja") setCajaId(id);
            setQuickCreate(null);
          }}
        />
      )}
    </Dialog>
  );
}
