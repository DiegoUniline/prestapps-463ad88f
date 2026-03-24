import { useState, useMemo } from "react";
import { invalidateFinanceQueries } from "@/lib/invalidateFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Calculator, Loader2, Percent, UserCheck, Wallet, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { $$ } from "@/lib/utils";
// ── Types & hooks ─────────────────────────────────────────────────
interface Cobrador {
  id: string;
  nombre: string;
  porcentaje_comision: number;
  efectivo_en_mano: number;
  activo: boolean;
}

interface Supervisor {
  id: string;
  nombre_completo: string;
  comision_tipo: string | null;
  comision_cobros_equipo: number | null;
  comision_prestamos: number | null;
  bono_meta_monto: number | null;
  bono_meta_objetivo: number | null;
  porcentaje_comision: number;
}

function useCobradores(empresaId: string) {
  return useQuery({
    queryKey: ["cobradores", empresaId],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "cobrador");
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nombre_completo, porcentaje_comision, efectivo_en_mano, activo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .in("id", userIds)
        .order("nombre_completo");
      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id,
        nombre: p.nombre_completo,
        porcentaje_comision: Number(p.porcentaje_comision || 0),
        efectivo_en_mano: Number(p.efectivo_en_mano || 0),
        activo: p.activo,
      })) as Cobrador[];
    },
  });
}

function useSupervisores(empresaId: string) {
  return useQuery({
    queryKey: ["supervisores-comisiones", empresaId],
    queryFn: async () => {
      // Get users with supervisor role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "supervisor");
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nombre_completo, comision_tipo, comision_cobros_equipo, comision_prestamos, bono_meta_monto, bono_meta_objetivo, porcentaje_comision")
        .eq("empresa_id", empresaId)
        .in("id", userIds);
      return (profiles || []) as Supervisor[];
    },
  });
}

function useCajas(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-all", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre, saldo_actual").eq("empresa_id", empresaId).order("nombre");
      return data || [];
    },
  });
}

// Fetch cobros in a period for a cobrador
async function fetchCobros(cobradorId: string, empresaId: string, desde?: string, hasta?: string) {
  let query = supabase
    .from("pagos")
    .select("monto_recibido, created_at")
    .eq("empresa_id", empresaId)
    .eq("anulado", false);
  
  query = query.eq("cobrador_id", cobradorId);
  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", hasta);

  return await fetchAllRows(query);
}

// Fetch cobros for all cobradores in supervisor's rutas
async function fetchCobrosEquipo(supervisorId: string, empresaId: string, desde?: string, hasta?: string) {
  // Get rutas assigned to supervisor
  const { data: supRutas } = await supabase
    .from("supervisor_rutas")
    .select("ruta_id")
    .eq("supervisor_id", supervisorId);
  
  if (!supRutas?.length) return 0;

  const rutaIds = supRutas.map((r) => r.ruta_id);

  let query = supabase
    .from("pagos")
    .select("monto_recibido")
    .in("ruta_id", rutaIds)
    .eq("empresa_id", empresaId);

  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", hasta);

  const { data } = await query;
  return (data || []).reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
}

// Fetch préstamos generated in period
async function fetchPrestamosGenerados(supervisorId: string, empresaId: string, desde?: string, hasta?: string) {
  let query = supabase
    .from("prestamos")
    .select("monto_solicitado")
    .eq("empresa_id", empresaId)
    .eq("generado_por", supervisorId);

  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", hasta);

  const { data } = await query;
  return (data || []).reduce((s, p) => s + Number(p.monto_solicitado || 0), 0);
}

// Historial de comisiones pagadas
function useComisionesPagadas(empresaId: string) {
  return useQuery({
    queryKey: ["comisiones-pagadas", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("movimientos_caja")
        .select("*, cajas ( nombre )")
        .eq("empresa_id", empresaId)
        .eq("tipo", "salida")
        .ilike("concepto", "%comisión%")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });
}

// ── Component ─────────────────────────────────────────────────────
export default function ComisionesPage() {
  const queryClient = useQueryClient();
  const { empresaId } = useEmpresa();
  const { data: cobradores = [] } = useCobradores(empresaId);
  const { data: supervisores = [] } = useSupervisores(empresaId);
  const { data: cajas = [] } = useCajas(empresaId);
  const { data: historial = [], isLoading: loadingHistorial } = useComisionesPagadas(empresaId);

  const [modalOpen, setModalOpen] = useState(false);
  const [tipoComision, setTipoComision] = useState<"cobrador" | "supervisor">("cobrador");
  const [selectedId, setSelectedId] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Calculated values
  const [totalCobrado, setTotalCobrado] = useState(0);
  const [porcentaje, setPorcentaje] = useState(0);
  const [comisionCalculada, setComisionCalculada] = useState(0);
  const [detalle, setDetalle] = useState("");

  const resetModal = () => {
    setModalOpen(false);
    setSelectedId("");
    setCajaId("");
    setTotalCobrado(0);
    setPorcentaje(0);
    setComisionCalculada(0);
    setDetalle("");
  };

  // Calculate commission for selected person
  const calcularComision = async () => {
    if (!selectedId) return;
    setCalculating(true);

    try {
      if (tipoComision === "cobrador") {
        const cobrador = cobradores.find((c) => c.id === selectedId);
        if (!cobrador) return;

        // Get last corte date
        const { data: lastCorte } = await (supabase.from as any)("cortes")
          .select("created_at")
          .eq("cobrador_id", cobrador.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const desde = lastCorte?.created_at || undefined;
        const cobros = await fetchCobros(cobrador.id, empresaId, desde);
        const total = cobros.reduce((s, p) => s + Number(p.monto_recibido || 0), 0);
        const comision = total * (cobrador.porcentaje_comision / 100);

        setTotalCobrado(total);
        setPorcentaje(cobrador.porcentaje_comision);
        setComisionCalculada(comision);
        setDetalle(`Cobros desde último corte: ${$$(total)} × ${cobrador.porcentaje_comision}%`);
      } else {
        const supervisor = supervisores.find((s) => s.id === selectedId);
        if (!supervisor) return;

        // Current month period
        const now = new Date();
        const desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const hasta = now.toISOString();
        let comision = 0;
        const detalles: string[] = [];

        // 1. Comisión por cobros del equipo
        if (supervisor.comision_cobros_equipo && supervisor.comision_cobros_equipo > 0) {
          const totalEquipo = await fetchCobrosEquipo(supervisor.id, empresaId, desde, hasta);
          const com = totalEquipo * (supervisor.comision_cobros_equipo / 100);
          comision += com;
          detalles.push(`Cobros equipo: ${$$(totalEquipo)} × ${supervisor.comision_cobros_equipo}% = ${$$(com)}`);
          setTotalCobrado(totalEquipo);
        }

        // 2. Comisión por préstamos generados
        if (supervisor.comision_prestamos && supervisor.comision_prestamos > 0) {
          const totalPrestamos = await fetchPrestamosGenerados(supervisor.id, empresaId, desde, hasta);
          const com = totalPrestamos * (supervisor.comision_prestamos / 100);
          comision += com;
          detalles.push(`Préstamos: ${$$(totalPrestamos)} × ${supervisor.comision_prestamos}% = ${$$(com)}`);
        }

        // 3. Bono por meta
        if (supervisor.bono_meta_objetivo && supervisor.bono_meta_objetivo > 0 && supervisor.bono_meta_monto) {
          const totalEquipo = await fetchCobrosEquipo(supervisor.id, empresaId, desde, hasta);
          if (totalEquipo >= supervisor.bono_meta_objetivo) {
            comision += supervisor.bono_meta_monto;
            detalles.push(`Bono meta alcanzada (${$$(totalEquipo)} ≥ ${$$(supervisor.bono_meta_objetivo)}): +${$$(supervisor.bono_meta_monto)}`);
          } else {
            detalles.push(`Meta no alcanzada (${$$(totalEquipo)} / ${$$(supervisor.bono_meta_objetivo)})`);
          }
        }

        setPorcentaje(0);
        setComisionCalculada(comision);
        setDetalle(detalles.join("\n") || "Sin configuración de comisiones");
      }
    } catch (err: any) {
      toast.error("Error calculando: " + err.message);
    } finally {
      setCalculating(false);
    }
  };

  // Pay commission
  const handlePagar = async () => {
    if (!cajaId || comisionCalculada <= 0) return;

    const caja = cajas.find((c) => c.id === cajaId);
    if (caja && comisionCalculada > Number(caja.saldo_actual || 0)) {
      toast.error("Saldo insuficiente en la caja");
      return;
    }

    setSaving(true);
    try {
      const nombre = tipoComision === "cobrador"
        ? cobradores.find((c) => c.id === selectedId)?.nombre
        : supervisores.find((s) => s.id === selectedId)?.nombre_completo;

      const conceptoFull = `[Comisiones] Comisión ${tipoComision}: ${nombre} — ${$$(comisionCalculada)}`;

      // 1) Movimiento de salida
      await supabase.from("movimientos_caja").insert({
        caja_id: cajaId,
        tipo: "salida" as const,
        monto: comisionCalculada,
        concepto: conceptoFull,
        empresa_id: empresaId,
      });

      // saldo_actual se sincroniza automáticamente via trigger

      toast.success(`Comisión de ${$$(comisionCalculada)} pagada a ${nombre}`);
      invalidateFinanceQueries(queryClient);
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // KPIs
  const totalComisionesMes = useMemo(() => {
    const now = new Date();
    return historial
      .filter((h: any) => {
        const d = new Date(h.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s: number, h: any) => s + Number(h.monto || 0), 0);
  }, [historial]);

  const totalComisionesHistorico = historial.reduce((s: number, h: any) => s + Number(h.monto || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comisiones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cálculo y pago de comisiones a cobradores y supervisores</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Calculator className="h-4 w-4 mr-2" />
          Calcular Comisión
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Comisiones del Mes</p>
          <p className="text-2xl font-bold mt-1 text-destructive">{$$(totalComisionesMes)}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Histórico</p>
          <p className="text-2xl font-bold mt-1">{$$(totalComisionesHistorico)}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobradores Activos</p>
          <p className="text-2xl font-bold mt-1">{cobradores.length}</p>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Supervisores</p>
          <p className="text-2xl font-bold mt-1">{supervisores.length}</p>
        </div>
      </div>

      {/* Cobradores quick view */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Cobradores — Comisión configurada</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {cobradores.map((c) => (
            <div key={c.id} className="border rounded-lg p-3 bg-card flex items-center justify-between">
              <div>
                <p className="font-medium text-[13px]">{c.nombre}</p>
                <p className="text-xs text-muted-foreground">{c.porcentaje_comision}% sobre cobros</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTipoComision("cobrador");
                  setSelectedId(c.id);
                  setModalOpen(true);
                }}
              >
                <Calculator className="h-3.5 w-3.5 mr-1" />
                Calcular
              </Button>
            </div>
          ))}
          {cobradores.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-3">No hay cobradores activos</p>
          )}
        </div>
      </div>

      {/* Supervisores quick view */}
      {supervisores.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Supervisores — Comisiones</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {supervisores.map((s) => (
              <div key={s.id} className="border rounded-lg p-3 bg-card flex items-center justify-between">
                <div>
                  <p className="font-medium text-[13px]">{s.nombre_completo}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(s.comision_cobros_equipo ?? 0) > 0 && <Badge variant="outline" className="text-[10px]">{s.comision_cobros_equipo}% cobros</Badge>}
                    {(s.comision_prestamos ?? 0) > 0 && <Badge variant="outline" className="text-[10px]">{s.comision_prestamos}% préstamos</Badge>}
                    {(s.bono_meta_monto ?? 0) > 0 && <Badge variant="outline" className="text-[10px]">Bono ${s.bono_meta_monto}</Badge>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTipoComision("supervisor");
                    setSelectedId(s.id);
                    setModalOpen(true);
                  }}
                >
                  <Calculator className="h-3.5 w-3.5 mr-1" />
                  Calcular
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Historial */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Historial de Comisiones Pagadas</h2>
        {loadingHistorial ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            {/* MOBILE Cards */}
            <div className="md:hidden space-y-2">
              {historial.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-[13px]">No hay comisiones pagadas</p>
              ) : historial.map((h: any) => (
                <div key={h.id} className="bg-card rounded-lg border border-border p-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium truncate">{(h.concepto || "").replace(/\[.*?\]\s*/, "")}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: es })} · {(h.cajas as any)?.nombre || "—"}</p>
                    </div>
                    <p className="font-semibold text-destructive text-[13px] shrink-0 ml-2">-{$$(Number(h.monto || 0))}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP Table */}
            <div className="hidden md:block bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-table-header hover:bg-table-header border-b">
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Concepto</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Caja</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historial.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-[13px]">
                        No hay comisiones pagadas
                      </TableCell>
                    </TableRow>
                  ) : (
                    historial.map((h: any) => (
                      <TableRow key={h.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                        <TableCell className="text-[13px] px-3">
                          {format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell className="text-[13px] px-3 max-w-[300px] truncate">
                          {(h.concepto || "").replace(/\[.*?\]\s*/, "")}
                        </TableCell>
                        <TableCell className="text-[13px] px-3">{(h.cajas as any)?.nombre || "—"}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive text-[13px] px-3">
                          -{$$(Number(h.monto || 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Modal: Calcular y Pagar Comisión */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) resetModal(); else setModalOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Calcular Comisión
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Type selector */}
            <div>
              <Label>Tipo</Label>
              <Select value={tipoComision} onValueChange={(v) => { setTipoComision(v as any); setSelectedId(""); setComisionCalculada(0); setDetalle(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cobrador">Cobrador</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Person selector */}
            <div>
              <Label>{tipoComision === "cobrador" ? "Cobrador" : "Supervisor"} *</Label>
              <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); setComisionCalculada(0); setDetalle(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {tipoComision === "cobrador"
                    ? cobradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} ({c.porcentaje_comision}%)</SelectItem>)
                    : supervisores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre_completo}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Calculate button */}
            {selectedId && comisionCalculada === 0 && !detalle && (
              <Button onClick={calcularComision} disabled={calculating} className="w-full" variant="outline">
                {calculating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                Calcular
              </Button>
            )}

            {/* Results */}
            {detalle && (
              <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Detalle del Cálculo</p>
                {detalle.split("\n").map((line, i) => (
                  <p key={i} className="text-[13px]">{line}</p>
                ))}
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Comisión a pagar:</span>
                  <span className="text-xl font-bold text-primary">{$$(comisionCalculada)}</span>
                </div>
              </div>
            )}

            {/* Caja selector for payment */}
            {comisionCalculada > 0 && (
              <div>
                <Label>Pagar desde caja *</Label>
                <Select value={cajaId} onValueChange={setCajaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar caja" />
                  </SelectTrigger>
                  <SelectContent>
                    {cajas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{c.nombre}</span>
                          <span className="text-xs text-muted-foreground">{$$(Number(c.saldo_actual || 0))}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetModal}>Cancelar</Button>
            {comisionCalculada > 0 && (
              <Button onClick={handlePagar} disabled={saving || !cajaId}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Pagar {$$(comisionCalculada)}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
