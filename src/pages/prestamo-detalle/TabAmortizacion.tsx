import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HandCoins, CalendarCheck, ChevronDown, Bell } from "lucide-react";
import { cn, $$, fmtDate } from "@/lib/utils";
import { dash, defaultCols, optionalCols, cuotaVisualStatus, type CuotaAmort, type AmortFilter } from "./utils";
import { CuotaStatusBadge } from "./ui";

interface TabAmortizacionProps {
  amort: CuotaAmort[];
  amortFilter: AmortFilter;
  setAmortFilter: (filter: AmortFilter) => void;
  isCancelado: boolean;
  proximaCuota: CuotaAmort | undefined;
  setHoveredRow: (row: number | null) => void;
  setPagoOpen: (open: boolean) => void;
  setPromesaOpen: (open: boolean) => void;
  setSelectedCuota: (cuota: CuotaAmort | null) => void;
  showOptional: boolean;
  setShowOptional: (show: boolean) => void;
}

export function TabAmortizacion({
  amort, amortFilter, setAmortFilter, isCancelado, proximaCuota, setHoveredRow, setPagoOpen,
  setPromesaOpen, setSelectedCuota, showOptional, setShowOptional,
}: TabAmortizacionProps) {
  const queryClient = useQueryClient();
  return (
    <>
      {/* Filter tabs + toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-b border-[hsl(220,14%,96%)]">
        <div className="flex gap-1 overflow-x-auto">
          {([
            { key: "todas", label: "Todas", count: amort.length },
            { key: "Pagada", label: "Pagadas", count: amort.filter(c => cuotaVisualStatus(c) === "Pagada").length },
            { key: "Pendiente", label: "Pendientes", count: amort.filter(c => { const vs = cuotaVisualStatus(c); return vs === "Pendiente" || vs === "Parcial" || vs === "Prometida"; }).length },
            { key: "Vencida", label: "Vencidas", count: amort.filter(c => cuotaVisualStatus(c) === "Vencida").length },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setAmortFilter(f.key)}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap shrink-0",
                amortFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowOptional(!showOptional)}
          className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors self-end sm:self-auto shrink-0"
        >
          {showOptional ? "Menos columnas" : "Más columnas"} <ChevronDown className={cn("h-3 w-3 transition-transform", showOptional && "rotate-180")} />
        </button>
      </div>
      {/* Desktop: Table */}
      <div className="overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-[hsl(210,20%,98%)] hover:bg-[hsl(210,20%,98%)]">
              {defaultCols.map((h) => (
                <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(220,9%,42%)] px-3 py-2 whitespace-nowrap border-b border-[hsl(220,14%,91%)]">{h}</TableHead>
              ))}
              {showOptional && optionalCols.map((h) => (
                <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(220,9%,42%)] px-3 py-2 whitespace-nowrap border-b border-[hsl(220,14%,91%)]">{h}</TableHead>
              ))}
              <TableHead className="border-b border-[hsl(220,14%,91%)] px-3 py-2 w-[120px] text-[11px] uppercase tracking-wider font-semibold text-[hsl(220,9%,42%)]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const filtered = amortFilter === "todas" ? amort
                : amortFilter === "Pendiente" ? amort.filter(c => { const vs = cuotaVisualStatus(c); return vs === "Pendiente" || vs === "Parcial" || vs === "Prometida"; })
                : amort.filter(c => cuotaVisualStatus(c) === amortFilter);
              if (filtered.length === 0) return (
                <TableRow><TableCell colSpan={defaultCols.length + (showOptional ? optionalCols.length : 0) + 1} className="text-center py-8 text-muted-foreground text-[13px]">Sin cuotas en este filtro</TableCell></TableRow>
              );
              return filtered.map((c) => {
              const status = cuotaVisualStatus(c);
              const isNext = proximaCuota?.num_cuota === c.num_cuota;
              const isParcial = status === "Parcial";
              const saldoAtrasado = status === "Vencida" ? Number(c.saldo_total || 0) + Number(c.saldo_mora || 0) : 0;
              return (
                <TableRow
                  key={c.num_cuota}
                  className={cn(
                    "border-b border-[hsl(220,14%,96%)] hover:bg-[hsl(210,20%,98%)] transition-colors",
                    isNext && "border-l-[3px] border-l-primary bg-primary/5",
                    isParcial && !isNext && "bg-[hsl(217,91%,60%,0.06)]",
                  )}
                  onMouseEnter={() => setHoveredRow(c.num_cuota)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <TableCell className="px-3 text-[13px] font-medium">{c.num_cuota}</TableCell>
                  <TableCell className="px-3 text-[12px]">{dash(c.capital) || $$(c.capital)}</TableCell>
                  <TableCell className="px-3 text-[12px]">{dash(c.interes) || $$(c.interes)}</TableCell>
                  <TableCell className="px-3 text-[13px] font-medium">{$$(c.capital_interes)}</TableCell>
                  <TableCell className="px-3 text-[12px] whitespace-nowrap">{fmtDate(c.fecha_vencimiento)}</TableCell>
                  <TableCell className={cn("px-3 text-[12px]", (c.dias_atraso || 0) > 0 ? "text-destructive font-bold" : "text-[hsl(220,14%,83%)]")}>
                    {(c.dias_atraso || 0) > 0 ? c.dias_atraso : "—"}
                  </TableCell>
                  <TableCell className={cn("px-3 text-[12px]", (c.mora || 0) > 0 ? "text-destructive font-bold" : "text-[hsl(220,14%,83%)]")}>
                    {(c.mora || 0) > 0 ? $$(c.mora) : "—"}
                  </TableCell>
                  <TableCell className={cn("px-3 text-[13px] font-medium", (Number(c.capital_pagado || 0) + Number(c.interes_pagado || 0) + Number(c.mora_pagada || 0)) > 0 ? "text-[hsl(142,72%,37%)]" : "text-[hsl(220,14%,83%)]")}>
                    {(() => { const paid = Number(c.capital_pagado || 0) + Number(c.interes_pagado || 0) + Number(c.mora_pagada || 0); return paid > 0 ? $$(paid) : "—"; })()}
                  </TableCell>
                  <TableCell className="px-3 text-[13px] font-medium">{dash(c.saldo_total) || $$(c.saldo_total)}</TableCell>
                  <TableCell className={cn("px-3 text-[13px] font-medium", saldoAtrasado > 0 ? "text-destructive font-bold" : "text-[hsl(220,14%,83%)]")}>
                    {saldoAtrasado > 0 ? $$(saldoAtrasado) : "—"}
                  </TableCell>
                  <TableCell className="px-3"><CuotaStatusBadge status={status} /></TableCell>
                  <TableCell className="px-3 text-[12px] text-muted-foreground whitespace-nowrap">
                    {c.fecha_pagada ? fmtDate(c.fecha_pagada) : <span className="text-[hsl(220,14%,83%)]">—</span>}
                  </TableCell>

                  {showOptional && (
                    <>
                      <TableCell className="px-3 text-[12px]">{dash(c.capital_pagado) || $$(c.capital_pagado)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{dash(c.interes_pagado) || $$(c.interes_pagado)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{dash(c.mora_pagada) || $$(c.mora_pagada)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{dash(c.saldo_capital) || $$(c.saldo_capital)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{dash(c.saldo_interes) || $$(c.saldo_interes)}</TableCell>
                      <TableCell className={cn("px-3 text-[12px]", (c.saldo_mora || 0) > 0 ? "text-destructive font-bold" : "text-[hsl(220,14%,83%)]")}>{dash(c.saldo_mora) || $$(c.saldo_mora)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{dash(c.descuento_mora) || $$(c.descuento_mora)}</TableCell>
                      <TableCell className="px-3 text-[12px] text-muted-foreground">{c.avisado ? "Sí" : "No"}</TableCell>
                    </>
                  )}

                  <TableCell className="px-3 w-[90px]">
                    {status !== "Pagada" && !isCancelado && (
                      <div className="flex items-center gap-1">
                        <button
                          title="Pagar"
                          onClick={() => { setSelectedCuota(c); setPagoOpen(true); }}
                          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <HandCoins className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Promesa"
                          onClick={() => { setSelectedCuota(c); setPromesaOpen(true); }}
                          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <CalendarCheck className="h-3.5 w-3.5" />
                        </button>
                        {!c.avisado && (
                          <button
                            title="Avisar"
                            onClick={async () => {
                              await supabase.from("amortizacion").update({ avisado: true }).eq("id", c.id);
                              queryClient.invalidateQueries({ queryKey: ["amortizacion"] });
                              toast.success(`Cuota #${c.num_cuota} marcada como avisada`);
                            }}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Bell className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            });
            })()}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: Cards */}
      <div className="md:hidden space-y-2 p-3">
        {(() => {
          const filtered = amortFilter === "todas" ? amort
            : amortFilter === "Pendiente" ? amort.filter(c => { const vs = cuotaVisualStatus(c); return vs === "Pendiente" || vs === "Parcial" || vs === "Prometida"; })
            : amort.filter(c => cuotaVisualStatus(c) === amortFilter);
          if (filtered.length === 0) return <p className="text-center py-8 text-muted-foreground text-[13px]">Sin cuotas en este filtro</p>;
          return filtered.map((c) => {
            const status = cuotaVisualStatus(c);
            const isNext = proximaCuota?.num_cuota === c.num_cuota;
            const paid = Number(c.capital_pagado || 0) + Number(c.interes_pagado || 0) + Number(c.mora_pagada || 0);
            const saldoAtrasado = status === "Vencida" ? Number(c.saldo_total || 0) + Number(c.saldo_mora || 0) : 0;
            return (
              <div
                key={c.num_cuota}
                className={cn(
                  "border rounded-lg p-3 bg-card",
                  isNext && "border-l-[3px] border-l-primary bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold">#{c.num_cuota}</span>
                    <CuotaStatusBadge status={status} />
                  </div>
                  <span className="text-[13px] font-bold">{$$(c.capital_interes)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Capital</span><span>{$$(c.capital)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Interés</span><span>{dash(c.interes) || $$(c.interes)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vence</span><span>{fmtDate(c.fecha_vencimiento)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Días atraso</span>
                    <span className={cn((c.dias_atraso || 0) > 0 ? "text-destructive font-bold" : "text-muted-foreground")}>{(c.dias_atraso || 0) > 0 ? c.dias_atraso : "—"}</span>
                  </div>
                  {(c.mora || 0) > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Mora</span><span className="text-destructive font-bold">{$$(c.mora)}</span></div>
                  )}
                  {paid > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span className="text-[hsl(142,72%,37%)] font-medium">{$$(paid)}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Saldo</span><span className="font-medium">{$$(c.saldo_total)}</span></div>
                  {saldoAtrasado > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Saldo Atrasado</span><span className="text-destructive font-bold">{$$(saldoAtrasado)}</span></div>
                  )}
                  {c.fecha_pagada && <div className="flex justify-between"><span className="text-muted-foreground">F.Pagada</span><span>{fmtDate(c.fecha_pagada)}</span></div>}
                </div>
                {status !== "Pagada" && !isCancelado && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                    <button onClick={() => { setSelectedCuota(c); setPagoOpen(true); }} className="flex items-center gap-1 text-[11px] text-primary font-medium">
                      <HandCoins className="h-3 w-3" /> Pagar
                    </button>
                    <button onClick={() => { setSelectedCuota(c); setPromesaOpen(true); }} className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                      <CalendarCheck className="h-3 w-3" /> Promesa
                    </button>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>
    </>
  );
}
