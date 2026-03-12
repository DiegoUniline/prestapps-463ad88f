import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { HandCoins, Info } from "lucide-react";

interface Cuota {
  num_cuota: number;
  saldo_mora: number;
  saldo_interes: number;
  saldo_capital: number;
  saldo_total: number;
  status: string;
  fecha_vencimiento: string;
}

interface PaymentDistribution {
  cuota: number;
  mora: number;
  interes: number;
  capital: number;
  total: number;
}

interface PagoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamoId: string;
  cuotasPendientes: Cuota[];
  cajas: { id: string; nombre: string }[];
  rutaId?: string | null;
  cobradorId?: string | null;
}

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PagoModal({ open, onOpenChange, prestamoId, cuotasPendientes, cajas }: PagoModalProps) {
  const [montoRecibido, setMontoRecibido] = useState("");
  const [descuento, setDescuento] = useState("");
  const [metodo, setMetodo] = useState("Efectivo");
  const [cajaId, setCajaId] = useState(cajas[0]?.id || "");

  const totalAdeudado = cuotasPendientes.reduce((s, c) => s + c.saldo_total, 0);
  const montoNum = parseFloat(montoRecibido) || 0;
  const descuentoNum = parseFloat(descuento) || 0;
  const montoEfectivo = montoNum + descuentoNum; // total que se aplica a las cuotas

  // Distribute payment across installments (mora → interés → capital order)
  const distribution = useMemo((): PaymentDistribution[] => {
    if (montoEfectivo <= 0) return [];
    let remaining = montoEfectivo;
    const result: PaymentDistribution[] = [];

    for (const c of cuotasPendientes) {
      if (remaining <= 0) break;
      if (c.saldo_total <= 0) continue;

      let mora = 0, interes = 0, capital = 0;

      // 1) Mora
      if (c.saldo_mora > 0 && remaining > 0) {
        mora = Math.min(c.saldo_mora, remaining);
        remaining -= mora;
      }
      // 2) Interés
      if (c.saldo_interes > 0 && remaining > 0) {
        interes = Math.min(c.saldo_interes, remaining);
        remaining -= interes;
      }
      // 3) Capital
      if (c.saldo_capital > 0 && remaining > 0) {
        capital = Math.min(c.saldo_capital, remaining);
        remaining -= capital;
      }

      const total = mora + interes + capital;
      if (total > 0) {
        result.push({ cuota: c.num_cuota, mora, interes, capital, total });
      }
    }

    return result;
  }, [montoEfectivo, cuotasPendientes]);

  const totalAplicado = distribution.reduce((s, d) => s + d.total, 0);
  const sobrante = montoEfectivo - totalAplicado;
  const cuotasCubiertas = distribution.filter((d) => {
    const c = cuotasPendientes.find((q) => q.num_cuota === d.cuota);
    if (!c) return false;
    return Math.abs(d.total - c.saldo_total) < 0.01;
  }).length;

  const canSubmit = montoNum > 0 && cajaId && distribution.length > 0;

  const handleSubmit = () => {
    // TODO: connect to Supabase
    console.log({
      prestamoId,
      montoRecibido: montoNum,
      descuento: descuentoNum,
      montoEfectivo,
      metodo,
      cajaId,
      distribution,
    });
    onOpenChange(false);
    setMontoRecibido("");
    setDescuento("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <HandCoins className="h-4 w-4 text-primary" />
            Registrar Pago — {prestamoId}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 space-y-4 pb-4">
          {/* Summary bar */}
          <div className="bg-secondary rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Total Adeudado</p>
              <p className="text-lg font-semibold">{$$(totalAdeudado)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Cuotas Pendientes</p>
              <p className="text-lg font-semibold">{cuotasPendientes.filter(c => c.saldo_total > 0).length}</p>
            </div>
          </div>

          {/* Input fields — 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto Recibido ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                className="mt-1 h-9 text-[13px]"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Descuento ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
                className="mt-1 h-9 text-[13px]"
              />
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Método de Pago</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Efectivo">Efectivo</SelectItem>
                  <SelectItem value="Transferencia">Transferencia</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Effective amount summary */}
          {(montoNum > 0 || descuentoNum > 0) && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px]">
                <Info className="h-3.5 w-3.5 text-primary" />
                <span>Recibido <strong>{$$(montoNum)}</strong></span>
                {descuentoNum > 0 && <span>+ Descuento <strong>{$$(descuentoNum)}</strong></span>}
              </div>
              <div className="text-[13px] font-semibold">
                Total aplicado: <span className="text-primary">{$$(montoEfectivo)}</span>
              </div>
            </div>
          )}

          {/* Distribution preview */}
          {distribution.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  Distribución del pago
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-table-header text-table-header-foreground">
                        <th className="px-3 py-1.5 text-left font-semibold text-[11px] uppercase tracking-wider">Cuota</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">A Mora</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">A Interés</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">A Capital</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-[11px] uppercase tracking-wider">Total</th>
                        <th className="px-3 py-1.5 text-center font-semibold text-[11px] uppercase tracking-wider">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distribution.map((d) => {
                        const c = cuotasPendientes.find((q) => q.num_cuota === d.cuota);
                        const fullPaid = c && Math.abs(d.total - c.saldo_total) < 0.01;
                        return (
                          <tr key={d.cuota} className="border-t border-border/50">
                            <td className="px-3 py-1.5 font-medium">#{d.cuota}</td>
                            <td className={cn("px-3 py-1.5 text-right", d.mora > 0 ? "text-destructive font-medium" : "text-muted-foreground/50")}>{$$(d.mora)}</td>
                            <td className={cn("px-3 py-1.5 text-right", d.interes === 0 && "text-muted-foreground/50")}>{$$(d.interes)}</td>
                            <td className={cn("px-3 py-1.5 text-right", d.capital === 0 && "text-muted-foreground/50")}>{$$(d.capital)}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{$$(d.total)}</td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={cn(
                                "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium",
                                fullPaid ? "bg-badge-activo text-badge-activo-foreground" : "bg-badge-aldia text-badge-aldia-foreground"
                              )}>
                                {fullPaid ? "Cubierta" : "Parcial"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-table-header font-semibold text-[12px]">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right">{$$(distribution.reduce((s, d) => s + d.mora, 0))}</td>
                        <td className="px-3 py-1.5 text-right">{$$(distribution.reduce((s, d) => s + d.interes, 0))}</td>
                        <td className="px-3 py-1.5 text-right">{$$(distribution.reduce((s, d) => s + d.capital, 0))}</td>
                        <td className="px-3 py-1.5 text-right">{$$(totalAplicado)}</td>
                        <td className="px-3 py-1.5 text-center text-muted-foreground">{cuotasCubiertas} cubierta{cuotasCubiertas !== 1 ? "s" : ""}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {sobrante > 0.01 && (
                <div className="bg-badge-juridico/30 border border-warning/30 rounded-lg px-4 py-2 text-[12px] text-warning-foreground flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" />
                  Sobrante de <strong>{$$(sobrante)}</strong> — se aplicará como abono al saldo.
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-secondary/30">
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={!canSubmit} onClick={handleSubmit}>
            <HandCoins className="h-3.5 w-3.5 mr-1.5" />
            Confirmar Pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
