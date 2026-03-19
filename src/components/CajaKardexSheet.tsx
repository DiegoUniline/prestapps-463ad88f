import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
  categoria: string; // Cobro, Desembolso, Depósito, Retiro, Gasto, Comisión, Transferencia
}

function classifyConcepto(concepto: string, tipo: "entrada" | "salida"): string {
  const lower = concepto.toLowerCase();
  if (lower.includes("cobro") || lower.includes("pago cuota")) return "Cobros";
  if (lower.includes("desembolso") || lower.includes("préstamo")) return "Desembolsos";
  if (lower.includes("comisión") || lower.includes("comision") || lower.includes("corte")) return "Comisiones";
  if (lower.includes("transferencia")) return "Transferencias";
  if (lower.includes("[") || lower.includes("gasto")) return "Gastos";
  if (tipo === "entrada") return "Depósitos";
  return "Retiros";
}

function useCajaKardex(cajaId: string, open: boolean) {
  return useQuery({
    queryKey: ["caja-kardex", cajaId],
    enabled: !!cajaId && open,
    queryFn: async () => {
      const { data: movs } = await supabase
        .from("movimientos_caja")
        .select("id, created_at, tipo, monto, concepto")
        .eq("caja_id", cajaId)
        .order("created_at", { ascending: true });

      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, created_at, monto_recibido, anulado, prestamos ( clientes ( nombre_completo ) )")
        .eq("caja_id", cajaId)
        .eq("anulado", false)
        .order("created_at", { ascending: true });

      const rows: KardexRow[] = [];

      for (const m of movs || []) {
        const concepto = m.concepto || (m.tipo === "entrada" ? "Depósito" : "Retiro");
        rows.push({
          id: m.id,
          fecha: m.created_at || "",
          tipo: m.tipo as "entrada" | "salida",
          concepto,
          monto: Number(m.monto || 0),
          categoria: classifyConcepto(concepto, m.tipo as "entrada" | "salida"),
        });
      }

      for (const p of pagos || []) {
        const cliente = (p.prestamos as any)?.clientes?.nombre_completo || "";
        const concepto = `Cobro cuota${cliente ? ` — ${cliente}` : ""}`;
        rows.push({
          id: `p-${p.id}`,
          fecha: p.created_at || "",
          tipo: "entrada",
          concepto,
          monto: Number(p.monto_recibido || 0),
          categoria: "Cobros",
        });
      }

      rows.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      return rows;
    },
  });
}

// ── Flujo de Efectivo Tab ──────────────────────────────────────
function FlujoEfectivo({ rows, saldoActual }: { rows: KardexRow[]; saldoActual: number }) {
  const data = useMemo(() => {
    const entradas: Record<string, number> = {};
    const salidas: Record<string, number> = {};
    let totalEntradas = 0;
    let totalSalidas = 0;

    for (const r of rows) {
      if (r.tipo === "entrada") {
        entradas[r.categoria] = (entradas[r.categoria] || 0) + r.monto;
        totalEntradas += r.monto;
      } else {
        salidas[r.categoria] = (salidas[r.categoria] || 0) + r.monto;
        totalSalidas += r.monto;
      }
    }

    const saldoInicial = saldoActual - totalEntradas + totalSalidas;
    const flujoNeto = totalEntradas - totalSalidas;

    return { entradas, salidas, totalEntradas, totalSalidas, saldoInicial, flujoNeto, saldoFinal: saldoActual };
  }, [rows, saldoActual]);

  const LineItem = ({ label, monto, variant = "normal" }: { label: string; monto: number; variant?: "normal" | "total" | "saldo" }) => (
    <div className={cn(
      "flex items-center justify-between py-2.5 px-4",
      variant === "total" && "border-t border-border font-semibold bg-muted/30",
      variant === "saldo" && "border-t-2 border-foreground font-bold text-base bg-muted/50 py-3",
    )}>
      <span className={cn("text-[13px]", variant === "normal" && "text-muted-foreground pl-3")}>{label}</span>
      <span className={cn(
        "text-[13px] tabular-nums font-medium",
        variant === "saldo" && "text-base",
      )}>
        {$$(monto)}
      </span>
    </div>
  );

  return (
    <div className="divide-y divide-border/50">
      {/* Saldo Inicial */}
      <div className="py-2">
        <div className="flex items-center gap-2 px-4 py-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Saldo Inicial</span>
        </div>
        <LineItem label="Saldo al inicio" monto={data.saldoInicial} variant="total" />
      </div>

      {/* Entradas */}
      <div className="py-2">
        <div className="flex items-center gap-2 px-4 py-2">
          <ArrowDownLeft className="h-4 w-4 text-success" />
          <span className="text-sm font-semibold text-success">Entradas de Efectivo</span>
        </div>
        {Object.entries(data.entradas)
          .sort(([, a], [, b]) => b - a)
          .map(([cat, monto]) => (
            <LineItem key={cat} label={cat} monto={monto} />
          ))}
        {Object.keys(data.entradas).length === 0 && (
          <p className="text-[12px] text-muted-foreground px-7 py-2">Sin entradas</p>
        )}
        <LineItem label="Total Entradas" monto={data.totalEntradas} variant="total" />
      </div>

      {/* Salidas */}
      <div className="py-2">
        <div className="flex items-center gap-2 px-4 py-2">
          <ArrowUpRight className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold text-destructive">Salidas de Efectivo</span>
        </div>
        {Object.entries(data.salidas)
          .sort(([, a], [, b]) => b - a)
          .map(([cat, monto]) => (
            <LineItem key={cat} label={cat} monto={monto} />
          ))}
        {Object.keys(data.salidas).length === 0 && (
          <p className="text-[12px] text-muted-foreground px-7 py-2">Sin salidas</p>
        )}
        <LineItem label="Total Salidas" monto={data.totalSalidas} variant="total" />
      </div>

      {/* Flujo Neto + Saldo Final */}
      <div className="py-2">
        <div className="flex items-center justify-between py-2.5 px-4">
          <span className="text-[13px] font-semibold flex items-center gap-1.5">
            {data.flujoNeto >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
            Flujo Neto
          </span>
          <span className={cn("text-[13px] tabular-nums font-semibold", data.flujoNeto >= 0 ? "text-success" : "text-destructive")}>
            {data.flujoNeto >= 0 ? "+" : ""}{$$(data.flujoNeto)}
          </span>
        </div>
        <LineItem label="Saldo Final" monto={data.saldoFinal} variant="saldo" />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function CajaKardexSheet({ open, onOpenChange, cajaId, cajaNombre, saldoActual }: Props) {
  const { data: rows = [], isLoading } = useCajaKardex(cajaId, open);
  const [tab, setTab] = useState("kardex");

  const withBalance = useMemo(() => {
    let balance = 0;
    return rows.map((r) => {
      balance += r.tipo === "entrada" ? r.monto : -r.monto;
      return { ...r, balance };
    }).reverse();
  }, [rows]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            {cajaNombre}
          </SheetTitle>
          <p className="text-2xl font-bold">{$$(saldoActual)}</p>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-5 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="kardex" className="flex-1 text-[13px]">Kardex</TabsTrigger>
              <TabsTrigger value="flujo" className="flex-1 text-[13px]">Flujo de Efectivo</TabsTrigger>
            </TabsList>
          </div>

          {/* Kardex Tab */}
          <TabsContent value="kardex" className="flex-1 overflow-auto mt-0 px-0">
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
          </TabsContent>

          {/* Estado de Resultados Tab */}
          <TabsContent value="resultados" className="flex-1 overflow-auto mt-0 px-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground text-sm">Sin movimientos</p>
            ) : (
              <EstadoResultados rows={rows} />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
