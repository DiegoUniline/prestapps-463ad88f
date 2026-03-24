import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, $$ } from "@/lib/utils";
import { CalendarDays, TrendingUp, Download, DollarSign, CalendarIcon, ArrowDownRight, Percent, Receipt } from "lucide-react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { exportToPDF, exportToCSV } from "@/lib/reportExport";

export default function ReporteSemanalPage() {
  const { empresaId } = useEmpresa();
  const [desde, setDesde] = useState<Date>(subDays(new Date(), 30));
  const [hasta, setHasta] = useState<Date>(new Date());

  const desdeStr = format(desde, "yyyy-MM-dd");
  const hastaStr = format(hasta, "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["reporte-semanal", empresaId, desdeStr, hastaStr],
    queryFn: async () => {
      if (!empresaId) return null;

      const [pagos, movimientos, cortes] = await Promise.all([
        fetchAllRows(
          supabase.from("pagos")
            .select("monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, fecha_pago, anulado")
            .eq("empresa_id", empresaId)
            .eq("anulado", false)
            .gte("fecha_pago", desdeStr)
            .lte("fecha_pago", hastaStr)
        ),
        fetchAllRows(
          supabase.from("movimientos_caja")
            .select("monto, tipo, concepto, created_at")
            .eq("empresa_id", empresaId)
            .gte("created_at", `${desdeStr}T00:00:00`)
            .lte("created_at", `${hastaStr}T23:59:59`)
        ),
        fetchAllRows(
          supabase.from("cortes")
            .select("monto_comision, cobrador_id, created_at")
            .eq("empresa_id", empresaId)
            .gte("created_at", `${desdeStr}T00:00:00`)
            .lte("created_at", `${hastaStr}T23:59:59`)
        ),
      ]);

      return { pagos: pagos || [], movimientos: movimientos || [], cortes: cortes || [] };
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  });

  const result = useMemo(() => {
    if (!data) return null;

    let totalCobrado = 0, interesGanado = 0, moraGanada = 0, capitalRecuperado = 0;
    for (const p of data.pagos) {
      totalCobrado += Number(p.monto_recibido || 0);
      interesGanado += Number(p.aplicado_interes || 0);
      moraGanada += Number(p.aplicado_mora || 0);
      capitalRecuperado += Number(p.aplicado_capital || 0);
    }

    // Gastos from movimientos (salidas que NO son desembolso, comisión, retiro)
    const gastosDetalle: { concepto: string; monto: number; fecha: string }[] = [];
    let totalGastos = 0;

    // Comisiones from movimientos
    const comisionesDetalle: { concepto: string; monto: number; fecha: string }[] = [];
    let totalComisiones = 0;

    for (const m of data.movimientos) {
      if (m.tipo !== "salida") continue;
      const monto = Number(m.monto || 0);
      const concepto = (m.concepto || "").toLowerCase();
      const fecha = m.created_at ? format(new Date(m.created_at), "dd/MM/yyyy") : "";

      if (concepto.includes("comisión") || concepto.includes("comision") || concepto.includes("liquidación") || concepto.includes("liquidacion")) {
        comisionesDetalle.push({ concepto: m.concepto || "Comisión", monto, fecha });
        totalComisiones += monto;
      } else if (concepto.includes("desembolso") || concepto.includes("préstamo") || concepto.includes("prestamo")) {
        // No contar desembolsos
      } else if (concepto.includes("retiro") || concepto.includes("transferencia") || concepto.includes("retira") || concepto.includes("recurso")) {
        // No contar retiros
      } else if (concepto.includes("anulación") || concepto.includes("anulacion")) {
        // No contar anulaciones
      } else {
        gastosDetalle.push({ concepto: m.concepto || "Gasto", monto, fecha });
        totalGastos += monto;
      }
    }

    // Also add comisiones from cortes table
    for (const c of data.cortes) {
      const monto = Number(c.monto_comision || 0);
      if (monto > 0) {
        comisionesDetalle.push({
          concepto: "Comisión cobrador",
          monto,
          fecha: c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "",
        });
        totalComisiones += monto;
      }
    }

    const gananciaReal = interesGanado + moraGanada - totalComisiones - totalGastos;

    return {
      totalCobrado, interesGanado, moraGanada, capitalRecuperado,
      totalGastos, totalComisiones, gananciaReal,
      gastosDetalle: gastosDetalle.sort((a, b) => b.monto - a.monto),
      comisionesDetalle: comisionesDetalle.sort((a, b) => b.monto - a.monto),
    };
  }, [data]);

  const handleExport = (type: "pdf" | "csv") => {
    if (!result) return;
    const rows = [
      { concepto: "Interés cobrado", monto: result.interesGanado },
      { concepto: "Mora cobrada", monto: result.moraGanada },
      { concepto: "(-) Comisiones", monto: -result.totalComisiones },
      { concepto: "(-) Gastos", monto: -result.totalGastos },
      { concepto: "= GANANCIA REAL", monto: result.gananciaReal },
    ];
    const opts = {
      title: "Ganancia Real",
      columns: [
        { header: "Concepto", key: "concepto" },
        { header: "Monto", key: "monto", format: "money" as const },
      ],
      rows,
      dateRange: { from: format(desde, "dd/MM/yyyy"), to: format(hasta, "dd/MM/yyyy") },
    };
    type === "pdf" ? exportToPDF(opts) : exportToCSV(opts);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          Reporte de Ganancia
        </h1>
        <p className="text-muted-foreground text-sm">Interés + Mora − Comisiones − Gastos = Ganancia Real</p>
      </div>

      {/* Date pickers */}
      <div className="flex flex-wrap items-end gap-3">
        <DatePicker label="Desde" date={desde} onChange={setDesde} />
        <DatePicker label="Hasta" date={hasta} onChange={setHasta} />
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <Download className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : result && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Interés + Mora" value={$$(result.interesGanado + result.moraGanada)} icon={<DollarSign className="h-4 w-4" />} />
            <KPICard label="Ganancia real" value={$$(result.gananciaReal)} icon={<TrendingUp className="h-4 w-4" />} positive={result.gananciaReal >= 0} />
            <KPICard label="(-) Comisiones" value={$$(result.totalComisiones)} icon={<Percent className="h-4 w-4" />} />
            <KPICard label="(-) Gastos" value={$$(result.totalGastos)} icon={<Receipt className="h-4 w-4" />} />
          </div>

          {/* Resumen */}
          <Card className="overflow-hidden">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Concepto</TableHead>
                    <TableHead className="text-xs text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SummaryRow label="Interés cobrado" value={result.interesGanado} variant="income" />
                  <SummaryRow label="Mora cobrada" value={result.moraGanada} variant="income" />
                  <SummaryRow label="(-) Comisiones" value={result.totalComisiones} variant="expense" />
                  <SummaryRow label="(-) Gastos" value={result.totalGastos} variant="expense" />
                  <TableRow className="bg-primary/5 font-bold">
                    <TableCell className="text-sm font-bold">= Ganancia Real</TableCell>
                    <TableCell className={cn("text-sm text-right font-bold", result.gananciaReal >= 0 ? "text-success" : "text-destructive")}>
                      {$$(result.gananciaReal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Detalle de comisiones */}
          {result.comisionesDetalle.length > 0 && (
            <DetailSection title="Detalle de Comisiones" items={result.comisionesDetalle} total={result.totalComisiones} />
          )}

          {/* Detalle de gastos */}
          {result.gastosDetalle.length > 0 && (
            <DetailSection title="Detalle de Gastos" items={result.gastosDetalle} total={result.totalGastos} />
          )}
        </>
      )}
    </div>
  );
}

/* ──────────────── sub-components ──────────────── */

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

function SummaryRow({ label, value, variant }: { label: string; value: number; variant: "income" | "expense" }) {
  return (
    <TableRow>
      <TableCell className="text-sm">{label}</TableCell>
      <TableCell className={cn("text-sm text-right font-medium", variant === "income" ? "text-success" : "text-destructive")}>
        {variant === "expense" ? `- ${$$(value)}` : $$(value)}
      </TableCell>
    </TableRow>
  );
}

function DetailSection({ title, items, total }: { title: string; items: { concepto: string; monto: number; fecha: string }[]; total: number }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {/* Mobile */}
      <div className="md:hidden space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-2.5 flex justify-between items-center">
            <div>
              <p className="text-[12px] font-medium truncate max-w-[200px]">{item.concepto}</p>
              <p className="text-[10px] text-muted-foreground">{item.fecha}</p>
            </div>
            <span className="text-[12px] font-semibold text-destructive">- {$$(item.monto)}</span>
          </div>
        ))}
        <div className="flex justify-between px-2.5 pt-1 text-[12px] font-bold border-t">
          <span>Total</span>
          <span className="text-destructive">- {$$(total)}</span>
        </div>
      </div>
      {/* Desktop */}
      <Card className="hidden md:block">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Concepto</TableHead>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{item.concepto}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.fecha}</TableCell>
                  <TableCell className="text-sm text-right text-destructive">- {$$(item.monto)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell className="text-sm font-bold" colSpan={2}>Total</TableCell>
                <TableCell className="text-sm text-right font-bold text-destructive">- {$$(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function DatePicker({ label, date, onChange }: { label: string; date: Date; onChange: (d: Date) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-[150px] justify-start text-left font-normal">
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            {format(date, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && onChange(d)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      </div>
  );
}
