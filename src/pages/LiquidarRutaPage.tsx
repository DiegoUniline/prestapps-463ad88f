import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Wallet, HandCoins, Receipt, CreditCard, Loader2, UserCheck,
  ArrowDownToLine, MinusCircle, Plus, ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Cobrador {
  id: string;
  nombre: string;
  telefono: string | null;
  porcentaje_comision: number;
  efectivo_en_mano: number;
  activo: boolean;
}

function useCobradores(empresaId: string) {
  return useQuery({
    queryKey: ["cobradores", empresaId],
    queryFn: async () => {
      // Get users with cobrador role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "cobrador");
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nombre_completo, telefono, porcentaje_comision, efectivo_en_mano, activo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .in("id", userIds)
        .order("nombre_completo");
      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id,
        nombre: p.nombre_completo,
        telefono: p.telefono,
        porcentaje_comision: Number(p.porcentaje_comision || 0),
        efectivo_en_mano: Number(p.efectivo_en_mano || 0),
        activo: p.activo,
      })) as Cobrador[];
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

function useLiquidaciones(empresaId: string) {
  return useQuery({
    queryKey: ["liquidaciones", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cortes")
        .select("*, cajas ( nombre )")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (!data?.length) return [];

      // Get cobrador names from profiles
      const cobIds = [...new Set(data.map((d: any) => d.cobrador_id).filter(Boolean))];
      let cobMap: Record<string, string> = {};
      if (cobIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nombre_completo")
          .in("id", cobIds);
        for (const p of profiles || []) cobMap[p.id] = p.nombre_completo;
      }

      return data.map((l: any) => ({ ...l, cobrador_nombre: cobMap[l.cobrador_id] || "—" }));
    },
  });
}

type ModalType = "depositar" | "gasto" | "prestamo_entregado" | null;

export default function LiquidarRutaPage() {
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();
  const { data: cobradores = [], isLoading } = useCobradores(empresaId);
  const { data: cajas = [] } = useCajas(empresaId);
  const { data: liquidaciones = [] } = useLiquidaciones(empresaId);

  const [selectedCobrador, setSelectedCobrador] = useState<Cobrador | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [monto, setMonto] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [concepto, setConcepto] = useState("");
  const [saving, setSaving] = useState(false);

  const totalEfectivo = cobradores.reduce((s, c) => s + c.efectivo_en_mano, 0);

  const resetModal = () => {
    setModal(null);
    setMonto("");
    setCajaId(cajas[0]?.id || "");
    setConcepto("");
  };

  const openModal = (cobrador: Cobrador, tipo: ModalType) => {
    setSelectedCobrador(cobrador);
    setCajaId(cajas[0]?.id || "");
    setModal(tipo);
  };

  const handleDepositar = async () => {
    if (!selectedCobrador || !cajaId) return;
    const montoNum = parseFloat(monto) || 0;
    if (montoNum <= 0) return toast.error("Ingresa un monto válido");
    if (montoNum > selectedCobrador.efectivo_en_mano) return toast.error("El monto excede el efectivo en mano");

    setSaving(true);
    try {
      // 1) Reduce cobrador efectivo in profiles
      await supabase.from("profiles")
        .update({ efectivo_en_mano: selectedCobrador.efectivo_en_mano - montoNum })
        .eq("id", selectedCobrador.id);

      // 2) Increase caja balance
      const { data: cajaData } = await supabase.from("cajas").select("saldo_actual").eq("id", cajaId).single();
      await supabase.from("cajas").update({ saldo_actual: (Number(cajaData?.saldo_actual) || 0) + montoNum }).eq("id", cajaId);

      // 3) Register movimiento_caja
      await supabase.from("movimientos_caja").insert({
        caja_id: cajaId,
        tipo: "entrada" as any,
        monto: montoNum,
        concepto: `Depósito cobrador ${selectedCobrador.nombre}`,
        empresa_id: empresaId,
      });

      // 4) Register corte
      const comision = montoNum * (selectedCobrador.porcentaje_comision / 100);
      await supabase.from("cortes").insert({
        cobrador_id: selectedCobrador.id,
        caja_id: cajaId,
        total_cobrado: montoNum,
        monto_efectivo: selectedCobrador.efectivo_en_mano,
        monto_depositado: montoNum,
        monto_comision: comision,
        porcentaje_usado: selectedCobrador.porcentaje_comision,
        empresa_id: empresaId,
        periodo_desde: new Date().toISOString(),
        periodo_hasta: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ["cobradores"] });
      queryClient.invalidateQueries({ queryKey: ["cajas-all"] });
      queryClient.invalidateQueries({ queryKey: ["liquidaciones"] });
      toast.success(`Depósito de ${$$(montoNum)} registrado. Comisión: ${$$(comision)}`);
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleGasto = async () => {
    if (!selectedCobrador) return;
    const montoNum = parseFloat(monto) || 0;
    if (montoNum <= 0) return toast.error("Ingresa un monto válido");
    if (montoNum > selectedCobrador.efectivo_en_mano) return toast.error("El monto excede el efectivo en mano");
    if (!concepto.trim()) return toast.error("Ingresa un concepto");

    setSaving(true);
    try {
      // Reduce cobrador efectivo in profiles
      await supabase.from("profiles")
        .update({ efectivo_en_mano: selectedCobrador.efectivo_en_mano - montoNum })
        .eq("id", selectedCobrador.id);

      const targetCaja = cajaId || cajas[0]?.id;
      if (targetCaja) {
        await supabase.from("movimientos_caja").insert({
          caja_id: targetCaja,
          tipo: "salida" as any,
          monto: montoNum,
          concepto: `Gasto cobrador ${selectedCobrador.nombre}: ${concepto}`,
          empresa_id: empresaId,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["cobradores"] });
      toast.success(`Gasto de ${$$(montoNum)} registrado para ${selectedCobrador.nombre}`);
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handlePrestamoEntregado = async () => {
    if (!selectedCobrador) return;
    const montoNum = parseFloat(monto) || 0;
    if (montoNum <= 0) return toast.error("Ingresa un monto válido");
    if (montoNum > selectedCobrador.efectivo_en_mano) return toast.error("El monto excede el efectivo en mano");

    setSaving(true);
    try {
      await supabase.from("profiles")
        .update({ efectivo_en_mano: selectedCobrador.efectivo_en_mano - montoNum })
        .eq("id", selectedCobrador.id);

      const targetCaja = cajaId || cajas[0]?.id;
      if (targetCaja) {
        await supabase.from("movimientos_caja").insert({
          caja_id: targetCaja,
          tipo: "salida" as any,
          monto: montoNum,
          concepto: `Préstamo entregado en ruta por ${selectedCobrador.nombre}${concepto ? `: ${concepto}` : ""}`,
          empresa_id: empresaId,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["cobradores"] });
      toast.success(`Préstamo entregado de ${$$(montoNum)} registrado`);
      resetModal();
    } catch (err: any) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    if (modal === "depositar") handleDepositar();
    else if (modal === "gasto") handleGasto();
    else if (modal === "prestamo_entregado") handlePrestamoEntregado();
  };

  const modalConfig = {
    depositar: { title: "Depositar a Caja", icon: ArrowDownToLine, showCaja: true, submitLabel: "Depositar", conceptoLabel: "" },
    gasto: { title: "Registrar Gasto de Ruta", icon: MinusCircle, showCaja: false, submitLabel: "Registrar Gasto", conceptoLabel: "Concepto del gasto *" },
    prestamo_entregado: { title: "Préstamo Entregado en Ruta", icon: CreditCard, showCaja: false, submitLabel: "Registrar", conceptoLabel: "Cliente / Referencia" },
  };

  const cfg = modal ? modalConfig[modal] : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          Liquidar Ruta
        </h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Cobradores Activos</p>
              <p className="text-xl font-bold">{cobradores.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Total Efectivo en Calle</p>
              <p className="text-xl font-bold">{$$(totalEfectivo)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
              <Receipt className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Liquidaciones Hoy</p>
              <p className="text-xl font-bold">
                {liquidaciones.filter((l: any) => new Date(l.created_at).toDateString() === new Date().toDateString()).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Cobradores con saldo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobradores con Efectivo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <div className="h-10 bg-muted rounded animate-pulse" />
              <div className="h-10 bg-muted rounded animate-pulse" />
            </div>
          ) : cobradores.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No hay cobradores activos</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Cobrador</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Efectivo en Mano</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Comisión (%)</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobradores.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-[13px] font-medium">{c.nombre}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "text-[13px] font-semibold",
                        c.efectivo_en_mano > 0 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {$$(c.efectivo_en_mano)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-[13px]">{c.porcentaje_comision}%</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button size="sm" variant="default" className="h-7 text-[11px] px-2.5" disabled={c.efectivo_en_mano <= 0} onClick={() => openModal(c, "depositar")}>
                          <ArrowDownToLine className="h-3 w-3 mr-1" />Depositar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5" disabled={c.efectivo_en_mano <= 0} onClick={() => openModal(c, "gasto")}>
                          <MinusCircle className="h-3 w-3 mr-1" />Gasto
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5" disabled={c.efectivo_en_mano <= 0} onClick={() => openModal(c, "prestamo_entregado")}>
                          <CreditCard className="h-3 w-3 mr-1" />Préstamo
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Historial de liquidaciones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de Liquidaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {liquidaciones.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No hay liquidaciones registradas</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Fecha</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Cobrador</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Depositado</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-right">Comisión</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Caja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidaciones.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-[12px]">{format(new Date(l.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="text-[13px] font-medium">{l.cobrador_nombre || "—"}</TableCell>
                    <TableCell className="text-right text-[13px] font-semibold">{$$(l.monto_depositado)}</TableCell>
                    <TableCell className="text-right text-[13px]">{$$(l.monto_comision)}</TableCell>
                    <TableCell className="text-[12px]">{l.cajas?.nombre || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal for all actions */}
      <Dialog open={!!modal} onOpenChange={(o) => !o && resetModal()}>
        <DialogContent className="sm:max-w-[420px]">
          {cfg && selectedCobrador && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <cfg.icon className="h-4 w-4 text-primary" />
                  {cfg.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="bg-secondary rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">Cobrador</p>
                    <p className="font-semibold text-sm">{selectedCobrador.nombre}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground uppercase">Efectivo en Mano</p>
                    <p className="font-semibold text-sm text-destructive">{$$(selectedCobrador.efectivo_en_mano)}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Monto ($)</Label>
                  <Input
                    type="number" step="0.01" min="0" max={selectedCobrador.efectivo_en_mano}
                    placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)}
                    className="mt-1 h-9 text-[13px]" autoFocus
                  />
                  {modal === "depositar" && (
                    <Button variant="link" className="text-[11px] p-0 h-auto mt-1"
                      onClick={() => setMonto(selectedCobrador.efectivo_en_mano.toFixed(2))}>
                      Depositar todo ({$$(selectedCobrador.efectivo_en_mano)})
                    </Button>
                  )}
                </div>

                {cfg.showCaja && (
                  <div>
                    <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">Caja Destino</Label>
                    <Select value={cajaId} onValueChange={setCajaId}>
                      <SelectTrigger className="mt-1 h-9 text-[13px]"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {cajas.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {cfg.conceptoLabel && (
                  <div>
                    <Label className="text-[12px] uppercase tracking-wider text-muted-foreground">{cfg.conceptoLabel}</Label>
                    <Textarea value={concepto} onChange={(e) => setConcepto(e.target.value)}
                      className="mt-1 text-[13px] min-h-[60px]"
                      placeholder={modal === "gasto" ? "Ej: Gasolina, comida, taxi..." : "Ej: Cliente Juan Pérez, préstamo rápido..."} />
                  </div>
                )}

                {modal === "depositar" && parseFloat(monto) > 0 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 text-[12px] space-y-1">
                    <div className="flex justify-between">
                      <span>Monto a depositar:</span>
                      <span className="font-semibold">{$$(parseFloat(monto) || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Comisión ({selectedCobrador.porcentaje_comision}%):</span>
                      <span className="font-semibold text-primary">
                        {$$((parseFloat(monto) || 0) * selectedCobrador.porcentaje_comision / 100)}
                      </span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between font-semibold">
                      <span>Saldo restante:</span>
                      <span>{$$(selectedCobrador.efectivo_en_mano - (parseFloat(monto) || 0))}</span>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" size="sm" onClick={resetModal} disabled={saving}>Cancelar</Button>
                <Button size="sm" onClick={handleSubmit} disabled={saving || !monto || parseFloat(monto) <= 0}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <cfg.icon className="h-3.5 w-3.5 mr-1.5" />}
                  {saving ? "Procesando..." : cfg.submitLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
