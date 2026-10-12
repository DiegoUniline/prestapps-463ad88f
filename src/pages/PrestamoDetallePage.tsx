import { useState } from "react";
import { LiquidarModal } from "@/components/LiquidarModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import { PagoModal } from "@/components/PagoModal";
import { PromesaModal } from "@/components/PromesaModal";
import { ReasignarModal } from "@/components/ReasignarModal";
import { AnularPagoModal } from "@/components/AnularPagoModal";
import { EditPagoModal } from "@/components/EditPagoModal";
import { CancelarPrestamoModal } from "@/components/CancelarPrestamoModal";
import { ReestructurarModal } from "@/components/ReestructurarModal";
import { EditPrestamoModal } from "@/components/EditPrestamoModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { $$, fmtDate, errorMessage } from "@/lib/utils";
import type { ComponentProps } from "react";
import { usePrestamoDetalle, useAmortizacion, usePagos, usePromesas, useCajas } from "@/hooks/usePrestamoDetalle";
import { useRutasOptions } from "@/hooks/usePrestamos";
import { generarEstadoCuenta, generarContrato, generarReciboPagos } from "@/lib/pdfDocuments";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { WhatsAppPreviewModal } from "@/components/WhatsAppPreviewModal";
import { sendReceiptAsImage } from "@/lib/whatsappReceipt";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { cuotaVisualStatus, type Actividad, type CuotaAmort, type PagoRow } from "@/pages/prestamo-detalle/utils";
import { KpiCards } from "@/pages/prestamo-detalle/ui";
import { buildActividad, buildPdfData } from "@/pages/prestamo-detalle/documentos";
import { PrestamoHeader } from "@/pages/prestamo-detalle/PrestamoHeader";
import { PrestamoSidebar } from "@/pages/prestamo-detalle/PrestamoSidebar";
import { TabAmortizacion } from "@/pages/prestamo-detalle/TabAmortizacion";
import { TabPagos } from "@/pages/prestamo-detalle/TabPagos";
import { TabPromesas } from "@/pages/prestamo-detalle/TabPromesas";
import { TabActividad } from "@/pages/prestamo-detalle/TabActividad";

// Campos que usePagos no selecciona (llegan undefined en runtime) pero el recibo consulta de forma opcional.
type PagoRecibo = PagoRow;

export default function PrestamoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("amortizacion");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [promesaOpen, setPromesaOpen] = useState(false);
  const [selectedCuota, setSelectedCuota] = useState<CuotaAmort | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [amortFilter, setAmortFilter] = useState<"todas" | "Pagada" | "Pendiente" | "Vencida">("todas");
  const [reasignarOpen, setReasignarOpen] = useState(false);
  const [anularPagoOpen, setAnularPagoOpen] = useState(false);
  const [selectedPago, setSelectedPago] = useState<ComponentProps<typeof AnularPagoModal>["pago"]>(null);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [reestructurarOpen, setReestructurarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [liquidarOpen, setLiquidarOpen] = useState(false);
  const [docPreview, setDocPreview] = useState<{ open: boolean; type: "estado" | "contrato" | "pagos" | null }>({ open: false, type: null });
  const [editPagoOpen, setEditPagoOpen] = useState(false);
  const [editPagoData, setEditPagoData] = useState<ComponentProps<typeof EditPagoModal>["pago"]>(null);
  const [fotoLightbox, setFotoLightbox] = useState(false);
  const [waPreview, setWaPreview] = useState<{ open: boolean; pg: PagoRow; idx: number } | null>(null);
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const { role } = useCurrentUserRole();
  const isNew = !id || id === "nuevo";

  const { data: prestamo, isLoading: loadingPrestamo } = usePrestamoDetalle(isNew ? undefined : id);
  const { data: amort = [] } = useAmortizacion(isNew ? undefined : id);
  const { data: pagosRaw = [] } = usePagos(isNew ? undefined : id);
  const { data: promesasRaw = [] } = usePromesas(isNew ? undefined : id);
  const { data: cajasAll = [] } = useCajas();
  const { data: rutasAll = [] } = useRutasOptions();
  const { empresaId: empresaActualId } = useEmpresa();
  const { data: cobradoresAll = [] } = useQuery({
    queryKey: ["cobradores-all", empresaActualId],
    enabled: !!empresaActualId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .eq("empresa_id", empresaActualId)
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
      const { data } = await supabase.from("empresas").select("nombre, logo_url, telefono, direccion").eq("id", empresaId).single();
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

  const cliente = prestamo.clientes;
  const caja = prestamo.cajas;
  const ruta = prestamo.rutas;

  // KPI calculations
  const totalPagado = amort.reduce((s, c) => s + Number(c.capital_pagado || 0) + Number(c.interes_pagado || 0) + Number(c.mora_pagada || 0), 0);
  const saldoPendiente = amort.reduce((s, c) => s + Number(c.saldo_total || 0), 0);
  const cuotasVencidas = amort.filter((c) => cuotaVisualStatus(c) === "Vencida").length;
  const cuotasPagadas = amort.filter((c) => cuotaVisualStatus(c) === "Pagada").length;
  const saldoMoroso = amort.reduce((s, c) => s + Number(c.saldo_mora || 0), 0);
  const proximaCuota = amort.find((c) => cuotaVisualStatus(c) === "Parcial") || amort.find((c) => cuotaVisualStatus(c) === "Vencida") || amort.find((c) => { const vs = cuotaVisualStatus(c); return vs === "Pendiente" || vs === "Prometida"; });
  const ultimoPago = pagosRaw.length > 0 ? pagosRaw[pagosRaw.length - 1] : null;
  const diasMora = amort.filter(c => cuotaVisualStatus(c) === "Vencida").reduce((max, c) => Math.max(max, c.dias_atraso || 0), 0);

  // Saldo atrasado: sum of saldo_total + saldo_mora for overdue cuotas
  const cuotasAtrasadas = amort.filter(c => cuotaVisualStatus(c) === "Vencida");
  const saldoAtrasadoCuotas = cuotasAtrasadas.reduce((s, c) => s + Number(c.saldo_total || 0), 0);
  const moraAtrasada = cuotasAtrasadas.reduce((s, c) => s + Number(c.saldo_mora || 0), 0);
  const saldoAtrasadoTotal = saldoAtrasadoCuotas + moraAtrasada;

  // Cobro de hoy = total para ponerse al corriente (todas las cuotas vencidas + mora + cuota actual si no es vencida)
  const cobroHoy = saldoAtrasadoCuotas + moraAtrasada + (proximaCuota && cuotaVisualStatus(proximaCuota) !== "Vencida" ? Number(proximaCuota.saldo_total || 0) : 0);

  const estado = (prestamo.estado || "Activo") as string;
  const isCancelado = estado === "Cancelado" || estado === "Reestructurado";
  const folioId = prestamo.id_prestamo || `PRE-${(prestamo.id?.slice(0, 8) || id)}`;
  const shortId = folioId;

  const kpis = [
    { label: "Cobro de Hoy", value: $$(cobroHoy), color: cobroHoy > 0 ? "text-primary" : "text-foreground", sub: cobroHoy > 0 ? `Saldo ${$$(saldoAtrasadoCuotas)} + Mora ${$$(moraAtrasada)}` : "Al corriente" },
    { label: "Avance", value: `${cuotasPagadas}/${prestamo.num_cuotas}`, color: "text-foreground", sub: "cuotas pagadas" },
    { label: "Total Pagado", value: $$(totalPagado), color: "text-[hsl(142,72%,37%)]" },
    { label: "Saldo Pendiente", value: $$(saldoPendiente), color: "text-[hsl(217,91%,60%)]" },
    { label: "Cuotas Vencidas", value: String(cuotasVencidas), color: cuotasVencidas > 0 ? "text-destructive" : "text-foreground" },
    { label: "Saldo Moroso", value: $$(saldoMoroso), color: saldoMoroso > 0 ? "text-destructive" : "text-foreground" },
    { label: "Saldo Atrasado", value: $$(saldoAtrasadoTotal), color: saldoAtrasadoTotal > 0 ? "text-destructive" : "text-foreground", sub: saldoAtrasadoTotal > 0 ? `Saldo ${$$(saldoAtrasadoCuotas)} + Mora ${$$(moraAtrasada)}` : "Sin atraso" },
  ];

  // Pagos totals (exclude annulled)
  const validPagos = pagosRaw.filter((pg) => !pg.anulado);
  const totalPagosMonto = validPagos.reduce((s, pg) => s + Number(pg.monto_recibido || 0), 0);
  const totalPagosMora = validPagos.reduce((s, pg) => s + Number(pg.aplicado_mora || 0), 0);
  const totalPagosInteres = validPagos.reduce((s, pg) => s + Number(pg.aplicado_interes || 0), 0);
  const totalPagosCapital = validPagos.reduce((s, pg) => s + Number(pg.aplicado_capital || 0), 0);

  // Activity timeline
  const actividad = buildActividad({ prestamo, pagosRaw, promesasRaw, cobradoresAll });

  // PDF data builder
  const { pdfPrestamo, pdfCuotas, pdfPagos } = buildPdfData({ prestamo, cliente, caja, ruta, estado, empresaData, amort, pagosRaw });

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

  const buildReceiptCaption = (pg: PagoRow, i: number) => {
    const cuotaMatch = amort.find(c => c.id === pg.cuota_id);
    return `✅ *Comprobante de pago recibido*\n\n👤 *${cliente?.nombre_completo}*\n💰 Monto: *${$$(Number(pg.monto_recibido))}*\n📋 Préstamo: ${folioId}\n📅 Cuota ${cuotaMatch?.num_cuota || (i + 1)} de ${prestamo.num_cuotas}\n\n🙏 ¡Gracias por tu pago! Tu compromiso es muy importante para nosotros.`;
  };

  const handleSendReceiptWA = (pg: PagoRow, i: number) => {
    const telefono = cliente?.telefono;
    if (!telefono) { toast.error("Cliente sin teléfono"); return; }
    setWaPreview({ open: true, pg, idx: i });
  };

  const doSendReceiptWA = async (pg: PagoRecibo, i: number, caption: string) => {
    const telefono = cliente?.telefono;
    if (!telefono) return;
    const cuotaMatch = amort.find(c => c.id === pg.cuota_id);

    // Calculate saldo restante at time of this payment by summing remaining cuotas' current saldo
    // and for the specific cuota that was paid, use current saldo (already reduced)
    const saldoRestanteActual = amort.reduce((s, c) => s + Number(c.saldo_total || 0), 0);

    // Find next unpaid cuota
    const nextUnpaid = amort.find(c => cuotaVisualStatus(c) !== "Pagada");

    const result = await sendReceiptAsImage(
      empresaId,
      telefono,
      {
        pago: {
          folio: prestamo?.id_prestamo || `PRE-${pg.id.slice(0, 8)}`,
          monto_recibido: Number(pg.monto_recibido),
          aplicado_mora: Number(pg.aplicado_mora || 0),
          aplicado_interes: Number(pg.aplicado_interes || 0),
          aplicado_capital: Number(pg.aplicado_capital || 0),
          metodo_pago: pg.metodo_pago || "Efectivo",
          saldo_restante: saldoRestanteActual,
          cuota_num: cuotaMatch?.num_cuota || (i + 1),
          proxima_cuota: nextUnpaid ? fmtDate(nextUnpaid.fecha_vencimiento) : undefined,
          monto_proxima: nextUnpaid ? Number(nextUnpaid.saldo_total || 0) : undefined,
          fecha: pg.fecha_pago ? fmtDate(pg.fecha_pago) : undefined,
          cobrador_nombre: pg.cobrador_nombre || undefined,
        },
        empresa: {
          nombre: empresaData?.nombre || "Empresa",
          telefono: empresaData?.telefono || undefined,
          direccion: empresaData?.direccion || undefined,
          logo_url: empresaData?.logo_url || null,
        },
        cliente: { nombre: cliente?.nombre_completo || "Cliente", telefono: cliente?.telefono || undefined },
        prestamo: { folio: folioId, num_cuotas: prestamo.num_cuotas },
      },
      caption,
    );
    if (result.success) {
      toast.success("Recibo enviado por WhatsApp");
    } else {
      toast.error("Error: " + (result.error || "desconocido"));
    }
  };

  return (
    <div>
      {/* ── HEADER ────────────────────────────────────────────── */}
      <PrestamoHeader
        prestamo={prestamo}
        cliente={cliente}
        estado={estado}
        folioId={folioId}
        fotoLightbox={fotoLightbox}
        setFotoLightbox={setFotoLightbox}
        handlePdf={handlePdf}
        id={id}
        isCancelado={isCancelado}
        proximaCuota={proximaCuota}
        role={role}
        saldoPendiente={saldoPendiente}
        setCancelarOpen={setCancelarOpen}
        setEditarOpen={setEditarOpen}
        setEliminarOpen={setEliminarOpen}
        setLiquidarOpen={setLiquidarOpen}
        setPagoOpen={setPagoOpen}
        setReasignarOpen={setReasignarOpen}
        setReestructurarOpen={setReestructurarOpen}
        setSelectedCuota={setSelectedCuota}
      />

      {/* ── KPI CARDS ─────────────────────────────────────────── */}
      <KpiCards kpis={kpis} />

      {/* ── BODY ── */}
      {(() => {
        const sidebarContent = (
          <PrestamoSidebar
            prestamo={prestamo}
            cliente={cliente}
            caja={caja}
            ruta={ruta}
            cobradoresAll={cobradoresAll}
            cuotasVencidas={cuotasVencidas}
            diasMora={diasMora}
            empresaId={empresaId}
            estado={estado}
            id={id}
            isCancelado={isCancelado}
            proximaCuota={proximaCuota}
            setReasignarOpen={setReasignarOpen}
            ultimoPago={ultimoPago}
          />
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
                  <TabAmortizacion
                    amort={amort}
                    amortFilter={amortFilter}
                    setAmortFilter={setAmortFilter}
                    isCancelado={isCancelado}
                    proximaCuota={proximaCuota}
                    setHoveredRow={setHoveredRow}
                    setPagoOpen={setPagoOpen}
                    setPromesaOpen={setPromesaOpen}
                    setSelectedCuota={setSelectedCuota}
                    showOptional={showOptional}
                    setShowOptional={setShowOptional}
                  />
                </TabsContent>

                {/* ── TAB: Pagos ─────────────────────────────────── */}
                <TabsContent value="pagos" className="m-0">
                  <TabPagos
                    pagosRaw={pagosRaw}
                    isCancelado={isCancelado}
                    handleSendReceiptWA={handleSendReceiptWA}
                    pdfPrestamo={pdfPrestamo}
                    pdfPagos={pdfPagos}
                    shortId={shortId}
                    setDocPreview={setDocPreview}
                    setEditPagoData={setEditPagoData}
                    setEditPagoOpen={setEditPagoOpen}
                    setSelectedPago={setSelectedPago}
                    setAnularPagoOpen={setAnularPagoOpen}
                    totalPagosMonto={totalPagosMonto}
                    totalPagosMora={totalPagosMora}
                    totalPagosInteres={totalPagosInteres}
                    totalPagosCapital={totalPagosCapital}
                  />
                </TabsContent>

                {/* ── TAB: Promesas ───────────────────────────────── */}
                <TabsContent value="promesas" className="m-0">
                  <TabPromesas promesasRaw={promesasRaw} isCancelado={isCancelado} />
                </TabsContent>

                {/* ── TAB: Actividad ──────────────────────────────── */}
                <TabsContent value="actividad" className="m-0 p-5">
                  <TabActividad actividad={actividad} />
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
        montoInicial={selectedCuota ? Number(selectedCuota.saldo_total || 0) : cobroHoy > 0 ? cobroHoy : (() => {
          const primera = amort.find((c) => c.status !== "Pagada");
          return primera ? Number(primera.saldo_total || 0) : undefined;
        })()}
      />

      {/* Liquidar Modal */}
      <LiquidarModal
        open={liquidarOpen}
        onOpenChange={setLiquidarOpen}
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
        }))}
        cajas={cajasAll.map((c) => ({ id: c.id, nombre: c.nombre }))}
        rutaId={prestamo.ruta_id}
        cobradorId={prestamo.cobrador_id}
      />


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
        cajaId={prestamo.caja_id}
        montoDesembolso={Number(prestamo.monto_solicitado || 0)}
        empresaId={empresaId}
        folioId={prestamo.id_prestamo}
      />

      {/* Eliminar Préstamo (hard delete) */}
      <ConfirmDialog
        open={eliminarOpen}
        onOpenChange={setEliminarOpen}
        title={`¿Eliminar préstamo ${prestamo.id_prestamo}?`}
        description="Esta acción es IRREVERSIBLE. Se borrarán pagos, amortización, promesas, movimientos de caja, gestiones CRM y el préstamo. Los saldos de caja y el efectivo en mano de los cobradores se ajustarán automáticamente."
        confirmLabel="Sí, eliminar todo"
        variant="destructive"
        loading={eliminando}
        onConfirm={async () => {
          setEliminando(true);
          try {
            const { data, error } = await supabase.functions.invoke("delete-prestamo", {
              body: { prestamoId: prestamo.id },
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || "Error al eliminar");
            toast.success(data.message || "Préstamo eliminado");
            setEliminarOpen(false);
            queryClient.invalidateQueries();
            navigate("/prestamos");
          } catch (e) {
            toast.error(errorMessage(e) || "No se pudo eliminar");
          } finally {
            setEliminando(false);
          }
        }}
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
          id_prestamo: prestamo.id_prestamo,
          monto_solicitado: Number(prestamo.monto_solicitado || 0),
          tasa_interes: prestamo.tasa_interes ? Number(prestamo.tasa_interes) : null,
          tipo_mora: prestamo.tipo_mora,
          valor_mora: prestamo.valor_mora ? Number(prestamo.valor_mora) : null,
          gastos_legales: prestamo.gastos_legales ? Number(prestamo.gastos_legales) : null,
          caja_id: prestamo.caja_id,
          ruta_id: prestamo.ruta_id,
          cobrador_id: prestamo.cobrador_id,
          notas: prestamo.notas || null,
          codigo_interno: prestamo.codigo_interno || null,
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
          clienteName={cliente?.nombre_completo}
          onWhatsApp={docPreview.type === "pagos" ? async (phone: string) => {
            for (let i = 0; i < pagosRaw.length; i++) {
              const pg = pagosRaw[i];
              await doSendReceiptWA(pg, i, buildReceiptCaption(pg, i));
            }
          } : undefined}
        />
      )}

      {/* WhatsApp Preview Modal */}
      {waPreview && (
        <WhatsAppPreviewModal
          open={waPreview.open}
          onOpenChange={(open) => { if (!open) setWaPreview(null); }}
          phone={cliente?.telefono || ""}
          message={buildReceiptCaption(waPreview.pg, waPreview.idx)}
          onSend={async (msg) => { await doSendReceiptWA(waPreview.pg, waPreview.idx, msg); }}
          clienteName={cliente?.nombre_completo}
        />
      )}
    </div>
  );
}
