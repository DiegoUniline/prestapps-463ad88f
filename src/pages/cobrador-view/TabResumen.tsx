import { format } from "date-fns";
import { es } from "date-fns/locale";
import { $$ } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, AlertTriangle, TrendingUp, CalendarCheck, Navigation } from "lucide-react";
import type { PendienteGrupo, CobranzaKpis } from "./types";
import type { ResumenSemanal, PerfilCobrador } from "./hooks";
import { KPICard } from "./cards";

interface TabResumenProps {
  perfil: PerfilCobrador | undefined;
  pendientesGrupos: PendienteGrupo[];
  kpis: CobranzaKpis;
  setHoy: () => void;
  setActiveTab: (tab: string) => void;
  resumenSemanal: ResumenSemanal | undefined;
  loadingResumen: boolean;
}

export function TabResumen({
  perfil, pendientesGrupos, kpis, setHoy, setActiveTab, resumenSemanal, loadingResumen,
}: TabResumenProps) {
  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-[#111217] p-5 text-white shadow-[0_26px_55px_-34px_rgba(15,23,42,.8)] sm:hidden">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
            {new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 19 ? "Buenas tardes" : "Buenas noches"}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            {perfil?.profile?.nombre_completo?.split(" ")[0] || "Tu cobranza"}
          </h2>
          <p className="mt-1 text-xs text-white/55">Todo lo que necesitas para completar tu día.</p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/45">Pendientes</p>
              <p className="mt-1 text-xl font-bold">{pendientesGrupos.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/45">Cobrado</p>
              <p className="mt-1 truncate text-sm font-bold text-emerald-400">{$$(kpis.cobrado)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/45">En mano</p>
              <p className="mt-1 truncate text-sm font-bold">{$$(Number(perfil?.profile?.efectivo_en_mano || 0))}</p>
            </div>
          </div>

          <Button
            className="mt-4 h-12 w-full rounded-xl bg-primary text-primary-foreground shadow-[0_12px_28px_-14px_rgba(240,20,77,.9)]"
            onClick={() => { setHoy(); setActiveTab("ruta"); }}
          >
            <Navigation className="mr-2 h-4 w-4" />Iniciar mi ruta
          </Button>
        </div>
      </section>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
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

      <div className="grid grid-cols-2 gap-2">
        <KPICard label="Pendientes" value={kpis.pendientes.toString()} sub={$$(kpis.porCobrar)} icon={Clock} color="text-warning" />
        <KPICard label="Cobradas" value={kpis.cobradas.toString()} sub={$$(kpis.cobrado)} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
        <KPICard label="Mora" value={$$(kpis.mora)} icon={AlertTriangle} color="text-destructive" />
        <KPICard label="Eficiencia" value={`${kpis.pct.toFixed(0)}%`} icon={TrendingUp} color="text-primary" />
      </div>
    </>
  );
}
