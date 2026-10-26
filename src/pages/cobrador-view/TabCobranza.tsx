import { $$ } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle2, Clock, X } from "lucide-react";
import type { CuotaCobrador, PendienteGrupo, CobranzaKpis } from "./types";
import { CuotaCard, EmptyCard, LoadingCards, PrestamoGroupCard } from "./cards";

interface TabCobranzaProps {
  kpis: CobranzaKpis;
  pendientesGrupos: PendienteGrupo[];
  search: string;
  setSearch: (value: string) => void;
  loadingCuotas: boolean;
  filtered: CuotaCobrador[];
  cobranzaSubTab: "por-cobrar" | "cobradas";
  setCobranzaSubTab: (value: "por-cobrar" | "cobradas") => void;
  collectedStopsCount: number;
  grupoExpanded: Set<string>;
  toggleGrupo: (prestamoId: string) => void;
  openPagoGrupo: (g: PendienteGrupo) => void;
  navigate: (path: string) => void;
  setDrawerPrestamoId: (id: string) => void;
  setDrawerOpen: (open: boolean) => void;
  setHistorialPrestamoId: (id: string) => void;
  setHistorialNombre: (nombre: string) => void;
  setHistorialOpen: (open: boolean) => void;
  setVisitaItem: (item: CuotaCobrador) => void;
  setVisitaOpen: (open: boolean) => void;
  setPromesaItem: (item: CuotaCobrador) => void;
  setPromesaOpen: (open: boolean) => void;
  cobradas: CuotaCobrador[];
  expanded: Set<string>;
  toggleExpand: (cuotaId: string) => void;
  openPago: (item: CuotaCobrador) => void;
  openHistorial: (item: CuotaCobrador) => void;
  openDrawer: (item: CuotaCobrador) => void;
  handleResend: (item: CuotaCobrador) => void;
  resending: string | null;
}

export function TabCobranza({
  kpis, pendientesGrupos, search, setSearch, loadingCuotas, filtered, cobranzaSubTab,
  setCobranzaSubTab, collectedStopsCount, grupoExpanded, toggleGrupo, openPagoGrupo, navigate,
  setDrawerPrestamoId, setDrawerOpen, setHistorialPrestamoId, setHistorialNombre,
  setHistorialOpen, setVisitaItem, setVisitaOpen, setPromesaItem, setPromesaOpen, cobradas,
  expanded, toggleExpand, openPago, openHistorial, openDrawer, handleResend, resending,
}: TabCobranzaProps) {
  return (
    <>
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,.45)] sm:hidden">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Cobranza del periodo</p>
            <p className="kpi-num mt-1 text-2xl font-bold tracking-tight">{$$(kpis.porCobrar)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pendientesGrupos.length} clientes pendientes</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Recuperado</p>
            <p className="text-sm font-bold text-success">{$$(kpis.cobrado)}</p>
            <p className="mt-1 text-[10px] font-semibold text-destructive">{$$(kpis.mora)} en mora</p>
          </div>
        </div>
      </section>
      <div className="relative sm:hidden">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 rounded-xl border-border/70 bg-card pl-9 pr-9 shadow-sm"
        />
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
      {loadingCuotas ? (
        <LoadingCards />
      ) : filtered.length === 0 ? (
        <EmptyCard icon={CheckCircle2} title="Sin cuotas en este rango" subtitle="No hay cuotas asignadas para este periodo." />
      ) : (
        <Tabs value={cobranzaSubTab} onValueChange={(v) => setCobranzaSubTab(v as "por-cobrar" | "cobradas")} className="w-full">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted/70 p-1">
            <TabsTrigger value="por-cobrar" className="gap-1 rounded-lg text-xs data-[state=active]:shadow-sm">
              <Clock className="h-3 w-3" />
              Por cobrar
              {pendientesGrupos.length > 0 && (
                <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 text-[9px] px-1">{pendientesGrupos.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cobradas" className="gap-1 rounded-lg text-xs data-[state=active]:shadow-sm">
              <CheckCircle2 className="h-3 w-3" />
              Cobradas
              {collectedStopsCount > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 text-[9px] px-1">{collectedStopsCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="por-cobrar" className="mt-3 space-y-3">
            {pendientesGrupos.length === 0 ? (
              <EmptyCard icon={CheckCircle2} title="¡Todo cobrado!" subtitle="No tienes cuotas pendientes en este rango." />
            ) : pendientesGrupos.map((g) => (
              <PrestamoGroupCard
                key={g.prestamoId}
                grupo={g}
                expanded={grupoExpanded.has(g.prestamoId)}
                onToggleExpand={() => toggleGrupo(g.prestamoId)}
                onCobrar={() => openPagoGrupo(g)}
                onNavigate={navigate}
                onDrawer={() => { setDrawerPrestamoId(g.prestamoId); setDrawerOpen(true); }}
                onHistorial={() => { setHistorialPrestamoId(g.prestamoId); setHistorialNombre(g.clienteNombre); setHistorialOpen(true); }}
                onVisita={() => { setVisitaItem(g.cuotas[0]); setVisitaOpen(true); }}
                onPromesa={() => { setPromesaItem(g.cuotas[0]); setPromesaOpen(true); }}
              />
            ))}
          </TabsContent>

          <TabsContent value="cobradas" className="mt-3 space-y-2">
            {cobradas.length === 0 ? (
              <EmptyCard icon={Clock} title="Aún no cobras nada" subtitle="Las cuotas que cobres aparecerán aquí." />
            ) : cobradas.map((item) => (
              <CuotaCard
                key={item.cuotaId}
                item={item}
                expanded={expanded.has(item.cuotaId)}
                onToggleExpand={() => toggleExpand(item.cuotaId)}
                onCobrar={openPago}
                onNavigate={navigate}
                onVisita={(i) => { setVisitaItem(i); setVisitaOpen(true); }}
                onPromesa={(i) => { setPromesaItem(i); setPromesaOpen(true); }}
                onHistorial={openHistorial}
                onDrawer={openDrawer}
                onResend={handleResend}
              resending={resending === item.prestamoId}
            />
          ))}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
