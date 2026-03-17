import { useAccesoApp } from "@/hooks/useAccesoApp";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubscriptionBanner() {
  const { estado, showBanner } = useAccesoApp();

  if (!showBanner) return null;

  if (estado === "gracia") {
    return (
      <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            No pudimos procesar tu pago. Para evitar perder acceso, actualiza tu método de pago y paga tu factura pendiente.
          </span>
        </div>
        <Link to="/mi-suscripcion">
          <Button size="sm" variant="outline" className="shrink-0 border-yellow-500 text-yellow-700 hover:bg-yellow-500/10">
            Ir a Mi Suscripción →
          </Button>
        </Link>
      </div>
    );
  }

  if (estado === "suspendida") {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            Tu cuenta está suspendida. Accede a Mi Suscripción para reactivar tu plan.
          </span>
        </div>
        <Link to="/mi-suscripcion">
          <Button size="sm" variant="destructive" className="shrink-0">
            Mi Suscripción →
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
