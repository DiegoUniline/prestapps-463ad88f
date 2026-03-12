import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { PagoModal } from "@/components/PagoModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, MoreHorizontal, Pencil, HandCoins, Check, Clock, AlertTriangle, CalendarCheck, Plus, Activity, CreditCard, FileText, Bell } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Badge colors (matching design system) ─────────────────────────
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

// ── Mock data ─────────────────────────────────────────────────────
const mockPrestamo = {
  id: "PRE-0002",
  cliente: "Carlos López",
  clienteId: "CLI-0002",
  empresa: "Comercial López",
  cobrador: "Juan Torres",
  ruta: "Ruta Norte",
  generadoPor: "Admin",
  fechaRegistro: "2025-11-01",
  fechaPrimerPago: "2025-11-08",
  caja: "Caja Principal",
  modalidad: "fijo" as const,
  montoSolicitado: 25000,
  numCuotas: 24,
  frecuencia: "semanal",
  tasaInteres: 20,
  cuotaCalculada: 1354.17,
  cuotaRedondeada: 1355,
  tipoMora: "porcentaje",
  valorMora: 5,
  gastosLegales: 500,
  estado: "Vencido",
  montoTotalPagar: 32500,
  notas: "Cliente con buen historial previo.",
};

const mockAmortizacion = [
  { num_cuota: 1, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-11-08", fecha_calculo: "2025-11-08", dias_atraso: 0, mora: 0, capital_pagado: 1041.67, interes_pagado: 312.50, mora_pagada: 0, saldo_capital: 0, saldo_interes: 0, saldo_mora: 0, saldo_total: 0, status: "Pagada", fecha_pagada: "2025-11-08", descuento_mora: 0, avisado: true },
  { num_cuota: 2, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-11-15", fecha_calculo: "2025-11-15", dias_atraso: 0, mora: 0, capital_pagado: 1041.67, interes_pagado: 312.50, mora_pagada: 0, saldo_capital: 0, saldo_interes: 0, saldo_mora: 0, saldo_total: 0, status: "Pagada", fecha_pagada: "2025-11-15", descuento_mora: 0, avisado: true },
  { num_cuota: 3, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-11-22", fecha_calculo: "2025-11-22", dias_atraso: 0, mora: 0, capital_pagado: 1041.67, interes_pagado: 312.50, mora_pagada: 0, saldo_capital: 0, saldo_interes: 0, saldo_mora: 0, saldo_total: 0, status: "Pagada", fecha_pagada: "2025-11-23", descuento_mora: 0, avisado: true },
  { num_cuota: 4, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-11-29", fecha_calculo: "2025-11-29", dias_atraso: 0, mora: 0, capital_pagado: 1041.67, interes_pagado: 312.50, mora_pagada: 0, saldo_capital: 0, saldo_interes: 0, saldo_mora: 0, saldo_total: 0, status: "Pagada", fecha_pagada: "2025-11-29", descuento_mora: 0, avisado: true },
  { num_cuota: 5, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-12-06", fecha_calculo: "2025-12-06", dias_atraso: 0, mora: 0, capital_pagado: 1041.67, interes_pagado: 312.50, mora_pagada: 0, saldo_capital: 0, saldo_interes: 0, saldo_mora: 0, saldo_total: 0, status: "Pagada", fecha_pagada: "2025-12-06", descuento_mora: 0, avisado: true },
  { num_cuota: 6, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-12-13", fecha_calculo: "2025-12-13", dias_atraso: 0, mora: 0, capital_pagado: 520.00, interes_pagado: 200.00, mora_pagada: 0, saldo_capital: 521.67, saldo_interes: 112.50, saldo_mora: 0, saldo_total: 634.17, status: "Parcial", fecha_pagada: null, descuento_mora: 0, avisado: true },
  { num_cuota: 7, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-12-20", fecha_calculo: "2026-03-12", dias_atraso: 82, mora: 450, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, saldo_capital: 1041.67, saldo_interes: 312.50, saldo_mora: 450, saldo_total: 1804.17, status: "Vencida", fecha_pagada: null, descuento_mora: 0, avisado: true },
  { num_cuota: 8, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2025-12-27", fecha_calculo: "2026-03-12", dias_atraso: 75, mora: 380, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, saldo_capital: 1041.67, saldo_interes: 312.50, saldo_mora: 380, saldo_total: 1734.17, status: "Vencida", fecha_pagada: null, descuento_mora: 0, avisado: false },
  { num_cuota: 9, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2026-01-03", fecha_calculo: "2026-03-12", dias_atraso: 68, mora: 370, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, saldo_capital: 1041.67, saldo_interes: 312.50, saldo_mora: 370, saldo_total: 1724.17, status: "Vencida", fecha_pagada: null, descuento_mora: 0, avisado: false },
  { num_cuota: 10, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2026-03-15", fecha_calculo: null, dias_atraso: 0, mora: 0, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, saldo_capital: 1041.67, saldo_interes: 312.50, saldo_mora: 0, saldo_total: 1354.17, status: "Prometida", fecha_pagada: null, descuento_mora: 0, avisado: false },
  { num_cuota: 11, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2026-03-22", fecha_calculo: null, dias_atraso: 0, mora: 0, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, saldo_capital: 1041.67, saldo_interes: 312.50, saldo_mora: 0, saldo_total: 1354.17, status: "Pendiente", fecha_pagada: null, descuento_mora: 0, avisado: false },
  { num_cuota: 12, capital: 1041.67, interes: 312.50, capital_interes: 1354.17, fecha_vencimiento: "2026-03-29", fecha_calculo: null, dias_atraso: 0, mora: 0, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, saldo_capital: 1041.67, saldo_interes: 312.50, saldo_mora: 0, saldo_total: 1354.17, status: "Pendiente", fecha_pagada: null, descuento_mora: 0, avisado: false },
];

const mockPagos = [
  { fecha: "2025-11-08", recibo: "PAG-0001", monto: 1354.17, mora: 0, interes: 312.50, capital: 1041.67, caja: "Caja Principal", metodo: "Efectivo", registrado: "Admin" },
  { fecha: "2025-11-15", recibo: "PAG-0002", monto: 1354.17, mora: 0, interes: 312.50, capital: 1041.67, caja: "Caja Principal", metodo: "Efectivo", registrado: "Admin" },
  { fecha: "2025-11-23", recibo: "PAG-0003", monto: 1354.17, mora: 0, interes: 312.50, capital: 1041.67, caja: "Caja Principal", metodo: "Transferencia", registrado: "Admin" },
  { fecha: "2025-11-29", recibo: "PAG-0004", monto: 1354.17, mora: 0, interes: 312.50, capital: 1041.67, caja: "Caja Principal", metodo: "Efectivo", registrado: "Juan Torres" },
  { fecha: "2025-12-06", recibo: "PAG-0005", monto: 1354.17, mora: 0, interes: 312.50, capital: 1041.67, caja: "Caja Principal", metodo: "Efectivo", registrado: "Juan Torres" },
  { fecha: "2025-12-13", recibo: "PAG-0006", monto: 720.00, mora: 0, interes: 200.00, capital: 520.00, caja: "Caja Principal", metodo: "Efectivo", registrado: "Juan Torres" },
];

const mockPromesas = [
  { cuota: 10, fecha: "2026-03-15", monto: 1354.17, notas: "Prometió pagar el viernes", status: "Pendiente", creado: "Juan Torres" },
  { cuota: 7, fecha: "2026-01-10", monto: 1354.17, notas: "Dijo que pagaría después de cobrar", status: "Incumplida", creado: "Juan Torres" },
];

const mockActividad = [
  { tipo: "registro", desc: "Préstamo registrado", usuario: "Admin", fecha: "2025-11-01T10:00:00" },
  { tipo: "pago", desc: "Pago recibido — $1,354.17 (Cuota #1)", usuario: "Admin", fecha: "2025-11-08T09:30:00" },
  { tipo: "pago", desc: "Pago recibido — $1,354.17 (Cuota #2)", usuario: "Admin", fecha: "2025-11-15T10:15:00" },
  { tipo: "pago", desc: "Pago recibido — $1,354.17 (Cuota #3)", usuario: "Admin", fecha: "2025-11-23T11:00:00" },
  { tipo: "pago", desc: "Pago recibido — $1,354.17 (Cuota #4)", usuario: "Juan Torres", fecha: "2025-11-29T08:45:00" },
  { tipo: "pago", desc: "Pago recibido — $1,354.17 (Cuota #5)", usuario: "Juan Torres", fecha: "2025-12-06T09:00:00" },
  { tipo: "pago", desc: "Pago parcial — $720.00 (Cuota #6)", usuario: "Juan Torres", fecha: "2025-12-13T10:20:00" },
  { tipo: "promesa", desc: "Promesa de pago creada — Cuota #7 para 10/01/2026", usuario: "Juan Torres", fecha: "2025-12-28T14:00:00" },
  { tipo: "estado", desc: "Estado cambiado a Vencido", usuario: "Sistema", fecha: "2026-01-11T00:00:00" },
  { tipo: "promesa_incumplida", desc: "Promesa de pago incumplida — Cuota #7", usuario: "Sistema", fecha: "2026-01-11T00:00:00" },
  { tipo: "promesa", desc: "Promesa de pago creada — Cuota #10 para 15/03/2026", usuario: "Juan Torres", fecha: "2026-03-10T16:00:00" },
];

// ── Helpers ───────────────────────────────────────────────────────
const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const muted0 = (n: number) => n === 0 ? "text-muted-foreground/50" : "";

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
  const isNew = !id || id === "nuevo";
  const navigate = useNavigate();
  const [tab, setTab] = useState("amortizacion");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);

  if (isNew) {
    // Redirect to creation form (keep existing logic or navigate)
    navigate("/prestamos");
    return null;
  }

  const p = mockPrestamo;
  const amort = mockAmortizacion;

  // KPI calculations
  const totalPagado = amort.reduce((s, c) => s + (c.capital_pagado || 0) + (c.interes_pagado || 0) + (c.mora_pagada || 0), 0);
  const saldoPendiente = amort.reduce((s, c) => s + (c.saldo_total || 0), 0);
  const cuotasVencidas = amort.filter((c) => c.status === "Vencida").length;
  const saldoMoroso = amort.reduce((s, c) => s + (c.saldo_mora || 0), 0);
  const proximaCuota = amort.find((c) => c.status === "Pendiente" || c.status === "Prometida");
  const ultimoPago = mockPagos[mockPagos.length - 1];

  const kpis = [
    { label: "Monto Prestado", value: $$(p.montoSolicitado), color: "" },
    { label: "Total a Pagar", value: $$(p.montoTotalPagar), color: "" },
    { label: "Total Pagado", value: $$(totalPagado), color: "text-success" },
    { label: "Saldo Pendiente", value: $$(saldoPendiente), color: "text-badge-aldia-foreground" },
    { label: "Cuotas Vencidas", value: String(cuotasVencidas), extra: `${cuotasVencidas} cuotas`, color: "text-destructive" },
    { label: "Saldo Moroso", value: $$(saldoMoroso), color: saldoMoroso > 0 ? "text-destructive" : "text-success" },
  ];

  // Pagos totals
  const totalPagosMonto = mockPagos.reduce((s, pg) => s + pg.monto, 0);
  const totalPagosMora = mockPagos.reduce((s, pg) => s + pg.mora, 0);
  const totalPagosInteres = mockPagos.reduce((s, pg) => s + pg.interes, 0);
  const totalPagosCapital = mockPagos.reduce((s, pg) => s + pg.capital, 0);

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
              <span className="text-foreground">{p.id}</span>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5">
              <h1 className="text-xl font-semibold">Préstamo {p.id}</h1>
              <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-medium", estadoBadge[p.estado])}>
                {p.estado}
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
          {/* Datos del Préstamo */}
          <div className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="px-4 py-3 border-b"><p className="text-[13px] font-semibold">Datos del Préstamo</p></div>
            <div className="px-4 py-3 space-y-2.5">
              <InfoRow label="Cliente" value={<Link to={`/clientes/${p.clienteId}`} className="text-primary hover:underline font-medium">{p.cliente}</Link>} />
              <InfoRow label="Empresa" value={p.empresa} />
              <InfoRow label="Cobrador" value={p.cobrador} />
              <InfoRow label="Ruta" value={p.ruta} />
              <InfoRow label="Generado por" value={p.generadoPor} />
              <InfoRow label="F. Registro" value={format(new Date(p.fechaRegistro), "dd/MM/yyyy")} />
              <InfoRow label="F. Primer Pago" value={format(new Date(p.fechaPrimerPago), "dd/MM/yyyy")} />
              <InfoRow label="Caja" value={p.caja} />
            </div>
          </div>

          {/* Configuración del Crédito */}
          <div className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="px-4 py-3 border-b"><p className="text-[13px] font-semibold">Configuración del Crédito</p></div>
            <div className="px-4 py-3 space-y-2.5">
              <InfoRow label="Modalidad" value={p.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos"} />
              <InfoRow label="Monto solicitado" value={$$(p.montoSolicitado)} />
              <InfoRow label="Cuotas" value={`${p.numCuotas} — ${p.frecuencia}`} />
              <InfoRow label="Tasa de interés" value={`${p.tasaInteres}%`} />
              <InfoRow label="Cuota estándar" value={$$(p.cuotaCalculada)} />
              <InfoRow label="Cuota redondeada" value={p.cuotaRedondeada ? $$(p.cuotaRedondeada) : "—"} />
              <InfoRow label="Tipo mora" value={`${p.tipoMora} — ${p.valorMora}${p.tipoMora === "porcentaje" ? "%" : ""}`} />
              <InfoRow label="Gastos legales" value={$$(p.gastosLegales)} />
            </div>
          </div>

          {/* Estado del Préstamo */}
          <div className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="px-4 py-3 border-b"><p className="text-[13px] font-semibold">Estado del Préstamo</p></div>
            <div className="px-4 py-3 space-y-2.5">
              <InfoRow label="Estado" value={
                <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[12px] font-medium", estadoBadge[p.estado])}>{p.estado}</span>
              } />
              {cuotasVencidas > 0 && <InfoRow label="Días en mora" value={<span className="text-destructive font-semibold">{amort.filter(c => c.status === "Vencida").reduce((max, c) => Math.max(max, c.dias_atraso), 0)} días</span>} />}
              {proximaCuota && <InfoRow label="Próxima cuota" value={`#${proximaCuota.num_cuota} — ${format(new Date(proximaCuota.fecha_vencimiento), "dd/MM/yyyy")} — ${$$(proximaCuota.capital_interes)}`} />}
              {ultimoPago && <InfoRow label="Último pago" value={`${format(new Date(ultimoPago.fecha), "dd/MM/yyyy")} — ${$$(ultimoPago.monto)}`} />}
              {p.notas && <InfoRow label="Notas" value={p.notas} />}
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
                    {amort.map((c) => {
                      const isNext = proximaCuota?.num_cuota === c.num_cuota;
                      return (
                        <TableRow
                          key={c.num_cuota}
                          className={cn(
                            "border-b border-border/50 transition-colors",
                            cuotaRowBg[c.status],
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
                          <TableCell className={cn("px-3 text-[12px]", c.dias_atraso > 0 ? "text-destructive font-bold" : muted0(c.dias_atraso))}>{c.dias_atraso}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", c.mora > 0 ? "text-destructive font-bold" : muted0(c.mora))}>{$$(c.mora)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.capital_pagado))}>{$$(c.capital_pagado)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.interes_pagado))}>{$$(c.interes_pagado)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.mora_pagada))}>{$$(c.mora_pagada)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.saldo_capital))}>{$$(c.saldo_capital)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", muted0(c.saldo_interes))}>{$$(c.saldo_interes)}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", c.saldo_mora > 0 ? "text-destructive font-bold" : muted0(c.saldo_mora))}>{$$(c.saldo_mora)}</TableCell>
                          <TableCell className="px-3 text-[13px] font-medium">{$$(c.saldo_total)}</TableCell>
                          <TableCell className="px-3">
                            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", cuotaStatusBadge[c.status])}>
                              {c.status === "Pagada" && <Check className="h-3 w-3 mr-0.5" />}
                              {c.status}
                            </span>
                          </TableCell>
                          <TableCell className="px-3 text-[12px] text-muted-foreground whitespace-nowrap">
                            {c.fecha_pagada ? format(new Date(c.fecha_pagada), "dd/MM/yy") : "—"}
                          </TableCell>
                          <TableCell className="px-3">
                            {hoveredRow === c.num_cuota && c.status !== "Pagada" && (
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
                      {["Fecha", "Recibo", "Monto", "A Mora", "A Interés", "A Capital", "Caja", "Método", "Registrado por"].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2 whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockPagos.map((pg, i) => (
                      <TableRow key={i} className="border-b border-border/50">
                        <TableCell className="px-3 text-[12px]">{format(new Date(pg.fecha), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="px-3 text-[12px] font-mono text-muted-foreground">{pg.recibo}</TableCell>
                        <TableCell className="px-3 text-[13px] font-medium">{$$(pg.monto)}</TableCell>
                        <TableCell className={cn("px-3 text-[12px]", muted0(pg.mora))}>{$$(pg.mora)}</TableCell>
                        <TableCell className={cn("px-3 text-[12px]", muted0(pg.interes))}>{$$(pg.interes)}</TableCell>
                        <TableCell className={cn("px-3 text-[12px]", muted0(pg.capital))}>{$$(pg.capital)}</TableCell>
                        <TableCell className="px-3 text-[12px] text-muted-foreground">{pg.caja}</TableCell>
                        <TableCell className="px-3">
                          <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", metodoBadge[pg.metodo])}>{pg.metodo}</span>
                        </TableCell>
                        <TableCell className="px-3 text-[12px]">{pg.registrado}</TableCell>
                      </TableRow>
                    ))}
                    {/* Footer totals */}
                    <TableRow className="bg-table-header hover:bg-table-header font-semibold">
                      <TableCell className="px-3 text-[12px]" colSpan={2}>Totales</TableCell>
                      <TableCell className="px-3 text-[13px]">{$$(totalPagosMonto)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{$$(totalPagosMora)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{$$(totalPagosInteres)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{$$(totalPagosCapital)}</TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
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
                      {["Cuota #", "F. Prometida", "Monto", "Notas", "Status", "Creado por"].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2 whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockPromesas.map((pr, i) => (
                      <TableRow key={i} className="border-b border-border/50">
                        <TableCell className="px-3 text-[13px] font-medium">{pr.cuota}</TableCell>
                        <TableCell className="px-3 text-[12px]">{format(new Date(pr.fecha), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="px-3 text-[13px]">{$$(pr.monto)}</TableCell>
                        <TableCell className="px-3 text-[12px] text-muted-foreground max-w-[200px] truncate">{pr.notas}</TableCell>
                        <TableCell className="px-3">
                          <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", promesaStatusBadge[pr.status])}>{pr.status}</span>
                        </TableCell>
                        <TableCell className="px-3 text-[12px]">{pr.creado}</TableCell>
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
                  {mockActividad.slice().reverse().map((a, i) => {
                    const Icon = activityIcon[a.tipo] || Activity;
                    return (
                      <div key={i} className="relative pl-10">
                        <div className="absolute left-[9px] top-1 h-7 w-7 rounded-full bg-secondary flex items-center justify-center border border-border">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-[13px]">{a.desc}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {a.usuario} · {format(new Date(a.fecha), "dd/MM/yyyy HH:mm")}
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
        prestamoId={p.id}
        cuotasPendientes={amort.filter((c) => c.saldo_total > 0).map((c) => ({
          num_cuota: c.num_cuota,
          saldo_mora: c.saldo_mora,
          saldo_interes: c.saldo_interes,
          saldo_capital: c.saldo_capital,
          saldo_total: c.saldo_total,
          status: c.status,
          fecha_vencimiento: c.fecha_vencimiento,
        }))}
        cajas={[
          { id: "caja-1", nombre: "Caja Principal" },
          { id: "caja-2", nombre: "Caja Secundaria" },
          { id: "caja-3", nombre: "Banco BAC" },
          { id: "caja-4", nombre: "Banco Agrícola" },
        ]}
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
