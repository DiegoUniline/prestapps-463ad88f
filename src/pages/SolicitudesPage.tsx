import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useSolicitudes, useUpdateSolicitud } from "@/hooks/useSolicitudes";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, addWeeks, addMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Check, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

function calcNextDate(base: Date, frecuencia: string, n: number): Date {
  switch (frecuencia) {
    case "diario": return addDays(base, n);
    case "semanal": return addWeeks(base, n);
    case "quincenal": return addDays(base, n * 15);
    case "mensual": return addMonths(base, n);
    default: return addWeeks(base, n);
  }
}

const statusColors: Record<string, string> = {
  Pendiente: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  Aprobada: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Rechazada: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function SolicitudesPage() {
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const { user } = useAuth();
  const { role } = useCurrentUserRole();
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const { data: solicitudes = [], isLoading } = useSolicitudes(empresaId, statusFilter);
  const updateSolicitud = useUpdateSolicitud();
  const queryClient = useQueryClient();

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [detailSol, setDetailSol] = useState<any>(null);

  const filtered = solicitudes.filter((s) => {
    if (!search) return true;
    const cliente = s.clientes?.nombre_completo?.toLowerCase() || "";
    const idCliente = s.clientes?.id_cliente?.toLowerCase() || "";
    return cliente.includes(search.toLowerCase()) || idCliente.includes(search.toLowerCase());
  });

  // Approve: create the prestamo + amortization from the solicitud data
  const approveMutation = useMutation({
    mutationFn: async (sol: any) => {
      const monto = Number(sol.monto_solicitado);
      const tasa = Number(sol.tasa_interes || 0);
      const cuotas = Number(sol.num_cuotas);
      const interesTotal = monto * tasa / 100;
      const montoTotalPagar = monto + interesTotal;
      const cuotaCalculada = montoTotalPagar / cuotas;
      const cuotaFinal = Math.ceil(cuotaCalculada);

      // Create prestamo
      const { data: prestamo, error } = await supabase
        .from("prestamos")
        .insert({
          cliente_id: sol.cliente_id,
          empresa_id: sol.empresa_id,
          monto_solicitado: monto,
          monto_total_pagar: montoTotalPagar,
          tasa_interes: tasa,
          num_cuotas: cuotas,
          frecuencia: sol.frecuencia as any,
          modalidad: sol.modalidad as any,
          fecha_primer_pago: sol.fecha_primer_pago,
          caja_id: sol.caja_id,
          ruta_id: sol.ruta_id,
          gastos_legales: Number(sol.gastos_legales || 0),
          tipo_mora: sol.tipo_mora as any,
          valor_mora: Number(sol.valor_mora || 0),
          notas: sol.notas,
          cuota_calculada: cuotaCalculada,
          cuota_redondeada: cuotaFinal,
          generado_por: user?.id,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Generate amortization
      const baseDate = sol.fecha_primer_pago ? new Date(sol.fecha_primer_pago) : new Date();
      const totalInteres = montoTotalPagar - monto;
      const interesPorCuota = totalInteres / cuotas;

      if (sol.modalidad === "fijo") {
        const capitalPorCuota = cuotaFinal - interesPorCuota;
        let saldo = monto;
        const rows = [];
        for (let i = 0; i < cuotas; i++) {
          const isLast = i === cuotas - 1;
          const capital = isLast ? saldo : Math.min(capitalPorCuota, saldo);
          const interes = isLast ? (saldo * totalInteres / monto) : interesPorCuota;
          const cuotaVal = isLast ? capital + interes : cuotaFinal;
          saldo = Math.max(0, saldo - capital);
          rows.push({
            prestamo_id: prestamo.id,
            num_cuota: i + 1,
            capital: Math.round(capital * 100) / 100,
            interes: Math.round(interes * 100) / 100,
            capital_interes: Math.round(cuotaVal * 100) / 100,
            fecha_vencimiento: format(calcNextDate(baseDate, sol.frecuencia, i), "yyyy-MM-dd"),
            saldo_capital: Math.round(capital * 100) / 100,
            saldo_interes: Math.round(interes * 100) / 100,
            saldo_total: Math.round(cuotaVal * 100) / 100,
            status: "Pendiente" as const,
          });
        }
        await supabase.from("amortizacion").insert(rows);
      } else {
        const tasaPeriodo = tasa / 100 / cuotas;
        const capitalPorCuota = monto / cuotas;
        let saldo = monto;
        const rows = [];
        for (let i = 0; i < cuotas; i++) {
          const inter = saldo * tasaPeriodo;
          const cuotaVal = capitalPorCuota + inter;
          saldo -= capitalPorCuota;
          rows.push({
            prestamo_id: prestamo.id,
            num_cuota: i + 1,
            capital: Math.round(capitalPorCuota * 100) / 100,
            interes: Math.round(inter * 100) / 100,
            capital_interes: Math.round(cuotaVal * 100) / 100,
            fecha_vencimiento: format(calcNextDate(baseDate, sol.frecuencia, i), "yyyy-MM-dd"),
            saldo_capital: Math.round(capitalPorCuota * 100) / 100,
            saldo_interes: Math.round(inter * 100) / 100,
            saldo_total: Math.round(cuotaVal * 100) / 100,
            status: "Pendiente" as const,
          });
        }
        await supabase.from("amortizacion").insert(rows);
      }

      // Update solicitud
      await (supabase.from as any)("solicitudes_prestamo")
        .update({
          status: "Aprobada",
          aprobado_por: user?.id,
          prestamo_generado_id: prestamo.id,
          resuelto_en: new Date().toISOString(),
        })
        .eq("id", sol.id);

      return prestamo;
    },
    onSuccess: (prestamo) => {
      toast.success("Solicitud aprobada — préstamo creado");
      queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
      queryClient.invalidateQueries({ queryKey: ["prestamos-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Error al aprobar"),
  });

  const handleReject = () => {
    if (!rejectId) return;
    updateSolicitud.mutate(
      {
        id: rejectId,
        status: "Rechazada",
        rechazado_por: user?.id,
        motivo_rechazo: motivo || "Sin motivo",
        resuelto_en: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          toast.success("Solicitud rechazada");
          setRejectId(null);
          setMotivo("");
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-semibold">Solicitudes de Préstamo</h1>
        <Button onClick={() => navigate("/solicitudes/nueva")}>
          <Plus className="h-4 w-4 mr-1.5" />Nueva Solicitud
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Pendiente">Pendientes</SelectItem>
                <SelectItem value="Aprobada">Aprobadas</SelectItem>
                <SelectItem value="Rechazada">Rechazadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">No hay solicitudes</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-center">Cuotas</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-sm">
                      {s.clientes?.nombre_completo || "—"}
                      <br />
                      <span className="text-xs text-muted-foreground">{s.clientes?.id_cliente}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">${Number(s.monto_solicitado).toLocaleString()}</TableCell>
                    <TableCell className="text-center text-sm">{s.num_cuotas}</TableCell>
                    <TableCell className="text-sm capitalize">{s.frecuencia}</TableCell>
                    <TableCell className="text-sm">{s.created_at ? format(new Date(s.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[s.status] || ""}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailSol(s)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {s.status === "Pendiente" && role === "admin" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700"
                              onClick={() => approveMutation.mutate(s)}
                              disabled={approveMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => { setRejectId(s.id); setMotivo(""); }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar Solicitud</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Motivo del rechazo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Indique el motivo..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={updateSolicitud.isPending}>
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailSol} onOpenChange={() => setDetailSol(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Solicitud</DialogTitle></DialogHeader>
          {detailSol && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Cliente:</span> {detailSol.clientes?.nombre_completo}</div>
                <div><span className="text-muted-foreground">Monto:</span> ${Number(detailSol.monto_solicitado).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Tasa:</span> {detailSol.tasa_interes}%</div>
                <div><span className="text-muted-foreground">Cuotas:</span> {detailSol.num_cuotas}</div>
                <div><span className="text-muted-foreground">Frecuencia:</span> {detailSol.frecuencia}</div>
                <div><span className="text-muted-foreground">Modalidad:</span> {detailSol.modalidad === "fijo" ? "Cuota Fija" : "Insolutos"}</div>
                <div><span className="text-muted-foreground">Fecha 1er pago:</span> {detailSol.fecha_primer_pago || "—"}</div>
                <div><span className="text-muted-foreground">Estado:</span> <Badge className={statusColors[detailSol.status] || ""}>{detailSol.status}</Badge></div>
              </div>
              {detailSol.notas && (
                <div><span className="text-muted-foreground">Notas:</span> {detailSol.notas}</div>
              )}
              {detailSol.motivo_rechazo && (
                <div><span className="text-muted-foreground">Motivo rechazo:</span> {detailSol.motivo_rechazo}</div>
              )}
              {detailSol.prestamo_generado_id && (
                <Button variant="link" className="p-0" onClick={() => { setDetailSol(null); navigate(`/prestamos/${detailSol.prestamo_generado_id}`); }}>
                  Ver préstamo generado →
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
