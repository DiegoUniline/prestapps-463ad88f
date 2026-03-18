import { useState } from "react";
import { useAccesoApp } from "@/hooks/useAccesoApp";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Lock, CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { $$, cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SubscriptionBanner() {
  const { estado, showBanner, data, diasGraciaRestantes, diasTrialRestantes, facturaPendiente } = useAccesoApp();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);

  const handlePayNow = async () => {
    if (!data?.plan_id) {
      navigate("/mi-suscripcion");
      toast.info("Primero selecciona un plan para continuar.");
      return;
    }

    setPaying(true);
    try {
      const { data: checkoutData, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan_id: data.plan_id,
          num_usuarios: data.num_usuarios || 1,
        },
      });

      if (error) throw error;
      if (!checkoutData?.url) throw new Error("No se pudo generar el enlace de pago");

      window.open(checkoutData.url, "_blank");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo abrir Stripe, intenta de nuevo.");
    } finally {
      setPaying(false);
    }
  };

  if (!showBanner) return null;

  // ── Trial active — info banner with countdown ──
  if (estado === "trial") {
    return (
      <div className="bg-primary/5 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary text-sm min-w-0">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            Prueba gratuita — {diasTrialRestantes !== null && diasTrialRestantes !== undefined
              ? `${diasTrialRestantes} día${diasTrialRestantes !== 1 ? "s" : ""} restante${diasTrialRestantes !== 1 ? "s" : ""}`
              : "7 días gratis"}
          </span>
        </div>
        <Link to="/mi-suscripcion">
          <Button size="sm" variant="outline" className="shrink-0 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
            <CreditCard className="h-3.5 w-3.5" />
            Elegir plan
          </Button>
        </Link>
      </div>
    );
  }

  // ── Trial expired — grace period or blocked ──
  if (estado === "trial_expirado") {
    const hasGrace = diasGraciaRestantes !== null && diasGraciaRestantes !== undefined && diasGraciaRestantes > 0;

    return (
      <div className={cn(
        "border-b px-4 py-3 flex items-center justify-between gap-3",
        hasGrace
          ? "bg-amber-500/10 border-amber-500/30"
          : "bg-destructive/10 border-destructive/30"
      )}>
        <div className={cn(
          "flex items-center gap-3 text-sm min-w-0",
          hasGrace ? "text-amber-700 dark:text-amber-400" : "text-destructive"
        )}>
          {hasGrace ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <Lock className="h-5 w-5 shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold">
              {hasGrace
                ? `⚠️ Tu prueba gratuita terminó — Te ${diasGraciaRestantes === 1 ? "queda" : "quedan"} ${diasGraciaRestantes} día${diasGraciaRestantes !== 1 ? "s" : ""} para elegir un plan`
                : "🔒 Cuenta bloqueada — Tu periodo de gracia ha expirado"
              }
            </p>
            <p className="text-xs opacity-80">
              {hasGrace
                ? "Elige un plan para continuar usando el sistema. Tus datos están seguros."
                : "Elige y paga un plan para reactivar tu cuenta. Tus datos están seguros."
              }
            </p>
          </div>
        </div>
        <Link to="/mi-suscripcion">
          <Button size="sm" variant={hasGrace ? "default" : "destructive"} className={cn(
            "shrink-0 gap-1.5",
            hasGrace && "bg-amber-600 hover:bg-amber-700 text-white"
          )}>
            <CreditCard className="h-3.5 w-3.5" />
            Elegir plan
          </Button>
        </Link>
      </div>
    );
  }

  // ── Pendiente de pago — invoice generated, waiting for payment ──
  if (estado === "pendiente_pago") {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400 text-sm min-w-0">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              💳 Factura pendiente de pago
              {facturaPendiente ? ` — ${$$(facturaPendiente.total)}` : ""}
            </p>
            <p className="text-xs opacity-80">
              {facturaPendiente
                ? `Factura ${facturaPendiente.numero_factura}${facturaPendiente.es_prorrateo ? " (prorrateada)" : ""}. Realiza el pago para activar tu plan.`
                : "Realiza el pago para activar tu plan."}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handlePayNow} disabled={paying} className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
          <CreditCard className="h-3.5 w-3.5" />
          {paying ? "Abriendo..." : "Pagar ahora"}
        </Button>
      </div>
    );
  }

  // ── Grace period — payment pending ──
  if (estado === "gracia") {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400 text-sm min-w-0">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              ⚠️ Pago pendiente — {diasGraciaRestantes !== null && diasGraciaRestantes !== undefined
                ? diasGraciaRestantes > 0
                  ? `Te ${diasGraciaRestantes === 1 ? "queda" : "quedan"} ${diasGraciaRestantes} día${diasGraciaRestantes !== 1 ? "s" : ""} para regularizar`
                  : "Tu periodo de gracia ha expirado"
                : "Tienes 3 días para regularizar tu pago"}
            </p>
            <p className="text-xs opacity-80">
              {facturaPendiente
                ? `Factura ${facturaPendiente.numero_factura} por ${$$(facturaPendiente.total)} pendiente de pago.`
                : "No pudimos procesar tu pago. Actualiza tu método de pago."}
              {" "}Si no pagas, tu acceso será limitado solo a Mi Suscripción.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handlePayNow} disabled={paying} className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
          <CreditCard className="h-3.5 w-3.5" />
          {paying ? "Abriendo..." : "Pagar ahora"}
        </Button>
      </div>
    );
  }

  // ── Suspended — blocked ──
  if (estado === "suspendida") {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-destructive text-sm min-w-0">
          <Lock className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              🔒 Cuenta suspendida — Acceso limitado
            </p>
            <p className="text-xs opacity-80">
              {facturaPendiente
                ? `Tienes una factura pendiente de ${$$(facturaPendiente.total)}.`
                : "Tu periodo de gracia venció."}
              {" "}Realiza el pago para reactivar tu cuenta.
            </p>
          </div>
        </div>
        <Button size="sm" variant="destructive" onClick={handlePayNow} disabled={paying} className="shrink-0 gap-1.5">
          <CreditCard className="h-3.5 w-3.5" />
          {paying ? "Abriendo..." : "Ir a pagar"}
        </Button>
      </div>
    );
  }

  return null;
}
