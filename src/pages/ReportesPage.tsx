import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, FileText, FileSpreadsheet, Download } from "lucide-react";
import { cn, $$, fmtDate } from "@/lib/utils";
import { exportToPDF, exportToCSV } from "@/lib/reportExport";
// ─── Date Range Filter ───
function DateRangeFilter({
  from, to, onFromChange, onToChange,
}: {
  from: Date; to: Date;
  onFromChange: (d: Date) => void; onToChange: (d: Date) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground">Desde:</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-[140px] justify-start text-left text-xs">
            <CalendarIcon className="mr-1 h-3 w-3" />
            {fmtDate(from)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={from} onSelect={(d) => d && onFromChange(d)} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      <span className="text-xs font-medium text-muted-foreground">Hasta:</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-[140px] justify-start text-left text-xs">
            <CalendarIcon className="mr-1 h-3 w-3" />
            {fmtDate(to)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={to} onSelect={(d) => d && onToChange(d)} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Export Buttons ───
function ExportButtons({ onPDF, onCSV }: { onPDF: () => void; onCSV: () => void }) {
  return (
    <div className="flex gap-1.5">
      <Button variant="outline" size="sm" onClick={onPDF} className="text-xs gap-1">
        <FileText className="h-3.5 w-3.5" /> PDF
      </Button>
      <Button variant="outline" size="sm" onClick={onCSV} className="text-xs gap-1">
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </Button>
    </div>
  );
}

// ─── Report Table ───
function ReportTable({
  columns,
  rows,
  totals,
}: {
  columns: { key: string; header: string; format?: "money" | "date" | "number"; align?: string }[];
  rows: Record<string, any>[];
  totals?: Record<string, number>;
}) {
  const fmt = (val: any, f?: string) => {
    if (val == null) return "—";
    if (f === "money") return $$(Number(val));
    if (f === "date") return val ? format(new Date(val), "dd/MM/yyyy") : "—";
    if (f === "number") return Number(val).toLocaleString();
    return String(val);
  };

  return (
    <div className="border rounded-lg overflow-auto max-h-[60vh]">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted/80 border-b">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-3 py-2 font-semibold whitespace-nowrap", c.align === "right" ? "text-right" : "text-left")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="text-center py-8 text-muted-foreground">Sin datos para el período seleccionado</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-1.5", c.align === "right" ? "text-right tabular-nums" : "text-left")}>
                  {fmt(row[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && rows.length > 0 && (
          <tfoot className="sticky bottom-0">
            <tr className="bg-muted font-bold border-t-2 border-primary/30">
              {columns.map((c, i) => (
                <td key={c.key} className={cn("px-3 py-2", c.align === "right" ? "text-right tabular-nums" : "text-left")}>
                  {i === 0 ? "TOTAL" : totals[c.key] !== undefined ? fmt(totals[c.key], c.format || "money") : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Main Page ───
export default function ReportesPage() {
  const { empresaId } = useEmpresa();
  const [from, setFrom] = useState(() => startOfMonth(new Date()));
  const [to, setTo] = useState(() => endOfMonth(new Date()));
  const [tab, setTab] = useState("prestamos");

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  // ── Queries ──
  const { data: prestamosRaw = [] } = useQuery({
    queryKey: ["rpt-prestamos", empresaId, fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("prestamos")
        .select("id, monto_solicitado, monto_total_pagar, tasa_interes, num_cuotas, estado, frecuencia, modalidad, fecha_registro, fecha_primer_pago, gastos_legales, cliente_id, ruta_id, cobrador_id, clientes(nombre_completo), rutas(nombre)")
        .eq("empresa_id", empresaId!)
        .gte("fecha_registro", fromStr)
        .lte("fecha_registro", toStr)
        .order("fecha_registro", { ascending: false });
      return data || [];
    },
    enabled: !!empresaId,
  });

  const { data: pagosRaw = [] } = useQuery({
    queryKey: ["rpt-pagos", empresaId, fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("pagos")
        .select("id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, metodo_pago, created_at, anulado, prestamo_id, cobrador_id, ruta_id, prestamos(id, clientes(nombre_completo)), rutas(nombre)")
        .eq("empresa_id", empresaId!)
        .gte("created_at", `${fromStr}T00:00:00`)
        .lte("created_at", `${toStr}T23:59:59`)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!empresaId,
  });

  const { data: cuotasRaw = [] } = useQuery({
    queryKey: ["rpt-cuotas", empresaId, fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("amortizacion")
        .select("id, num_cuota, capital, interes, capital_interes, mora, capital_pagado, interes_pagado, mora_pagada, saldo_capital, saldo_interes, saldo_mora, saldo_total, status, fecha_vencimiento, dias_atraso, prestamo_id, prestamos(id, clientes(nombre_completo), rutas(nombre))")
        .eq("empresa_id", empresaId!)
        .gte("fecha_vencimiento", fromStr)
        .lte("fecha_vencimiento", toStr)
        .order("fecha_vencimiento", { ascending: true });
      return data || [];
    },
    enabled: !!empresaId,
  });

  // ── Filters ──
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [cuotaStatusFilter, setCuotaStatusFilter] = useState("todos");
  const [searchFilter, setSearchFilter] = useState("");

  // ── Computed data ──

  // PRÉSTAMOS
  const prestamosData = useMemo(() => {
    let d = prestamosRaw.map((p: any) => ({
      ...p,
      cliente: p.clientes?.nombre_completo || "—",
      ruta: p.rutas?.nombre || "—",
    }));
    if (estadoFilter !== "todos") d = d.filter((p: any) => p.estado === estadoFilter);
    if (searchFilter) {
      const s = searchFilter.toLowerCase();
      d = d.filter((p: any) => p.cliente.toLowerCase().includes(s) || p.id.includes(s));
    }
    return d;
  }, [prestamosRaw, estadoFilter, searchFilter]);

  const prestamosTotals = useMemo(() => ({
    monto_solicitado: prestamosData.reduce((a: number, p: any) => a + Number(p.monto_solicitado || 0), 0),
    monto_total_pagar: prestamosData.reduce((a: number, p: any) => a + Number(p.monto_total_pagar || 0), 0),
    gastos_legales: prestamosData.reduce((a: number, p: any) => a + Number(p.gastos_legales || 0), 0),
  }), [prestamosData]);

  const prestamosColumns = [
    { key: "cliente", header: "Cliente" },
    { key: "fecha_registro", header: "Fecha", format: "date" as const },
    { key: "monto_solicitado", header: "Monto", format: "money" as const, align: "right" },
    { key: "monto_total_pagar", header: "Total a Pagar", format: "money" as const, align: "right" },
    { key: "tasa_interes", header: "Tasa %", align: "right" },
    { key: "num_cuotas", header: "Cuotas", align: "right" },
    { key: "frecuencia", header: "Frecuencia" },
    { key: "modalidad", header: "Modalidad" },
    { key: "estado", header: "Estado" },
    { key: "ruta", header: "Ruta" },
    { key: "gastos_legales", header: "Gastos Leg.", format: "money" as const, align: "right" },
  ];

  // PAGOS / COBRANZA
  const pagosData = useMemo(() => {
    let d = pagosRaw.map((p: any) => ({
      ...p,
      cliente: p.prestamos?.clientes?.nombre_completo || "—",
      ruta: p.rutas?.nombre || "—",
      fecha: p.created_at,
    }));
    if (searchFilter) {
      const s = searchFilter.toLowerCase();
      d = d.filter((p: any) => p.cliente.toLowerCase().includes(s));
    }
    return d;
  }, [pagosRaw, searchFilter]);

  const pagosActivos = useMemo(() => pagosData.filter((p: any) => !p.anulado), [pagosData]);
  const pagosTotals = useMemo(() => ({
    monto_recibido: pagosActivos.reduce((a: number, p: any) => a + Number(p.monto_recibido || 0), 0),
    aplicado_capital: pagosActivos.reduce((a: number, p: any) => a + Number(p.aplicado_capital || 0), 0),
    aplicado_interes: pagosActivos.reduce((a: number, p: any) => a + Number(p.aplicado_interes || 0), 0),
    aplicado_mora: pagosActivos.reduce((a: number, p: any) => a + Number(p.aplicado_mora || 0), 0),
  }), [pagosActivos]);

  const pagosColumns = [
    { key: "cliente", header: "Cliente" },
    { key: "fecha", header: "Fecha", format: "date" as const },
    { key: "monto_recibido", header: "Recibido", format: "money" as const, align: "right" },
    { key: "aplicado_capital", header: "Capital", format: "money" as const, align: "right" },
    { key: "aplicado_interes", header: "Interés", format: "money" as const, align: "right" },
    { key: "aplicado_mora", header: "Mora", format: "money" as const, align: "right" },
    { key: "metodo_pago", header: "Método" },
    { key: "ruta", header: "Ruta" },
    { key: "anulado", header: "Anulado" },
  ];

  // CUOTAS
  const cuotasData = useMemo(() => {
    let d = cuotasRaw.map((c: any) => ({
      ...c,
      cliente: c.prestamos?.clientes?.nombre_completo || "—",
      ruta: c.prestamos?.rutas?.nombre || "—",
    }));
    if (cuotaStatusFilter !== "todos") d = d.filter((c: any) => c.status === cuotaStatusFilter);
    if (searchFilter) {
      const s = searchFilter.toLowerCase();
      d = d.filter((c: any) => c.cliente.toLowerCase().includes(s));
    }
    return d;
  }, [cuotasRaw, cuotaStatusFilter, searchFilter]);

  const cuotasTotals = useMemo(() => ({
    capital: cuotasData.reduce((a: number, c: any) => a + Number(c.capital || 0), 0),
    interes: cuotasData.reduce((a: number, c: any) => a + Number(c.interes || 0), 0),
    capital_interes: cuotasData.reduce((a: number, c: any) => a + Number(c.capital_interes || 0), 0),
    mora: cuotasData.reduce((a: number, c: any) => a + Number(c.mora || 0), 0),
    capital_pagado: cuotasData.reduce((a: number, c: any) => a + Number(c.capital_pagado || 0), 0),
    interes_pagado: cuotasData.reduce((a: number, c: any) => a + Number(c.interes_pagado || 0), 0),
    mora_pagada: cuotasData.reduce((a: number, c: any) => a + Number(c.mora_pagada || 0), 0),
    saldo_total: cuotasData.reduce((a: number, c: any) => a + Number(c.saldo_total || 0), 0),
  }), [cuotasData]);

  const cuotasColumns = [
    { key: "cliente", header: "Cliente" },
    { key: "num_cuota", header: "#", align: "right" },
    { key: "fecha_vencimiento", header: "Vencimiento", format: "date" as const },
    { key: "capital", header: "Capital", format: "money" as const, align: "right" },
    { key: "interes", header: "Interés", format: "money" as const, align: "right" },
    { key: "capital_interes", header: "Cap+Int", format: "money" as const, align: "right" },
    { key: "mora", header: "Mora", format: "money" as const, align: "right" },
    { key: "capital_pagado", header: "Cap. Pagado", format: "money" as const, align: "right" },
    { key: "interes_pagado", header: "Int. Pagado", format: "money" as const, align: "right" },
    { key: "mora_pagada", header: "Mora Pagada", format: "money" as const, align: "right" },
    { key: "saldo_total", header: "Saldo", format: "money" as const, align: "right" },
    { key: "dias_atraso", header: "Días Atraso", align: "right" },
    { key: "status", header: "Estado" },
    { key: "ruta", header: "Ruta" },
  ];

  // ── RESUMEN ──
  const resumenData = useMemo(() => {
    const capitalRecuperado = pagosTotals.aplicado_capital;
    const interesGanado = pagosTotals.aplicado_interes;
    const moraRecaudada = pagosTotals.aplicado_mora;
    const totalCobrado = pagosTotals.monto_recibido;
    const totalPrestado = prestamosTotals.monto_solicitado;
    const totalPorCobrar = prestamosTotals.monto_total_pagar;
    const cuotasPendientes = cuotasRaw.filter((c: any) => c.status === "Pendiente").length;
    const cuotasVencidas = cuotasRaw.filter((c: any) => c.status === "Vencida").length;
    const cuotasPagadas = cuotasRaw.filter((c: any) => c.status === "Pagada").length;
    const cuotasParciales = cuotasRaw.filter((c: any) => c.status === "Parcial").length;
    const totalPagos = pagosActivos.length;
    const totalPrestamos = prestamosRaw.length;
    const pagosAnulados = pagosData.filter((p: any) => p.anulado).length;

    return [
      { concepto: "Total Préstamos Generados", cantidad: totalPrestamos, monto: totalPrestado },
      { concepto: "Total a Cobrar (Préstamos)", cantidad: "—", monto: totalPorCobrar },
      { concepto: "Total Cobrado", cantidad: totalPagos, monto: totalCobrado },
      { concepto: "Capital Recuperado", cantidad: "—", monto: capitalRecuperado },
      { concepto: "Intereses Ganados", cantidad: "—", monto: interesGanado },
      { concepto: "Mora Recaudada", cantidad: "—", monto: moraRecaudada },
      { concepto: "Gastos Legales", cantidad: "—", monto: prestamosTotals.gastos_legales },
      { concepto: "Pagos Anulados", cantidad: pagosAnulados, monto: "—" },
      { concepto: "Cuotas Pendientes", cantidad: cuotasPendientes, monto: "—" },
      { concepto: "Cuotas Vencidas", cantidad: cuotasVencidas, monto: "—" },
      { concepto: "Cuotas Pagadas", cantidad: cuotasPagadas, monto: "—" },
      { concepto: "Cuotas Parciales", cantidad: cuotasParciales, monto: "—" },
    ];
  }, [prestamosTotals, pagosTotals, cuotasRaw, prestamosRaw, pagosActivos, pagosData]);

  const resumenColumns = [
    { key: "concepto", header: "Concepto" },
    { key: "cantidad", header: "Cantidad", align: "right" },
    { key: "monto", header: "Monto", format: "money" as const, align: "right" },
  ];

  // ── Export helper ──
  const dateRange = { from: format(from, "dd/MM/yyyy"), to: format(to, "dd/MM/yyyy") };

  const handleExport = (type: "pdf" | "csv") => {
    const configs: Record<string, any> = {
      resumen: { title: "Reporte Resumen", columns: resumenColumns, rows: resumenData },
      prestamos: { title: "Reporte de Préstamos", columns: prestamosColumns, rows: prestamosData, totals: prestamosTotals },
      cobranza: { title: "Reporte de Cobranza", columns: pagosColumns, rows: pagosData, totals: pagosTotals },
      cuotas: { title: "Reporte de Cuotas", columns: cuotasColumns, rows: cuotasData, totals: cuotasTotals },
    };
    const cfg = configs[tab];
    const opts = { ...cfg, dateRange };
    if (type === "pdf") exportToPDF(opts);
    else exportToCSV(opts);
  };

  const estados = ["todos", "Activo", "Al día", "Vencido", "Liquidado", "Cancelado", "Juridico", "Reestructurado"];
  const cuotaStatuses = ["todos", "Pendiente", "Pagada", "Parcial", "Vencida", "Prometida"];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-muted-foreground text-sm">Reportes detallados con filtros y exportación</p>
      </div>

      {/* Filters bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <div className="flex-1" />
            <Input
              placeholder="Buscar cliente..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-[180px] h-8 text-xs"
            />
            <ExportButtons onPDF={() => handleExport("pdf")} onCSV={() => handleExport("csv")} />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumen" className="text-xs">Resumen</TabsTrigger>
          <TabsTrigger value="prestamos" className="text-xs">Préstamos</TabsTrigger>
          <TabsTrigger value="cobranza" className="text-xs">Cobranza</TabsTrigger>
          <TabsTrigger value="cuotas" className="text-xs">Cuotas</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-3">
          <Card>
            <CardContent className="pt-4">
              <ReportTable columns={resumenColumns} rows={resumenData} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prestamos" className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Estado:</span>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {estados.map((e) => (
                  <SelectItem key={e} value={e} className="text-xs">{e === "todos" ? "Todos" : e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-[10px]">{prestamosData.length} registros</Badge>
          </div>
          <Card>
            <CardContent className="pt-4">
              <ReportTable columns={prestamosColumns} rows={prestamosData} totals={prestamosTotals} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cobranza" className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{pagosData.length} pagos</Badge>
            <div className="flex gap-3 text-[11px]">
              <span className="text-muted-foreground">Capital: <strong className="text-foreground">{$$(pagosTotals.aplicado_capital)}</strong></span>
              <span className="text-muted-foreground">Interés: <strong className="text-foreground">{$$(pagosTotals.aplicado_interes)}</strong></span>
              <span className="text-muted-foreground">Mora: <strong className="text-foreground">{$$(pagosTotals.aplicado_mora)}</strong></span>
            </div>
          </div>
          <Card>
            <CardContent className="pt-4">
              <ReportTable columns={pagosColumns} rows={pagosData} totals={pagosTotals} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cuotas" className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Estado:</span>
            <Select value={cuotaStatusFilter} onValueChange={setCuotaStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {cuotaStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{s === "todos" ? "Todos" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-[10px]">{cuotasData.length} cuotas</Badge>
          </div>
          <Card>
            <CardContent className="pt-4">
              <ReportTable columns={cuotasColumns} rows={cuotasData} totals={cuotasTotals} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
