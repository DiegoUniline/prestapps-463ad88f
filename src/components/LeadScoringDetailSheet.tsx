import { $$ } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, TrendingUp, TrendingDown,
  Shield, Ban, UserPlus, ArrowUpCircle, ExternalLink, Timer, CalendarClock,
  Banknote, BarChart3, CircleDot
} from "lucide-react";

interface ClienteScore {
  cliente_id: string;
  id_cliente: string;
  nombre_completo: string;
  score: number;
  nivel: "Excelente" | "Bueno" | "Regular" | "Riesgoso" | "Crítico" | "Nuevo";
  recomendacion: string;
  icono: "prestar" | "aumentar" | "avales" | "no_prestar" | "vencimiento";
  totalPrestamos: number;
  prestamosLiquidados: number;
  cuotasATiempo: number;
  cuotasTotales: number;
  cuotasPagadasTarde: number;
  cuotasVencidas: number;
  saldoActual: number;
  diasAtrasoPromedio: number;
  maxDiasAtraso: number;
  montoHistorico: number;
  diasGracia: number;
}

interface Props {
  cliente: ClienteScore | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const nivelEmoji: Record<string, string> = {
  Excelente: "🏆",
  Bueno: "✅",
  Regular: "⚠️",
  Riesgoso: "🔶",
  Crítico: "🚨",
  Nuevo: "🆕",
};

const nivelColor: Record<string, string> = {
  Excelente: "text-emerald-600 dark:text-emerald-400",
  Bueno: "text-blue-600 dark:text-blue-400",
  Regular: "text-amber-600 dark:text-amber-400",
  Riesgoso: "text-orange-600 dark:text-orange-400",
  Crítico: "text-red-600 dark:text-red-400",
  Nuevo: "text-muted-foreground",
};

const scoreColor = (score: number) =>
  score >= 85 ? "text-emerald-600 dark:text-emerald-400" :
  score >= 70 ? "text-blue-600 dark:text-blue-400" :
  score >= 50 ? "text-amber-600 dark:text-amber-400" :
  score >= 30 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400";

const progressColor = (score: number) =>
  score >= 85 ? "[&>div]:bg-emerald-500" :
  score >= 70 ? "[&>div]:bg-blue-500" :
  score >= 50 ? "[&>div]:bg-amber-500" :
  score >= 30 ? "[&>div]:bg-orange-500" : "[&>div]:bg-red-500";

// Factor evaluation component
function ScoreFactor({
  icon: Icon,
  label,
  value,
  maxPoints,
  earned,
  description,
  sentiment,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  maxPoints: number;
  earned: number;
  description: string;
  sentiment: "positive" | "negative" | "neutral" | "warning";
}) {
  const sentimentStyles = {
    positive: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
      icon: "text-emerald-600 dark:text-emerald-400",
      badge: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    },
    negative: {
      bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      icon: "text-red-600 dark:text-red-400",
      badge: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
    },
    warning: {
      bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
      icon: "text-amber-600 dark:text-amber-400",
      badge: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
    },
    neutral: {
      bg: "bg-muted/50 border-border",
      icon: "text-muted-foreground",
      badge: "bg-muted text-muted-foreground",
    },
  };

  const s = sentimentStyles[sentiment];

  return (
    <div className={`rounded-lg border p-3 ${s.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${s.icon}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold">{label}</span>
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${s.badge}`}>
                {earned > 0 ? "+" : ""}{earned} pts
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
          </div>
        </div>
        <span className="text-[13px] font-bold tabular-nums shrink-0">{value}</span>
      </div>
    </div>
  );
}

export default function LeadScoringDetailSheet({ cliente: s, open, onOpenChange }: Props) {
  const navigate = useNavigate();

  if (!s) return null;

  // Recalculate factor points for display
  const puntualidad = s.cuotasTotales > 0 ? Math.round((s.cuotasATiempo / s.cuotasTotales) * 40) : 0;
  const pagadasTardePoints = s.cuotasTotales > 0 ? Math.round((s.cuotasPagadasTarde / s.cuotasTotales) * 15) : 0;
  const liquidadosPoints = s.totalPrestamos > 0 ? Math.round((s.prestamosLiquidados / s.totalPrestamos) * 20) : 0;

  let trackRecord = 0;
  if (s.totalPrestamos >= 2) trackRecord += 3;
  if (s.totalPrestamos >= 4) trackRecord += 3;
  if (s.montoHistorico >= 5000) trackRecord += 2;
  if (s.montoHistorico >= 15000) trackRecord += 2;

  const penCuotas = -Math.min(30, s.cuotasVencidas * 4);
  const diasReales = Math.max(0, s.maxDiasAtraso - s.diasGracia);
  let penAntigüedad = 0;
  if (diasReales > 0) {
    if (diasReales <= 7) penAntigüedad = -(diasReales * 0.5);
    else if (diasReales <= 30) penAntigüedad = -(3.5 + (diasReales - 7) * 0.5);
    else if (diasReales <= 90) penAntigüedad = -(15 + (diasReales - 30) * 0.3);
    else penAntigüedad = -Math.min(25, 15 + 18 + (diasReales - 90) * 0.1);
  }
  penAntigüedad = Math.round(penAntigüedad);

  const avgReal = Math.max(0, s.diasAtrasoPromedio - s.diasGracia);
  const penAtraso = -Math.round(Math.min(15, avgReal * 0.4));

  const totalPositivo = puntualidad + pagadasTardePoints + liquidadosPoints + trackRecord;
  const totalNegativo = penCuotas + penAntigüedad + penAtraso;

  const ratioATiempo = s.cuotasTotales > 0 ? Math.round((s.cuotasATiempo / s.cuotasTotales) * 100) : 0;
  const ratioPagadasTarde = s.cuotasTotales > 0 ? Math.round((s.cuotasPagadasTarde / s.cuotasTotales) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted text-2xl">
              {nivelEmoji[s.nivel]}
            </div>
            <div>
              <SheetTitle className="text-lg">{s.nombre_completo}</SheetTitle>
              <p className="text-[12px] text-muted-foreground font-mono">{s.id_cliente}</p>
            </div>
          </div>
        </SheetHeader>

        {/* Big score display */}
        <div className="text-center py-4">
          <div className={`text-5xl font-black tabular-nums ${s.score >= 0 ? scoreColor(s.score) : "text-muted-foreground"}`}>
            {s.score >= 0 ? s.score : "—"}
          </div>
          <div className="text-[13px] font-semibold mt-1">
            <span className={nivelColor[s.nivel]}>{s.nivel}</span>
            <span className="text-muted-foreground"> / 100 puntos</span>
          </div>
          {s.score >= 0 && (
            <Progress value={s.score} className={`mt-3 h-3 ${progressColor(s.score)}`} />
          )}
        </div>

        {/* Recommendation */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4">
          <p className="text-[13px] font-medium leading-relaxed">{s.recomendacion}</p>
        </div>

        {/* Score summary */}
        <div className="flex items-center justify-between text-[12px] mb-3 px-1">
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            ✓ Ganados: +{totalPositivo} pts
          </span>
          <span className="text-red-600 dark:text-red-400 font-semibold">
            ✗ Penalizaciones: {totalNegativo} pts
          </span>
        </div>

        <Separator className="mb-4" />

        {/* Factor breakdown */}
        <div className="space-y-2.5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-1">Factores positivos</p>

          <ScoreFactor
            icon={CheckCircle2}
            label="Puntualidad de pagos"
            value={`${ratioATiempo}%`}
            maxPoints={40}
            earned={puntualidad}
            description={
              s.cuotasTotales > 0
                ? `${s.cuotasATiempo} de ${s.cuotasTotales} cuotas pagadas dentro del plazo${s.diasGracia > 0 ? ` (+${s.diasGracia} días de gracia)` : ""}. Este es el factor más importante.`
                : "Sin cuotas registradas aún."
            }
            sentiment={ratioATiempo >= 80 ? "positive" : ratioATiempo >= 50 ? "warning" : "negative"}
          />

          <ScoreFactor
            icon={Clock}
            label="Pagó tarde pero pagó"
            value={`${ratioPagadasTarde}%`}
            maxPoints={15}
            earned={pagadasTardePoints}
            description={
              s.cuotasPagadasTarde > 0
                ? `${s.cuotasPagadasTarde} cuotas se pagaron después de la fecha de vencimiento. Se otorga crédito parcial porque sí cumplió, aunque tarde.`
                : "Ninguna cuota pagada con retraso — eso es bueno."
            }
            sentiment={s.cuotasPagadasTarde === 0 ? "positive" : "warning"}
          />

          <ScoreFactor
            icon={Shield}
            label="Préstamos liquidados"
            value={`${s.prestamosLiquidados}/${s.totalPrestamos}`}
            maxPoints={20}
            earned={liquidadosPoints}
            description={
              s.prestamosLiquidados > 0
                ? `Ha completado ${s.prestamosLiquidados} préstamo${s.prestamosLiquidados > 1 ? "s" : ""} exitosamente. Demuestra capacidad y voluntad de pago.`
                : "Aún no ha liquidado ningún préstamo. Completar uno mejora significativamente el score."
            }
            sentiment={s.prestamosLiquidados > 0 ? "positive" : "neutral"}
          />

          <ScoreFactor
            icon={BarChart3}
            label="Historial crediticio"
            value={$$(s.montoHistorico)}
            maxPoints={10}
            earned={trackRecord}
            description={
              s.totalPrestamos >= 2
                ? `${s.totalPrestamos} préstamos totales por ${$$(s.montoHistorico)}. Un historial más largo da mayor confiabilidad al score.`
                : "Historial corto. Con más préstamos completados, el score será más confiable."
            }
            sentiment={trackRecord >= 6 ? "positive" : trackRecord >= 3 ? "warning" : "neutral"}
          />

          <Separator className="my-3" />
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-1">Penalizaciones</p>

          <ScoreFactor
            icon={XCircle}
            label="Cuotas vencidas actuales"
            value={`${s.cuotasVencidas}`}
            maxPoints={-30}
            earned={penCuotas}
            description={
              s.cuotasVencidas === 0
                ? "Sin cuotas vencidas actualmente. ¡Excelente!"
                : `Tiene ${s.cuotasVencidas} cuota${s.cuotasVencidas > 1 ? "s" : ""} sin pagar pasada${s.cuotasVencidas > 1 ? "s" : ""} de fecha. Cada cuota vencida resta 4 puntos.`
            }
            sentiment={s.cuotasVencidas === 0 ? "positive" : s.cuotasVencidas <= 2 ? "warning" : "negative"}
          />

          <ScoreFactor
            icon={CalendarClock}
            label="Antigüedad de deuda"
            value={diasReales > 0 ? `${diasReales} días` : "0 días"}
            maxPoints={-25}
            earned={penAntigüedad}
            description={
              diasReales === 0
                ? `Sin deuda vencida más allá del período de gracia${s.diasGracia > 0 ? ` (${s.diasGracia} días)` : ""}.`
                : diasReales <= 7
                  ? `Atraso leve de ${diasReales} días. Penalización mínima. Aún está a tiempo de regularizarse.`
                  : diasReales <= 30
                    ? `Atraso moderado de ${diasReales} días. La penalización escala. Requiere atención.`
                    : diasReales <= 90
                      ? `Atraso severo de ${diasReales} días (${Math.round(diasReales / 30)} meses). Impacto fuerte en el score.`
                      : `Atraso crítico de ${diasReales} días (${Math.round(diasReales / 30)} meses). Deuda prolongada sin resolver.`
            }
            sentiment={diasReales === 0 ? "positive" : diasReales <= 7 ? "warning" : "negative"}
          />

          <ScoreFactor
            icon={Timer}
            label="Atraso promedio"
            value={avgReal > 0 ? `${s.diasAtrasoPromedio} días` : "0 días"}
            maxPoints={-15}
            earned={penAtraso}
            description={
              avgReal === 0
                ? "El promedio de atraso está dentro del período de gracia o no hay atrasos."
                : `En promedio, las cuotas vencidas tienen ${s.diasAtrasoPromedio} días de atraso. Indica un patrón ${avgReal > 15 ? "crónico" : "ocasional"} de impago.`
            }
            sentiment={avgReal === 0 ? "positive" : avgReal <= 7 ? "warning" : "negative"}
          />
        </div>

        <Separator className="my-4" />

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-lg border border-border p-2.5 text-center">
            <Banknote className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[11px] text-muted-foreground">Saldo actual</p>
            <p className="text-[15px] font-bold">{$$(s.saldoActual)}</p>
          </div>
          <div className="rounded-lg border border-border p-2.5 text-center">
            <CircleDot className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[11px] text-muted-foreground">Días de gracia</p>
            <p className="text-[15px] font-bold">{s.diasGracia}</p>
          </div>
        </div>

        {/* Go to client */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            onOpenChange(false);
            navigate(`/clientes/${s.cliente_id}`);
          }}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Ver ficha completa del cliente
        </Button>
      </SheetContent>
    </Sheet>
  );
}
