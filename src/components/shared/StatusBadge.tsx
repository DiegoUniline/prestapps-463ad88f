import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PRESET_COLORS: Record<string, string> = {
  // Prestamo states
  Activo: "bg-badge-activo text-badge-activo-foreground",
  "Al día": "bg-badge-aldia text-badge-aldia-foreground",
  Vencido: "bg-badge-vencido text-badge-vencido-foreground",
  Liquidado: "bg-badge-liquidado text-badge-liquidado-foreground",
  Cancelado: "bg-badge-cancelado text-badge-cancelado-foreground",
  Juridico: "bg-badge-juridico text-badge-juridico-foreground",
  Reestructurado: "bg-muted text-muted-foreground",
  // Cuota states
  Pendiente: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  Pagada: "bg-badge-activo text-badge-activo-foreground",
  Parcial: "bg-badge-aldia text-badge-aldia-foreground",
  Prometida: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  // Solicitud states
  Aprobada: "bg-badge-activo text-badge-activo-foreground",
  Rechazada: "bg-badge-vencido text-badge-vencido-foreground",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge = React.memo(function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = PRESET_COLORS[status] || "bg-muted text-muted-foreground";
  return (
    <Badge className={cn("text-[11px] font-medium border-0 px-2 py-0.5", colorClass, className)}>
      {status}
    </Badge>
  );
});
