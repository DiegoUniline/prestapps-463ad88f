import { useAccesoApp } from "@/hooks/useAccesoApp";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock, CreditCard, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { $$ } from "@/lib/utils";

export function SubscriptionBanner() {
  const { estado, showBanner, diasGraciaRestantes, diasTrialRestantes, facturaPendiente } = useAccesoApp();

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
        <Link to="/mi-suscripcion">
          <Button size="sm" className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
            <CreditCard className="h-3.5 w-3.5" />
            Pagar ahora
          </Button>
        </Link>
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
        <Link to="/mi-suscripcion">
          <Button size="sm" variant="destructive" className="shrink-0 gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Ir a pagar
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
