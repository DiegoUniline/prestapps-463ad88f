import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, $$ } from "@/lib/utils";
import { CalendarDays, TrendingUp, Wallet, Download, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isWithinInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { exportToPDF, exportToCSV } from "@/lib/reportExport";

/* ──────────────────── helpers ──────────────────── */

function getWeekRanges(weeksBack: number, corteDia: number) {
  const ranges: { start: Date; end: Date; label: string }[] = [];
  const today = new Date();
  // Find start of current week based on corteDia (0=Sun..6=Sat)
  const todayDay = today.getDay();
  let diff = todayDay - corteDia;
  if (diff < 0) diff += 7;
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - diff);
  currentWeekStart.setHours(0, 0, 0, 0);

  for (let i = 0; i < weeksBack; i++) {
    const start = new Date(currentWeekStart);
    start.setDate(currentWeekStart.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    ranges.push({
      start,
      end,
      label: `${format(start, "dd MMM", { locale: es })} — ${format(end, "dd MMM", { locale: es })}`,
    });
  }
  return ranges;
}

function dateInRange(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

/* ──────────────────── main component ──────────────────── */

export default function ReporteSemanalPage() {
  const { empresaId } = useEmpresa();
  const [weeksBack] = useState(12);

  const { data, isLoading } = useQuery({
    queryKey: ["reporte-semanal", empresaId],
    queryFn: async () => {
      if (!empresaId) return null;

      const [empresa, pagos, movimientos, cortes] = await Promise.all([
        supabase.from("empresas").select("corte_dia_semana").eq("id", empresaId).single(),
        fetchAllRows(
          supabase.from("pagos")
            .select("monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, fecha_pago, anulado")
            .eq("empresa_id", empresaId)
            .eq("anulado", false)
        ),
        fetchAllRows(
          supabase.from("movimientos_caja")
            .select("monto, tipo, concepto, created_at")
            .eq("empresa_id", empresaId)
        ),
        fetchAllRows(
          supabase.from("cortes")
            .select("monto_comision, total_cobrado, monto_depositado, created_at")
            .eq("empresa_id", empresaId)
        ),
      ]);

      return {
        corteDia: empresa.data?.corte_dia_semana ?? 1,
        pagos: pagos || [],
        movimientos: movimientos || [],
        cortes: cortes || [],
      };
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  });

  const weeks = useMemo(() => {
    if (!data) return [];
    const ranges = getWeekRanges(weeksBack, data.corteDia);

    return ranges.map(({ start, end, label }) => {
      // Cobros (pagos recibidos)
      let totalCobrado = 0;
      let interesGanado = 0;
      let moraGanada = 0;
      let capitalRecuperado = 0;

      for (const p of data.pagos) {
        if (dateInRange(p.fecha_pago, start, end)) {
          totalCobrado += Number(p.monto_recibido || 0);
          interesGanado += Number(p.aplicado_interes || 0);
          moraGanada += Number(p.aplicado_mora || 0);
          capitalRecuperado += Number(p.aplicado_capital || 0);
        }
      }

      // Movimientos de caja
      let desembolsos = 0;
      let gastos = 0;
      let depositos = 0;
      let retiros = 0;

      for (const m of data.movimientos) {
        if (!dateInRange(m.created_at, start, end)) continue;
        const monto = Number(m.monto || 0);
        const concepto = (m.concepto || "").toLowerCase();

        if (m.tipo === "entrada") {
          if (concepto.includes("depósito") || concepto.includes("deposito") || concepto.includes("transferencia entrada")) {
            depositos += monto;
          }
          // Pagos de cobro ya se cuentan en pagos table
        } else {
          // salida
          if (concepto.includes("desembolso") || concepto.includes("préstamo") || concepto.includes("prestamo")) {
            desembolsos += monto;
          } else if (concepto.includes("comisión") || concepto.includes("comision") || concepto.includes("liquidación")) {
            // comisiones se cuentan aparte
          } else if (concepto.includes("retiro") || concepto.includes("transferencia salida")) {
            retiros += monto;
          } else {
            gastos += monto;
          }
        }
      }

      // Comisiones de cortes
      let comisiones = 0;
      for (const c of data.cortes) {
        if (dateInRange(c.created_at, start, end)) {
          comisiones += Number(c.monto_comision || 0);
        }
      }

      // Also count comisiones from movimientos_caja
      for (const m of data.movimientos) {
        if (!dateInRange(m.created_at, start, end)) continue;
        const concepto = (m.concepto || "").toLowerCase();
        if (m.tipo === "salida" && (concepto.includes("comisión") || concepto.includes("comision") || concepto.includes("liquidación"))) {
          comisiones += Number(m.monto || 0);
        }
      }

      // Flujo de efectivo = Cobros + Depósitos - Retiros - Gastos - Comisiones
      const flujoEfectivo = totalCobrado + depositos - retiros - gastos - comisiones;

      // Ganancia real = Interés + Mora - Comisiones - Gastos - Desembolsos
      const gananciaReal = interesGanado + moraGanada - comisiones - gastos - desembolsos;

      return {
        label,
        startDate: format(start, "yyyy-MM-dd"),
        endDate: format(end, "yyyy-MM-dd"),
        totalCobrado,
        capitalRecuperado,
        interesGanado,
        moraGanada,
        desembolsos,
        gastos,
        comisiones,
        depositos,
        retiros,
        flujoEfectivo,
        gananciaReal,
      };
    });
  }, [data, weeksBack]);

  const handleExport = (type: "pdf" | "csv", tab: "flujo" | "ganancia") => {
    const columns = tab === "flujo"
      ? [
          { header: "Semana", key: "label" },
          { header: "Cobros", key: "totalCobrado", format: "money" as const },
          { header: "Depósitos", key: "depositos", format: "money" as const },
          { header: "Retiros", key: "retiros", format: "money" as const },
          { header: "Gastos", key: "gastos", format: "money" as const },
          { header: "Comisiones", key: "comisiones", format: "money" as const },
          { header: "Flujo Neto", key: "flujoEfectivo", format: "money" as const },
        ]
      : [
          { header: "Semana", key: "label" },
          { header: "Interés", key: "interesGanado", format: "money" as const },
          { header: "Mora", key: "moraGanada", format: "money" as const },
          { header: "Comisiones", key: "comisiones", format: "money" as const },
          { header: "Gastos", key: "gastos", format: "money" as const },
          { header: "Desembolsos", key: "desembolsos", format: "money" as const },
          { header: "Ganancia Real", key: "gananciaReal", format: "money" as const },
        ];

    const title = tab === "flujo" ? "Flujo de Efectivo Semanal" : "Ganancia Real Semanal";
    const opts = { title, columns, rows: weeks };
    type === "pdf" ? exportToPDF(opts) : exportToCSV(opts);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          Reporte Semanal
        </h1>
        <p className="text-muted-foreground text-sm">Flujo de efectivo y ganancia real semana a semana</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : weeks.length > 0 && (
        <>
          {/* KPIs — current week */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Cobrado esta semana" value={$$(weeks[0].totalCobrado)} icon={<DollarSign className="h-4 w-4" />} />
            <KPICard label="Ganancia real" value={$$(weeks[0].gananciaReal)} icon={<TrendingUp className="h-4 w-4" />} positive={weeks[0].gananciaReal >= 0} />
            <KPICard label="Flujo de efectivo" value={$$(weeks[0].flujoEfectivo)} icon={<Wallet className="h-4 w-4" />} positive={weeks[0].flujoEfectivo >= 0} />
            <KPICard label="Desembolsado" value={$$(weeks[0].desembolsos)} icon={<ArrowDownRight className="h-4 w-4" />} />
          </div>

          <Tabs defaultValue="ganancia">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <TabsList>
                <TabsTrigger value="ganancia">Ganancia Real</TabsTrigger>
                <TabsTrigger value="flujo">Flujo de Efectivo</TabsTrigger>
              </TabsList>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => handleExport("pdf", "ganancia")}>
                  <Download className="h-3.5 w-3.5 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("csv", "ganancia")}>
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
              </div>
            </div>

            <TabsContent value="ganancia" className="mt-3">
              <WeeklyTable
                weeks={weeks}
                columns={["Semana", "Interés", "Mora", "(-) Comisiones", "(-) Gastos", "(-) Desembolsos", "= Ganancia Real"]}
                accessor={(w) => [
                  w.label,
                  $$(w.interesGanado),
                  $$(w.moraGanada),
                  $$(w.comisiones),
                  $$(w.gastos),
                  $$(w.desembolsos),
                  $$(w.gananciaReal),
                ]}
                highlightLast
              />
            </TabsContent>

            <TabsContent value="flujo" className="mt-3">
              <WeeklyTable
                weeks={weeks}
                columns={["Semana", "Cobros", "Depósitos", "(-) Retiros", "(-) Gastos", "(-) Comisiones", "= Flujo Neto"]}
                accessor={(w) => [
                  w.label,
                  $$(w.totalCobrado),
                  $$(w.depositos),
                  $$(w.retiros),
                  $$(w.gastos),
                  $$(w.comisiones),
                  $$(w.flujoEfectivo),
                ]}
                highlightLast
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/* ──────────────────── sub-components ──────────────────── */

function KPICard({ label, value, icon, positive }: { label: string; value: string; icon: React.ReactNode; positive?: boolean }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-lg font-bold", positive === true && "text-success", positive === false && "text-destructive")}>
        {value}
      </p>
    </Card>
  );
}

interface WeekRow {
  label: string;
  [key: string]: any;
}

function WeeklyTable({ weeks, columns, accessor, highlightLast }: {
  weeks: WeekRow[];
  columns: string[];
  accessor: (w: any) => string[];
  highlightLast?: boolean;
}) {
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {weeks.map((w, i) => {
          const row = accessor(w);
          return (
            <div key={i} className={cn("bg-card rounded-lg border border-border p-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]", i === 0 && "ring-2 ring-primary/20")}>
              <p className="font-semibold text-[13px] mb-1.5">{row[0]}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {columns.slice(1).map((col, j) => (
                  <div key={col} className="flex justify-between">
                    <span className="text-muted-foreground">{col}</span>
                    <span className={cn("font-medium", j === columns.length - 2 && "text-primary font-bold")}>{row[j + 1]}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop */}
      <Card className="hidden md:block">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col, i) => (
                  <TableHead key={col} className={cn("text-xs", i > 0 && "text-right")}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((w, i) => {
                const row = accessor(w);
                return (
                  <TableRow key={i} className={cn(i === 0 && "bg-primary/5 font-medium")}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className={cn("text-sm", j > 0 && "text-right", j === 0 && "font-medium", j === row.length - 1 && "font-bold text-primary")}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
