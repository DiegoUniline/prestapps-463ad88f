import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { StripeChargeButton } from "@/components/StripeChargeButton";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Pencil, HandCoins, FileText, Receipt, FileSignature, MapPin, Phone,
  Route, Ban, RefreshCw, XCircle, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PhotoLightbox } from "@/components/shared/PhotoLightbox";
import type { AppRole } from "@/hooks/useCurrentUserRole";
import { estadoBadge, type PrestamoDetalle, type CuotaAmort, type DocType } from "./utils";

interface PrestamoHeaderProps {
  prestamo: PrestamoDetalle;
  cliente: PrestamoDetalle["clientes"];
  estado: string;
  folioId: string;
  fotoLightbox: boolean;
  setFotoLightbox: (open: boolean) => void;
  handlePdf: (type: DocType) => void;
  id: string | undefined;
  isCancelado: boolean;
  proximaCuota: CuotaAmort | undefined;
  role: AppRole;
  saldoPendiente: number;
  setCancelarOpen: (open: boolean) => void;
  setEditarOpen: (open: boolean) => void;
  setEliminarOpen: (open: boolean) => void;
  setLiquidarOpen: (open: boolean) => void;
  setPagoOpen: (open: boolean) => void;
  setReasignarOpen: (open: boolean) => void;
  setReestructurarOpen: (open: boolean) => void;
  setSelectedCuota: (cuota: CuotaAmort | null) => void;
}

export function PrestamoHeader({
  prestamo, cliente, estado, folioId, fotoLightbox, setFotoLightbox, handlePdf, id, isCancelado,
  proximaCuota, role, saldoPendiente, setCancelarOpen, setEditarOpen, setEliminarOpen,
  setLiquidarOpen, setPagoOpen, setReasignarOpen, setReestructurarOpen, setSelectedCuota,
}: PrestamoHeaderProps) {
  const queryClient = useQueryClient();
  return (
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
        <Button size="sm" variant="outline" className="h-8 text-[12px] md:text-[13px]" onClick={() => setLiquidarOpen(true)} disabled={isCancelado || estado === "Liquidado"}>
          <Zap className="h-3.5 w-3.5 mr-1" />Liquidar
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
            {role === "admin" && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setEliminarOpen(true)}
              >
                <XCircle className="h-3.5 w-3.5 mr-2" />Eliminar préstamo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
