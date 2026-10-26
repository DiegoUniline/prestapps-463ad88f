import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc } from "@/lib/supabaseQuery";
import { usePaginacion, PAGE_SIZE } from "@/hooks/usePaginacion";
import { PaginacionControles } from "@/components/PaginacionControles";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { cn, $$ } from "@/lib/utils";
import { RefreshCw, Star, TrendingUp, DollarSign, ChevronRight, CheckCircle2 } from "lucide-react";
import type { Enums } from "@/integrations/supabase/types";

/** Fila que arma `renovacion_candidatos` con jsonb_build_object. */
interface CandidatoRenovacion {
  id: string;
  monto_solicitado: number;
  monto_total_pagar: number | null;
  num_cuotas: number;
  frecuencia: Enums<"frecuencia_pago">;
  tasa_interes: number | null;
  modalidad: Enums<"prestamo_modalidad">;
  cliente_id: string;
  ruta_id: string | null;
  caja_id: string | null;
  cobrador_id: string | null;
  cliente: { id: string; nombre_completo: string; telefono: string | null };
  pagadas: number;
  total: number;
  progreso: number;
  pendientes: number;
  saldoRestante: number;
  maxAtraso: number;
  score: number;
  elegible: boolean;
  montoSugerido: number;
}

interface RenovacionPagina {
  total: number;
  elegibles: number;
  colocacion: number;
  score_promedio: number;
  rows: CandidatoRenovacion[];
}

export default function RenovacionPage() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();

  const [page, setPage] = usePaginacion(`${empresaId}`);

  // Candidatos (progreso >= 50%) con score, elegibilidad y totales calculados en SQL; solo la página visible.
  const { data: resultado, isLoading, isFetching } = useQuery({
    queryKey: ["renovacion-candidatos", empresaId, page],
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await rpc<RenovacionPagina>("renovacion_candidatos", {
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return {
        total: Number(data?.total || 0),
        elegibles: Number(data?.elegibles || 0),
        colocacion: Number(data?.colocacion || 0),
        score_promedio: Number(data?.score_promedio || 0),
        rows: (data?.rows || []).map((c) => ({
          ...c,
          monto_solicitado: Number(c.monto_solicitado || 0),
          saldoRestante: Number(c.saldoRestante || 0),
          montoSugerido: Number(c.montoSugerido || 0),
          progreso: Number(c.progreso || 0),
        })),
      } as RenovacionPagina;
    },
  });

  const candidatos = resultado?.rows;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="h-6 w-6 text-primary" />
          Renovación Automática
        </h1>
        <p className="text-muted-foreground text-sm">Candidatos a renovación basados en progreso y comportamiento de pago</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Candidatos</p>
          <p className="kpi-num text-xl font-bold">{resultado?.total ?? 0}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Elegibles</p>
          <p className="kpi-num text-xl font-bold text-success">{resultado?.elegibles ?? 0}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Colocación potencial</p>
          <p className="kpi-num text-xl font-bold text-primary">{$$(resultado?.colocacion ?? 0)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score promedio</p>
          <p className="kpi-num text-xl font-bold">{resultado?.score_promedio ?? 0}%</p>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <>
          {/* MOBILE Cards */}
          <div className="md:hidden space-y-3">
            {(candidatos || []).length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-[13px]">No hay candidatos a renovación</p>
            ) : (candidatos || []).map((c) => (
              <div key={c.id} className={cn("bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)] overflow-hidden", c.elegible && "border-success/30")}>
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-border/50">
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] truncate">{c.cliente.nombre_completo}</p>
                    <p className="text-[11px] text-muted-foreground">{c.frecuencia} · {c.modalidad}</p>
                  </div>
                  {c.elegible ? (
                    <Badge className="bg-success/20 text-success text-[9px] shrink-0 ml-2"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Elegible</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] shrink-0 ml-2">En progreso</Badge>
                  )}
                </div>
                <div className="px-3 py-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div><span className="text-muted-foreground">Progreso</span><div className="flex items-center gap-1 mt-0.5"><Progress value={c.progreso} className="h-1.5 w-12" /><span className="text-[10px] font-medium">{c.pagadas}/{c.total}</span></div></div>
                  <div><span className="text-muted-foreground">Score</span><p className="font-semibold">{c.score}%</p></div>
                  <div><span className="text-muted-foreground">Saldo</span><p className="font-medium">{$$(c.saldoRestante)}</p></div>
                  <div><span className="text-muted-foreground">Actual</span><p className="font-medium">{$$(c.monto_solicitado)}</p></div>
                  <div><span className="text-muted-foreground">Sugerido</span><p className="font-bold text-primary">{$$(c.montoSugerido)}</p></div>
                </div>
                {c.elegible && (
                  <div className="px-3 py-2 border-t border-border/50 flex gap-2">
                    <Button size="sm" className="h-7 text-[11px] flex-1" onClick={() => navigate(`/prestamos/nuevo?clienteId=${c.cliente.id}&monto=${c.montoSugerido}&renovacion=${c.id}`)}>
                      <RefreshCw className="h-3 w-3 mr-1" />Renovar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => navigate(`/prestamos/${c.id}`)}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* DESKTOP Table */}
          <Card className="hidden md:block">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs text-center">Progreso</TableHead>
                    <TableHead className="text-xs text-center">Score</TableHead>
                    <TableHead className="text-xs text-right">Monto actual</TableHead>
                    <TableHead className="text-xs text-right">Saldo restante</TableHead>
                    <TableHead className="text-xs text-right">Monto sugerido</TableHead>
                    <TableHead className="text-xs text-center">Estado</TableHead>
                    <TableHead className="text-xs text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(candidatos || []).map(c => (
                    <TableRow key={c.id} className={cn(c.elegible && "bg-success/5")}>
                      <TableCell>
                        <p className="font-medium text-sm">{c.cliente.nombre_completo}</p>
                        <p className="text-[11px] text-muted-foreground">{c.frecuencia} • {c.modalidad}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={c.progreso} className="h-2 w-16" />
                          <span className="text-xs font-medium">{c.pagadas}/{c.total}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("text-[10px]",
                          c.score >= 90 ? "bg-success/20 text-success" :
                          c.score >= 70 ? "bg-primary/20 text-primary" :
                          "bg-warning/20 text-warning"
                        )}>
                          <Star className="h-2.5 w-2.5 mr-0.5" />{c.score}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{$$(c.monto_solicitado)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{$$(c.saldoRestante)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold text-primary">{$$(c.montoSugerido)}</TableCell>
                      <TableCell className="text-center">
                        {c.elegible ? (
                          <Badge className="bg-success/20 text-success text-[10px]">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Elegible
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">En progreso</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {c.elegible && (
                            <Button
                              size="sm"
                              className="h-7 text-[11px] gap-1"
                              onClick={() => navigate(`/prestamos/nuevo?clienteId=${c.cliente.id}&monto=${c.montoSugerido}&renovacion=${c.id}`)}
                            >
                              <RefreshCw className="h-3 w-3" />Renovar
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/prestamos/${c.id}`)}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(candidatos || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay candidatos a renovación</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
          <PaginacionControles
            page={page}
            pageSize={PAGE_SIZE}
            total={resultado?.total}
            onPageChange={setPage}
            isFetching={isFetching}
          />
        </>
      )}
      </div>
  );
}
