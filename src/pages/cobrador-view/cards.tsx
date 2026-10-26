import type { ComponentType } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$, fmtDateTime } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, Clock, AlertTriangle, HandCoins, Eye, Phone, MapPin, Receipt,
  MessageSquare, CalendarCheck, FileText, Send, ChevronDown, ChevronUp, Loader2,
  Navigation,
} from "lucide-react";
import type { CuotaCobrador, PagoHistorial } from "./types";
import type { ResumenSemanal } from "./hooks";

// ── Status helpers ──────────────────────────────────────────────
function getStatusInfo(item: CuotaCobrador) {
  if (item.pagada) return { label: "Cobrada", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 };
  if (item.status === "Parcial") return { label: "Parcial", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Clock };
  if (item.diasAtraso > 0) return { label: `Vencida ${item.diasAtraso}d`, color: "bg-red-500/15 text-red-700 dark:text-red-400", icon: AlertTriangle };
  return { label: "Pendiente", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400", icon: Clock };
}



export function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
          <Icon className={cn("h-3.5 w-3.5", color)} />
        </div>
        <p className={cn("kpi-num text-lg font-bold leading-tight", color)}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function CuotaCard({
  item, onCobrar, onNavigate, onVisita, onPromesa, showDate,
  expanded, onToggleExpand, onHistorial, onDrawer, onResend, resending,
}: {
  item: CuotaCobrador;
  onCobrar: (item: CuotaCobrador) => void;
  onNavigate: (path: string) => void;
  onVisita?: (item: CuotaCobrador) => void;
  onPromesa?: (item: CuotaCobrador) => void;
  showDate?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onHistorial?: (item: CuotaCobrador) => void;
  onDrawer?: (item: CuotaCobrador) => void;
  onResend?: (item: CuotaCobrador) => void;
  resending?: boolean;
}) {
  const status = getStatusInfo(item);
  const isOverdue = item.diasAtraso > 0 && !item.pagada;

  return (
    <Card className={cn(
      "border-border/50 transition-colors",
      item.pagada && "opacity-70",
      isOverdue && "border-destructive/30 bg-destructive/5",
    )}>
      <CardContent className="p-3">
        {/* Row 1: Client + Status */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <button
              className="font-semibold text-sm truncate hover:text-primary hover:underline text-left block w-full"
              onClick={() => onNavigate(`/clientes/${item.clienteId}`)}
            >
              {item.clienteNombre}
            </button>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground">
                Cuota <span className="font-medium">#{item.numCuota}</span>/{item.totalCuotas}
              </span>
              <span className="text-[11px] text-muted-foreground">• {item.ruta}</span>
              {showDate && (
                <span className="text-[11px] text-muted-foreground">
                  • {format(parseISO(item.fechaVencimiento), "dd/MM")}
                </span>
              )}
            </div>
          </div>
          <Badge className={cn("text-[10px] shrink-0 h-5", status.color)}>
            {status.label}
          </Badge>
        </div>

        {/* Row 2: Amounts */}
        <div className="grid grid-cols-3 gap-2 text-center bg-secondary/50 rounded-md p-2 mb-2">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Cuota</p>
            <p className="text-xs font-semibold">{$$(item.capitalInteres)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mora</p>
            <p className={cn("text-xs font-semibold", item.saldoMora > 0 ? "text-destructive" : "text-muted-foreground")}>
              {item.saldoMora > 0 ? $$(item.saldoMora) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-xs font-bold">{$$(item.saldoTotal)}</p>
          </div>
        </div>

        {/* Row 3: Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {!item.pagada ? (
            <>
              <Button
                size="sm"
                className="h-8 text-[11px] font-medium min-w-0 flex-1"
                onClick={() => onCobrar(item)}
              >
                <HandCoins className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span className="truncate">Cobrar {$$(item.saldoTotal)}</span>
              </Button>
              <div className="flex items-center gap-1 shrink-0">
                {item.clienteTelefono && (
                  <>
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => window.open(`tel:${item.clienteTelefono}`, "_blank")}>
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-green-600"
                      onClick={() => window.open(`https://wa.me/${item.clienteTelefono?.replace(/\D/g, "")}`, "_blank")}>
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {onVisita && (
                  <Button variant="outline" size="icon" className="h-8 w-8" title="Registrar visita"
                    onClick={() => onVisita(item)}>
                    <MapPin className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onPromesa && item.status !== "Prometida" && (
                  <Button variant="outline" size="icon" className="h-8 w-8" title="Promesa de pago"
                    onClick={() => onPromesa(item)}>
                    <CalendarCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="outline" size="icon" className="h-8 w-8" title="Ver préstamo"
                  onClick={() => onDrawer ? onDrawer(item) : onNavigate(`/prestamos/${item.prestamoId}`)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {onToggleExpand && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Más"
                    onClick={onToggleExpand}>
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Cobrado {$$(item.montoPagado || item.capitalInteres)}
              </span>
              <div className="flex items-center gap-1">
                {onResend && (
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={resending}
                    onClick={() => onResend(item)} title="Reenviar último ticket">
                    {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    Reenviar
                  </Button>
                )}
                {onHistorial && (
                  <Button variant="outline" size="sm" className="h-7 text-[11px]"
                    onClick={() => onHistorial(item)}>
                    <Receipt className="h-3 w-3 mr-1" /> Pagos
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => onDrawer ? onDrawer(item) : onNavigate(`/prestamos/${item.prestamoId}`)}>
                  <Eye className="h-3 w-3 mr-1" /> Ver
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Expanded actions panel */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {onDrawer && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => onDrawer(item)}>
                <FileText className="h-3 w-3 mr-1" /> Préstamo
              </Button>
            )}
            {onHistorial && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => onHistorial(item)}>
                <Receipt className="h-3 w-3 mr-1" /> Pagos
              </Button>
            )}
            {onResend && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]" disabled={resending}
                onClick={() => onResend(item)}>
                {resending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                Reenviar ticket
              </Button>
            )}
            {item.clienteDireccion && (
              <Button variant="outline" size="sm" className="h-8 text-[11px]"
                onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.clienteDireccion!)}`, "_blank")}>
                <MapPin className="h-3 w-3 mr-1" /> Mapa
              </Button>
            )}
          </div>
        )}

        {/* Client address if available */}
        {item.clienteDireccion && !item.pagada && (
          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border/50">
            <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-tight">{item.clienteDireccion}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PagoCard({ pago, onNavigate }: { pago: PagoHistorial; onNavigate: (path: string) => void }) {
  return (
    <Card className={cn("border-border/50", pago.anulado && "opacity-50")}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{pago.clienteNombre}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {pago.numCuota && <span className="text-[11px] text-muted-foreground">Cuota #{pago.numCuota}</span>}
              <span className="text-[11px] text-muted-foreground">{pago.metodoPago}</span>
              <span className="text-[11px] text-muted-foreground">
                {fmtDateTime(pago.fechaPago)}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={cn("text-sm font-bold", pago.anulado ? "text-muted-foreground line-through" : "text-emerald-600 dark:text-emerald-400")}>
              {$$(pago.montoRecibido)}
            </p>
            {pago.anulado && <Badge variant="destructive" className="text-[9px] mt-0.5">Anulado</Badge>}
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/30 text-center">
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Capital</p>
            <p className="text-[11px] font-medium">{$$(pago.aplicadoCapital)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Interés</p>
            <p className="text-[11px] font-medium">{$$(pago.aplicadoInteres)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Mora</p>
            <p className="text-[11px] font-medium">{$$(pago.aplicadoMora)}</p>
          </div>
        </div>

        <button
          className="text-[11px] text-primary hover:underline mt-2 block"
          onClick={() => onNavigate(`/prestamos/${pago.prestamoId}`)}
        >
          Ver préstamo →
        </button>
      </CardContent>
    </Card>
  );
}

export function EmptyCard({ icon: Icon, title, subtitle }: { icon: ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-8 text-center">
        <Icon className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export function LoadingCards() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ── Prestamo Group Card ─────────────────────────────────────────
// Shows one card per loan with the TOTAL outstanding (saldo + mora).
// Click "Cobrar" → opens PagoModal preloaded with the full grouped amount.
// The waterfall (Mora → Interés → Capital) settles cuotas oldest-first automatically.
export function PrestamoGroupCard({
  grupo, expanded, onToggleExpand, onCobrar, onNavigate, onDrawer, onHistorial, onVisita, onPromesa,
}: {
  grupo: {
    prestamoId: string; clienteNombre: string; clienteId: string;
    clienteTelefono: string | null; clienteDireccion: string | null;
    ruta: string; cuotas: CuotaCobrador[]; saldoTotal: number; saldoMora: number;
    diasAtrasoMax: number; proximaCuota: number; totalCuotas: number;
  };
  expanded: boolean;
  onToggleExpand: () => void;
  onCobrar: () => void;
  onNavigate: (path: string) => void;
  onDrawer: () => void;
  onHistorial: () => void;
  onVisita: () => void;
  onPromesa: () => void;
}) {
  const isOverdue = grupo.diasAtrasoMax > 0;
  return (
    <Card className={cn(
      "relative overflow-hidden rounded-2xl border-border/70 bg-card shadow-[0_18px_38px_-34px_rgba(15,23,42,.5)] transition-all",
      isOverdue && "border-destructive/20",
    )}>
      {isOverdue && <span className="absolute inset-y-0 left-0 w-1 bg-destructive" />}
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button
              className="block w-full truncate text-left text-[15px] font-bold leading-tight tracking-tight hover:text-primary"
              onClick={() => onNavigate(`/clientes/${grupo.clienteId}`)}
            >
              {grupo.clienteNombre}
            </button>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{grupo.ruta} · {grupo.cuotas.length} cuotas pendientes</p>
          </div>
          <Badge className={cn(
            "h-6 shrink-0 rounded-full px-2.5 text-[10px] font-bold",
            isOverdue ? "bg-destructive/10 text-destructive hover:bg-destructive/10" : "bg-warning/10 text-warning hover:bg-warning/10",
          )}>
            {isOverdue ? `${grupo.diasAtrasoMax} días tarde` : "Pendiente"}
          </Badge>
        </div>

        <div className="flex items-end justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total por cobrar</p>
            <p className="kpi-num mt-0.5 text-xl font-bold tracking-tight">{$$(grupo.saldoTotal)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Cuota próxima #{grupo.proximaCuota}/{grupo.totalCuotas}</p>
            {grupo.saldoMora > 0 && <p className="mt-0.5 text-[11px] font-semibold text-destructive">Mora {$$(grupo.saldoMora)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2">
          <Button
            className="h-11 min-w-0 rounded-xl text-xs font-semibold shadow-[0_10px_24px_-15px_rgba(240,20,77,.8)]"
            onClick={onCobrar}
          >
            <HandCoins className="mr-1.5 h-4 w-4 shrink-0" />
            <span className="truncate">Registrar pago</span>
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl" disabled={!grupo.clienteTelefono}
            onClick={() => grupo.clienteTelefono && window.open(`tel:${grupo.clienteTelefono}`, "_blank")} aria-label="Llamar al cliente">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-success" disabled={!grupo.clienteTelefono}
            onClick={() => grupo.clienteTelefono && window.open(`https://wa.me/${grupo.clienteTelefono.replace(/\D/g, "")}`, "_blank")} aria-label="Enviar WhatsApp">
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-primary" disabled={!grupo.clienteDireccion}
            onClick={() => grupo.clienteDireccion && window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(grupo.clienteDireccion)}`, "_blank")} aria-label="Abrir navegación">
            <Navigation className="h-4 w-4" />
          </Button>
        </div>

        <button onClick={onToggleExpand} className="flex w-full items-center justify-center gap-1.5 border-t border-border/50 pt-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
          {expanded ? "Ocultar detalles" : `Ver detalles y ${grupo.cuotas.length} cuotas`}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {/* Expanded: list of pending cuotas + extra actions */}
        {expanded && (
          <div className="space-y-3 border-t border-border/50 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="h-9 rounded-lg text-[11px]" onClick={onDrawer}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Préstamo
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg text-[11px]" onClick={onHistorial}>
                <Receipt className="mr-1.5 h-3.5 w-3.5" /> Historial
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg text-[11px]" onClick={onVisita}>
                <MapPin className="mr-1.5 h-3.5 w-3.5" /> Registrar visita
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg text-[11px]" onClick={onPromesa}>
                <CalendarCheck className="mr-1.5 h-3.5 w-3.5" /> Crear promesa
              </Button>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Cuotas pendientes
            </p>
            <div className="space-y-1.5">
              {grupo.cuotas.map((c) => (
                <div key={c.cuotaId} className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs",
                  c.diasAtraso > 0 ? "bg-destructive/[0.06]" : "bg-muted/45",
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium shrink-0">#{c.numCuota}/{c.totalCuotas}</span>
                    <span className="text-muted-foreground text-[11px] shrink-0">
                      {format(parseISO(c.fechaVencimiento), "dd/MM")}
                    </span>
                    {c.diasAtraso > 0 && (
                      <span className="text-destructive text-[10px] shrink-0">+{c.diasAtraso}d</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.saldoMora > 0 && (
                      <span className="text-destructive text-[10px]">M: {$$(c.saldoMora)}</span>
                    )}
                    <span className="font-semibold">{$$(c.saldoTotal)}</span>
                  </div>
                </div>
              ))}
            </div>
            {grupo.clienteDireccion && (
              <div className="flex items-start gap-1.5 border-t border-border/50 pt-3">
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-tight">{grupo.clienteDireccion}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ResumenSemanalCard({ resumenSemanal, loadingResumen, className }: {
  resumenSemanal: ResumenSemanal | undefined;
  loadingResumen: boolean;
  className: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Resumen Semanal</span>
          </div>
          {resumenSemanal && (
            <span className="text-[10px] text-muted-foreground">
              {format(resumenSemanal.start, "dd/MM", { locale: es })} — {format(resumenSemanal.end, "dd/MM", { locale: es })}
            </span>
          )}
        </div>

        {loadingResumen ? (
          <Skeleton className="h-16 w-full" />
        ) : resumenSemanal ? (
          <>
            <div className="flex items-end justify-between gap-4">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Cobrado</span>
                  <span className="font-bold text-primary">{$$(resumenSemanal.cobrado)}</span>
                </div>
                <Progress value={resumenSemanal.pct} className="h-3" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Meta semanal</span>
                  <span className="font-semibold">{$$(resumenSemanal.total)}</span>
                </div>
              </div>
              <div className="text-center shrink-0">
                <span className="text-3xl" role="img" aria-label="estado">
                  {resumenSemanal.pct >= 100 ? "🎉" : resumenSemanal.pct >= 70 ? "😊" : resumenSemanal.pct >= 40 ? "😐" : "😟"}
                </span>
                <p className="text-[10px] font-bold text-primary mt-0.5">{resumenSemanal.pct.toFixed(0)}%</p>
              </div>
            </div>
            {resumenSemanal.porCobrar > 0 && (
              <p className="text-xs text-muted-foreground">
                Falta por cobrar: <span className="font-semibold text-foreground">{$$(resumenSemanal.porCobrar)}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">Sin datos para esta semana</p>
        )}
      </CardContent>
    </Card>
  );
}
