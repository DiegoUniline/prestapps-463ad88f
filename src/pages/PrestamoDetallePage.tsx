import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, useParams, Link } from "react-router-dom";
import { PagoModal } from "@/components/PagoModal";
import { PromesaModal } from "@/components/PromesaModal";
import { ReasignarModal } from "@/components/ReasignarModal";
import { AnularPagoModal } from "@/components/AnularPagoModal";
import { CancelarPrestamoModal } from "@/components/CancelarPrestamoModal";
import { ReestructurarModal } from "@/components/ReestructurarModal";
import { EditPrestamoModal } from "@/components/EditPrestamoModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, Pencil, HandCoins, Check, AlertTriangle, CalendarCheck, Plus, Activity, CreditCard, FileText, ChevronDown, Bell, Receipt, FileSignature, MapPin, Phone, Route, Ban, RefreshCw, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePrestamoDetalle, useAmortizacion, usePagos, usePromesas, useCajas } from "@/hooks/usePrestamoDetalle";
import { useRutasOptions } from "@/hooks/usePrestamos";
import { generarEstadoCuenta, generarContrato, generarReciboPagos } from "@/lib/pdfDocuments";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";

// ── Badge colors ──────────────────────────────────────────────────
const estadoBadge: Record<string, string> = {
  Activo: "bg-badge-activo text-badge-activo-foreground",
  "Al día": "bg-badge-aldia text-badge-aldia-foreground",
  Vencido: "bg-badge-vencido text-badge-vencido-foreground",
  Liquidado: "bg-badge-liquidado text-badge-liquidado-foreground",
  Cancelado: "bg-badge-cancelado text-badge-cancelado-foreground",
  Juridico: "bg-badge-juridico text-badge-juridico-foreground",
  Reestructurado: "bg-amber-100 text-amber-800",
};

// ── Helpers ───────────────────────────────────────────────────────
const $$ = (n: number | null | undefined) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dash = (n: number | null | undefined) => (n || 0) === 0 ? "—" : null;
const dashStr = (s: string | null | undefined) => s || "—";

const activityColors: Record<string, string> = {
  pago: "bg-[hsl(142,72%,37%)]",
  registro: "bg-[hsl(220,9%,70%)]",
  promesa: "bg-[hsl(38,92%,50%)]",
  promesa_incumplida: "bg-[hsl(0,72%,51%)]",
  estado: "bg-[hsl(220,9%,70%)]",
};

const activityIcon: Record<string, typeof CreditCard> = {
  registro: FileText,
  pago: HandCoins,
  promesa: CalendarCheck,
  promesa_incumplida: AlertTriangle,
  estado: Activity,
};

// ── Status badge (outline style) ──────────────────────────────────
function CuotaStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pagada: "border-[hsl(142,72%,37%)] text-[hsl(142,72%,37%)]",
    Vencida: "border-[hsl(0,72%,51%)] text-[hsl(0,72%,51%)]",
    Parcial: "border-[hsl(217,91%,60%)] text-[hsl(217,91%,60%)]",
    Prometida: "border-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]",
    Pendiente: "border-transparent text-[hsl(220,9%,60%)]",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap border",
      styles[status] || styles.Pendiente
    )}>
      {status === "Pagada" && <Check className="h-3 w-3 mr-0.5" />}
      {status}
    </span>
  );
}

// ── Metodo dot ────────────────────────────────────────────────────
function MetodoDot({ metodo }: { metodo: string }) {
  const color = metodo === "Efectivo" ? "bg-[hsl(142,72%,37%)]" : metodo === "Transferencia" ? "bg-[hsl(217,91%,60%)]" : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {metodo}
    </span>
  );
}

// ── Default & optional columns ────────────────────────────────────
const defaultCols = ["#", "Capital", "Interés", "Cuota", "F.Venc.", "Días", "Mora", "Saldo Total", "Status", "F.Pagada"];
const optionalCols = ["Cap.Pag.", "Int.Pag.", "Mora Pag.", "S.Cap", "S.Int", "S.Mora", "Desc.Mora", "Avisado"];

// ── Component ─────────────────────────────────────────────────────
export default function PrestamoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("amortizacion");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [promesaOpen, setPromesaOpen] = useState(false);
  const [selectedCuota, setSelectedCuota] = useState<any>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [reasignarOpen, setReasignarOpen] = useState(false);
  const [anularPagoOpen, setAnularPagoOpen] = useState(false);
  const [selectedPago, setSelectedPago] = useState<any>(null);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [reestructurarOpen, setReestructurarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [docPreview, setDocPreview] = useState<{ open: boolean; type: "estado" | "contrato" | "pagos" | null }>({ open: false, type: null });
  const isNew = !id || id === "nuevo";

  const { data: prestamo, isLoading: loadingPrestamo } = usePrestamoDetalle(isNew ? undefined : id);
  const { data: amort = [] } = useAmortizacion(isNew ? undefined : id);
  const { data: pagosRaw = [] } = usePagos(isNew ? undefined : id);
  const { data: promesasRaw = [] } = usePromesas(isNew ? undefined : id);
  const { data: cajasAll = [] } = useCajas();
  const { data: rutasAll = [] } = useRutasOptions();
  const { data: cobradoresAll = [] } = useQuery({
    queryKey: ["cobradores-all"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "cobrador");
      if (!roles?.length) return [];
      const userIds = roles.map((r) => r.user_id);
      const { data } = await supabase.from("profiles").select("id, nombre_completo").eq("activo", true).in("id", userIds).order("nombre_completo");
      return (data || []).map((p) => ({ id: p.id, nombre: p.nombre_completo }));
    },
  });
  const empresaId = prestamo?.empresa_id || "00000000-0000-0000-0000-000000000001";
  const { data: empresaData } = useQuery({
    queryKey: ["empresa-datos", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("nombre, logo_url").eq("id", empresaId).single();
      return data;
    },
    enabled: !!prestamo,
  });

  if (isNew) { navigate("/prestamos"); return null; }

  if (loadingPrestamo) {
    return (
      <div className="space-y-5 p-6">
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
  const diasMora = amort.filter(c => c.status === "Vencida").reduce((max, c) => Math.max(max, c.dias_atraso || 0), 0);

  const estado = (prestamo.estado || "Activo") as string;
  const shortId = prestamo.id?.slice(0, 8) || id;

  const kpis = [
    { label: "Monto Prestado", value: $$(prestamo.monto_solicitado), color: "text-foreground" },
    { label: "Total a Pagar", value: $$(prestamo.monto_total_pagar), color: "text-foreground" },
    { label: "Total Pagado", value: $$(totalPagado), color: "text-[hsl(142,72%,37%)]" },
    { label: "Saldo Pendiente", value: $$(saldoPendiente), color: "text-[hsl(217,91%,60%)]" },
    { label: "Cuotas Vencidas", value: String(cuotasVencidas), color: cuotasVencidas > 0 ? "text-destructive" : "text-foreground" },
    { label: "Saldo Moroso", value: $$(saldoMoroso), color: saldoMoroso > 0 ? "text-destructive" : "text-foreground" },
  ];

  // Pagos totals (exclude annulled)
  const validPagos = pagosRaw.filter((pg) => !(pg as any).anulado);
  const totalPagosMonto = validPagos.reduce((s, pg) => s + Number(pg.monto_recibido || 0), 0);
  const totalPagosMora = validPagos.reduce((s, pg) => s + Number(pg.aplicado_mora || 0), 0);
  const totalPagosInteres = validPagos.reduce((s, pg) => s + Number(pg.aplicado_interes || 0), 0);
  const totalPagosCapital = validPagos.reduce((s, pg) => s + Number(pg.aplicado_capital || 0), 0);

  // Activity timeline
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

  // Promesas status badge
  const promesaStatusStyle: Record<string, string> = {
    Pendiente: "border-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]",
    Cumplida: "border-[hsl(142,72%,37%)] text-[hsl(142,72%,37%)]",
    Incumplida: "border-[hsl(0,72%,51%)] text-[hsl(0,72%,51%)]",
  };

  // PDF data builder
  const pdfPrestamo = {
    id: prestamo.id,
    clienteNombre: cliente?.nombre_completo || "—",
    clienteDni: cliente?.dni || "",
    clienteDireccion: cliente?.direccion || "",
    clienteTelefono: cliente?.telefono || "",
    empresa: prestamo.empresa || "—",
    modalidad: prestamo.modalidad,
    montoSolicitado: Number(prestamo.monto_solicitado),
    montoTotalPagar: Number(prestamo.monto_total_pagar || 0),
    numCuotas: prestamo.num_cuotas,
    frecuencia: prestamo.frecuencia,
    tasaInteres: Number(prestamo.tasa_interes || 0),
    cuotaCalculada: Number(prestamo.cuota_calculada || 0),
    cuotaRedondeada: Number(prestamo.cuota_redondeada || 0),
    gastosLegales: Number(prestamo.gastos_legales || 0),
    tipoMora: prestamo.tipo_mora || "porcentaje",
    valorMora: Number(prestamo.valor_mora || 0),
    estado,
    fechaRegistro: prestamo.fecha_registro ? format(new Date(prestamo.fecha_registro), "dd/MM/yyyy") : "—",
    fechaPrimerPago: prestamo.fecha_primer_pago ? format(new Date(prestamo.fecha_primer_pago), "dd/MM/yyyy") : "—",
    caja: caja?.nombre || "—",
    ruta: ruta?.nombre || "—",
    notas: prestamo.notas || "",
    logoUrl: empresaData?.logo_url,
    empresaNombre: empresaData?.nombre,
  };

  const pdfCuotas = amort.map(c => ({
    num_cuota: c.num_cuota,
    capital: Number(c.capital || 0),
    interes: Number(c.interes || 0),
    capital_interes: Number(c.capital_interes || 0),
    fecha_vencimiento: c.fecha_vencimiento,
    dias_atraso: Number(c.dias_atraso || 0),
    mora: Number(c.mora || 0),
    saldo_total: Number(c.saldo_total || 0),
    status: c.status || "Pendiente",
    fecha_pagada: c.fecha_pagada,
    capital_pagado: Number(c.capital_pagado || 0),
    interes_pagado: Number(c.interes_pagado || 0),
    mora_pagada: Number(c.mora_pagada || 0),
  }));

  const pdfPagos = pagosRaw.map(p => ({
    created_at: p.created_at || "",
    monto_recibido: Number(p.monto_recibido),
    aplicado_mora: Number(p.aplicado_mora || 0),
    aplicado_interes: Number(p.aplicado_interes || 0),
    aplicado_capital: Number(p.aplicado_capital || 0),
    metodo_pago: p.metodo_pago || "Efectivo",
    cajaNombre: (p.cajas as any)?.nombre || "—",
  }));

  const handlePdf = async (type: "estado" | "contrato" | "pagos") => {
    setDocPreview({ open: true, type });
  };

  const docTitles: Record<string, string> = { estado: "Estado de Cuenta", contrato: "Contrato de Préstamo", pagos: "Recibo de Pagos" };
  const docFileNames: Record<string, string> = {
    estado: `estado-cuenta-PRE-${shortId}.pdf`,
    contrato: `contrato-PRE-${shortId}.pdf`,
    pagos: `pagos-PRE-${shortId}.pdf`,
  };

  const generateDocForPreview = async () => {
    const t = docPreview.type!;
    if (t === "estado") return generarEstadoCuenta(pdfPrestamo, pdfCuotas, pdfPagos);
    if (t === "contrato") return generarContrato(pdfPrestamo, pdfCuotas);
    return generarReciboPagos(pdfPrestamo, pdfPagos);
  };

  return (
    <div>
      {/* ── HEADER ────────────────────────────────────────────── */}
      <div className="bg-card px-6 py-5 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-1">
              <Link to="/prestamos" className="hover:text-foreground transition-colors">Préstamos</Link>
              <span>/</span>
              <span className="text-foreground">PRE-{shortId}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-xl font-bold tracking-tight">
                {cliente ? (
                  <Link to={`/clientes/${cliente.id}`} className="hover:text-primary transition-colors">{cliente.nombre_completo}</Link>
                ) : "Cliente"}
              </h1>
              <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-medium", estadoBadge[estado])}>
                {estado}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[13px] text-muted-foreground">
              {cliente?.direccion && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />{cliente.direccion}
                </span>
              )}
              {cliente?.telefono && (
                <a href={`tel:${cliente.telefono}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                  <Phone className="h-3.5 w-3.5" />{cliente.telefono}
                </a>
              )}
              <span className="text-[11px] text-muted-foreground/60">PRE-{shortId}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Document buttons */}
            <div className="flex items-center gap-1 mr-1 border-r border-border pr-3">
              <Button variant="secondary" size="sm" className="h-8 text-[12px] text-muted-foreground hover:text-primary" title="Estado de Cuenta" onClick={() => handlePdf("estado")}>
                <FileText className="h-3.5 w-3.5 mr-1.5" />Estado de Cuenta
              </Button>
              <Button variant="secondary" size="sm" className="h-8 text-[12px] text-muted-foreground hover:text-primary" title="Contrato" onClick={() => handlePdf("contrato")}>
                <FileSignature className="h-3.5 w-3.5 mr-1.5" />Contrato
              </Button>
              <Button variant="secondary" size="sm" className="h-8 text-[12px] text-muted-foreground hover:text-primary" title="Recibo de Pagos" onClick={() => handlePdf("pagos")}>
                <Receipt className="h-3.5 w-3.5 mr-1.5" />Pagos
              </Button>
            </div>
            {/* Action buttons */}
            <Button size="sm" className="h-8 text-[13px] bg-primary hover:bg-primary/90" onClick={() => { setSelectedCuota(null); setPagoOpen(true); }}>
              <HandCoins className="h-3.5 w-3.5 mr-1.5" />Registrar Pago
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => setEditarOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Editar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setReasignarOpen(true)}>
                  <Route className="h-3.5 w-3.5 mr-2" />Reasignar Ruta / Cobrador
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReestructurarOpen(true)} disabled={estado === "Liquidado" || estado === "Cancelado" || estado === "Reestructurado"}>
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />Reestructurar Préstamo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Imprimir tabla</DropdownMenuItem>
                <DropdownMenuItem>Exportar PDF</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setCancelarOpen(true)}
                  disabled={estado === "Liquidado" || estado === "Cancelado" || estado === "Reestructurado"}
                >
                  <Ban className="h-3.5 w-3.5 mr-2" />Cancelar préstamo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── KPI CARDS ─────────────────────────────────────────── */}
      <div className="bg-card px-6 py-4 border-b border-border">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="border border-[hsl(220,14%,91%)] rounded-lg px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(220,9%,60%)]">{k.label}</p>
              <p className={cn("text-[22px] font-bold mt-0.5 leading-tight", k.color)}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── BODY — 2 columns ──────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row min-h-[600px]">

        {/* LEFT SIDEBAR (28%) */}
        <div className="lg:w-[28%] bg-[hsl(210,20%,98%)] border-r border-[hsl(220,14%,91%)] p-5 space-y-5">

          {/* Datos del Préstamo */}
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Datos del Préstamo</h3>
            <div className="space-y-2.5">
              <SidebarField label="CLIENTE" value={
                cliente ? <Link to={`/clientes/${cliente.id}`} className="text-primary hover:underline font-medium">{cliente.nombre_completo}</Link> : "—"
              } />
              <SidebarField label="EMPRESA" value={dashStr(prestamo.empresa)} />
              <SidebarField label="COBRADOR" value={cobradoresAll.find((c: any) => c.id === prestamo.cobrador_id)?.nombre || "Sin asignar"} />
              <SidebarField label="RUTA" value={
                <span className="flex items-center gap-1.5">
                  {ruta?.nombre || "—"}
                  <button onClick={() => setReasignarOpen(true)} className="text-primary hover:text-primary/80 transition-colors" title="Reasignar">
                    <Route className="h-3 w-3" />
                  </button>
                </span>
              } />
              <SidebarField label="GENERADO POR" value="—" />
              <SidebarField label="F. REGISTRO" value={prestamo.fecha_registro ? format(new Date(prestamo.fecha_registro), "dd/MM/yyyy") : "—"} />
              <SidebarField label="F. PRIMER PAGO" value={prestamo.fecha_primer_pago ? format(new Date(prestamo.fecha_primer_pago), "dd/MM/yyyy") : "—"} />
              <SidebarField label="CAJA" value={caja?.nombre || "—"} />
            </div>
          </div>

          <div className="border-t border-[hsl(220,14%,91%)]" />

          {/* Configuración del Crédito */}
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Configuración del Crédito</h3>
            <div className="space-y-2.5">
              <SidebarField label="MODALIDAD" value={prestamo.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos"} />
              <SidebarField label="MONTO SOLICITADO" value={$$(prestamo.monto_solicitado)} />
              <SidebarField label="CUOTAS — FRECUENCIA" value={`${prestamo.num_cuotas} — ${prestamo.frecuencia}`} />
              <SidebarField label="TASA DE INTERÉS" value={prestamo.tasa_interes ? `${prestamo.tasa_interes}%` : "—"} />
              <SidebarField label="CUOTA ESTÁNDAR" value={$$(prestamo.cuota_calculada)} />
              <SidebarField label="CUOTA REDONDEADA" value={prestamo.cuota_redondeada ? $$(prestamo.cuota_redondeada) : "—"} />
              <SidebarField label="TIPO MORA / VALOR" value={prestamo.tipo_mora ? `${prestamo.tipo_mora} — ${prestamo.valor_mora}${prestamo.tipo_mora === "porcentaje" ? "%" : ""}` : "—"} />
              <SidebarField label="GASTOS LEGALES" value={$$(prestamo.gastos_legales)} />
            </div>
          </div>

          <div className="border-t border-[hsl(220,14%,91%)]" />

          {/* Estado del Préstamo */}
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Estado del Préstamo</h3>
            <div className="space-y-2.5">
              <SidebarField label="ESTADO" value={
                <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[12px] font-medium", estadoBadge[estado])}>{estado}</span>
              } />
              {cuotasVencidas > 0 && (
                <SidebarField label="DÍAS EN MORA" value={<span className="text-destructive font-bold text-[15px]">{diasMora}</span>} />
              )}
              {proximaCuota && (
                <SidebarField label="PRÓXIMA CUOTA" value={`#${proximaCuota.num_cuota} — ${format(new Date(proximaCuota.fecha_vencimiento), "dd/MM/yyyy")} — ${$$(proximaCuota.capital_interes)}`} />
              )}
              {ultimoPago && (
                <SidebarField label="ÚLTIMO PAGO" value={`${ultimoPago.created_at ? format(new Date(ultimoPago.created_at), "dd/MM/yyyy") : "—"} — ${$$(Number(ultimoPago.monto_recibido))}`} />
              )}
              {prestamo.notas && (
                <SidebarField label="NOTAS" value={<span className="italic text-muted-foreground">{prestamo.notas}</span>} />
              )}
              {(prestamo as any).reestructurado_de && (
                <SidebarField label="REESTRUCTURADO DE" value={
                  <Link to={`/prestamos/${(prestamo as any).reestructurado_de}`} className="text-primary hover:underline text-[12px]">
                    PRE-{((prestamo as any).reestructurado_de as string).slice(0, 8)}
                  </Link>
                } />
              )}
              {(prestamo as any).cancelado_en && (
                <SidebarField label="CANCELADO/REEST." value={
                  <span className="text-destructive text-[12px]">
                    {format(new Date((prestamo as any).cancelado_en), "dd/MM/yyyy HH:mm")}
                    {(prestamo as any).motivo_cancelacion && <><br /><span className="italic text-muted-foreground">{(prestamo as any).motivo_cancelacion}</span></>}
                  </span>
                } />
              )}
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT (72%) */}
        <div className="lg:w-[72%] bg-card">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="border-b border-border px-5">
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
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-[13px] font-medium text-muted-foreground data-[state=active]:text-foreground"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* ── TAB: Amortización ──────────────────────────── */}
            <TabsContent value="amortizacion" className="m-0">
              {/* Toggle optional columns */}
              <div className="flex justify-end px-4 py-2">
                <button
                  onClick={() => setShowOptional(!showOptional)}
                  className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                >
                  {showOptional ? "Menos columnas" : "Más columnas"} <ChevronDown className={cn("h-3 w-3 transition-transform", showOptional && "rotate-180")} />
                </button>
              </div>
              <div className="overflow-x-auto">
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
                    {amort.length === 0 ? (
                      <TableRow><TableCell colSpan={defaultCols.length + (showOptional ? optionalCols.length : 0) + 1} className="text-center py-8 text-muted-foreground text-[13px]">Sin cuotas</TableCell></TableRow>
                    ) : amort.map((c) => {
                      const status = c.status || "Pendiente";
                      const isNext = proximaCuota?.num_cuota === c.num_cuota;
                      return (
                        <TableRow
                          key={c.num_cuota}
                          className={cn(
                            "border-b border-[hsl(220,14%,96%)] hover:bg-[hsl(210,20%,98%)] transition-colors",
                            isNext && "border-l-[3px] border-l-primary",
                          )}
                          onMouseEnter={() => setHoveredRow(c.num_cuota)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          <TableCell className="px-3 text-[13px] font-medium">{c.num_cuota}</TableCell>
                          <TableCell className="px-3 text-[12px]">{dash(c.capital) || $$(c.capital)}</TableCell>
                          <TableCell className="px-3 text-[12px]">{dash(c.interes) || $$(c.interes)}</TableCell>
                          <TableCell className="px-3 text-[13px] font-medium">{$$(c.capital_interes)}</TableCell>
                          <TableCell className="px-3 text-[12px] whitespace-nowrap">{format(new Date(c.fecha_vencimiento), "dd/MM/yy")}</TableCell>
                          <TableCell className={cn("px-3 text-[12px]", (c.dias_atraso || 0) > 0 ? "text-destructive font-bold" : "text-[hsl(220,14%,83%)]")}>
                            {(c.dias_atraso || 0) > 0 ? c.dias_atraso : "—"}
                          </TableCell>
                          <TableCell className={cn("px-3 text-[12px]", (c.mora || 0) > 0 ? "text-destructive font-bold" : "text-[hsl(220,14%,83%)]")}>
                            {(c.mora || 0) > 0 ? $$(c.mora) : "—"}
                          </TableCell>
                          <TableCell className="px-3 text-[13px] font-medium">{dash(c.saldo_total) || $$(c.saldo_total)}</TableCell>
                          <TableCell className="px-3"><CuotaStatusBadge status={status} /></TableCell>
                          <TableCell className="px-3 text-[12px] text-muted-foreground whitespace-nowrap">
                            {c.fecha_pagada ? format(new Date(c.fecha_pagada), "dd/MM/yy") : <span className="text-[hsl(220,14%,83%)]">—</span>}
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
                            {status !== "Pagada" && (
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
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── TAB: Pagos ─────────────────────────────────── */}
            <TabsContent value="pagos" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[hsl(210,20%,98%)] hover:bg-[hsl(210,20%,98%)]">
                      {["Fecha", "Recibo", "Monto", "→ Mora", "→ Interés", "→ Capital", "Caja", "Método", "Estado", ""].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(220,9%,42%)] px-3 py-2 whitespace-nowrap border-b border-[hsl(220,14%,91%)]">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosRaw.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-[13px]">Sin pagos registrados</TableCell></TableRow>
                    ) : (
                      <>
                        {pagosRaw.map((pg, i) => {
                          const cajaName = (pg.cajas as any)?.nombre || "—";
                          const isAnulado = (pg as any).anulado === true;
                          return (
                            <TableRow key={pg.id} className={cn(
                              "border-b border-[hsl(220,14%,96%)] hover:bg-[hsl(210,20%,98%)]",
                              isAnulado && "opacity-50 line-through"
                            )}>
                              <TableCell className="px-3 text-[12px]">{pg.created_at ? format(new Date(pg.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                              <TableCell className="px-3 text-[12px] text-muted-foreground">#{i + 1}</TableCell>
                              <TableCell className="px-3 text-[13px] font-medium">{$$(Number(pg.monto_recibido))}</TableCell>
                              <TableCell className={cn("px-3 text-[12px]", (pg.aplicado_mora || 0) > 0 ? "text-destructive" : "text-[hsl(220,14%,83%)]")}>{(pg.aplicado_mora || 0) > 0 ? $$(pg.aplicado_mora) : "—"}</TableCell>
                              <TableCell className="px-3 text-[12px]">{dash(pg.aplicado_interes) || $$(pg.aplicado_interes)}</TableCell>
                              <TableCell className="px-3 text-[12px]">{dash(pg.aplicado_capital) || $$(pg.aplicado_capital)}</TableCell>
                              <TableCell className="px-3 text-[12px] text-muted-foreground">{cajaName}</TableCell>
                              <TableCell className="px-3"><MetodoDot metodo={pg.metodo_pago || "Efectivo"} /></TableCell>
                              <TableCell className="px-3">
                                {isAnulado ? (
                                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-destructive text-destructive" title={(pg as any).motivo_anulacion || ""}>
                                    <XCircle className="h-3 w-3 mr-0.5" />Anulado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-[hsl(142,72%,37%)] text-[hsl(142,72%,37%)]">
                                    <Check className="h-3 w-3 mr-0.5" />Válido
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="px-3">
                                {!isAnulado && (
                                  <button
                                    title="Anular pago"
                                    onClick={() => {
                                      setSelectedPago({
                                        id: pg.id,
                                        prestamo_id: pg.prestamo_id,
                                        cuota_id: pg.cuota_id,
                                        monto_recibido: Number(pg.monto_recibido),
                                        aplicado_mora: Number(pg.aplicado_mora || 0),
                                        aplicado_interes: Number(pg.aplicado_interes || 0),
                                        aplicado_capital: Number(pg.aplicado_capital || 0),
                                        caja_id: pg.caja_id,
                                        cobrador_id: (pg as any).cobrador_id,
                                      });
                                      setAnularPagoOpen(true);
                                    }}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-[hsl(210,20%,98%)] hover:bg-[hsl(210,20%,98%)] font-semibold border-t border-[hsl(220,14%,91%)]">
                          <TableCell className="px-3 text-[12px]">Totales</TableCell>
                          <TableCell className="px-3" />
                          <TableCell className="px-3 text-[13px]">{$$(totalPagosMonto)}</TableCell>
                          <TableCell className="px-3 text-[12px]">{$$(totalPagosMora)}</TableCell>
                          <TableCell className="px-3 text-[12px]">{$$(totalPagosInteres)}</TableCell>
                          <TableCell className="px-3 text-[12px]">{$$(totalPagosCapital)}</TableCell>
                          <TableCell colSpan={4} />
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── TAB: Promesas ───────────────────────────────── */}
            <TabsContent value="promesas" className="m-0">
              <div className="flex justify-end px-5 py-2.5 border-b border-border">
                <Button variant="outline" size="sm" className="h-7 text-[12px]"><Plus className="h-3 w-3 mr-1" />Nueva Promesa</Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[hsl(210,20%,98%)] hover:bg-[hsl(210,20%,98%)]">
                      {["Cuota #", "F. Prometida", "Monto", "Notas", "Status", "Creado", "Acción"].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(220,9%,42%)] px-3 py-2 whitespace-nowrap border-b border-[hsl(220,14%,91%)]">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promesasRaw.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-[13px]">Sin promesas</TableCell></TableRow>
                    ) : promesasRaw.map((pr) => (
                      <TableRow key={pr.id} className="border-b border-[hsl(220,14%,96%)] hover:bg-[hsl(210,20%,98%)]">
                        <TableCell className="px-3 text-[12px]">{pr.cuota_id ? "—" : "—"}</TableCell>
                        <TableCell className="px-3 text-[12px]">{format(new Date(pr.fecha_prometida), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="px-3 text-[13px] font-medium">{$$(Number(pr.monto_prometido))}</TableCell>
                        <TableCell className="px-3 text-[12px] text-muted-foreground max-w-[200px] truncate">{pr.notas || "—"}</TableCell>
                        <TableCell className="px-3">
                          <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border", promesaStatusStyle[pr.status || "Pendiente"] || promesaStatusStyle.Pendiente)}>
                            {pr.status || "Pendiente"}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 text-[12px] text-muted-foreground">{pr.created_at ? format(new Date(pr.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                        <TableCell className="px-3">
                          <button className="text-[11px] text-muted-foreground hover:text-primary transition-colors">Editar</button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── TAB: Actividad ──────────────────────────────── */}
            <TabsContent value="actividad" className="m-0 p-5">
              <div className="relative">
                <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
                <div className="space-y-5">
                  {actividad.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground pl-10">Sin actividad registrada</p>
                  ) : actividad.slice().reverse().map((a, i) => {
                    const dotColor = activityColors[a.tipo] || "bg-muted-foreground";
                    return (
                      <div key={i} className="relative pl-8">
                        <div className={cn("absolute left-[7px] top-1.5 h-2.5 w-2.5 rounded-full", dotColor)} />
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
          id: c.id,
          num_cuota: c.num_cuota,
          saldo_mora: Number(c.saldo_mora || 0),
          saldo_interes: Number(c.saldo_interes || 0),
          saldo_capital: Number(c.saldo_capital || 0),
          saldo_total: Number(c.saldo_total || 0),
          mora_pagada: Number(c.mora_pagada || 0),
          interes_pagado: Number(c.interes_pagado || 0),
          capital_pagado: Number(c.capital_pagado || 0),
          status: c.status || "Pendiente",
          fecha_vencimiento: c.fecha_vencimiento,
        }))}
        cajas={cajasAll.map((c) => ({ id: c.id, nombre: c.nombre }))}
        rutaId={prestamo.ruta_id}
        cobradorId={prestamo.cobrador_id}
        montoInicial={selectedCuota ? Number(selectedCuota.saldo_total || 0) : undefined}
      />

      {/* Promesa Modal */}
      {selectedCuota && (
        <PromesaModal
          open={promesaOpen}
          onOpenChange={setPromesaOpen}
          prestamoId={prestamo.id}
          cuotaNum={selectedCuota.num_cuota}
          cuotaId={selectedCuota.id}
          saldoTotal={Number(selectedCuota.saldo_total || 0)}
          fechaVencimiento={format(new Date(selectedCuota.fecha_vencimiento), "dd/MM/yyyy")}
        />
      )}

      {/* Reasignar Modal */}
      <ReasignarModal
        open={reasignarOpen}
        onOpenChange={setReasignarOpen}
        prestamoId={prestamo.id}
        currentRutaId={prestamo.ruta_id}
        currentCobradorId={prestamo.cobrador_id}
        rutas={rutasAll.map((r) => ({ id: r.id, nombre: r.nombre }))}
      />

      {/* Anular Pago Modal */}
      <AnularPagoModal
        open={anularPagoOpen}
        onOpenChange={setAnularPagoOpen}
        pago={selectedPago}
      />

      {/* Cancelar Préstamo Modal */}
      <CancelarPrestamoModal
        open={cancelarOpen}
        onOpenChange={setCancelarOpen}
        prestamoId={prestamo.id}
        clienteNombre={cliente?.nombre_completo || "—"}
        saldoPendiente={saldoPendiente}
      />

      {/* Reestructurar Modal */}
      <ReestructurarModal
        open={reestructurarOpen}
        onOpenChange={setReestructurarOpen}
        prestamoId={prestamo.id}
        clienteId={prestamo.cliente_id}
        clienteNombre={cliente?.nombre_completo || "—"}
        saldoCapital={amort.reduce((s, c) => s + Number(c.saldo_capital || 0), 0)}
        saldoTotal={saldoPendiente}
        prestamo={{
          modalidad: prestamo.modalidad,
          frecuencia: prestamo.frecuencia,
          tasa_interes: prestamo.tasa_interes ? Number(prestamo.tasa_interes) : null,
          tipo_mora: prestamo.tipo_mora,
          valor_mora: prestamo.valor_mora ? Number(prestamo.valor_mora) : null,
          caja_id: prestamo.caja_id,
          ruta_id: prestamo.ruta_id,
          cobrador_id: prestamo.cobrador_id,
        }}
      />

      {/* Editar Préstamo Modal */}
      <EditPrestamoModal
        open={editarOpen}
        onOpenChange={setEditarOpen}
        prestamo={{
          id: prestamo.id,
          tasa_interes: prestamo.tasa_interes ? Number(prestamo.tasa_interes) : null,
          tipo_mora: prestamo.tipo_mora,
          valor_mora: prestamo.valor_mora ? Number(prestamo.valor_mora) : null,
          gastos_legales: prestamo.gastos_legales ? Number(prestamo.gastos_legales) : null,
          caja_id: prestamo.caja_id,
          ruta_id: prestamo.ruta_id,
          cobrador_id: prestamo.cobrador_id,
          notas: prestamo.notas || null,
        }}
        cajas={cajasAll.map((c) => ({ id: c.id, nombre: c.nombre }))}
        rutas={rutasAll.map((r) => ({ id: r.id, nombre: r.nombre }))}
        cobradores={cobradoresAll.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      {/* Document Preview Modal */}
      {docPreview.type && (
        <DocumentPreviewModal
          open={docPreview.open}
          onOpenChange={(open) => setDocPreview({ open, type: open ? docPreview.type : null })}
          title={docTitles[docPreview.type]}
          fileName={docFileNames[docPreview.type]}
          generateDoc={generateDocForPreview}
        />
      )}
    </div>
  );
}

// ── Sidebar field component ───────────────────────────────────────
function SidebarField({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", full && "col-span-2")}>
      <p className="text-[11px] uppercase tracking-wider text-foreground font-semibold whitespace-nowrap">{label}</p>
      <p className="text-[12px] text-muted-foreground text-right">{value}</p>
    </div>
  );
}
