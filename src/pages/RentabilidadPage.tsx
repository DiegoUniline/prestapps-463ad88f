import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export default function RentabilidadPage() {
  const { empresaId } = useEmpresa();

  const { data, isLoading } = useQuery({
    queryKey: ["rentabilidad", empresaId],
    queryFn: async () => {
      const [{ data: prestamos }, { data: pagos }, { data: rutas }, { data: profiles }] = await Promise.all([
        supabase.from("prestamos").select("id, monto_solicitado, monto_total_pagar, tasa_interes, gastos_legales, estado, ruta_id, cobrador_id, cliente_id, clientes(nombre_completo)")
          .eq("empresa_id", empresaId).in("estado", ["Activo", "Al día", "Vencido", "Liquidado"]),
        supabase.from("pagos").select("id, prestamo_id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, anulado")
          .eq("empresa_id", empresaId).eq("anulado", false),
        supabase.from("rutas").select("id, nombre").eq("empresa_id", empresaId),
        supabase.from("profiles").select("id, nombre_completo").eq("empresa_id", empresaId),
      ]);

      return { prestamos: prestamos || [], pagos: pagos || [], rutas: rutas || [], profiles: profiles || [] };
    },
  });

  const { byPrestamo, byRuta, byCobrador, totales } = useMemo(() => {
    if (!data) return { byPrestamo: [], byRuta: [], byCobrador: [], totales: null };

    const pagosByPrestamo: Record<string, { capital: number; interes: number; mora: number; total: number }> = {};
    for (const p of data.pagos) {
      const key = p.prestamo_id;
      if (!pagosByPrestamo[key]) pagosByPrestamo[key] = { capital: 0, interes: 0, mora: 0, total: 0 };
      pagosByPrestamo[key].capital += Number(p.aplicado_capital || 0);
      pagosByPrestamo[key].interes += Number(p.aplicado_interes || 0);
      pagosByPrestamo[key].mora += Number(p.aplicado_mora || 0);
      pagosByPrestamo[key].total += Number(p.monto_recibido || 0);
    }

    const rutaMap: Record<string, string> = {};
    for (const r of data.rutas) rutaMap[r.id] = r.nombre;
    const profileMap: Record<string, string> = {};
    for (const p of data.profiles) profileMap[p.id] = p.nombre_completo;

    const byPrestamo = data.prestamos.map((p: any) => {
      const pagado = pagosByPrestamo[p.id] || { capital: 0, interes: 0, mora: 0, total: 0 };
      const capitalColocado = Number(p.monto_solicitado || 0);
      const interesEsperado = Number(p.monto_total_pagar || 0) - capitalColocado;
      const utilidadBruta = pagado.interes + pagado.mora;
      const roi = capitalColocado > 0 ? (utilidadBruta / capitalColocado) * 100 : 0;
      const recuperacion = capitalColocado > 0 ? (pagado.capital / capitalColocado) * 100 : 0;

      return {
        id: p.id,
        cliente: (p.clientes as any)?.nombre_completo || "—",
        capitalColocado,
        interesEsperado,
        capitalRecuperado: pagado.capital,
        interesGanado: pagado.interes,
        moraGanada: pagado.mora,
        totalRecibido: pagado.total,
        utilidadBruta,
        roi,
        recuperacion,
        estado: p.estado,
        rutaId: p.ruta_id,
        cobradorId: p.cobrador_id,
      };
    });

    // Group by ruta
    const rutaGroups: Record<string, typeof byPrestamo> = {};
    for (const p of byPrestamo) {
      const key = p.rutaId || "sin-ruta";
      if (!rutaGroups[key]) rutaGroups[key] = [];
      rutaGroups[key].push(p);
    }
    const byRuta = Object.entries(rutaGroups).map(([rutaId, items]) => {
      const capitalColocado = items.reduce((s, i) => s + i.capitalColocado, 0);
      const utilidadBruta = items.reduce((s, i) => s + i.utilidadBruta, 0);
      const capitalRecuperado = items.reduce((s, i) => s + i.capitalRecuperado, 0);
      return {
        rutaId,
        nombre: rutaMap[rutaId] || "Sin ruta",
        prestamos: items.length,
        capitalColocado,
        capitalRecuperado,
        utilidadBruta,
        roi: capitalColocado > 0 ? (utilidadBruta / capitalColocado) * 100 : 0,
        recuperacion: capitalColocado > 0 ? (capitalRecuperado / capitalColocado) * 100 : 0,
      };
    }).sort((a, b) => b.utilidadBruta - a.utilidadBruta);

    // Group by cobrador
    const cobGroups: Record<string, typeof byPrestamo> = {};
    for (const p of byPrestamo) {
      const key = p.cobradorId || "sin-cobrador";
      if (!cobGroups[key]) cobGroups[key] = [];
      cobGroups[key].push(p);
    }
    const byCobrador = Object.entries(cobGroups).map(([cobId, items]) => {
      const capitalColocado = items.reduce((s, i) => s + i.capitalColocado, 0);
      const utilidadBruta = items.reduce((s, i) => s + i.utilidadBruta, 0);
      const capitalRecuperado = items.reduce((s, i) => s + i.capitalRecuperado, 0);
      return {
        cobId,
        nombre: profileMap[cobId] || "Sin asignar",
        prestamos: items.length,
        capitalColocado,
        capitalRecuperado,
        utilidadBruta,
        roi: capitalColocado > 0 ? (utilidadBruta / capitalColocado) * 100 : 0,
        recuperacion: capitalColocado > 0 ? (capitalRecuperado / capitalColocado) * 100 : 0,
      };
    }).sort((a, b) => b.utilidadBruta - a.utilidadBruta);

    const totalCapital = byPrestamo.reduce((s, p) => s + p.capitalColocado, 0);
    const totalUtilidad = byPrestamo.reduce((s, p) => s + p.utilidadBruta, 0);
    const totalRecuperado = byPrestamo.reduce((s, p) => s + p.capitalRecuperado, 0);
    const totalInteres = byPrestamo.reduce((s, p) => s + p.interesGanado, 0);
    const totalMora = byPrestamo.reduce((s, p) => s + p.moraGanada, 0);

    return {
      byPrestamo: byPrestamo.sort((a, b) => b.utilidadBruta - a.utilidadBruta),
      byRuta,
      byCobrador,
      totales: { totalCapital, totalUtilidad, totalRecuperado, totalInteres, totalMora, roi: totalCapital > 0 ? (totalUtilidad / totalCapital) * 100 : 0 },
    };
  }, [data]);

  return (
    <div className="space-y-4">
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
