import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { $$, fmtDate, fmtDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FileText, Receipt, ListOrdered, User, Phone, MapPin } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prestamoId: string;
}

export function PrestamoQuickDrawer({ open, onOpenChange, prestamoId }: Props) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["prestamo-quick", prestamoId],
    enabled: open && !!prestamoId,
    queryFn: async () => {
      const [{ data: pres }, { data: amort }, { data: pagos }] = await Promise.all([
        supabase.from("prestamos").select(`
          id, id_prestamo, monto_solicitado, monto_total_pagar, num_cuotas, modalidad, frecuencia,
          tasa_interes, fecha_registro, fecha_primer_pago, estado, notas,
          clientes ( id, nombre_completo, telefono, direccion, dni, foto_cliente )
        `).eq("id", prestamoId).maybeSingle(),
        supabase.from("amortizacion").select("id, num_cuota, fecha_vencimiento, capital_interes, saldo_total, status, mora").eq("prestamo_id", prestamoId).order("num_cuota"),
        supabase.from("pagos").select("id, monto_recibido, metodo_pago, created_at, anulado").eq("prestamo_id", prestamoId).order("created_at", { ascending: false }).limit(10),
      ]);
      return { pres, amort: amort || [], pagos: pagos || [] };
    },
  });

  const cliente = (data?.pres as any)?.clientes;
  const totalPagado = (data?.pagos || []).filter((p: any) => !p.anulado).reduce((s: number, p: any) => s + Number(p.monto_recibido), 0);
  const saldoPendiente = (data?.amort || []).reduce((s: number, c: any) => s + Number(c.saldo_total || 0), 0);
  const cuotasPagadas = (data?.amort || []).filter((c: any) => c.status === "Pagada").length;
  const totalCuotas = (data?.amort || []).length;
  const pct = totalCuotas > 0 ? (cuotasPagadas / totalCuotas) * 100 : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              {(data?.pres as any)?.id_prestamo || "Préstamo"}
            </span>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => { onOpenChange(false); navigate(`/prestamos/${prestamoId}`); }}>
              <ExternalLink className="h-3 w-3 mr-1" /> Abrir completo
            </Button>
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {/* Cliente */}
            {cliente && (
              <div className="rounded-lg border border-border/50 p-3 bg-card">
                <div className="flex items-start gap-3">
                  {cliente.foto_cliente ? (
                    <img src={cliente.foto_cliente} alt="" className="h-14 w-14 rounded object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded bg-secondary flex items-center justify-center">
                      <User className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{cliente.nombre_completo}</p>
                    {cliente.dni && <p className="text-[11px] text-muted-foreground">DNI: {cliente.dni}</p>}
                    {cliente.telefono && (
                      <a href={`tel:${cliente.telefono}`} className="text-[11px] text-primary flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" /> {cliente.telefono}
                      </a>
                    )}
                    {cliente.direccion && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.direccion)}`}
                        target="_blank" rel="noreferrer"
                        className="text-[11px] text-muted-foreground flex items-start gap-1 mt-0.5 hover:text-primary"
                      >
                        <MapPin className="h-3 w-3 shrink-0 mt-0.5" /> {cliente.direccion}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <KPI label="Monto" value={$$(Number((data?.pres as any)?.monto_solicitado || 0))} />
              <KPI label="Pagado" value={$$(totalPagado)} accent="emerald" />
              <KPI label="Saldo" value={$$(saldoPendiente)} accent={saldoPendiente > 0 ? "destructive" : "muted"} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Avance: {cuotasPagadas}/{totalCuotas} cuotas ({pct.toFixed(0)}%)
              <div className="h-1.5 bg-secondary rounded mt-1 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <Tabs defaultValue="amortizacion" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="amortizacion"><ListOrdered className="h-3 w-3 mr-1" /> Amortización</TabsTrigger>
                <TabsTrigger value="pagos"><Receipt className="h-3 w-3 mr-1" /> Pagos ({(data?.pagos || []).length})</TabsTrigger>
              </TabsList>
              <TabsContent value="amortizacion" className="mt-3 space-y-1 max-h-[40vh] overflow-y-auto">
                {(data?.amort || []).map((c: any) => (
                  <div key={c.id} className={cn(
                    "flex items-center justify-between text-xs px-2 py-1.5 rounded",
                    c.status === "Pagada" ? "bg-emerald-500/10" :
                    c.status === "Vencida" ? "bg-destructive/10" :
                    c.status === "Parcial" ? "bg-amber-500/10" : "bg-secondary/40"
                  )}>
                    <span className="font-medium">#{c.num_cuota}</span>
                    <span className="text-muted-foreground">{fmtDate(c.fecha_vencimiento)}</span>
                    <span>{$$(Number(c.capital_interes || 0))}</span>
                    <span className={cn("font-semibold", Number(c.saldo_total) > 0 ? "" : "text-emerald-600")}>
                      {$$(Number(c.saldo_total || 0))}
                    </span>
                    <Badge variant="outline" className="text-[9px] h-4 ml-1">{c.status}</Badge>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="pagos" className="mt-3 space-y-1 max-h-[40vh] overflow-y-auto">
                {(data?.pagos || []).length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-6">Sin pagos aún</p>
                ) : (data?.pagos || []).map((p: any) => (
                  <div key={p.id} className={cn(
                    "flex items-center justify-between text-xs px-2 py-1.5 rounded bg-secondary/40",
                    p.anulado && "opacity-50"
                  )}>
                    <span className="text-muted-foreground">{fmtDateTime(p.created_at)}</span>
                    <span>{p.metodo_pago || "Efectivo"}</span>
                    <span className={cn("font-semibold", p.anulado ? "line-through" : "text-emerald-600")}>
                      {$$(Number(p.monto_recibido))}
                    </span>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "destructive" | "muted" }) {
  return (
    <div className="rounded-lg border border-border/50 p-2 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "text-sm font-bold mt-0.5",
        accent === "emerald" && "text-emerald-600",
        accent === "destructive" && "text-destructive",
        accent === "muted" && "text-muted-foreground",
      )}>{value}</p>
    </div>
  );
}