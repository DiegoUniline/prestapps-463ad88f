import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, Trash2, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CONFIRM_CODE = "BORRAR-TODO";

export function PurgeDataSection() {
  const { empresaId } = useEmpresa();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [keepCatalogs, setKeepCatalogs] = useState(true);
  const [keepClientes, setKeepClientes] = useState(true);
  const [inputCode, setInputCode] = useState("");
  const [purging, setPurging] = useState(false);

  const reset = () => {
    setStep(1);
    setKeepCatalogs(true);
    setKeepClientes(true);
    setInputCode("");
    setPurging(false);
  };

  const handleOpen = () => {
    reset();
    setOpen(true);
  };

  const handlePurge = async () => {
    if (inputCode !== CONFIRM_CODE) {
      toast.error("Código de confirmación incorrecto");
      return;
    }
    setPurging(true);
    try {
      const { data, error } = await supabase.functions.invoke("purge-empresa-data", {
        body: { keepCatalogs, keepClientes, confirmCode: inputCode },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success(data.message);
      qc.invalidateQueries();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al purgar datos");
    } finally {
      setPurging(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5" />
            Zona de Peligro
          </CardTitle>
          <CardDescription>
            Eliminar todos los datos operativos de la empresa. Esta acción es irreversible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleOpen} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Purgar Datos de la Empresa
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!purging) { setOpen(v); if (!v) reset(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Purgar Datos — Paso {step} de 3
            </DialogTitle>
            <DialogDescription>
              {step === 1 && "Elige qué datos quieres eliminar."}
              {step === 2 && "Revisa lo que se va a borrar. Esto es IRREVERSIBLE."}
              {step === 3 && "Confirma escribiendo el código de seguridad."}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Choose what to delete */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm space-y-1.5">
                <p className="font-semibold text-destructive">Se eliminarán:</p>
                <ul className="list-disc list-inside text-muted-foreground text-[13px] space-y-0.5">
                  <li>Todos los préstamos y amortizaciones</li>
                  <li>Todos los pagos y movimientos de caja</li>
                  <li>Promesas, solicitudes, gestiones CRM</li>
                  <li>Rutas, cortes, folios (se reinician)</li>
                  <li>Efectivo en mano de cobradores (se reinicia a $0)</li>
                  <li>Logs de WhatsApp y Stripe</li>
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="font-semibold text-[13px] text-[hsl(142,72%,37%)] mb-1">Nunca se elimina:</p>
                <ul className="list-disc list-inside text-muted-foreground text-[13px] space-y-0.5">
                  <li>Tu usuario y perfil</li>
                  <li>La empresa y su configuración</li>
                  <li>Las cajas (se reinicia el saldo a $0)</li>
                  <li>Otros usuarios de tu empresa</li>
                </ul>
              </div>

              <Separator />

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-[13px] font-medium">¿Conservar clientes?</p>
                  <p className="text-[11px] text-muted-foreground">
                    Mantener la base de datos de clientes registrados
                  </p>
                </div>
                <Switch checked={keepClientes} onCheckedChange={setKeepClientes} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-[13px] font-medium">¿Conservar catálogos?</p>
                  <p className="text-[11px] text-muted-foreground">
                    Planes de cuotas, métodos de pago, estados, frecuencias, etc.
                  </p>
                </div>
                <Switch checked={keepCatalogs} onCheckedChange={setKeepCatalogs} />
              </div>
            </div>
          )}

          {/* Step 2: Confirmation summary */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 border-2 border-destructive/30 text-center">
                <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-2" />
                <p className="font-bold text-destructive text-lg">¡ATENCIÓN!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Estás a punto de eliminar <strong>TODOS</strong> los datos operativos de tu empresa.
                </p>
                <p className="text-sm font-semibold text-destructive mt-2">
                  Esta acción NO se puede deshacer.
                </p>
              </div>

              <div className="text-[13px] space-y-1">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  <span>Préstamos, pagos, efectivo en mano — <strong className="text-destructive">ELIMINADOS/REINICIADOS</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  {keepClientes ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-[hsl(142,72%,37%)]" /><span>Clientes — <strong className="text-[hsl(142,72%,37%)]">CONSERVADOS</strong></span></>
                  ) : (
                    <><Trash2 className="h-3.5 w-3.5 text-destructive" /><span>Clientes — <strong className="text-destructive">ELIMINADOS</strong></span></>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {keepCatalogs ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-[hsl(142,72%,37%)]" /><span>Catálogos — <strong className="text-[hsl(142,72%,37%)]">CONSERVADOS</strong></span></>
                  ) : (
                    <><Trash2 className="h-3.5 w-3.5 text-destructive" /><span>Catálogos — <strong className="text-destructive">ELIMINADOS</strong></span></>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Enter code */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-[13px] font-medium mb-2">
                  Escribe <code className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-bold text-sm">{CONFIRM_CODE}</code> para confirmar:
                </p>
                <Input
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="Escribe el código aquí"
                  className={cn(
                    "font-mono text-center text-lg tracking-widest",
                    inputCode === CONFIRM_CODE && "border-destructive ring-1 ring-destructive"
                  )}
                  autoFocus
                />
              </div>
              {inputCode.length > 0 && inputCode !== CONFIRM_CODE && (
                <p className="text-[11px] text-destructive text-center">El código no coincide</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2)} disabled={purging}>
                Atrás
              </Button>
            )}
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={purging}>
              Cancelar
            </Button>
            {step < 3 ? (
              <Button variant="destructive" onClick={() => setStep((s) => (s + 1) as 2 | 3)}>
                Continuar
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handlePurge}
                disabled={purging || inputCode !== CONFIRM_CODE}
                className="gap-2"
              >
                {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {purging ? "Eliminando..." : "Confirmar Eliminación"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
