import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { RefreshCw, Star, TrendingUp, DollarSign, ChevronRight, CheckCircle2 } from "lucide-react";

const $$ = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RenovacionPage() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();

  const { data: candidatos, isLoading } = useQuery({
    queryKey: ["renovacion-candidatos", empresaId],
    queryFn: async () => {
      // Get active loans with their amortization
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select(`
          id, monto_solicitado, monto_total_pagar, num_cuotas, frecuencia, tasa_interes, modalidad,
          cliente_id, ruta_id, caja_id, cobrador_id,
          clientes!inner(id, nombre_completo, telefono),
          amortizacion(id, num_cuota, status, saldo_total, dias_atraso)
        `)
        .eq("empresa_id", empresaId)
        .in("estado", ["Activo", "Al día"]);

      return (prestamos || []).map((p: any) => {
        const cuotas = p.amortizacion || [];
        const pagadas = cuotas.filter((c: any) => c.status === "Pagada").length;
        const total = cuotas.length;
        const progreso = total > 0 ? (pagadas / total) * 100 : 0;
        const pendientes = total - pagadas;
        const saldoRestante = cuotas.reduce((s: number, c: any) => s + (c.saldo_total || 0), 0);
        const maxAtraso = Math.max(0, ...cuotas.map((c: any) => c.dias_atraso || 0));
        const cuotasATiempo = cuotas.filter((c: any) => c.status === "Pagada" && (c.dias_atraso || 0) <= 3).length;
        const score = pagadas > 0 ? Math.round((cuotasATiempo / pagadas) * 100) : 0;

        return {
          ...p,
          cliente: p.clientes,
          pagadas,
          total,
          progreso,
          pendientes,
          saldoRestante,
          maxAtraso,
          score,
          elegible: progreso >= 70 && maxAtraso <= 7,
          montoSugerido: Math.round(p.monto_solicitado * (score >= 90 ? 1.3 : score >= 70 ? 1.15 : 1)),
        };
      })
      .filter((p: any) => p.progreso >= 50)
      .sort((a: any, b: any) => b.progreso - a.progreso);
    },
  });

  const elegibles = useMemo(() => (candidatos || []).filter(c => c.elegible), [candidatos]);
  const totalColocacion = useMemo(() => elegibles.reduce((s, c) => s + c.montoSugerido, 0), [elegibles]);

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
          <p className="text-xl font-bold">{(candidatos || []).length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Elegibles</p>
          <p className="text-xl font-bold text-success">{elegibles.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Colocación potencial</p>
          <p className="text-xl font-bold text-primary">{$$(totalColocacion)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score promedio</p>
          <p className="text-xl font-bold">{elegibles.length > 0 ? Math.round(elegibles.reduce((s, c) => s + c.score, 0) / elegibles.length) : 0}%</p>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <Card>
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
      )}
    </div>
  );
}
