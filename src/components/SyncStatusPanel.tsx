import { useState, useEffect, useCallback } from "react";
import { getAll, syncAll, remove, clearAll, pendingCount, type QueuedMutation } from "@/lib/offlineQueue";
import { fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, Trash2, CloudOff, Cloud, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SyncStatusBadge() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  const refresh = useCallback(async () => {
    setCount(await pendingCount());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    const onlineHandler = () => { setOnline(true); refresh(); };
    const offlineHandler = () => setOnline(false);

    window.addEventListener("offline-queue-change", handler);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    // Poll every 10s
    const interval = setInterval(refresh, 10000);
    return () => {
      window.removeEventListener("offline-queue-change", handler);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      clearInterval(interval);
    };
  }, [refresh]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative">
              {online ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4 text-destructive" />}
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {count}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {online ? (count > 0 ? `${count} cambios pendientes` : "En línea") : "Sin conexión"}
          </TooltipContent>
        </Tooltip>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg bg-card">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {online ? <Cloud className="h-5 w-5 text-green-500" /> : <CloudOff className="h-5 w-5 text-destructive" />}
            Sincronización
          </SheetTitle>
        </SheetHeader>
        <SyncPanel />
      </SheetContent>
    </Sheet>
  );
}

function SyncPanel() {
  const [items, setItems] = useState<QueuedMutation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  const refresh = useCallback(async () => {
    setItems(await getAll());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    const onlineH = () => { setOnline(true); refresh(); };
    const offlineH = () => setOnline(false);
    window.addEventListener("offline-queue-change", handler);
    window.addEventListener("online", onlineH);
    window.addEventListener("offline", offlineH);
    return () => {
      window.removeEventListener("offline-queue-change", handler);
      window.removeEventListener("online", onlineH);
      window.removeEventListener("offline", offlineH);
    };
  }, [refresh]);

  const handleSync = async () => {
    if (!navigator.onLine) {
      toast.error("Sin conexión a internet");
      return;
    }
    setSyncing(true);
    try {
      const result = await syncAll();
      await refresh();
      if (result.synced > 0) toast.success(`${result.synced} cambio(s) sincronizado(s)`);
      if (result.failed > 0) toast.error(`${result.failed} cambio(s) fallaron`);
      if (result.synced === 0 && result.failed === 0) toast.info("No hay cambios pendientes");
    } catch {
      toast.error("Error al sincronizar");
    }
    setSyncing(false);
  };

  const handleRemove = async (id: string) => {
    await remove(id);
    await refresh();
    toast.info("Cambio eliminado de la cola");
  };

  const handleClearAll = async () => {
    await clearAll();
    await refresh();
    toast.info("Cola limpiada");
  };

  const pending = items.filter((i) => i.status === "pending");
  const errors = items.filter((i) => i.status === "error");

  return (
    <div className="mt-4 space-y-4">
      {/* Status card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Estado</span>
            <Badge variant={online ? "default" : "destructive"}>
              {online ? "En línea" : "Sin conexión"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Cambios pendientes</span>
            <span className="text-sm font-bold">{pending.length}</span>
          </div>
          {errors.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-destructive">Con error</span>
              <span className="text-sm font-bold text-destructive">{errors.length}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleSync} disabled={syncing || items.length === 0 || !online} className="flex-1">
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sincronizar
        </Button>
        {items.length > 0 && (
          <Button variant="outline" onClick={handleClearAll} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      {/* Queue list */}
      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
          <p className="text-sm">Todo sincronizado</p>
          <p className="text-xs mt-1">No hay cambios pendientes</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-350px)]">
          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.id} className="border">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {item.status === "pending" && <CloudOff className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                        {item.status === "syncing" && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin flex-shrink-0" />}
                        {item.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
                        <span className="text-sm font-medium truncate">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {item.operation} → {item.table}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {fmtDate(item.createdAt, "dd/MM/yyyy HH:mm")}
                        </span>
                      </div>
                      {item.error && (
                        <p className="text-[11px] text-destructive mt-1 truncate">{item.error}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => handleRemove(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
