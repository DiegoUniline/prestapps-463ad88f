import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Send, Loader2, Calendar } from "lucide-react";
import { $$, fmtDateTime } from "@/lib/utils";
import { resendReceiptForPrestamo } from "@/lib/resendReceipt";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prestamoId: string;
  clienteNombre?: string;
}

export function HistorialPagosModal({ open, onOpenChange, prestamoId, clienteNombre }: Props) {
  const { empresaId } = useEmpresa();
  const [resending, setResending] = useState<string | null>(null);

  const { data: pagos, isLoading } = useQuery({
    queryKey: ["historial-pagos-prestamo", prestamoId],
    enabled: open && !!prestamoId,
    queryFn: async () => {
      const { data } = await supabase
        .from("pagos")
        .select("id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, metodo_pago, created_at, fecha_pago, anulado, cuota_id")
        .eq("prestamo_id", prestamoId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const handleResend = async (pagoId: string) => {
    setResending(pagoId);
    try {
      const res = await resendReceiptForPrestamo({ empresaId, prestamoId, pagoId });
      if (res.success) toast.success("Ticket reenviado por WhatsApp");
      else toast.error(res.error || "No se pudo reenviar el ticket");
    } finally {
      setResending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-primary" />
            Historial de pagos {clienteNombre && <span className="text-muted-foreground">— {clienteNombre}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : !pagos?.length ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Sin pagos registrados aún
            </div>
          ) : (
            pagos.map((p: any) => (
              <div
                key={p.id}
                className={cn(
                  "rounded-lg border border-border/50 p-3",
                  p.anulado && "opacity-50"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-base font-bold", p.anulado ? "line-through" : "text-emerald-600")}>
                        {$$(Number(p.monto_recibido))}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5">{p.metodo_pago || "Efectivo"}</Badge>
                      {p.anulado && <Badge variant="destructive" className="text-[10px] h-5">Anulado</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {fmtDateTime(p.created_at)}
                    </p>
                  </div>
                  {!p.anulado && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      disabled={resending === p.id}
                      onClick={() => handleResend(p.id)}
                    >
                      {resending === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1" />
                      )}
                      Reenviar ticket
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center bg-secondary/40 rounded p-2">
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Capital</p>
                    <p className="text-xs font-semibold">{$$(Number(p.aplicado_capital || 0))}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Interés</p>
                    <p className="text-xs font-semibold">{$$(Number(p.aplicado_interes || 0))}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Mora</p>
                    <p className="text-xs font-semibold">{$$(Number(p.aplicado_mora || 0))}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}