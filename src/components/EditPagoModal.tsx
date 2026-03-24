import { useState, useMemo } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useMetodosPagoActivos } from "@/hooks/useCatalogos";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Loader2, Pencil } from "lucide-react";
import { $$ } from "@/lib/utils";

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
  const cajaChanged = cajaId !== (pago.caja_id || "");

  const handleSave = async () => {
    if (nuevoMonto <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    setSaving(true);
    try {
      const montoChanged = Math.abs(diferencia) > 0.001;

      // 1) Update the pago record metadata
      const updateData: Record<string, any> = {
        monto_recibido: nuevoMonto,
        metodo_pago: metodo as any,
        caja_id: cajaId,
      };
      if (isAdmin && cobradorId) updateData.cobrador_id = cobradorId;

      await supabase.from("pagos").update(updateData as any).eq("id", pago.id);

      // 2) Handle caja balance via movimientos_caja (let trigger manage saldo_actual)
      if (montoChanged || cajaChanged) {
        // Get human-readable loan ID for concepto
        const { data: prestamoData } = await supabase
          .from("prestamos")
          .select("id_prestamo")
          .eq("id", pago.prestamo_id)
          .single();
        const folio = prestamoData?.id_prestamo || pago.prestamo_id.slice(0, 8);

        // Reverse original: insert salida on old caja
        if (pago.caja_id) {
          await supabase.from("movimientos_caja").insert({
            caja_id: pago.caja_id,
            tipo: "salida" as const,
            monto: montoOriginal,
            prestamo_id: pago.prestamo_id,
            concepto: `Corrección pago ${folio} — salida de caja anterior`,
            empresa_id: empresaId,
          });
        }
        // Re-enter on new caja
        await supabase.from("movimientos_caja").insert({
          caja_id: cajaId,
          tipo: "entrada" as const,
          monto: nuevoMonto,
          prestamo_id: pago.prestamo_id,
          concepto: cajaChanged && !montoChanged
            ? `Corrección pago ${folio} — cambio de caja`
            : `Corrección pago ${folio} — monto actualizado`,
          empresa_id: empresaId,
        });
      }

      // 3) Handle cobrador efectivo_en_mano changes
      if (pago.cobrador_id && pago.cobrador_id !== cobradorId) {
        const { data: oldCob } = await supabase.from("profiles").select("efectivo_en_mano").eq("id", pago.cobrador_id).single();
        if (oldCob) {
          await supabase.from("profiles").update({
            efectivo_en_mano: Math.max(0, Number(oldCob.efectivo_en_mano || 0) - montoOriginal),
          }).eq("id", pago.cobrador_id);
        }
      }
      if (cobradorId) {
        const { data: newCob } = await supabase.from("profiles").select("efectivo_en_mano").eq("id", cobradorId).single();
        if (newCob && cobradorId !== pago.cobrador_id) {
          await supabase.from("profiles").update({
            efectivo_en_mano: Number(newCob.efectivo_en_mano || 0) + nuevoMonto,
          }).eq("id", cobradorId);
        } else if (newCob && cobradorId === pago.cobrador_id && montoChanged) {
          await supabase.from("profiles").update({
            efectivo_en_mano: Number(newCob.efectivo_en_mano || 0) + diferencia,
          }).eq("id", cobradorId);
        }
      }

      // 4) If monto changed, rebuild amortizacion atomically via RPC
      if (montoChanged) {
        const { error: rebuildErr } = await supabase.rpc("rebuild_amortizacion", {
          p_prestamo_id: pago.prestamo_id,
        });
        if (rebuildErr) throw rebuildErr;
      } else {
        // Check liquidado status even if monto didn't change
        const { data: remaining } = await supabase
          .from("amortizacion")
          .select("id")
          .eq("prestamo_id", pago.prestamo_id)
          .not("status", "eq", "Pagada");

        if (remaining && remaining.length === 0) {
          await supabase.from("prestamos").update({ estado: "Liquidado" as any }).eq("id", pago.prestamo_id);
        } else {
          const { data: prest } = await supabase.from("prestamos").select("estado").eq("id", pago.prestamo_id).single();
          if (prest?.estado === "Liquidado") {
            await supabase.from("prestamos").update({ estado: "Activo" as any }).eq("id", pago.prestamo_id);
          }
        }
      }

      invalidateFinanceQueries(queryClient, { prestamoId: pago.prestamo_id });

      toast.success("Pago actualizado correctamente");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al editar pago: " + (err.message || err));
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
