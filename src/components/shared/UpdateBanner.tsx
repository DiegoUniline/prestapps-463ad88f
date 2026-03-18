import React, { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const UpdateBanner = React.memo(function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener("app:sw-update-available", handler);
    return () => window.removeEventListener("app:sw-update-available", handler);
  }, []);

  if (!show) return null;

  const handleUpdate = async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        // Reload once the new SW takes over
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[100] animate-in slide-in-from-top duration-300 bg-primary text-primary-foreground shadow-lg">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Nueva versión disponible
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs font-semibold"
            onClick={handleUpdate}
          >
            Actualizar
          </Button>
          <button onClick={() => setShow(false)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
