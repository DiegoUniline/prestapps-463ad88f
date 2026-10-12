import { useState, useMemo } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useMetodosPagoActivos } from "@/hooks/useCatalogos";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { rpcEditarPago } from "@/lib/rpcIntegridad";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Loader2, Pencil } from "lucide-react";
import { $$, errorMessage } from "@/lib/utils";

interface EditPagoModalProps {
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
    metodo_pago: string;
    caja_id: string | null;
    cobrador_id: string | null;
    fecha_pago: string | null;
  } | null;
  cajas: { id: string; nombre: string }[];
}

export function EditPagoModal({ open, onOpenChange, pago, cajas }: EditPagoModalProps) {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: metodosPago = [] } = useMetodosPagoActivos();
  const { role } = useCurrentUserRole();
  const isAdmin = role === "admin";

  const { data: cobradores = [] } = useQuery({
    queryKey: ["profiles-cobradores-edit", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre_completo");
      return data || [];
    },
    enabled: isAdmin && open,
  });

  const [montoRecibido, setMontoRecibido] = useState("");
  const [metodo, setMetodo] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [cobradorId, setCobradorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Init fields when modal opens
  if (open && pago && !initialized) {
    setMontoRecibido(pago.monto_recibido.toFixed(2));
    setMetodo(pago.metodo_pago || "Efectivo");
    setCajaId(pago.caja_id || cajas[0]?.id || "");
    setCobradorId(pago.cobrador_id || "");
    setInitialized(true);
  }
  if (!open && initialized) {
    setInitialized(false);
  }

  if (!pago) return null;

  const nuevoMonto = parseFloat(montoRecibido) || 0;
  const montoOriginal = pago.monto_recibido;
  const diferencia = nuevoMonto - montoOriginal;

  const handleSave = async () => {
    if (nuevoMonto <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    setSaving(true);
    try {
      // Pago + movimientos de corrección + efectivo_en_mano + amortización en una sola
      // transacción. El servidor rechaza pagos ya liquidados en un corte.
      await rpcEditarPago({
        pagoId: pago.id,
        monto: nuevoMonto,
        metodo,
        cajaId,
        cobradorId: isAdmin && cobradorId ? cobradorId : null,
      });

      invalidateFinanceQueries(queryClient, { prestamoId: pago.prestamo_id });

      toast.success("Pago actualizado correctamente");
      onOpenChange(false);
    } catch (err) {
      toast.error("Error al editar pago: " + (errorMessage(err) || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" />
            Editar Pago
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-secondary rounded-lg px-4 py-3 text-[13px]">
            <p className="text-muted-foreground">Pago original: <strong className="text-foreground">{$$(montoOriginal)}</strong></p>
            <p className="text-muted-foreground text-[11px] mt-1">
              Mora: {$$(pago.aplicado_mora)} · Interés: {$$(pago.aplicado_interes)} · Capital: {$$(pago.aplicado_capital)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Nuevo Monto ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                className="mt-1 h-9 text-[13px]"
                autoFocus
              />
              {Math.abs(diferencia) > 0.001 && (
                <p className={`text-[11px] mt-1 ${diferencia > 0 ? "text-[hsl(142,72%,37%)]" : "text-destructive"}`}>
                  {diferencia > 0 ? "+" : ""}{$$(diferencia)} diferencia
                </p>
              )}
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Método de Pago</Label>
              <SearchableSelect
                options={metodosPago.map((m) => ({ value: m.nombre, label: m.nombre }))}
                value={metodo}
                onValueChange={setMetodo}
                placeholder="Seleccionar..."
                searchPlaceholder="Buscar método..."
                triggerClassName="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja</Label>
              <SearchableSelect
                options={cajas.map((c) => ({ value: c.id, label: c.nombre }))}
                value={cajaId}
                onValueChange={setCajaId}
                placeholder="Seleccionar..."
                searchPlaceholder="Buscar caja..."
                triggerClassName="mt-1"
              />
            </div>
            {isAdmin && (
              <div>
                <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Cobrador</Label>
                <SearchableSelect
                  options={cobradores.map((c) => ({ value: c.id, label: c.nombre_completo }))}
                  value={cobradorId}
                  onValueChange={setCobradorId}
                  placeholder="Sin asignar"
                  searchPlaceholder="Buscar cobrador..."
                  triggerClassName="mt-1"
                />
              </div>
            )}
          </div>

          {Math.abs(diferencia) > 0.001 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-[12px] text-amber-800 dark:text-amber-200">
              ⚠️ Al cambiar el monto, se recalcularán los saldos de las cuotas usando la regla waterfall (Mora → Interés → Capital).
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || nuevoMonto <= 0}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
