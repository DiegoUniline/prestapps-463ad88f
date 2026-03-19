import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$ } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cajaId: string;
  cajaNombre: string;
  saldoActual: number;
}

interface KardexRow {
  id: string;
  fecha: string;
  tipo: "entrada" | "salida";
  concepto: string;
  monto: number;
}

function useCajaKardex(cajaId: string, open: boolean) {
  return useQuery({
    queryKey: ["caja-kardex", cajaId],
    enabled: !!cajaId && open,
    queryFn: async () => {
      // Movimientos de caja
      const { data: movs } = await supabase
        .from("movimientos_caja")
        .select("id, created_at, tipo, monto, concepto")
        .eq("caja_id", cajaId)
        .order("created_at", { ascending: true });

      // Pagos (cobros) a esta caja
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, created_at, monto_recibido, prestamos ( clientes ( nombre_completo ) )")
        .eq("caja_id", cajaId)
        .eq("anulado", false)
        .order("created_at", { ascending: true });

      const rows: KardexRow[] = [];
      const movIds = new Set((movs || []).map(m => m.id));

      for (const m of movs || []) {
        rows.push({
          id: m.id,
          fecha: m.created_at || "",
          tipo: m.tipo as "entrada" | "salida",
          concepto: m.concepto || (m.tipo === "entrada" ? "Depósito" : "Retiro"),
          monto: Number(m.monto || 0),
        });
      }

      for (const p of pagos || []) {
        const cliente = (p.prestamos as any)?.clientes?.nombre_completo || "";
        rows.push({
          id: `p-${p.id}`,
          fecha: p.created_at || "",
          tipo: "entrada",
          concepto: `Cobro${cliente ? ` — ${cliente}` : ""}`,
          monto: Number(p.monto_recibido || 0),
        });
      }

      rows.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      return rows;
    },
  });
}

export default function CajaKardexSheet({ open, onOpenChange, cajaId, cajaNombre, saldoActual }: Props) {
  const { data: rows = [], isLoading } = useCajaKardex(cajaId, open);

  // Calculate running balance
  const withBalance = useMemo(() => {
    let balance = 0;
    return rows.map((r) => {
      balance += r.tipo === "entrada" ? r.monto : -r.monto;
      return { ...r, balance };
    }).reverse(); // most recent first
  }, [rows]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Kardex — {cajaNombre}
          </SheetTitle>
          <p className="text-2xl font-bold">{$$(saldoActual)}</p>
          <p className="text-xs text-muted-foreground">{withBalance.length} movimientos</p>
        </SheetHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : withBalance.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin movimientos</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border">
                {withBalance.map((r) => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{r.concepto}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {r.fecha ? format(new Date(r.fecha), "dd/MM/yy HH:mm", { locale: es }) : "—"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-[13px] font-semibold", r.tipo === "entrada" ? "text-success" : "text-destructive")}>
                          {r.tipo === "entrada" ? "+" : "-"}{$$(r.monto)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{$$(r.balance)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Fecha</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Concepto</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Entrada</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Salida</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withBalance.map((r) => (
                      <TableRow key={r.id} className="border-b border-border/50">
                        <TableCell className="text-[12px] px-3 whitespace-nowrap">
                          {r.fecha ? format(new Date(r.fecha), "dd/MM/yy HH:mm", { locale: es }) : "—"}
                        </TableCell>
                        <TableCell className="text-[13px] px-3 max-w-[250px] truncate">{r.concepto}</TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-success font-medium">
                          {r.tipo === "entrada" ? $$(r.monto) : ""}
                        </TableCell>
                        <TableCell className="text-right text-[13px] px-3 text-destructive font-medium">
                          {r.tipo === "salida" ? $$(r.monto) : ""}
                        </TableCell>
                        <TableCell className="text-right text-[13px] px-3 font-semibold">{$$(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
