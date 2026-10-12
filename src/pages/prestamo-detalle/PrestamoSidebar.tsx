import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Route } from "lucide-react";
import { cn, $$, fmtDate, fmtDateTime } from "@/lib/utils";
import { estadoBadge, dashStr, type PrestamoDetalle, type CuotaAmort, type PagoRow } from "./utils";
import { SidebarField } from "./ui";
import { StripeAutoChargeToggle } from "./StripeAutoChargeToggle";

interface PrestamoSidebarProps {
  prestamo: PrestamoDetalle;
  cliente: PrestamoDetalle["clientes"];
  caja: PrestamoDetalle["cajas"];
  ruta: PrestamoDetalle["rutas"];
  cobradoresAll: { id: string; nombre: string }[];
  cuotasVencidas: number;
  diasMora: number;
  empresaId: string;
  estado: string;
  id: string | undefined;
  isCancelado: boolean;
  proximaCuota: CuotaAmort | undefined;
  setReasignarOpen: (open: boolean) => void;
  ultimoPago: PagoRow | null;
}

export function PrestamoSidebar({
  prestamo, cliente, caja, ruta, cobradoresAll, cuotasVencidas, diasMora, empresaId, estado, id,
  isCancelado, proximaCuota, setReasignarOpen, ultimoPago,
}: PrestamoSidebarProps) {
  const queryClient = useQueryClient();
  return (
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
}
