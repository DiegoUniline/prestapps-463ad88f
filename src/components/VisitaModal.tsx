import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, CalendarCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const RESULTADOS_VISITA = [
  { value: "no_encontrado", label: "No se encontró al cliente" },
  { value: "se_nego", label: "Se negó a pagar" },
  { value: "sin_dinero", label: "Sin dinero disponible" },
  { value: "promesa_pago", label: "Promesa de pago" },
  { value: "abono_parcial", label: "Hizo abono parcial" },
  { value: "otro", label: "Otro" },
];

interface VisitaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  cuotaId: string;
  cuotaNum: number;
  saldoTotal: number;
}
import { $$ } from "@/lib/utils";
export function VisitaModal({ open, onOpenChange, prestamoId, clienteId, clienteNombre, cuotaId, cuotaNum, saldoTotal }: VisitaModalProps) {
  const { empresaId } = useEmpresa();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [resultado, setResultado] = useState("no_encontrado");
  const [notas, setNotas] = useState("");
  const [montoPromesa, setMontoPromesa] = useState(saldoTotal.toString());
  const [fechaPromesa, setFechaPromesa] = useState("");
  const [saving, setSaving] = useState(false);

  const isPromesa = resultado === "promesa_pago";

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // 1) Register CRM gestión as visita
      await supabase.from("crm_gestiones").insert({
        empresa_id: empresaId,
        prestamo_id: prestamoId,
        cliente_id: clienteId,
        tipo_gestion: "visita",
        resultado: resultado,
        notas: notas || null,
        fecha_seguimiento: isPromesa && fechaPromesa ? fechaPromesa : null,
        registrado_por: user?.id || null,
      });

      // 2) If promesa de pago, also register in promesas_pago and update cuota
      if (isPromesa && fechaPromesa) {
        const montoNum = parseFloat(montoPromesa) || saldoTotal;
        await supabase.from("promesas_pago").insert({
          prestamo_id: prestamoId,
          cuota_id: cuotaId,
          empresa_id: empresaId,
          monto_prometido: montoNum,
          fecha_prometida: fechaPromesa,
          notas: notas || null,
          status: "Pendiente",
        });

        // Update cuota status to Prometida
        await supabase.from("amortizacion").update({ status: "Prometida" as any }).eq("id", cuotaId);
      }

      toast.success(isPromesa ? "Visita registrada con promesa de pago" : "Visita registrada");
      queryClient.invalidateQueries({ queryKey: ["cobranza-diaria"] });
      queryClient.invalidateQueries({ queryKey: ["crm-gestiones"] });
      queryClient.invalidateQueries({ queryKey: ["promesas"] });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setResultado("no_encontrado");
    setNotas("");
    setMontoPromesa(saldoTotal.toString());
    setFechaPromesa("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" />
            Registrar Visita — Cuota #{cuotaNum}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{clienteNombre} — Saldo: {$$(saldoTotal)}</p>
        </DialogHeader>

        <div className="px-5 space-y-4 pb-4">
          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Resultado de la visita</Label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESULTADOS_VISITA.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Notas / Observaciones</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalle de la visita..."
              className="mt-1 text-[13px] min-h-[60px]"
            />
          </div>

          {/* Promesa de pago fields */}
          {isPromesa && (
            <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 space-y-3">
              <p className="text-[12px] font-semibold text-primary flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5" />
                Datos de la Promesa de Pago
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Monto Prometido ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montoPromesa}
                    onChange={(e) => setMontoPromesa(e.target.value)}
                    className="mt-1 h-8 text-[13px]"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Fecha Prometida</Label>
                  <Input
                    type="date"
                    value={fechaPromesa}
                    onChange={(e) => setFechaPromesa(e.target.value)}
                    className="mt-1 h-8 text-[13px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-8 text-[13px]"
            disabled={saving || (isPromesa && !fechaPromesa)}
            onClick={handleSubmit}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5 mr-1.5" />}
            {saving ? "Guardando..." : "Registrar Visita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
