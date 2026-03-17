import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, useParams, Link } from "react-router-dom";
import { PagoModal } from "@/components/PagoModal";
import { StripeChargeButton } from "@/components/StripeChargeButton";
import { PromesaModal } from "@/components/PromesaModal";
import { ReasignarModal } from "@/components/ReasignarModal";
import { AnularPagoModal } from "@/components/AnularPagoModal";
import { EditPagoModal } from "@/components/EditPagoModal";
import { CancelarPrestamoModal } from "@/components/CancelarPrestamoModal";
import { ReestructurarModal } from "@/components/ReestructurarModal";
import { EditPrestamoModal } from "@/components/EditPrestamoModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, Pencil, HandCoins, Check, AlertTriangle, CalendarCheck, Plus, Activity, CreditCard, FileText, ChevronDown, Bell, Receipt, FileSignature, MapPin, Phone, Route, Ban, RefreshCw, XCircle, Zap, Eye, Send, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { cn, $$, fmtDate, fmtDateTime } from "@/lib/utils";
import { usePrestamoDetalle, useAmortizacion, usePagos, usePromesas, useCajas } from "@/hooks/usePrestamoDetalle";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PhotoLightbox } from "@/components/shared/PhotoLightbox";
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
const defaultCols = ["#", "Capital", "Interés", "Cuota", "F.Venc.", "Días", "Mora", "Pagado", "Saldo Total", "Status", "F.Pagada"];
const optionalCols = ["Cap.Pag.", "Int.Pag.", "Mora Pag.", "S.Cap", "S.Int", "S.Mora", "Desc.Mora", "Avisado"];

// ── Stripe Auto-Charge Toggle ─────────────────────────────────────
function StripeAutoChargeToggle({ prestamoId, enabled, disabled, onToggled, empresaId }: {
  prestamoId: string; enabled: boolean; disabled: boolean; onToggled: () => void; empresaId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(enabled);

  // Check if Stripe Connect is configured for this empresa
  const { data: stripeStatus } = useQuery({
    queryKey: ["stripe-connect-status-toggle", empresaId],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/stripe-connect-status?empresa_id=${empresaId}`;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) return { connected: false, charges_enabled: false };
      return res.json();
    },
    staleTime: 60_000,
  });

  const stripeConnected = stripeStatus?.connected && stripeStatus?.charges_enabled;

  const handleToggle = async (value: boolean) => {
    if (!stripeConnected) {
      toast.error("Primero debes conectar Stripe en Configuración → Stripe Connect");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("prestamos")
        .update({ cobro_automatico_stripe: value } as any)
        .eq("id", prestamoId);
      if (error) throw error;
      setChecked(value);
      toast.success(value ? "Cobro automático activado" : "Cobro automático desactivado");
      onToggled();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5" /> Cobro Automático Stripe
      </h3>
      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium">
            {checked ? "Activado" : "Desactivado"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {!stripeConnected
              ? "Stripe no está conectado. Configúralo en Configuración → Stripe Connect."
              : checked
                ? "Las cuotas se cobrarán automáticamente a la tarjeta del cliente en su fecha de vencimiento."
                : "Active para cobrar automáticamente las cuotas con tarjeta registrada."}
          </p>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={handleToggle}
          disabled={disabled || loading || !stripeConnected}
        />
      </div>
    </div>
  );
}

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
  const [amortFilter, setAmortFilter] = useState<"todas" | "Pagada" | "Pendiente" | "Vencida">("todas");
  const [reasignarOpen, setReasignarOpen] = useState(false);
  const [anularPagoOpen, setAnularPagoOpen] = useState(false);
  const [selectedPago, setSelectedPago] = useState<any>(null);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [reestructurarOpen, setReestructurarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [docPreview, setDocPreview] = useState<{ open: boolean; type: "estado" | "contrato" | "pagos" | null }>({ open: false, type: null });
  const [editPagoOpen, setEditPagoOpen] = useState(false);
  const [editPagoData, setEditPagoData] = useState<any>(null);
  const [fotoLightbox, setFotoLightbox] = useState(false);
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .eq("activo", true)
        .order("nombre_completo");
      if (error) throw error;
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
  const cuotasPagadas = amort.filter((c) => c.status === "Pagada").length;
  const saldoMoroso = amort.reduce((s, c) => s + Number(c.saldo_mora || 0), 0);
  const proximaCuota = amort.find((c) => c.status === "Parcial") || amort.find((c) => c.status === "Vencida") || amort.find((c) => c.status === "Pendiente" || c.status === "Prometida");
  const ultimoPago = pagosRaw.length > 0 ? pagosRaw[pagosRaw.length - 1] : null;
  const diasMora = amort.filter(c => c.status === "Vencida").reduce((max, c) => Math.max(max, c.dias_atraso || 0), 0);
  const cobroHoy = proximaCuota ? Number(proximaCuota.saldo_total || 0) : 0;

  const estado = (prestamo.estado || "Activo") as string;
  const isCancelado = estado === "Cancelado" || estado === "Reestructurado";
  const folioId = (prestamo as any).id_prestamo || `PRE-${(prestamo.id?.slice(0, 8) || id)}`;
  const shortId = folioId;

  const kpis = [
    { label: "Cobro de Hoy", value: $$(cobroHoy), color: cobroHoy > 0 ? "text-primary" : "text-foreground", sub: proximaCuota ? `Cuota #${proximaCuota.num_cuota}` : "—" },
    { label: "Avance", value: `${cuotasPagadas}/${prestamo.num_cuotas}`, color: "text-foreground", sub: "cuotas pagadas" },
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
  const findUserName = (userId: string | null | undefined) => {
    if (!userId) return "—";
    const profile = cobradoresAll.find((c: any) => c.id === userId);
    return profile?.nombre || userId.slice(0, 8);
  };

  const actividad = [
    { tipo: "registro", desc: "Préstamo registrado", usuario: findUserName(prestamo.generado_por), fecha: prestamo.created_at || prestamo.fecha_registro || "" },
    ...pagosRaw.map((pg) => ({
      tipo: pg.anulado ? "anulacion" : "pago",
      desc: pg.anulado
        ? `Pago anulado — ${$$(Number(pg.monto_recibido))}${pg.motivo_anulacion ? ` (${pg.motivo_anulacion})` : ""}`
        : `Pago recibido — ${$$(Number(pg.monto_recibido))} (${pg.metodo_pago || "Efectivo"})`,
      usuario: pg.anulado ? findUserName(pg.anulado_por) : findUserName(pg.registrado_por),
      fecha: pg.anulado ? (pg.anulado_en || pg.created_at || "") : (pg.created_at || ""),
    })),
    ...promesasRaw.map((pr) => ({
      tipo: pr.status === "Incumplida" ? "promesa_incumplida" : "promesa",
      desc: `Promesa de pago — ${$$(Number(pr.monto_prometido))} para ${fmtDate(pr.fecha_prometida)}`,
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
    fechaRegistro: fmtDate(prestamo.fecha_registro),
    fechaPrimerPago: fmtDate(prestamo.fecha_primer_pago),
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
      <div className="bg-card px-4 md:px-6 py-4 md:py-5 border-b border-border">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-2">
          <Link to="/prestamos" className="hover:text-foreground transition-colors">Préstamos</Link>
          <span>/</span>
          <span className="text-foreground">{folioId}</span>
        </div>

        {/* Client info row */}
        <div className="flex items-start gap-3">
          <Avatar
            className={cn("h-14 w-14 md:h-20 md:w-20 shrink-0 rounded-xl", cliente?.foto_cliente && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all")}
            onClick={() => cliente?.foto_cliente && setFotoLightbox(true)}
          >
            {cliente?.foto_cliente ? <AvatarImage src={cliente.foto_cliente} alt={cliente.nombre_completo} className="rounded-xl object-cover" /> : null}
            <AvatarFallback className="text-xl md:text-2xl font-bold bg-primary/10 text-primary rounded-xl">
              {(cliente?.nombre_completo || "C").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {cliente?.foto_cliente && (
            <PhotoLightbox open={fotoLightbox} onOpenChange={setFotoLightbox} src={cliente.foto_cliente} alt={cliente.nombre_completo} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-bold tracking-tight truncate">
                {cliente ? (
                  <Link to={`/clientes/${cliente.id}`} className="hover:text-primary transition-colors">{cliente.nombre_completo}</Link>
                ) : "Cliente"}
              </h1>
              <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-medium shrink-0", estadoBadge[estado])}>
                {estado}
              </span>
            </div>
            <div className="flex items-center gap-2 md:gap-3 mt-1 text-[12px] md:text-[13px] text-muted-foreground flex-wrap">
              {cliente?.direccion && (
                <span className="flex items-center gap-1 truncate max-w-[180px] md:max-w-none">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{cliente.direccion}</span>
                </span>
              )}
              {cliente?.telefono && (
                <a href={`tel:${cliente.telefono}`} className="flex items-center gap-1 hover:text-primary transition-colors shrink-0">
                  <Phone className="h-3.5 w-3.5" />{cliente.telefono}
                </a>
              )}
              <span className="text-[11px] text-muted-foreground/60 shrink-0">{folioId}</span>
            </div>
          </div>
        </div>

        {/* Document & Action buttons */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          {/* Document buttons */}
          <Button variant="secondary" size="sm" className="h-8 text-[11px] md:text-[12px] text-muted-foreground hover:text-primary" onClick={() => handlePdf("estado")}>
            <FileText className="h-3.5 w-3.5 mr-1" />Estado de Cuenta
          </Button>
          <Button variant="secondary" size="sm" className="h-8 text-[11px] md:text-[12px] text-muted-foreground hover:text-primary" onClick={() => handlePdf("contrato")}>
            <FileSignature className="h-3.5 w-3.5 mr-1" />Contrato
          </Button>
          <Button variant="secondary" size="sm" className="h-8 text-[11px] md:text-[12px] text-muted-foreground hover:text-primary" onClick={() => handlePdf("pagos")}>
            <Receipt className="h-3.5 w-3.5 mr-1" />Pagos
          </Button>
          <div className="hidden md:block w-px h-5 bg-border mx-1" />
          {/* Action buttons */}
          <Button size="sm" className="h-8 text-[12px] md:text-[13px] bg-primary hover:bg-primary/90" onClick={() => { setSelectedCuota(null); setPagoOpen(true); }} disabled={isCancelado}>
            <HandCoins className="h-3.5 w-3.5 mr-1" />Pago
          </Button>
          {!isCancelado && <StripeChargeButton
            prestamoId={prestamo.id}
            clienteId={cliente?.id}
            clienteNombre={cliente?.nombre_completo || ""}
            clienteTelefono={cliente?.telefono}
            clienteEmail={cliente?.correo}
            cuotaId={proximaCuota?.id}
            monto={proximaCuota ? Number(proximaCuota.saldo_total || 0) : saldoPendiente}
            cuotaNum={proximaCuota?.num_cuota}
            onChargeSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["amortizacion", id] });
              queryClient.invalidateQueries({ queryKey: ["pagos", id] });
              queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", id] });
            }}
          />}
          <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setEditarOpen(true)} disabled={isCancelado}>
            <Pencil className="h-3.5 w-3.5 md:mr-1" /><span className="hidden md:inline">Editar</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setReasignarOpen(true)} disabled={isCancelado}>
                <Route className="h-3.5 w-3.5 mr-2" />Reasignar Ruta / Cobrador
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReestructurarOpen(true)} disabled={estado === "Liquidado" || estado === "Cancelado" || estado === "Reestructurado"}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />Reestructurar Préstamo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isCancelado}>Imprimir tabla</DropdownMenuItem>
              <DropdownMenuItem disabled={isCancelado}>Exportar PDF</DropdownMenuItem>
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

      {/* ── KPI CARDS ─────────────────────────────────────────── */}
      <div className="bg-card px-4 md:px-6 py-3 md:py-4 border-b border-border">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="border border-[hsl(220,14%,91%)] rounded-lg px-3 md:px-4 py-2 md:py-3">
              <p className="text-[10px] md:text-[11px] font-medium uppercase tracking-wider text-[hsl(220,9%,60%)]">{k.label}</p>
              <p className={cn("text-[18px] md:text-[22px] font-bold mt-0.5 leading-tight", k.color)}>{k.value}</p>
              {(k as any).sub && <p className="text-[10px] text-muted-foreground mt-0.5">{(k as any).sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      {(() => {
        const sidebarContent = (
          <div className="space-y-4 md:space-y-5">
            {/* Datos del Préstamo */}
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Datos del Préstamo</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <SidebarField full label="CLIENTE" value={
                  cliente ? <Link to={`/clientes/${cliente.id}`} className="text-primary hover:underline font-medium">{cliente.nombre_completo}</Link> : "—"
                } />
                <SidebarField label="EMPRESA" value={dashStr(prestamo.empresa)} />
                <SidebarField label="COBRADOR" value={cobradoresAll.find((c: any) => c.id === prestamo.cobrador_id)?.nombre || "Sin asignar"} />
                <SidebarField label="RUTA" value={
                  <span className="flex items-center gap-1.5">
                    {ruta?.nombre || "—"}
                    {!isCancelado && <button onClick={() => setReasignarOpen(true)} className="text-primary hover:text-primary/80 transition-colors" title="Reasignar">
                      <Route className="h-3 w-3" />
                    </button>}
                  </span>
                } />
                <SidebarField label="CAJA" value={caja?.nombre || "—"} />
                {(prestamo as any).codigo_interno && (
                  <SidebarField label="CÓD. INTERNO" value={<span className="font-mono font-semibold">{(prestamo as any).codigo_interno}</span>} />
                )}
                <SidebarField label="F. REGISTRO" value={fmtDate(prestamo.fecha_registro)} />
                <SidebarField label="F. PRIMER PAGO" value={fmtDate(prestamo.fecha_primer_pago)} />
              </div>
            </div>

            <div className="border-t border-[hsl(220,14%,91%)]" />

            {/* Configuración del Crédito */}
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Configuración del Crédito</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <SidebarField label="MODALIDAD" value={prestamo.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos"} />
                <SidebarField label="MONTO" value={$$(prestamo.monto_solicitado)} />
                <SidebarField label="CUOTAS" value={`${prestamo.num_cuotas} — ${prestamo.frecuencia}`} />
                <SidebarField label="TASA INTERÉS" value={prestamo.tasa_interes ? `${prestamo.tasa_interes}%` : "—"} />
                <SidebarField label="CUOTA" value={$$(prestamo.cuota_calculada)} />
                <SidebarField label="REDONDEADA" value={prestamo.cuota_redondeada ? $$(prestamo.cuota_redondeada) : "—"} />
                <SidebarField label="MORA" value={prestamo.tipo_mora ? `${prestamo.tipo_mora} — ${prestamo.valor_mora}${prestamo.tipo_mora === "porcentaje" ? "%" : ""}` : "—"} />
                <SidebarField label="GASTOS LEG." value={$$(prestamo.gastos_legales)} />
              </div>
            </div>

            <div className="border-t border-[hsl(220,14%,91%)]" />

            {/* Estado del Préstamo */}
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Estado del Préstamo</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <SidebarField label="ESTADO" value={
                  <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-[12px] font-medium", estadoBadge[estado])}>{estado}</span>
                } />
                {cuotasVencidas > 0 && (
                  <SidebarField label="DÍAS MORA" value={<span className="text-destructive font-bold text-[14px]">{diasMora}</span>} />
                )}
                {proximaCuota && (
                  <SidebarField full label="PRÓXIMA CUOTA" value={`#${proximaCuota.num_cuota} — ${fmtDate(proximaCuota.fecha_vencimiento)} — ${$$(proximaCuota.capital_interes)}`} />
                )}
                {ultimoPago && (
                  <SidebarField full label="ÚLTIMO PAGO" value={`${fmtDate(ultimoPago.created_at)} — ${$$(Number(ultimoPago.monto_recibido))}`} />
                )}
                {prestamo.notas && (
                  <SidebarField full label="NOTAS" value={<span className="italic text-muted-foreground">{prestamo.notas}</span>} />
                )}
                {(prestamo as any).reestructurado_de && (
                  <SidebarField full label="REESTRUCTURADO DE" value={
                    <Link to={`/prestamos/${(prestamo as any).reestructurado_de}`} className="text-primary hover:underline text-[12px]">
                      PRE-{((prestamo as any).reestructurado_de as string).slice(0, 8)}
                    </Link>
                  } />
                )}
                {(prestamo as any).cancelado_en && (
                  <SidebarField full label="CANCELADO/REEST." value={
                    <span className="text-destructive text-[12px]">
                      {fmtDateTime((prestamo as any).cancelado_en)}
                      {(prestamo as any).motivo_cancelacion && <><br /><span className="italic text-muted-foreground">{(prestamo as any).motivo_cancelacion}</span></>}
                    </span>
                  } />
                )}
              </div>
            </div>

            <div className="border-t border-[hsl(220,14%,91%)]" />

            {/* Cobro Automático Stripe */}
            <StripeAutoChargeToggle
              prestamoId={prestamo.id}
              enabled={(prestamo as any).cobro_automatico_stripe ?? false}
              disabled={estado === "Liquidado" || estado === "Cancelado" || estado === "Reestructurado"}
              onToggled={() => queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", id] })}
              empresaId={empresaId}
            />
          </div>
        );

        return (
          <Tabs value={tab} onValueChange={setTab}>
            {/* Mobile tab bar */}
            <div className="lg:hidden border-b border-border px-3 bg-card">
              <div className="overflow-x-auto -mx-1">
                <TabsList className="bg-transparent h-auto p-0 gap-0 inline-flex min-w-max">
                  {[{ value: "amortizacion", label: "Cuotas" }, { value: "pagos", label: "Pagos" }, { value: "resumen", label: "Resumen" }, { value: "promesas", label: "Promesas" }, { value: "actividad", label: "Actividad" }].map((t) => (
                    <TabsTrigger key={t.value} value={t.value} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-[12px] font-medium text-muted-foreground data-[state=active]:text-foreground whitespace-nowrap">{t.label}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row min-h-[400px] lg:min-h-[600px]">
              {/* Desktop sidebar */}
              <div className="hidden lg:block lg:w-[28%] bg-[hsl(210,20%,98%)] dark:bg-card border-r border-[hsl(220,14%,91%)] p-5">
                {sidebarContent}
              </div>

              {/* Content area */}
              <div className="w-full lg:w-[72%] bg-card">
                {/* Desktop tab bar */}
                <div className="hidden lg:block border-b border-border px-5">
                  <TabsList className="bg-transparent h-auto p-0 gap-0 inline-flex">
                    {[{ value: "amortizacion", label: "Amortización" }, { value: "pagos", label: "Pagos" }, { value: "promesas", label: "Promesas" }, { value: "actividad", label: "Actividad" }].map((t) => (
                      <TabsTrigger key={t.value} value={t.value} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-[13px] font-medium text-muted-foreground data-[state=active]:text-foreground whitespace-nowrap">{t.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {/* Mobile: Resumen tab */}
                <TabsContent value="resumen" className="lg:hidden m-0 p-4 bg-[hsl(210,20%,98%)] dark:bg-card">
                  {sidebarContent}
                </TabsContent>

                {/* ── TAB: Amortización ──────────────────────────── */}
                <TabsContent value="amortizacion" className="m-0">
                  {/* Filter tabs + toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-b border-[hsl(220,14%,96%)]">
                    <div className="flex gap-1 overflow-x-auto">
                      {([
                        { key: "todas", label: "Todas", count: amort.length },
                        { key: "Pagada", label: "Pagadas", count: amort.filter(c => c.status === "Pagada").length },
                        { key: "Pendiente", label: "Pendientes", count: amort.filter(c => c.status === "Pendiente" || c.status === "Parcial" || c.status === "Prometida").length },
                        { key: "Vencida", label: "Vencidas", count: amort.filter(c => c.status === "Vencida").length },
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
                        {(() => {
                          const filtered = amortFilter === "todas" ? amort
                            : amortFilter === "Pendiente" ? amort.filter(c => c.status === "Pendiente" || c.status === "Parcial" || c.status === "Prometida")
                            : amort.filter(c => c.status === amortFilter);
                          if (filtered.length === 0) return (
                            <TableRow><TableCell colSpan={defaultCols.length + (showOptional ? optionalCols.length : 0) + 1} className="text-center py-8 text-muted-foreground text-[13px]">Sin cuotas en este filtro</TableCell></TableRow>
                          );
                          return filtered.map((c) => {
                          const status = c.status || "Pendiente";
                          const isNext = proximaCuota?.num_cuota === c.num_cuota;
                          const isParcial = status === "Parcial";
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
                                  <TableCell className="px-3 text-[12px]">{fmtDate(pg.created_at)}</TableCell>
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
                                      <div className="flex items-center gap-0.5">
                                        {!isCancelado && (
                                          <button
                                            title="Editar pago"
                                            onClick={() => {
                                              setEditPagoData({
                                                id: pg.id,
                                                prestamo_id: pg.prestamo_id,
                                                cuota_id: pg.cuota_id,
                                                monto_recibido: Number(pg.monto_recibido),
                                                aplicado_mora: Number(pg.aplicado_mora || 0),
                                                aplicado_interes: Number(pg.aplicado_interes || 0),
                                                aplicado_capital: Number(pg.aplicado_capital || 0),
                                                metodo_pago: pg.metodo_pago || "Efectivo",
                                                caja_id: pg.caja_id,
                                                cobrador_id: (pg as any).cobrador_id,
                                                fecha_pago: (pg as any).fecha_pago,
                                              });
                                              setEditPagoOpen(true);
                                            }}
                                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                        <button
                                          title="Ver comprobante"
                                          onClick={() => {
                                            setDocPreview({ open: true, type: "pagos" });
                                          }}
                                          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          title="Enviar comprobante por WhatsApp"
                                          onClick={async () => {
                                            try {
                                              const doc = await generarReciboPagos(pdfPrestamo, [pdfPagos[i]]);
                                              const pdfBlob = doc.output("blob");
                                              const telefono = cliente?.telefono;
                                              if (!telefono) { toast.error("Cliente sin teléfono"); return; }
                                              const fileName = `recibo-pago-${i + 1}-${Date.now()}.pdf`;
                                              const { error: upErr } = await supabase.storage.from("empresa-assets").upload(`temp/${fileName}`, pdfBlob, { contentType: "application/pdf" });
                                              if (upErr) throw upErr;
                                              const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(`temp/${fileName}`);
                                              await supabase.functions.invoke("whatsapp-sender", {
                                                body: { action: "send-file", phone: telefono, url: urlData.publicUrl, message: `📄 Comprobante de pago #${i + 1} por ${$$(Number(pg.monto_recibido))}`, empresa_id: empresaId },
                                              });
                                              toast.success("Comprobante enviado por WhatsApp");
                                              setTimeout(() => supabase.storage.from("empresa-assets").remove([`temp/${fileName}`]), 30000);
                                            } catch (err: any) {
                                              toast.error("Error al enviar: " + (err.message || err));
                                            }
                                          }}
                                          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-[hsl(142,72%,37%)] hover:bg-[hsl(142,72%,37%)]/10 transition-colors"
                                        >
                                          <Send className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          title="Descargar comprobante"
                                          onClick={async () => {
                                            try {
                                              const doc = await generarReciboPagos(pdfPrestamo, [pdfPagos[i]]);
                                              doc.save(`recibo-pago-${i + 1}-${shortId}.pdf`);
                                            } catch (err: any) {
                                              toast.error("Error al descargar: " + (err.message || err));
                                            }
                                          }}
                                          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                        </button>
                                        {!isCancelado && (
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
                                      </div>
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
                    <Button variant="outline" size="sm" className="h-7 text-[12px]" disabled={isCancelado}><Plus className="h-3 w-3 mr-1" />Nueva Promesa</Button>
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
                            <TableCell className="px-3 text-[12px]">{fmtDate(pr.fecha_prometida)}</TableCell>
                            <TableCell className="px-3 text-[13px] font-medium">{$$(Number(pr.monto_prometido))}</TableCell>
                            <TableCell className="px-3 text-[12px] text-muted-foreground max-w-[200px] truncate">{pr.notas || "—"}</TableCell>
                            <TableCell className="px-3">
                              <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border", promesaStatusStyle[pr.status || "Pendiente"] || promesaStatusStyle.Pendiente)}>
                                {pr.status || "Pendiente"}
                              </span>
                            </TableCell>
                            <TableCell className="px-3 text-[12px] text-muted-foreground">{fmtDate(pr.created_at)}</TableCell>
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
                                {a.usuario} · {fmtDateTime(a.fecha)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        );
      })()}

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
          fechaVencimiento={fmtDate(selectedCuota.fecha_vencimiento)}
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

      {/* Editar Pago Modal */}
      <EditPagoModal
        open={editPagoOpen}
        onOpenChange={setEditPagoOpen}
        pago={editPagoData}
        cajas={cajasAll.map((c) => ({ id: c.id, nombre: c.nombre }))}
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
          codigo_interno: (prestamo as any).codigo_interno || null,
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
          empresaId={empresaId}
          clientePhone={cliente?.telefono || ""}
        />
      )}
    </div>
  );
}

// ── Sidebar field component ───────────────────────────────────────
function SidebarField({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-1.5", full && "col-span-2")}>
      <p className="text-[11px] uppercase tracking-wider text-foreground font-semibold whitespace-nowrap">{label}</p>
      <p className="text-[12px] text-muted-foreground">{value}</p>
    </div>
  );
}
