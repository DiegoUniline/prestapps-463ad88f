import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { PagoModal } from "@/components/PagoModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MoreHorizontal, Pencil, HandCoins, Check, AlertTriangle, CalendarCheck, Plus, Activity, CreditCard, FileText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePrestamoDetalle, useAmortizacion, usePagos, usePromesas, useCajas } from "@/hooks/usePrestamoDetalle";

// ── Badge colors ──────────────────────────────────────────────────
const estadoBadge: Record<string, string> = {
  Activo: "bg-badge-activo text-badge-activo-foreground",
  "Al día": "bg-badge-aldia text-badge-aldia-foreground",
  Vencido: "bg-badge-vencido text-badge-vencido-foreground",
  Liquidado: "bg-badge-liquidado text-badge-liquidado-foreground",
  Cancelado: "bg-badge-cancelado text-badge-cancelado-foreground",
  Juridico: "bg-badge-juridico text-badge-juridico-foreground",
};

const cuotaStatusBadge: Record<string, string> = {
  Pagada: "bg-badge-activo text-badge-activo-foreground",
  Vencida: "bg-badge-vencido text-badge-vencido-foreground",
  Prometida: "bg-badge-juridico text-badge-juridico-foreground",
  Parcial: "bg-badge-aldia text-badge-aldia-foreground",
  Pendiente: "bg-secondary text-muted-foreground",
};

const cuotaRowBg: Record<string, string> = {
  Pagada: "bg-[hsl(142_76%_97%)]",
  Vencida: "bg-[hsl(0_93%_97%)]",
  Prometida: "bg-[hsl(45_93%_97%)]",
  Parcial: "bg-[hsl(217_91%_97%)]",
  Pendiente: "",
};

const metodoBadge: Record<string, string> = {
  Efectivo: "bg-badge-activo text-badge-activo-foreground",
  Transferencia: "bg-badge-aldia text-badge-aldia-foreground",
  Otro: "bg-secondary text-muted-foreground",
};

const promesaStatusBadge: Record<string, string> = {
  Pendiente: "bg-badge-juridico text-badge-juridico-foreground",
  Cumplida: "bg-badge-activo text-badge-activo-foreground",
  Incumplida: "bg-badge-vencido text-badge-vencido-foreground",
};

// ── Helpers ───────────────────────────────────────────────────────
const $$ = (n: number | null | undefined) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const muted0 = (n: number | null | undefined) => (n || 0) === 0 ? "text-muted-foreground/50" : "";

const activityIcon: Record<string, typeof CreditCard> = {
  registro: FileText,
  pago: HandCoins,
  promesa: CalendarCheck,
  promesa_incumplida: AlertTriangle,
  estado: Activity,
};

// ── Component ─────────────────────────────────────────────────────
export default function PrestamoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("amortizacion");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);

  const isNew = !id || id === "nuevo";

  const { data: prestamo, isLoading: loadingPrestamo } = usePrestamoDetalle(isNew ? undefined : id);
  const { data: amort = [] } = useAmortizacion(isNew ? undefined : id);
  const { data: pagosRaw = [] } = usePagos(isNew ? undefined : id);
  const { data: promesasRaw = [] } = usePromesas(isNew ? undefined : id);
  const { data: cajasAll = [] } = useCajas();

  if (isNew) {
    navigate("/prestamos");
    return null;
  }

  if (loadingPrestamo) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!prestamo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg">Préstamo no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/prestamos")}>Volver</Button>
      </div>
    );
  }

  const cliente = prestamo.clientes as any;
  const caja = prestamo.cajas as any;
  const ruta = prestamo.rutas as any;

  // KPI calculations
  const totalPagado = amort.reduce((s, c) => s + Number(c.capital_pagado || 0) + Number(c.interes_pagado || 0) + Number(c.mora_pagada || 0), 0);
  const saldoPendiente = amort.reduce((s, c) => s + Number(c.saldo_total || 0), 0);
  const cuotasVencidas = amort.filter((c) => c.status === "Vencida").length;
  const saldoMoroso = amort.reduce((s, c) => s + Number(c.saldo_mora || 0), 0);
  const proximaCuota = amort.find((c) => c.status === "Pendiente" || c.status === "Prometida");
  const ultimoPago = pagosRaw.length > 0 ? pagosRaw[pagosRaw.length - 1] : null;

  const kpis = [
    { label: "Monto Prestado", value: $$(prestamo.monto_solicitado), color: "" },
    { label: "Total a Pagar", value: $$(prestamo.monto_total_pagar), color: "" },
    { label: "Total Pagado", value: $$(totalPagado), color: "text-success" },
    { label: "Saldo Pendiente", value: $$(saldoPendiente), color: "text-badge-aldia-foreground" },
    { label: "Cuotas Vencidas", value: String(cuotasVencidas), extra: `${cuotasVencidas} cuotas`, color: "text-destructive" },
    { label: "Saldo Moroso", value: $$(saldoMoroso), color: saldoMoroso > 0 ? "text-destructive" : "text-success" },
  ];

  // Pagos totals
  const totalPagosMonto = pagosRaw.reduce((s, pg) => s + Number(pg.monto_recibido || 0), 0);
  const totalPagosMora = pagosRaw.reduce((s, pg) => s + Number(pg.aplicado_mora || 0), 0);
  const totalPagosInteres = pagosRaw.reduce((s, pg) => s + Number(pg.aplicado_interes || 0), 0);
  const totalPagosCapital = pagosRaw.reduce((s, pg) => s + Number(pg.aplicado_capital || 0), 0);

  // Build activity timeline from pagos + promesas
  const actividad = [
    { tipo: "registro", desc: "Préstamo registrado", usuario: "—", fecha: prestamo.created_at || prestamo.fecha_registro || "" },
    ...pagosRaw.map((pg) => ({
      tipo: "pago",
      desc: `Pago recibido — ${$$(Number(pg.monto_recibido))}`,
      usuario: "—",
      fecha: pg.created_at || "",
    })),
    ...promesasRaw.map((pr) => ({
      tipo: pr.status === "Incumplida" ? "promesa_incumplida" : "promesa",
      desc: `Promesa de pago — ${$$(Number(pr.monto_prometido))} para ${pr.fecha_prometida ? format(new Date(pr.fecha_prometida), "dd/MM/yyyy") : "—"}`,
      usuario: "—",
      fecha: pr.created_at || "",
    })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const estado = prestamo.estado || "Activo";
  const shortId = id?.slice(0, 8) || id;

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/prestamos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Link to="/prestamos" className="hover:text-foreground transition-colors">Préstamos</Link>
              <span>/</span>
              <span className="text-foreground">{shortId}</span>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5">
              <h1 className="text-xl font-semibold">Préstamo</h1>
              <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-medium", estadoBadge[estado])}>
                {estado}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8 text-[13px]" onClick={() => setPagoOpen(true)}>
            <HandCoins className="h-3.5 w-3.5 mr-1.5" />Registrar Pago
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[13px]">
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Imprimir tabla</DropdownMenuItem>
              <DropdownMenuItem>Exportar PDF</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Cancelar préstamo</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card rounded-lg border border-border px-4 py-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
            <p className={cn("text-lg font-semibold mt-0.5", k.color)}>{k.value}</p>
            {k.extra && <p className="text-[11px] text-muted-foreground">{k.extra}</p>}
          </div>
        ))}
      </div>

      {/* ── Two columns ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* LEFT — Info cards */}
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="px-4 py-3 border-b"><p className="text-[13px] font-semibold">Datos del Préstamo</p></div>
            <div className="px-4 py-3 space-y-2.5">
              <InfoRow label="Cliente" value={
                cliente ? <Link to={`/clientes/${cliente.id}`} className="text-primary hover:underline font-medium">{cliente.nombre_completo}</Link> : "—"
              } />
              <InfoRow label="Empresa" value={prestamo.empresa || "—"} />
              <InfoRow label="Cobrador" value="—" />
              <InfoRow label="Ruta" value={ruta?.nombre || "—"} />
              <InfoRow label="F. Registro" value={prestamo.fecha_registro ? format(new Date(prestamo.fecha_registro), "dd/MM/yyyy") : "—"} />
              <InfoRow label="F. Primer Pago" value={prestamo.fecha_primer_pago ? format(new Date(prestamo.fecha_primer_pago), "dd/MM/yyyy") : "—"} />
              <InfoRow label="Caja" value={caja?.nombre || "—"} />
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="px-4 py-3 border-b"><p className="text-[13px] font-semibold">Configuración del Crédito</p></div>
            <div className="px-4 py-3 space-y-2.5">
              <InfoRow label="Modalidad" value={prestamo.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos"} />
              <InfoRow label="Monto solicitado" value={$$(prestamo.monto_solicitado)} />
              <InfoRow label="Cuotas" value={`${prestamo.num_cuotas} — ${prestamo.frecuencia}`} />
              <InfoRow label="Tasa de interés" value={prestamo.tasa_interes ? `${prestamo.tasa_interes}%` : "—"} />
              <InfoRow label="Cuota estándar" value={$$(prestamo.cuota_calculada)} />
              <InfoRow label="Cuota redondeada" value={prestamo.cuota_redondeada ? $$(prestamo.cuota_redondeada) : "—"} />
              <InfoRow label="Tipo mora" value={prestamo.tipo_mora ? `${prestamo.tipo_mora} — ${prestamo.valor_mora}${prestamo.tipo_mora === "porcentaje" ? "%" : ""}` : "—"} />
              <InfoRow label="Gastos legales" value={$$(prestamo.gastos_legales)} />
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="px-4 py-3 border-b"><p className="text-[13px] font-semibold">Estado del Préstamo</p></div>
            <div className="px-4 py-3 space-y-2.5">
              <InfoRow label="Estado" value={
                <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[12px] font-medium", estadoBadge[estado])}>{estado}</span>
              } />
              {cuotasVencidas > 0 && <InfoRow label="Días en mora" value={<span className="text-destructive font-semibold">{amort.filter(c => c.status === "Vencida").reduce((max, c) => Math.max(max, c.dias_atraso || 0), 0)} días</span>} />}
              {proximaCuota && <InfoRow label="Próxima cuota" value={`#${proximaCuota.num_cuota} — ${format(new Date(proximaCuota.fecha_vencimiento), "dd/MM/yyyy")} — ${$$(proximaCuota.capital_interes)}`} />}
              {ultimoPago && <InfoRow label="Último pago" value={`${ultimoPago.created_at ? format(new Date(ultimoPago.created_at), "dd/MM/yyyy") : "—"} — ${$$(Number(ultimoPago.monto_recibido))}`} />}
              {prestamo.notas && <InfoRow label="Notas" value={prestamo.notas} />}
            </div>
          </div>
        </div>

        {/* RIGHT — Tabs */}
        <div className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)] overflow-hidden">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="border-b px-4">
              <TabsList className="bg-transparent h-auto p-0 gap-0">
                {[
                  { value: "amortizacion", label: "Amortización" },
                  { value: "pagos", label: "Pagos" },
                  { value: "promesas", label: "Promesas" },
                  { value: "actividad", label: "Actividad" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-[13px] font-medium"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* TAB: Amortización */}
            <TabsContent value="amortizacion" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header hover:bg-table-header">
                      {["#", "Capital", "Interés", "Cuota", "F. Venc.", "Días", "Mora", "Cap. Pag.", "Int. Pag.", "Mora Pag.", "S. Cap.", "S. Int.", "S. Mora", "S. Total", "Status", "F. Pagada", ""].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2 whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {amort.length === 0 ? (
                      <TableRow><TableCell colSpan={17} className="text-center py-8 text-muted-foreground text-[13px]">Sin cuotas</TableCell></TableRow>
                    ) : amort.map((c) => {
                      const status = c.status || "Pendiente";
                      const isNext = proximaCuota?.num_cuota === c.num_cuota;
                      return (
                        <TableRow
                          key={c.num_cuota}
                          className={cn(
                            "border-b border-border/50 transition-colors",
                            cuotaRowBg[status],
                            isNext && "border-l-[3px] border-l-primary",
                          )}
                          onMouseEnter={() => setHoveredRow(c.num_cuota)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          <TableCell className="px-3 text-[13px] font-medium">{c.num_cuota}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.capital))}>{$$(c.capital)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.interes))}>{$$(c.interes)}</TableCell>
                          <TableCell className="px-3 text-[13px] font-medium">{$$(c.capital_interes)}</TableCell>
                          <TableCell className="px-3 text-[12px] whitespace-nowrap">{format(new Date(c.fecha_vencimiento), "dd/MM/yy")}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", (c.dias_atraso || 0) > 0 ? "text-destructive font-bold" : muted0(c.dias_atraso))}>{c.dias_atraso || 0}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", (c.mora || 0) > 0 ? "text-destructive font-bold" : muted0(c.mora))}>{$$(c.mora)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.capital_pagado))}>{$$(c.capital_pagado)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.interes_pagado))}>{$$(c.interes_pagado)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.mora_pagada))}>{$$(c.mora_pagada)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.saldo_capital))}>{$$(c.saldo_capital)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.saldo_interes))}>{$$(c.saldo_interes)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", (c.saldo_mora || 0) > 0 ? "text-destructive font-bold" : muted0(c.saldo_mora))}>{$$(c.saldo_mora)}</TableCell>
                          <TableCell className="px-3 text-[13px] font-medium">{$$(c.saldo_total)}</TableCell>
                          <TableCell className="px-3">
                            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", cuotaStatusBadge[status])}>
                              {status === "Pagada" && <Check className="h-3 w-3 mr-0.5" />}
                              {status}
                            </span>
                          </TableCell>
                          <TableCell className="px-3 text-[12px] text-muted-foreground whitespace-nowrap">
                            {c.fecha_pagada ? format(new Date(c.fecha_pagada), "dd/MM/yy") : "—"}
                          </TableCell>
                          <TableCell className="px-3">
                            {hoveredRow === c.num_cuota && status !== "Pagada" && (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">Pagar</Button>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">Promesa</Button>
                                {!c.avisado && <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">Avisar</Button>}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* TAB: Pagos */}
            <TabsContent value="pagos" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header hover:bg-table-header">
                      {["Fecha", "Monto", "A Mora", "A Interés", "A Capital", "Caja", "Método"].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2 whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosRaw.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-[13px]">Sin pagos registrados</TableCell></TableRow>
                    ) : (
                      <>
                        {pagosRaw.map((pg) => {
                          const cajaName = (pg.cajas as any)?.nombre || "—";
                          return (
                            <TableRow key={pg.id} className="border-b border-border/50">
                              <TableCell className="px-3 text-[12px]">{pg.created_at ? format(new Date(pg.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                              <TableCell className="px-3 text-[13px] font-medium">{$$(Number(pg.monto_recibido))}</TableCell>
                              <TableCell className={cn("px-3 text-[12px]", muted0(pg.aplicado_mora))}>{$$(pg.aplicado_mora)}</TableCell>
                              <TableCell className={cn("px-3 text-[12px]", muted0(pg.aplicado_interes))}>{$$(pg.aplicado_interes)}</TableCell>
                              <TableCell className={cn("px-3 text-[12px]", muted0(pg.aplicado_capital))}>{$$(pg.aplicado_capital)}</TableCell>
                              <TableCell className="px-3 text-[12px] text-muted-foreground">{cajaName}</TableCell>
                              <TableCell className="px-3">
                                <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", metodoBadge[pg.metodo_pago || "Efectivo"])}>{pg.metodo_pago || "Efectivo"}</span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-table-header hover:bg-table-header font-semibold">
                          <TableCell className="px-3 text-[12px]">Totales</TableCell>
                          <TableCell className="px-3 text-[13px]">{$$(totalPagosMonto)}</TableCell>
                          <TableCell className="px-3 text-[12px]">{$$(totalPagosMora)}</TableCell>
                          <TableCell className="px-3 text-[12px]">{$$(totalPagosInteres)}</TableCell>
                          <TableCell className="px-3 text-[12px]">{$$(totalPagosCapital)}</TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* TAB: Promesas */}
            <TabsContent value="promesas" className="m-0">
              <div className="flex justify-end px-4 py-2 border-b">
                <Button size="sm" className="h-7 text-[12px]"><Plus className="h-3 w-3 mr-1" />Nueva Promesa</Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header hover:bg-table-header">
                      {["F. Prometida", "Monto", "Notas", "Status"].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2 whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promesasRaw.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-[13px]">Sin promesas</TableCell></TableRow>
                    ) : promesasRaw.map((pr) => (
                      <TableRow key={pr.id} className="border-b border-border/50">
                        <TableCell className="px-3 text-[12px]">{format(new Date(pr.fecha_prometida), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="px-3 text-[13px]">{$$(Number(pr.monto_prometido))}</TableCell>
                        <TableCell className="px-3 text-[12px] text-muted-foreground max-w-[200px] truncate">{pr.notas || "—"}</TableCell>
                        <TableCell className="px-3">
                          <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", promesaStatusBadge[pr.status || "Pendiente"])}>{pr.status || "Pendiente"}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* TAB: Actividad */}
            <TabsContent value="actividad" className="m-0 p-4">
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4">
                  {actividad.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground pl-10">Sin actividad registrada</p>
                  ) : actividad.slice().reverse().map((a, i) => {
                    const Icon = activityIcon[a.tipo] || Activity;
                    return (
                      <div key={i} className="relative pl-10">
                        <div className="absolute left-[9px] top-1 h-7 w-7 rounded-full bg-secondary flex items-center justify-center border border-border">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-[13px]">{a.desc}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {a.usuario} · {a.fecha ? format(new Date(a.fecha), "dd/MM/yyyy HH:mm") : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Payment Modal */}
      <PagoModal
        open={pagoOpen}
        onOpenChange={setPagoOpen}
        prestamoId={prestamo.id}
        cuotasPendientes={amort.filter((c) => (c.saldo_total || 0) > 0).map((c) => ({
          num_cuota: c.num_cuota,
          saldo_mora: Number(c.saldo_mora || 0),
          saldo_interes: Number(c.saldo_interes || 0),
          saldo_capital: Number(c.saldo_capital || 0),
          saldo_total: Number(c.saldo_total || 0),
          status: c.status || "Pendiente",
          fecha_vencimiento: c.fecha_vencimiento,
        }))}
        cajas={cajasAll.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />
    </div>
  );
}

// ── Small info row component ──────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="text-[13px] text-right">{value}</span>
    </div>
  );
}
