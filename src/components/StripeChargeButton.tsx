import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreditCard, Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn, $$ } from "@/lib/utils";

interface StripeChargeButtonProps {
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string | null;
  clienteEmail?: string | null;
  cuotaId?: string;
  monto: number;
  cuotaNum?: number;
  onChargeSuccess?: () => void;
}

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StripeChargeButton({
  prestamoId, clienteId, clienteNombre, clienteTelefono, clienteEmail,
  cuotaId, monto, cuotaNum, onChargeSuccess,
}: StripeChargeButtonProps) {
  const { empresaId } = useEmpresa();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "link_sent" | "error" | null>(null);

  // Check if Stripe Connect is configured for this empresa
  const { data: connectStatus } = useQuery({
    queryKey: ["stripe-connect-status", empresaId],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/stripe-connect-status?empresa_id=${empresaId}`;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  // Check if this client has a card registered
  const { data: paymentMethod } = useQuery({
    queryKey: ["stripe-pm", empresaId, clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stripe_payment_methods" as any)
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("cliente_id", clienteId)
        .eq("activo", true)
        .maybeSingle();
      return data as any;
    },
    enabled: !!connectStatus?.charges_enabled,
  });

  // If Stripe isn't set up for this empresa, don't show button
  if (!connectStatus?.charges_enabled) return null;

  const hasCard = paymentMethod?.stripe_payment_method_id;

  const handleAction = async () => {
    setLoading(true);
    setResult(null);

    try {
      if (hasCard) {
        // ── CHARGE the card ──
        const { data, error } = await supabase.functions.invoke("stripe-charge-cuota", {
          body: {
            empresa_id: empresaId,
            prestamo_id: prestamoId,
            cuota_id: cuotaId || null,
            cliente_id: clienteId,
            monto,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.success) {
          setResult("success");
          toast.success(`Cobro de ${$$(monto)} realizado a tarjeta ${paymentMethod.brand} ****${paymentMethod.last4}`);

          // Send WhatsApp notification
          if (clienteTelefono) {
            try {
              await supabase.functions.invoke("whatsapp-sender", {
                body: {
                  action: "send-message",
                  empresa_id: empresaId,
                  phone: clienteTelefono,
                  message: `✅ Se ha procesado un cobro de ${$$(monto)} a su tarjeta ${paymentMethod.brand} ****${paymentMethod.last4} para la cuota${cuotaNum ? ` #${cuotaNum}` : ""} del préstamo PRE-${prestamoId.slice(0, 8)}. Gracias por su pago.`,
                },
              });
            } catch { /* silent */ }
          }

          onChargeSuccess?.();
        } else {
          throw new Error(data?.status || "Cobro no exitoso");
        }
      } else {
        // ── SEND payment link to register card ──
        const { data, error } = await supabase.functions.invoke("stripe-create-payment-link", {
          body: {
            empresa_id: empresaId,
            cliente_id: clienteId,
            cliente_nombre: clienteNombre,
            cliente_email: clienteEmail,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.url) {
          // Send link via WhatsApp if client has phone
          if (clienteTelefono) {
            try {
              await supabase.functions.invoke("whatsapp-sender", {
                body: {
                  action: "send-message",
                  empresa_id: empresaId,
                  phone: clienteTelefono,
                  message: `💳 Hola ${clienteNombre}, para facilitar sus pagos le invitamos a registrar su tarjeta de forma segura en el siguiente enlace:\n\n${data.url}\n\nEste enlace es 100% seguro y procesado por Stripe.`,
                },
              });
              toast.success("Enlace de registro de tarjeta enviado por WhatsApp");
              setResult("link_sent");
            } catch {
              // If WhatsApp fails, open URL in new tab
              window.open(data.url, "_blank");
              toast.info("WhatsApp no disponible. Se abrió el enlace en nueva pestaña.");
              setResult("link_sent");
            }
          } else {
            // No phone - open URL directly
            window.open(data.url, "_blank");
            toast.info("Enlace abierto en nueva pestaña (cliente sin teléfono registrado)");
            setResult("link_sent");
          }
        }
      }
    } catch (err: any) {
      setResult("error");
      toast.error(err.message || "Error al procesar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-[12px]"
        onClick={() => setConfirmOpen(true)}
      >
        <CreditCard className="h-3.5 w-3.5" />
        {hasCard ? "Cobrar Tarjeta" : "Enviar Link Tarjeta"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(v) => { setConfirmOpen(v); if (!v) setResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {hasCard ? "Cobrar con Tarjeta" : "Registrar Tarjeta"}
            </DialogTitle>
            <DialogDescription>
              {hasCard
                ? `Se cobrará ${$$(monto)} a la tarjeta ${paymentMethod.brand} ****${paymentMethod.last4} del cliente ${clienteNombre}.`
                : `El cliente ${clienteNombre} no tiene tarjeta registrada. Se enviará un enlace seguro para que registre su tarjeta.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Card info */}
            {hasCard && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <CreditCard className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{paymentMethod.brand?.toUpperCase()} ****{paymentMethod.last4}</p>
                  <p className="text-xs text-muted-foreground">Vence {paymentMethod.exp_month}/{paymentMethod.exp_year}</p>
                </div>
              </div>
            )}

            {!hasCard && clienteTelefono && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Send className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Se enviará por WhatsApp</p>
                  <p className="text-xs text-muted-foreground">{clienteTelefono}</p>
                </div>
              </div>
            )}

            {!hasCard && !clienteTelefono && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                <span>El cliente no tiene teléfono. El enlace se abrirá en una nueva pestaña.</span>
              </div>
            )}

            {/* Result feedback */}
            {result === "success" && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Cobro realizado exitosamente</span>
              </div>
            )}
            {result === "link_sent" && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Enlace de registro enviado</span>
              </div>
            )}
            {result === "error" && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span>Error al procesar. Intente de nuevo.</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
              {result ? "Cerrar" : "Cancelar"}
            </Button>
            {!result && (
              <Button onClick={handleAction} disabled={loading} className="gap-2">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasCard ? (
                  <CreditCard className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {loading ? "Procesando..." : hasCard ? `Cobrar ${$$(monto)}` : "Enviar Enlace"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
