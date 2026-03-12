import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Star, Ban, UserPlus, ArrowUpCircle } from "lucide-react";
import { useState, useMemo } from "react";

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
  cuotasVencidas: number;
  saldoActual: number;
  diasAtrasoPromedio: number;
  montoHistorico: number;
}

function calcularScore(data: {
  totalPrestamos: number;
  prestamosLiquidados: number;
  cuotasATiempo: number;
  cuotasTotales: number;
  cuotasVencidas: number;
  diasAtrasoPromedio: number;
  saldoActual: number;
  montoHistorico: number;
}): { score: number; nivel: ClienteScore["nivel"]; recomendacion: string; icono: ClienteScore["icono"] } {
  // Sin préstamos = cliente nuevo, no evaluable
  if (data.totalPrestamos === 0) {
    return {
      score: -1,
      nivel: "Nuevo",
      recomendacion: "⚪ Sin historial crediticio. Cliente nuevo — evaluar capacidad de pago antes de otorgar primer préstamo.",
      icono: "avales",
    };
  }

  let score = 50; // Base

  // 1. Historial de pagos a tiempo (0-35 pts)
  if (data.cuotasTotales > 0) {
    const ratioATiempo = data.cuotasATiempo / data.cuotasTotales;
    score += ratioATiempo * 35;
  }

  // 2. Préstamos liquidados exitosamente (0-15 pts)
  if (data.totalPrestamos > 0) {
    const ratioLiquidados = data.prestamosLiquidados / data.totalPrestamos;
    score += ratioLiquidados * 15;
  }

  // 3. Penalización por cuotas vencidas activas (-20 pts max)
  score -= Math.min(20, data.cuotasVencidas * 5);

  // 4. Penalización por días de atraso promedio (-15 pts max)
  score -= Math.min(15, data.diasAtrasoPromedio * 0.5);

  // 5. Bonus por historial largo (+5 pts)
  if (data.totalPrestamos >= 3) score += 5;

  // 6. Bonus por monto histórico alto (+5 pts)
  if (data.montoHistorico >= 5000) score += 3;
  if (data.montoHistorico >= 10000) score += 2;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let nivel: ClienteScore["nivel"];
  let recomendacion: string;
  let icono: ClienteScore["icono"];

  if (score >= 85) {
    nivel = "Excelente";
    recomendacion = "🟢 Excelente pagador. Aumentar línea de crédito o prestar más. Cliente confiable para montos mayores.";
    icono = "aumentar";
  } else if (score >= 70) {
    nivel = "Bueno";
    recomendacion = "🔵 Buen historial. Se le puede prestar con confianza. Considerar aumentar monto gradualmente.";
    icono = "prestar";
  } else if (score >= 50) {
    nivel = "Regular";
    recomendacion = "🟡 Historial mixto. Prestar con precaución, mismo monto o menor. Solicitar un aval adicional.";
    icono = "avales";
  } else if (score >= 30) {
    nivel = "Riesgoso";
    recomendacion = "🟠 Alto riesgo. No aumentar monto. Exigir avales sólidos y garantías. Monitorear de cerca.";
    icono = "avales";
  } else {
    nivel = "Crítico";
    recomendacion = "🔴 No prestar. Cliente con historial muy negativo. Si tiene saldo pendiente, gestionar cobro prioritario.";
    icono = "no_prestar";
  }

  // Override: si tiene préstamo próximo a vencer y buen score
  if (score >= 60 && data.saldoActual > 0 && data.cuotasVencidas === 0) {
    recomendacion += " 📅 Próximo a liquidar — preparar oferta de renovación.";
    icono = "vencimiento";
  }

  return { score, nivel, recomendacion, icono };
}

// ── Data hook ──────────────────────────────────────────────────
function useLeadScoring(empresaId: string) {
  return useQuery({
    queryKey: ["lead-scoring", empresaId],
    queryFn: async () => {
      // 1. All active clients
      const { data: clientes } = await supabase
        .from("clientes")
        .select("id, id_cliente, nombre_completo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre_completo");

      if (!clientes?.length) return [];

      // 2. All loans for these clients
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select("id, cliente_id, estado, monto_solicitado")
        .eq("empresa_id", empresaId);

      // 3. All cuotas
      const prestamoIds = (prestamos || []).map((p) => p.id);
      let cuotas: any[] = [];
      if (prestamoIds.length > 0) {
        const { data } = await supabase
          .from("amortizacion")
          .select("prestamo_id, status, dias_atraso, saldo_total, fecha_vencimiento, fecha_pagada")
          .in("prestamo_id", prestamoIds);
        cuotas = data || [];
      }

      // Build maps
      const prestamosByCliente: Record<string, typeof prestamos> = {};
      for (const p of prestamos || []) {
        if (!prestamosByCliente[p.cliente_id]) prestamosByCliente[p.cliente_id] = [];
        prestamosByCliente[p.cliente_id].push(p);
      }

      const cuotasByPrestamo: Record<string, typeof cuotas> = {};
      for (const c of cuotas) {
        if (!cuotasByPrestamo[c.prestamo_id]) cuotasByPrestamo[c.prestamo_id] = [];
        cuotasByPrestamo[c.prestamo_id].push(c);
      }

      const results: ClienteScore[] = clientes.map((cli) => {
        const cliPrestamos = prestamosByCliente[cli.id] || [];
        const totalPrestamos = cliPrestamos.length;
        const prestamosLiquidados = cliPrestamos.filter((p) => p.estado === "Liquidado").length;
        const montoHistorico = cliPrestamos.reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);

        let cuotasATiempo = 0;
        let cuotasTotales = 0;
        let cuotasVencidas = 0;
        let saldoActual = 0;
        let totalDiasAtraso = 0;
        let cuotasConAtraso = 0;

        for (const p of cliPrestamos) {
          const pCuotas = cuotasByPrestamo[p.id] || [];
          for (const c of pCuotas) {
            cuotasTotales++;
            if (c.status === "Pagada") {
              // Check if paid on time
              if (!c.dias_atraso || c.dias_atraso <= 1) {
                cuotasATiempo++;
              }
            } else if (c.status === "Vencida") {
              cuotasVencidas++;
              saldoActual += Number(c.saldo_total || 0);
              totalDiasAtraso += Number(c.dias_atraso || 0);
              cuotasConAtraso++;
            } else {
              saldoActual += Number(c.saldo_total || 0);
              // Pending/Parcial that's not overdue = on time still
            }
          }
        }

        const diasAtrasoPromedio = cuotasConAtraso > 0 ? totalDiasAtraso / cuotasConAtraso : 0;

        const { score, nivel, recomendacion, icono } = calcularScore({
          totalPrestamos,
          prestamosLiquidados,
          cuotasATiempo,
          cuotasTotales,
          cuotasVencidas,
          diasAtrasoPromedio,
          saldoActual,
          montoHistorico,
        });

        return {
          cliente_id: cli.id,
          id_cliente: cli.id_cliente,
          nombre_completo: cli.nombre_completo,
          score,
          nivel,
          recomendacion,
          icono,
          totalPrestamos,
          prestamosLiquidados,
          cuotasATiempo,
          cuotasTotales,
          cuotasVencidas,
          saldoActual,
          diasAtrasoPromedio: Math.round(diasAtrasoPromedio),
          montoHistorico,
        };
      });

      // Sort by score descending
      return results.sort((a, b) => b.score - a.score);
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

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Page component ─────────────────────────────────────────────
export default function LeadScoringPage() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();
  const { data: scores, isLoading } = useLeadScoring(empresaId);
  const [search, setSearch] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("todos");

  const filtered = useMemo(() => {
    if (!scores) return [];
    return scores.filter((s) => {
      const matchSearch =
        s.nombre_completo.toLowerCase().includes(search.toLowerCase()) ||
        s.id_cliente.toLowerCase().includes(search.toLowerCase());
      const matchNivel = filtroNivel === "todos" || s.nivel === filtroNivel;
      return matchSearch && matchNivel;
    });
  }, [scores, search, filtroNivel]);

  // Summary stats
  const totals = useMemo(() => {
    if (!scores?.length) return { avg: 0, excelentes: 0, buenos: 0, regulares: 0, riesgosos: 0, criticos: 0 };
    const avg = Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length);
    return {
      avg,
      excelentes: scores.filter((s) => s.nivel === "Excelente").length,
      buenos: scores.filter((s) => s.nivel === "Bueno").length,
      regulares: scores.filter((s) => s.nivel === "Regular").length,
      riesgosos: scores.filter((s) => s.nivel === "Riesgoso").length,
      criticos: scores.filter((s) => s.nivel === "Crítico").length,
    };
  }, [scores]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lead Scoring</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Evaluación crediticia automática de cada cliente</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score Promedio</p>
          <p className="text-2xl font-bold mt-1">{totals.avg}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Excelentes</p>
          </div>
          <p className="text-2xl font-bold mt-1">{totals.excelentes}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Buenos</p>
          </div>
          <p className="text-2xl font-bold mt-1">{totals.buenos}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Regulares</p>
          </div>
          <p className="text-2xl font-bold mt-1">{totals.regulares}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-orange-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Riesgosos</p>
          </div>
          <p className="text-2xl font-bold mt-1">{totals.riesgosos}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Críticos</p>
          </div>
          <p className="text-2xl font-bold mt-1">{totals.criticos}</p>
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
                      onClick={() => navigate(`/clientes/${s.cliente_id}`)}
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
    </div>
  );
}
