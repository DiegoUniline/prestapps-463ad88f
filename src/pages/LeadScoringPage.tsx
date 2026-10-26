import { $$ } from "@/lib/utils";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc } from "@/lib/supabaseQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginacion, PAGE_SIZE } from "@/hooks/usePaginacion";
import { PaginacionControles } from "@/components/PaginacionControles";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Star, Ban, UserPlus, ArrowUpCircle } from "lucide-react";
import { useState } from "react";
import LeadScoringDetailSheet from "@/components/LeadScoringDetailSheet";

// ── Scoring algorithm ──────────────────────────────────────────
interface ClienteScore {
  cliente_id: string;
  id_cliente: string;
  nombre_completo: string;
  score: number; // 0–100
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

// ── Data hook ──────────────────────────────────────────────────
// El score (puerto exacto de calcularScore) se calcula en SQL: rpc lead_scoring_listado
// devuelve solo la página visible + total filtrado + resumen por nivel de todos los clientes activos.
interface LeadResumen { avg: number; excelentes: number; buenos: number; regulares: number; riesgosos: number; criticos: number; nuevos: number; }
interface LeadPagina { total: number; resumen: LeadResumen | null; rows: ClienteScore[]; }

function toLocalISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function useLeadScoring(empresaId: string, search: string, nivel: string, page: number) {
  return useQuery({
    queryKey: ["lead-scoring", empresaId, search, nivel, page],
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await rpc<LeadPagina>("lead_scoring_listado", {
        p_search: search || null,
        p_nivel: nivel === "todos" ? null : nivel,
        p_hoy: toLocalISODate(new Date()),
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return {
        total: Number(data?.total || 0),
        resumen: data?.resumen || null,
        rows: (data?.rows || []).map((r) => ({
          ...r,
          saldoActual: Number(r.saldoActual || 0),
          montoHistorico: Number(r.montoHistorico || 0),
        })),
      } as LeadPagina;
    },
  });
}

// ── UI helpers ──────────────────────────────────────────────────
const nivelConfig: Record<string, { color: string; bg: string }> = {
  Excelente: { color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800" },
  Bueno: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800" },
  Regular: { color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800" },
  Riesgoso: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/40 border-orange-200 dark:border-orange-800" },
  Crítico: { color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800" },
  Nuevo: { color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800" },
};

function ScoreBar({ score }: { score: number }) {
  if (score < 0) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-2 rounded-full bg-muted" />
        <span className="text-xs font-medium text-muted-foreground w-8 text-right">N/A</span>
      </div>
    );
  }

  const color =
    score >= 85 ? "bg-emerald-500" :
    score >= 70 ? "bg-blue-500" :
    score >= 50 ? "bg-amber-500" :
    score >= 30 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right">{score}</span>
    </div>
  );
}

function IconoAccion({ tipo }: { tipo: ClienteScore["icono"] }) {
  switch (tipo) {
    case "aumentar": return <ArrowUpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    case "prestar": return <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    case "avales": return <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case "no_prestar": return <Ban className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "vencimiento": return <TrendingUp className="h-4 w-4 text-primary" />;
  }
}


// ── Page component ─────────────────────────────────────────────
export default function LeadScoringPage() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [selectedCliente, setSelectedCliente] = useState<ClienteScore | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = usePaginacion(`${empresaId}|${filtroNivel}|${debouncedSearch}`);
  const { data: pagina, isLoading, isFetching } = useLeadScoring(empresaId, debouncedSearch, filtroNivel, page);

  const filtered = pagina?.rows || [];
  const totals: LeadResumen = pagina?.resumen || { avg: 0, excelentes: 0, buenos: 0, regulares: 0, riesgosos: 0, criticos: 0, nuevos: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lead Scoring</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Evaluación crediticia automática de cada cliente</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score Promedio</p>
          <p className="kpi-num text-2xl font-bold mt-1">{totals.avg}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Excelentes</p>
          </div>
          <p className="kpi-num text-2xl font-bold mt-1">{totals.excelentes}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Buenos</p>
          </div>
          <p className="kpi-num text-2xl font-bold mt-1">{totals.buenos}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Regulares</p>
          </div>
          <p className="kpi-num text-2xl font-bold mt-1">{totals.regulares}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-orange-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Riesgosos</p>
          </div>
          <p className="kpi-num text-2xl font-bold mt-1">{totals.riesgosos}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Críticos</p>
          </div>
          <p className="kpi-num text-2xl font-bold mt-1">{totals.criticos}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-slate-400" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nuevos</p>
          </div>
          <p className="kpi-num text-2xl font-bold mt-1">{totals.nuevos}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroNivel} onValueChange={setFiltroNivel}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="Excelente">Excelente</SelectItem>
            <SelectItem value="Bueno">Bueno</SelectItem>
            <SelectItem value="Regular">Regular</SelectItem>
            <SelectItem value="Riesgoso">Riesgoso</SelectItem>
            <SelectItem value="Crítico">Crítico</SelectItem>
            <SelectItem value="Nuevo">Nuevo (sin historial)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header border-b">
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">ID</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cliente</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Score</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Nivel</TableHead>
                <TableHead className="text-center text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Préstamos</TableHead>
                <TableHead className="text-center text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">A Tiempo</TableHead>
                <TableHead className="text-center text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Vencidas</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Saldo</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5 min-w-[280px]">Recomendación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-[13px]">
                    No se encontraron clientes
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => {
                  const cfg = nivelConfig[s.nivel];
                  return (
                    <TableRow
                      key={s.cliente_id}
                      className="cursor-pointer border-b border-border/50 hover:bg-table-hover transition-colors"
                      onClick={() => setSelectedCliente(s)}
                    >
                      <TableCell className="font-mono text-[12px] px-3">{s.id_cliente}</TableCell>
                      <TableCell className="font-medium text-[13px] px-3">{s.nombre_completo}</TableCell>
                      <TableCell className="px-3"><ScoreBar score={s.score} /></TableCell>
                      <TableCell className="px-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
                          {s.nivel}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-[13px] px-3">
                        <span className="font-semibold">{s.prestamosLiquidados}</span>
                        <span className="text-muted-foreground">/{s.totalPrestamos}</span>
                      </TableCell>
                      <TableCell className="text-center text-[13px] px-3">
                        {s.cuotasTotales > 0 ? (
                          <span className="font-semibold">{Math.round((s.cuotasATiempo / s.cuotasTotales) * 100)}%</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center px-3">
                        {s.cuotasVencidas > 0 ? (
                          <Badge variant="destructive" className="text-[11px]">{s.cuotasVencidas}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-[13px]">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[13px] px-3">{$$(s.saldoActual)}</TableCell>
                      <TableCell className="px-3">
                        <div className="flex items-start gap-2">
                          <IconoAccion tipo={s.icono} />
                          <span className="text-[12px] leading-snug text-muted-foreground">{s.recomendacion}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {!isLoading && (
        <PaginacionControles page={page} pageSize={PAGE_SIZE} total={pagina?.total} onPageChange={setPage} isFetching={isFetching} />
      )}

      <LeadScoringDetailSheet
        cliente={selectedCliente}
        open={!!selectedCliente}
        onOpenChange={(open) => { if (!open) setSelectedCliente(null); }}
      />
      </div>
  );
}
