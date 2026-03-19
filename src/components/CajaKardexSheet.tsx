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

// ── Estado de Resultados Tab ──────────────────────────────────────
function EstadoResultados({ rows }: { rows: KardexRow[] }) {
  const { ingresos, egresos, resultado } = useMemo(() => {
    const cats: Record<string, { total: number; tipo: "entrada" | "salida" }> = {};

    for (const r of rows) {
      if (!cats[r.categoria]) cats[r.categoria] = { total: 0, tipo: r.tipo };
      cats[r.categoria].total += r.monto;
    }

    const ingresoCats = ["Cobros", "Depósitos"];
    const egresoCats = ["Desembolsos", "Gastos", "Comisiones", "Retiros"];

    const ingresos = ingresoCats
      .map((c) => ({ label: c, monto: cats[c]?.total || 0 }))
      .filter((i) => i.monto > 0);

    // Add any other entrada categories not in the known list
    for (const [cat, val] of Object.entries(cats)) {
      if (val.tipo === "entrada" && !ingresoCats.includes(cat) && cat !== "Transferencias") {
        ingresos.push({ label: cat, monto: val.total });
      }
    }

    const egresos = egresoCats
      .map((c) => ({ label: c, monto: cats[c]?.total || 0 }))
      .filter((i) => i.monto > 0);

    // Add any other salida categories not in the known list
    for (const [cat, val] of Object.entries(cats)) {
      if (val.tipo === "salida" && !egresoCats.includes(cat) && cat !== "Transferencias") {
        egresos.push({ label: cat, monto: val.total });
      }
    }

    const totalIngresos = ingresos.reduce((s, i) => s + i.monto, 0);
    const totalEgresos = egresos.reduce((s, i) => s + i.monto, 0);
    const transferenciasIn = cats["Transferencias"]?.tipo === "entrada" ? cats["Transferencias"]?.total || 0 : 0;
    const transferenciasOut = cats["Transferencias"]?.tipo === "salida" ? cats["Transferencias"]?.total || 0 : 0;

    return {
      ingresos: { items: ingresos, total: totalIngresos, transferencias: transferenciasIn },
      egresos: { items: egresos, total: totalEgresos, transferencias: transferenciasOut },
      resultado: totalIngresos + transferenciasIn - totalEgresos - transferenciasOut,
    };
  }, [rows]);

  const LineItem = ({ label, monto, variant = "normal" }: { label: string; monto: number; variant?: "normal" | "total" | "result" }) => (
    <div className={cn(
      "flex items-center justify-between py-2 px-4",
      variant === "total" && "border-t border-border font-semibold bg-muted/30",
      variant === "result" && "border-t-2 border-foreground font-bold text-base bg-muted/50",
    )}>
      <span className={cn("text-[13px]", variant === "normal" && "text-muted-foreground pl-3")}>{label}</span>
      <span className={cn(
        "text-[13px] tabular-nums",
        variant === "result" && (monto >= 0 ? "text-success" : "text-destructive"),
        variant === "total" && "text-foreground",
      )}>
        {variant === "result" && monto >= 0 ? "+" : ""}{$$(Math.abs(monto))}
      </span>
    </div>
  );

  return (
    <div className="divide-y divide-border/50">
      {/* Ingresos section */}
      <div className="py-2">
        <div className="flex items-center gap-2 px-4 py-2">
          <ArrowDownLeft className="h-4 w-4 text-success" />
          <span className="text-sm font-semibold text-success">Ingresos</span>
        </div>
        {ingresos.items.map((i) => (
          <LineItem key={i.label} label={i.label} monto={i.monto} />
        ))}
        {ingresos.transferencias > 0 && (
          <LineItem label="Transferencias recibidas" monto={ingresos.transferencias} />
        )}
        <LineItem label="Total Ingresos" monto={ingresos.total + ingresos.transferencias} variant="total" />
      </div>

      {/* Egresos section */}
      <div className="py-2">
        <div className="flex items-center gap-2 px-4 py-2">
          <ArrowUpRight className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold text-destructive">Egresos</span>
        </div>
        {egresos.items.map((i) => (
          <LineItem key={i.label} label={i.label} monto={i.monto} />
        ))}
        {egresos.transferencias > 0 && (
          <LineItem label="Transferencias enviadas" monto={egresos.transferencias} />
        )}
        <LineItem label="Total Egresos" monto={egresos.total + egresos.transferencias} variant="total" />
      </div>

      {/* Resultado */}
      <div className="py-2">
        <LineItem label="Resultado Neto" monto={resultado} variant="result" />
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
              <TabsTrigger value="resultados" className="flex-1 text-[13px]">Estado de Resultados</TabsTrigger>
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
