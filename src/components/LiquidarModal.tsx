import { useState, useMemo } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQueryClient } from "@tanstack/react-query";
import { useGeoLocation } from "@/hooks/useGeoLocation";
import { rpcLiquidarPrestamo } from "@/lib/rpcIntegridad";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Slider } from "@/components/ui/slider";
import { cn, $$, errorMessage } from "@/lib/utils";
import { HandCoins, Loader2, AlertTriangle, Percent, BadgeDollarSign, Zap } from "lucide-react";

interface Cuota {
  id: string;
  num_cuota: number;
  saldo_mora: number;
  saldo_interes: number;
  saldo_capital: number;
  saldo_total: number;
  mora_pagada: number;
  interes_pagado: number;
  capital_pagado: number;
}

interface LiquidarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  cuotasPendientes: Cuota[];
  cajas: { id: string; nombre: string }[];
  rutaId?: string | null;
  cobradorId?: string | null;
}

type LiquidarMode = "completo" | "solo_capital" | "descuento";

export function LiquidarModal({ open, onOpenChange, prestamoId, cuotasPendientes, cajas, rutaId, cobradorId }: LiquidarModalProps) {
  const queryClient = useQueryClient();
  const geo = useGeoLocation();

  const [mode, setMode] = useState<LiquidarMode>("completo");
  const [descuentoMora, setDescuentoMora] = useState(100);
  const [descuentoInteres, setDescuentoInteres] = useState(0);
  const [cajaId, setCajaId] = useState(cajas[0]?.id || "");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const capital = cuotasPendientes.reduce((s, c) => s + c.saldo_capital, 0);
    const interes = cuotasPendientes.reduce((s, c) => s + c.saldo_interes, 0);
    const mora = cuotasPendientes.reduce((s, c) => s + c.saldo_mora, 0);
    const total = capital + interes + mora;
    return { capital, interes, mora, total };
  }, [cuotasPendientes]);

  const montoAPagar = useMemo(() => {
    if (mode === "completo") return totals.total;
    if (mode === "solo_capital") return totals.capital;
    // descuento mode
    const moraConDescuento = totals.mora * (1 - descuentoMora / 100);
    const interesConDescuento = totals.interes * (1 - descuentoInteres / 100);
    return totals.capital + interesConDescuento + moraConDescuento;
  }, [mode, totals, descuentoMora, descuentoInteres]);

  const descuentoTotal = totals.total - montoAPagar;

  const handleLiquidar = async () => {
    if (!cajaId || montoAPagar <= 0) return;
    setSaving(true);
    try {
      const notaLiquidacion = mode === "completo"
        ? "Liquidación total"
        : mode === "solo_capital"
          ? `Liquidación solo capital (condonado: ${$$(descuentoTotal)})`
          : `Liquidación con descuento mora ${descuentoMora}%${descuentoInteres > 0 ? ` + interés ${descuentoInteres}%` : ""} (condonado: ${$$(descuentoTotal)})`;

      // Una sola transacción: condonaciones por cuota + pago + nota + rebuild de amortización
      const res = await rpcLiquidarPrestamo({
        prestamoId,
        cajaId,
        modo: mode,
        descMoraPct: mode === "descuento" ? descuentoMora : 0,
        descInteresPct: mode === "descuento" ? descuentoInteres : 0,
        cobradorId: cobradorId || null,
        rutaId: rutaId || null,
        fechaPago: format(new Date(), "yyyy-MM-dd"),
        gpsLat: geo.lat || null,
        gpsLng: geo.lng || null,
        montoEsperado: Math.round(montoAPagar * 100) / 100,
        nota: notaLiquidacion,
      });

      invalidateFinanceQueries(queryClient, { prestamoId });
      toast.success(`Préstamo liquidado por ${$$(Number(res?.monto ?? montoAPagar))}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err) || "Error al liquidar");
    } finally {
      setSaving(false);
    }
  };

  const modes = [
    { value: "completo" as const, label: "Liquidación Total", desc: "Pagar todo el saldo pendiente", icon: BadgeDollarSign },
    { value: "solo_capital" as const, label: "Solo Capital", desc: "Condonar mora e interés pendiente", icon: Zap },
    { value: "descuento" as const, label: "Con Descuento %", desc: "Configurar % de descuento en mora/interés", icon: Percent },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Liquidar Préstamo
          </DialogTitle>
        </DialogHeader>

        {/* Resumen de saldos */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital</p>
            <p className="text-sm font-semibold">{$$(totals.capital)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Interés</p>
            <p className="text-sm font-semibold">{$$(totals.interes)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mora</p>
            <p className={cn("text-sm font-semibold", totals.mora > 0 && "text-destructive")}>{$$(totals.mora)}</p>
          </div>
        </div>

        {/* Mode selection */}
        <div className="space-y-2">
          <Label className="text-[13px]">Tipo de Liquidación</Label>
          <div className="grid gap-2">
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                  mode === m.value ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-muted/50"
                )}
              >
                <m.icon className={cn("h-5 w-5 shrink-0", mode === m.value ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="text-[13px] font-medium">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Descuento controls */}
        {mode === "descuento" && (
          <div className="space-y-4 p-3 rounded-lg border border-border bg-muted/30">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">Descuento en Mora</Label>
                <span className="text-sm font-semibold text-primary">{descuentoMora}%</span>
              </div>
              <Slider
                value={[descuentoMora]}
                onValueChange={([v]) => setDescuentoMora(v)}
                min={0}
                max={100}
                step={5}
              />
              <p className="text-[11px] text-muted-foreground">
                Mora original: {$$(totals.mora)} → Condonado: {$$(totals.mora * descuentoMora / 100)}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">Descuento en Interés</Label>
                <span className="text-sm font-semibold text-primary">{descuentoInteres}%</span>
              </div>
              <Slider
                value={[descuentoInteres]}
                onValueChange={([v]) => setDescuentoInteres(v)}
                min={0}
                max={100}
                step={5}
              />
              <p className="text-[11px] text-muted-foreground">
                Interés original: {$$(totals.interes)} → Condonado: {$$(totals.interes * descuentoInteres / 100)}
              </p>
            </div>
          </div>
        )}

        {/* Caja */}
        <div className="space-y-1.5">
          <Label className="text-[13px]">Caja *</Label>
          <SearchableSelect
            options={cajas.map((c) => ({ value: c.id, label: c.nombre }))}
            value={cajaId}
            onValueChange={setCajaId}
            placeholder="Seleccionar caja"
          />
        </div>

        {/* Summary */}
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Monto a Cobrar</p>
              <p className="text-2xl font-bold text-primary">{$$(montoAPagar)}</p>
            </div>
            {descuentoTotal > 0 && (
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Condonado</p>
                <p className="text-lg font-semibold text-destructive line-through">{$$(descuentoTotal)}</p>
              </div>
            )}
          </div>
          {mode === "solo_capital" && (
            <p className="text-[11px] text-warning flex items-center gap-1 mt-2">
              <AlertTriangle className="h-3 w-3" />
              Se condonará toda la mora ({$$(totals.mora)}) e interés ({$$(totals.interes)}) pendiente
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleLiquidar}
            disabled={saving || !cajaId || montoAPagar <= 0}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <HandCoins className="h-4 w-4 mr-1.5" />}
            {saving ? "Liquidando..." : `Liquidar ${$$(montoAPagar)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
