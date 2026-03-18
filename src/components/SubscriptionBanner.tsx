import { useAccesoApp } from "@/hooks/useAccesoApp";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { $$ } from "@/lib/utils";

export function SubscriptionBanner() {
  const { estado, showBanner, diasGraciaRestantes, facturaPendiente } = useAccesoApp();

  if (!showBanner) return null;

  if (estado === "gracia") {
    return (
      <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-yellow-700 dark:text-yellow-400 text-sm min-w-0">
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
                : "No pudimos procesar tu pago. Actualiza tu método de pago para evitar la suspensión."}
              {" "}Si no pagas, tu acceso será limitado solo a Mi Suscripción.
            </p>
          </div>
        </div>
        <Link to="/mi-suscripcion">
          <Button size="sm" className="shrink-0 gap-1.5 bg-yellow-600 hover:bg-yellow-700 text-white">
            <CreditCard className="h-3.5 w-3.5" />
            Pagar ahora
          </Button>
        </Link>
      </div>
    );
  }

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
                : "Tu periodo de gracia venció."
              }
              {" "}Realiza el pago para reactivar tu cuenta y recuperar el acceso completo.
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
