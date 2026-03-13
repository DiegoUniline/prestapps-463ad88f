import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useFrecuenciasPagoActivas } from "@/hooks/useCatalogos";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Loader2, RefreshCw } from "lucide-react";
import { addDays, addWeeks, addMonths } from "date-fns";

interface ReestructurarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  saldoCapital: number;
  saldoTotal: number; // capital + interes + mora
  prestamo: {
    modalidad: string;
    frecuencia: string;
    tasa_interes: number | null;
    tipo_mora: string | null;
    valor_mora: number | null;
    caja_id: string | null;
    ruta_id: string | null;
    cobrador_id: string | null;
  };
}

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function calcNextDate(base: Date, frecuencia: string, n: number): Date {
  switch (frecuencia) {
    case "diario": return addDays(base, n);
    case "semanal": return addWeeks(base, n);
    case "quincenal": return addDays(base, n * 15);
    case "mensual": return addMonths(base, n);
    default: return addMonths(base, n);
  }
}

export function ReestructurarModal({
  open, onOpenChange, prestamoId, clienteId, clienteNombre,
  saldoCapital, saldoTotal, prestamo,
}: ReestructurarModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: frecuencias = [] } = useFrecuenciasPagoActivas();

  const [base, setBase] = useState<"capital" | "total">("capital");
  const [numCuotas, setNumCuotas] = useState("12");
  const [frecuencia, setFrecuencia] = useState(prestamo.frecuencia);
  const [tasaInteres, setTasaInteres] = useState(String(prestamo.tasa_interes || 0));
  const [modalidad, setModalidad] = useState(prestamo.modalidad);
  const [saving, setSaving] = useState(false);

  const montoBase = base === "capital" ? saldoCapital : saldoTotal;
  const cuotasNum = parseInt(numCuotas) || 1;
  const tasaNum = parseFloat(tasaInteres) || 0;

  const cuotaEstimada = useMemo(() => {
    if (modalidad === "fijo") {
      const totalPagar = montoBase * (1 + tasaNum / 100);
      return totalPagar / cuotasNum;
    } else {
      // Saldos insolutos - approximate
      if (tasaNum === 0) return montoBase / cuotasNum;
      const r = tasaNum / 100;
      return (montoBase * r * Math.pow(1 + r, cuotasNum)) / (Math.pow(1 + r, cuotasNum) - 1);
    }
  }, [montoBase, cuotasNum, tasaNum, modalidad]);

  const handleReestructurar = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Cancel original loan as "Reestructurado"
      await supabase.from("prestamos").update({
        estado: "Reestructurado" as any,
        cancelado_por: user?.id || null,
        cancelado_en: new Date().toISOString(),
        motivo_cancelacion: `Reestructurado — base: ${base === "capital" ? "solo capital" : "saldo total"} (${$$(montoBase)})`,
      } as any).eq("id", prestamoId);

      // Zero out remaining cuotas on old loan
      await supabase.from("amortizacion").update({
        saldo_capital: 0, saldo_interes: 0, saldo_mora: 0, saldo_total: 0,
      }).eq("prestamo_id", prestamoId).not("status", "eq", "Pagada");

      // 2) Create new loan
      const fechaPrimerPago = calcNextDate(new Date(), frecuencia, 1);
      let montoTotalPagar = montoBase;
      if (modalidad === "fijo") {
        montoTotalPagar = montoBase * (1 + tasaNum / 100);
      } else {
        montoTotalPagar = cuotaEstimada * cuotasNum;
      }

      const { data: newPrestamo, error: newErr } = await supabase.from("prestamos").insert({
        cliente_id: clienteId,
        empresa_id: empresaId,
        monto_solicitado: montoBase,
        monto_total_pagar: montoTotalPagar,
        num_cuotas: cuotasNum,
        frecuencia: frecuencia as any,
        modalidad: modalidad as any,
        tasa_interes: tasaNum,
        cuota_calculada: cuotaEstimada,
        tipo_mora: prestamo.tipo_mora as any,
        valor_mora: prestamo.valor_mora,
        caja_id: prestamo.caja_id,
        ruta_id: prestamo.ruta_id,
        cobrador_id: prestamo.cobrador_id,
        fecha_primer_pago: fechaPrimerPago.toISOString().slice(0, 10),
        estado: "Activo" as any,
        generado_por: user?.id || null,
        reestructurado_de: prestamoId,
        notas: `Reestructurado del préstamo PRE-${prestamoId.slice(0, 8)} — base: ${base === "capital" ? "solo capital" : "saldo total"}`,
      } as any).select("id").single();

      if (newErr) throw newErr;

      // 3) Generate amortization for new loan
      const cuotaRows = [];
      for (let i = 1; i <= cuotasNum; i++) {
        const fechaVenc = calcNextDate(fechaPrimerPago, frecuencia, i - 1);
        let capital: number, interes: number;

        if (modalidad === "fijo") {
          capital = montoBase / cuotasNum;
          interes = (montoBase * tasaNum / 100) / cuotasNum;
        } else {
          const saldoAnterior = montoBase - (montoBase / cuotasNum) * (i - 1);
          interes = saldoAnterior * (tasaNum / 100);
          capital = cuotaEstimada - interes;
        }

        const capitalInteres = capital + interes;
        cuotaRows.push({
          prestamo_id: newPrestamo.id,
          empresa_id: empresaId,
          num_cuota: i,
          capital,
          interes,
          capital_interes: capitalInteres,
          fecha_vencimiento: fechaVenc.toISOString().slice(0, 10),
          saldo_capital: capital,
          saldo_interes: interes,
          saldo_total: capitalInteres,
          status: "Pendiente" as any,
        });
      }

      const { error: amortErr } = await supabase.from("amortizacion").insert(cuotaRows as any);
      if (amortErr) throw amortErr;

      queryClient.invalidateQueries({ queryKey: ["prestamo-detalle"] });
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });

      toast.success("Préstamo reestructurado exitosamente");
      onOpenChange(false);
      navigate(`/prestamos/${newPrestamo.id}`);
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-primary" />
            Reestructurar Préstamo
          </DialogTitle>
          <p className="text-[13px] text-muted-foreground mt-1">
            Cliente: <strong>{clienteNombre}</strong> — PRE-{prestamoId.slice(0, 8)}
          </p>
        </DialogHeader>

        <div className="px-5 space-y-4 pb-4">
          {/* Base selection */}
          <div>
            <Label className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2 block">
              Base para nuevo préstamo
            </Label>
            <RadioGroup value={base} onValueChange={(v) => setBase(v as "capital" | "total")} className="space-y-2">
              <label className="flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="capital" />
                <div>
                  <p className="text-[13px] font-medium">Solo capital pendiente</p>
                  <p className="text-[12px] text-muted-foreground">{$$(saldoCapital)}</p>
                </div>
              </label>
              <label className="flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="total" />
                <div>
                  <p className="text-[13px] font-medium">Saldo total (capital + interés + mora)</p>
                  <p className="text-[12px] text-muted-foreground">{$$(saldoTotal)}</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          <Separator />

          {/* New loan config */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto base</Label>
              <Input value={$$(montoBase)} readOnly className="mt-1 h-9 text-[13px] bg-muted" />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Modalidad</Label>
              <Select value={modalidad} onValueChange={setModalidad}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fijo">Interés Fijo</SelectItem>
                  <SelectItem value="insolutos">Saldos Insolutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Núm. Cuotas</Label>
              <Input type="number" min="1" value={numCuotas} onChange={(e) => setNumCuotas(e.target.value)} className="mt-1 h-9 text-[13px]" />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Frecuencia</Label>
              <Select value={frecuencia} onValueChange={setFrecuencia}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {frecuencias.map((f) => (
                    <SelectItem key={f.id} value={f.nombre}>{f.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Tasa Interés (%)</Label>
              <Input type="number" step="0.01" min="0" value={tasaInteres} onChange={(e) => setTasaInteres(e.target.value)} className="mt-1 h-9 text-[13px]" />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Cuota estimada</Label>
              <Input value={$$(cuotaEstimada)} readOnly className="mt-1 h-9 text-[13px] bg-muted font-semibold" />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
            <p className="text-[12px] text-muted-foreground">
              Se cancelará el préstamo actual (quedará como <strong>Reestructurado</strong>) y se creará uno nuevo por <strong>{$$(montoBase)}</strong> con {numCuotas} cuotas {frecuencia}es.
            </p>
          </div>
        </div>

        <DialogFooter className="px-5 pb-5">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleReestructurar} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Reestructurar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
