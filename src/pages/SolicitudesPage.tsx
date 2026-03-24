import { useState } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { $$ } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { useSolicitudes, useUpdateSolicitud } from "@/hooks/useSolicitudes";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { calcNextDate } from "@/lib/financial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Plus, Search, Check, X, Eye, FileInput, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
  const [esCargaInicial, setEsCargaInicial] = useState(false);

  // Only admin and supervisor can approve/reject
  const canApprove = role === "admin" || role === "supervisor";

  const filtered = solicitudes.filter((s) => {
    if (!search) return true;
    const cliente = s.clientes?.nombre_completo?.toLowerCase() || "";
    const idCliente = s.clientes?.id_cliente?.toLowerCase() || "";
    return cliente.includes(search.toLowerCase()) || idCliente.includes(search.toLowerCase());
  });

  // Approve: create the prestamo + amortization + validate caja balance + optional WhatsApp
  const approveMutation = useMutation({
    mutationFn: async ({ sol, cargaInicial }: { sol: any; cargaInicial: boolean }) => {
      const monto = Number(sol.monto_solicitado);
      const tasa = Number(sol.tasa_interes || 0);
      const cuotas = Number(sol.num_cuotas);
      const interesTotal = monto * tasa / 100;
      const montoTotalPagar = monto + interesTotal;
      const cuotaCalculada = montoTotalPagar / cuotas;
      const cuotaFinal = Math.ceil(cuotaCalculada);

      // Validate caja balance if not carga inicial and caja is assigned
      if (!cargaInicial && sol.caja_id) {
        const { data: caja } = await supabase
          .from("cajas")
          .select("id, nombre, saldo_actual")
          .eq("id", sol.caja_id)
          .single();

        if (caja && Number(caja.saldo_actual) < monto) {
          throw new Error(
            `Saldo insuficiente en caja "${caja.nombre}". Saldo: ${$$(Number(caja.saldo_actual))}, Monto solicitado: ${$$(monto)}`
          );
        }
      }

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
          notas: cargaInicial ? `[CARGA INICIAL] ${sol.notas || ""}`.trim() : sol.notas,
          cuota_calculada: cuotaCalculada,
          cuota_redondeada: cuotaFinal,
          generado_por: user?.id,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Generate amortization
      const baseDate = sol.fecha_primer_pago ? new Date(sol.fecha_primer_pago) : new Date();

      if (sol.modalidad === "fijo") {
        const totalInteres = montoTotalPagar - monto;
        const interesPorCuota = totalInteres / cuotas;
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
            empresa_id: sol.empresa_id,
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
            empresa_id: sol.empresa_id,
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

      // Register cash outflow (salida) ONLY if NOT carga inicial
      if (!cargaInicial && sol.caja_id) {
        await supabase.from("movimientos_caja").insert({
          caja_id: sol.caja_id,
          empresa_id: sol.empresa_id,
          tipo: "salida" as any,
          monto: monto,
          concepto: `Desembolso préstamo - ${sol.clientes?.nombre_completo || "Cliente"}`,
          prestamo_id: prestamo.id,
          registrado_por: user?.id,
        });

        // saldo_actual se sincroniza automáticamente via trigger
      }

      // Update solicitud status
      await supabase
        .from("solicitudes_prestamo")
        .update({
          status: "Aprobada",
          aprobado_por: user?.id,
          prestamo_generado_id: prestamo.id,
          resuelto_en: new Date().toISOString(),
        } as any)
        .eq("id", sol.id);

      // Send WhatsApp notification (fire and forget)
      sendWhatsAppNotification(sol, "aprobada", empresaId).catch(() => {});

      return prestamo;
    },
    onSuccess: () => {
      toast.success("Solicitud aprobada — préstamo creado");
      setEsCargaInicial(false);
      queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
      invalidateFinanceQueries(queryClient);
    },
    onError: (err: any) => toast.error(err.message || "Error al aprobar"),
  });

  const handleReject = () => {
    if (!rejectId) return;
    const sol = solicitudes.find((s) => s.id === rejectId);

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
          // Send WhatsApp notification
          if (sol) {
            sendWhatsAppNotification(sol, "rechazada", empresaId, motivo).catch(() => {});
          }
          setRejectId(null);
          setMotivo("");
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  // State for approve confirmation dialog
  const [approveTarget, setApproveTarget] = useState<any>(null);

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-lg p-4 space-y-5">
      <PageHeader
        title="Solicitudes de Préstamo"
        actions={
          <Button onClick={() => navigate("/solicitudes/nueva")}>
            <Plus className="h-4 w-4 mr-1.5" />Nueva Solicitud
          </Button>
        }
      />

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
            <LoadingSkeleton rows={6} type="table" />
          ) : filtered.length === 0 ? (
            <EmptyState icon={FileInput} title="No hay solicitudes" description="Las solicitudes de préstamo aparecerán aquí" />
          ) : (
            <>
              {/* MOBILE Cards */}
              <div className="md:hidden space-y-3">
                {filtered.map((s) => (
                  <div key={s.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-[13px] truncate">{s.clientes?.nombre_completo || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{s.clientes?.id_cliente} · {s.created_at ? format(new Date(s.created_at), "dd/MM/yyyy") : "—"}</p>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                      <div><span className="text-muted-foreground">Monto</span><p className="font-semibold">{$$(Number(s.monto_solicitado))}</p></div>
                      <div><span className="text-muted-foreground">Cuotas</span><p className="font-medium">{s.num_cuotas}</p></div>
                      <div><span className="text-muted-foreground">Frecuencia</span><p className="font-medium capitalize">{s.frecuencia}</p></div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] flex-1" onClick={() => setDetailSol(s)}>
                        <Eye className="h-3 w-3 mr-1" />Ver
                      </Button>
                      {s.status === "Pendiente" && canApprove && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-success" onClick={() => setApproveTarget(s)} disabled={approveMutation.isPending}>
                            <Check className="h-3 w-3 mr-1" />Aprobar
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive" onClick={() => { setRejectId(s.id); setMotivo(""); }}>
                            <X className="h-3 w-3 mr-1" />Rechazar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP Table */}
              <div className="hidden md:block">
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
                        <TableCell className="text-right text-sm">{$$(Number(s.monto_solicitado))}</TableCell>
                        <TableCell className="text-center text-sm">{s.num_cuotas}</TableCell>
                        <TableCell className="text-sm capitalize">{s.frecuencia}</TableCell>
                        <TableCell className="text-sm">{s.created_at ? format(new Date(s.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailSol(s)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {s.status === "Pendiente" && canApprove && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 hover:text-green-700"
                                  onClick={() => setApproveTarget(s)}
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
                            {s.status === "Pendiente" && !canApprove && (
                              <span className="text-xs text-muted-foreground italic">Solo lectura</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Approve confirmation dialog */}
      <Dialog open={!!approveTarget} onOpenChange={() => { setApproveTarget(null); setEsCargaInicial(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aprobar Solicitud</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              ¿Aprobar solicitud de <strong>{approveTarget?.clientes?.nombre_completo}</strong> por{" "}
              <strong>{$$(Number(approveTarget?.monto_solicitado || 0))}</strong>?
            </p>

            {approveTarget?.caja_id && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Se descontará el monto de la caja seleccionada.</p>
              </div>
            )}

            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
              <Checkbox
                checked={esCargaInicial}
                onCheckedChange={(v) => setEsCargaInicial(!!v)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Carga Inicial (sin salida de caja)</p>
                <p className="text-xs text-muted-foreground">
                  Marcar si es un préstamo existente que se está cargando al sistema por primera vez.
                  No generará movimiento de salida en la caja.
                </p>
              </div>
            </label>

            {!esCargaInicial && !approveTarget?.caja_id && (
              <div className="flex items-center gap-2 text-warning text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>No se seleccionó caja. No se registrará movimiento de salida.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApproveTarget(null); setEsCargaInicial(false); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                approveMutation.mutate({ sol: approveTarget, cargaInicial: esCargaInicial });
                setApproveTarget(null);
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Procesando..." : "Aprobar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div><span className="text-muted-foreground">Monto:</span> {$$(Number(detailSol.monto_solicitado))}</div>
                <div><span className="text-muted-foreground">Tasa:</span> {detailSol.tasa_interes}%</div>
                <div><span className="text-muted-foreground">Cuotas:</span> {detailSol.num_cuotas}</div>
                <div><span className="text-muted-foreground">Frecuencia:</span> {detailSol.frecuencia}</div>
                <div><span className="text-muted-foreground">Modalidad:</span> {detailSol.modalidad === "fijo" ? "Cuota Fija" : "Insolutos"}</div>
                <div><span className="text-muted-foreground">Fecha 1er pago:</span> {detailSol.fecha_primer_pago || "—"}</div>
                <div><span className="text-muted-foreground">Estado:</span> <StatusBadge status={detailSol.status} /></div>
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
    </div>
  );
}

/** Fire-and-forget WhatsApp notification for solicitud status change */
async function sendWhatsAppNotification(
  sol: any,
  resultado: "aprobada" | "rechazada",
  empresaId: string,
  motivoRechazo?: string
) {
  try {
    // Get client phone
    const { data: cliente } = await supabase
      .from("clientes")
      .select("telefono, nombre_completo")
      .eq("id", sol.cliente_id)
      .single();

    if (!cliente?.telefono) return;

    // Get WhatsApp config
    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("activo")
      .eq("empresa_id", empresaId)
      .single();

    if (!config?.activo) return;

    const message = resultado === "aprobada"
      ? `✅ ¡Hola ${cliente.nombre_completo}! Tu solicitud de préstamo por ${$$(Number(sol.monto_solicitado))} ha sido *APROBADA*. Pronto recibirás más detalles.`
      : `❌ Hola ${cliente.nombre_completo}, lamentamos informarte que tu solicitud de préstamo por ${$$(Number(sol.monto_solicitado))} ha sido *RECHAZADA*. ${motivoRechazo ? `Motivo: ${motivoRechazo}` : "Contacta a tu asesor para más información."}`;

    await supabase.functions.invoke("whatsapp-sender", {
      body: {
        action: "send-text",
        empresa_id: empresaId,
        phone: cliente.telefono,
        message,
        tipo: "solicitud",
        referencia_id: sol.id,
      },
    });
  } catch {
    // Silent fail - notification is not critical
  }
}
