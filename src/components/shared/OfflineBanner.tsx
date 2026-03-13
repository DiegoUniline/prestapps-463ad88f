import React from "react";
import { useUIStore } from "@/stores/uiStore";
import { WifiOff } from "lucide-react";

export const OfflineBanner = React.memo(function OfflineBanner() {
  const isOnline = useUIStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <div className="bg-destructive text-destructive-foreground text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
      <WifiOff className="h-4 w-4" />
      Sin conexión — las acciones de escritura están deshabilitadas
    </div>
  );
});
