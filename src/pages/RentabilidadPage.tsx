import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, $$ } from "@/lib/utils";
import { DollarSign, TrendingUp, PieChart, BarChart3, Users } from "lucide-react";

const pct = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%";

type RentabilidadNum = number | string | null;
type RentabilidadGrupo = {
  rutaId?: string; cobId?: string; nombre: string; prestamos: RentabilidadNum;
  capitalColocado: RentabilidadNum; capitalRecuperado: RentabilidadNum; utilidadBruta: RentabilidadNum;
};
type RentabilidadRpc = {
  totales: Record<"totalCapital" | "totalUtilidad" | "totalRecuperado" | "totalInteres" | "totalMora", RentabilidadNum>;
  porRuta: RentabilidadGrupo[];
  porCobrador: RentabilidadGrupo[];
  porPrestamo: {
    id: string; cliente: string; estado: string; capitalColocado: RentabilidadNum; capitalRecuperado: RentabilidadNum;
    interesGanado: RentabilidadNum; moraGanada: RentabilidadNum; totalRecibido: RentabilidadNum; utilidadBruta: RentabilidadNum;
  }[];
};

export default function RentabilidadPage() {
  const { empresaId } = useEmpresa();

  // Agregado en SQL (rpc rentabilidad_resumen): totales, por ruta, por cobrador y top 100 préstamos.
  const { data, isLoading } = useQuery({
    queryKey: ["rentabilidad", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await rpc<RentabilidadRpc>("rentabilidad_resumen");
      if (error) throw error;
      return data as RentabilidadRpc;
    },
  });

  const { byPrestamo, byRuta, byCobrador, totales } = useMemo(() => {
    if (!data) return { byPrestamo: [], byRuta: [], byCobrador: [], totales: null };
    const n = (v: number | string | null | undefined) => Number(v || 0);
    const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

    const byPrestamo = data.porPrestamo.map((p) => {
      const capitalColocado = n(p.capitalColocado);
      const utilidadBruta = n(p.utilidadBruta);
      const capitalRecuperado = n(p.capitalRecuperado);
      return {
        id: p.id,
        cliente: p.cliente,
        capitalColocado,
        capitalRecuperado,
        interesGanado: n(p.interesGanado),
        moraGanada: n(p.moraGanada),
        totalRecibido: n(p.totalRecibido),
        utilidadBruta,
        roi: ratio(utilidadBruta, capitalColocado),
        recuperacion: ratio(capitalRecuperado, capitalColocado),
        estado: p.estado,
      };
    });
    const grupo = (g: RentabilidadGrupo) => {
      const capitalColocado = n(g.capitalColocado);
      const capitalRecuperado = n(g.capitalRecuperado);
      const utilidadBruta = n(g.utilidadBruta);
      return {
        nombre: g.nombre,
        prestamos: n(g.prestamos),
        capitalColocado,
        capitalRecuperado,
        utilidadBruta,
        roi: ratio(utilidadBruta, capitalColocado),
        recuperacion: ratio(capitalRecuperado, capitalColocado),
      };
    };
    const byRuta = data.porRuta.map((g) => ({ rutaId: g.rutaId, ...grupo(g) }));
    const byCobrador = data.porCobrador.map((g) => ({ cobId: g.cobId, ...grupo(g) }));

    const t = data.totales;
    const totalCapital = n(t.totalCapital);
    const totalUtilidad = n(t.totalUtilidad);
    return {
      byPrestamo,
      byRuta,
      byCobrador,
      totales: {
        totalCapital, totalUtilidad,
        totalRecuperado: n(t.totalRecuperado), totalInteres: n(t.totalInteres), totalMora: n(t.totalMora),
        roi: ratio(totalUtilidad, totalCapital),
      },
    };
  }, [data]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PieChart className="h-6 w-6 text-primary" />
          Rentabilidad
        </h1>
        <p className="text-muted-foreground text-sm">Análisis de retorno de inversión por préstamo, ruta y cobrador</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : totales && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital colocado</p><p className="text-lg font-bold">{$$(totales.totalCapital)}</p></Card>
            <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital recuperado</p><p className="text-lg font-bold text-success">{$$(totales.totalRecuperado)}</p></Card>
            <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Intereses ganados</p><p className="text-lg font-bold text-primary">{$$(totales.totalInteres)}</p></Card>
            <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mora recaudada</p><p className="text-lg font-bold text-warning">{$$(totales.totalMora)}</p></Card>
            <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Utilidad bruta</p><p className="text-lg font-bold text-success">{$$(totales.totalUtilidad)}</p></Card>
            <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">ROI</p><p className="text-lg font-bold text-primary">{totales.roi.toFixed(1)}%</p></Card>
          </div>

          <Tabs defaultValue="prestamos">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="prestamos">Por Préstamo</TabsTrigger>
              <TabsTrigger value="rutas">Por Ruta</TabsTrigger>
              <TabsTrigger value="cobradores">Por Cobrador</TabsTrigger>
            </TabsList>

            <TabsContent value="prestamos" className="mt-3">
              <RentabilidadTable
                columns={["Cliente", "Capital", "Recuperado", "Interés", "Mora", "Utilidad", "ROI", "Estado"]}
                rows={(byPrestamo || []).slice(0, 100).map(p => [
                  p.cliente, $$(p.capitalColocado), $$(p.capitalRecuperado), $$(p.interesGanado),
                  $$(p.moraGanada), $$(p.utilidadBruta), `${p.roi.toFixed(1)}%`, p.estado,
                ])}
              />
            </TabsContent>

            <TabsContent value="rutas" className="mt-3">
              <RentabilidadTable
                columns={["Ruta", "Préstamos", "Capital", "Recuperado", "Utilidad", "ROI", "Recuperación"]}
                rows={(byRuta || []).map(r => [
                  r.nombre, r.prestamos.toString(), $$(r.capitalColocado), $$(r.capitalRecuperado),
                  $$(r.utilidadBruta), `${r.roi.toFixed(1)}%`, `${r.recuperacion.toFixed(1)}%`,
                ])}
              />
            </TabsContent>

            <TabsContent value="cobradores" className="mt-3">
              <RentabilidadTable
                columns={["Cobrador", "Préstamos", "Capital", "Recuperado", "Utilidad", "ROI", "Recuperación"]}
                rows={(byCobrador || []).map(c => [
                  c.nombre, c.prestamos.toString(), $$(c.capitalColocado), $$(c.capitalRecuperado),
                  $$(c.utilidadBruta), `${c.roi.toFixed(1)}%`, `${c.recuperacion.toFixed(1)}%`,
                ])}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function RentabilidadTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <>
      {/* MOBILE Cards */}
      <div className="md:hidden space-y-2">
        {rows.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-[13px]">Sin datos</p>
        ) : rows.map((row, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <p className="font-semibold text-[13px] truncate mb-1.5">{row[0]}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              {columns.slice(1).map((col, j) => (
                <div key={col} className="flex justify-between">
                  <span className="text-muted-foreground">{col}</span>
                  <span className="font-medium">{row[j + 1]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP Table */}
      <Card className="hidden md:block">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(col => (
                  <TableHead key={col} className={cn("text-xs", col !== columns[0] && "text-right")}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  {row.map((cell, j) => (
                    <TableCell key={j} className={cn("text-sm", j > 0 && "text-right", j === 0 && "font-medium")}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">Sin datos</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
