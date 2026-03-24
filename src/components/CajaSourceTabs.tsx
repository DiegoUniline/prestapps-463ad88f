import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, $$ } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

// ── Préstamos Tab ─────────────────────────────────────────────
function useCajaPrestamos(cajaId: string) {
  return useQuery({
    queryKey: ["caja-prestamos-source", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("prestamos")
        .select("id, id_prestamo, monto_solicitado, monto_total_pagar, estado, created_at, cliente_id, clientes(nombre_completo)")
        .eq("caja_id", cajaId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });
}

export function PrestamosTab({ cajaId }: { cajaId: string }) {
  const { data: prestamos = [], isLoading } = useCajaPrestamos(cajaId);
  const navigate = useNavigate();

  const totals = useMemo(() => {
    let colocado = 0, totalPagar = 0, cancelados = 0;
    for (const p of prestamos) {
      if (p.estado === "Cancelado") { cancelados++; continue; }
      colocado += Number(p.monto_solicitado || 0);
      totalPagar += Number(p.monto_total_pagar || 0);
    }
    return { colocado, totalPagar, count: prestamos.length, cancelados };
  }, [prestamos]);

  if (isLoading) return <div className="space-y-2 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (prestamos.length === 0) return <p className="text-center py-12 text-muted-foreground text-sm mt-4">Sin préstamos en esta caja</p>;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-4 text-[12px] px-1">
        <span className="text-muted-foreground">{totals.count} préstamos</span>
        <span className="font-medium">Colocado: {$$(totals.colocado)}</span>
        <span className="font-medium">Total a Pagar: {$$(totals.totalPagar)}</span>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-border bg-card rounded-lg border">
        {prestamos.map(p => (
          <div key={p.id} className="px-4 py-3 cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/prestamos/${p.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{p.id_prestamo}</p>
                <p className="text-[11px] text-muted-foreground truncate">{(p.clientes as any)?.nombre_completo || "—"}</p>
                <p className="text-[11px] text-muted-foreground">{p.created_at ? format(new Date(p.created_at), "dd/MM/yy", { locale: es }) : "—"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-semibold text-destructive">-{$$(Number(p.monto_solicitado || 0))}</p>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                  p.estado === "Activo" ? "bg-primary/10 text-primary" :
                  p.estado === "Liquidado" ? "bg-success/10 text-success" :
                  p.estado === "Vencido" ? "bg-destructive/10 text-destructive" :
                  "bg-muted text-muted-foreground"
                )}>{p.estado}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="px-4 py-3 bg-muted/50 border-t-2 border-border flex items-center justify-between font-bold text-[13px]">
          <span>Totales</span>
          <span className="text-destructive">Desembolsos: {$$(totals.colocado)}</span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Fecha</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Préstamo</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Cliente</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Estado</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Desembolso</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Total a Pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prestamos.map(p => (
              <TableRow key={p.id} className="border-b border-border/50 cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/prestamos/${p.id}`)}>
                <TableCell className="text-[12px] px-3 whitespace-nowrap">{p.created_at ? format(new Date(p.created_at), "dd/MM/yy", { locale: es }) : "—"}</TableCell>
                <TableCell className="text-[13px] px-3 font-medium">{p.id_prestamo}</TableCell>
                <TableCell className="text-[13px] px-3 max-w-[200px] truncate">{(p.clientes as any)?.nombre_completo || "—"}</TableCell>
                <TableCell className="text-[12px] px-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium",
                    p.estado === "Activo" ? "bg-primary/10 text-primary" :
                    p.estado === "Liquidado" ? "bg-success/10 text-success" :
                    p.estado === "Vencido" ? "bg-destructive/10 text-destructive" :
                    p.estado === "Cancelado" ? "bg-muted text-muted-foreground" :
                    "bg-muted text-muted-foreground"
                  )}>{p.estado}</span>
                </TableCell>
                <TableCell className="text-right text-[13px] px-3 text-destructive font-medium">{$$(Number(p.monto_solicitado || 0))}</TableCell>
                <TableCell className="text-right text-[13px] px-3 font-medium">{$$(Number(p.monto_total_pagar || 0))}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 border-t-2 border-border font-bold">
              <TableCell className="px-3 text-[12px]" colSpan={4}>Totales</TableCell>
              <TableCell className="text-right text-[13px] px-3 text-destructive font-bold">{$$(totals.colocado)}</TableCell>
              <TableCell className="text-right text-[13px] px-3 font-bold">{$$(totals.totalPagar)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Pagos Tab ─────────────────────────────────────────────────
function useCajaPagos(cajaId: string) {
  return useQuery({
    queryKey: ["caja-pagos-source", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const data = await fetchAllRows(
        supabase
          .from("pagos")
          .select("id, monto_recibido, fecha_pago, created_at, anulado, metodo_pago, prestamo_id, prestamos(id_prestamo, clientes(nombre_completo))")
          .eq("caja_id", cajaId)
          .order("created_at", { ascending: false })
      );
      return data || [];
    },
  });
}

export function PagosTab({ cajaId }: { cajaId: string }) {
  const { data: pagos = [], isLoading } = useCajaPagos(cajaId);

  const totals = useMemo(() => {
    let cobrado = 0, anulados = 0;
    for (const p of pagos) {
      if (p.anulado) { anulados += Number(p.monto_recibido || 0); continue; }
      cobrado += Number(p.monto_recibido || 0);
    }
    return { cobrado, anulados, count: pagos.length };
  }, [pagos]);

  if (isLoading) return <div className="space-y-2 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (pagos.length === 0) return <p className="text-center py-12 text-muted-foreground text-sm mt-4">Sin pagos en esta caja</p>;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-4 text-[12px] px-1">
        <span className="text-muted-foreground">{totals.count} pagos</span>
        <span className="text-success font-medium">Cobrado: +{$$(totals.cobrado)}</span>
        {totals.anulados > 0 && <span className="text-destructive font-medium">Anulados: {$$(totals.anulados)}</span>}
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-border bg-card rounded-lg border">
        {pagos.map(p => {
          const prestamo = p.prestamos as any;
          return (
            <div key={p.id} className={cn("px-4 py-3", p.anulado && "opacity-50")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{prestamo?.id_prestamo || "—"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{prestamo?.clientes?.nombre_completo || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.fecha_pago ? format(new Date(p.fecha_pago), "dd/MM/yy", { locale: es }) : "—"}
                    {p.metodo_pago && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{p.metodo_pago}</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("text-[13px] font-semibold", p.anulado ? "text-muted-foreground line-through" : "text-success")}>
                    +{$$(Number(p.monto_recibido || 0))}
                  </p>
                  {p.anulado && <span className="text-[10px] text-destructive font-medium">ANULADO</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div className="px-4 py-3 bg-muted/50 border-t-2 border-border flex items-center justify-between font-bold text-[13px]">
          <span>Total Cobrado</span>
          <span className="text-success">+{$$(totals.cobrado)}</span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Fecha</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Préstamo</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Cliente</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Método</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Estado</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagos.map(p => {
              const prestamo = p.prestamos as any;
              return (
                <TableRow key={p.id} className={cn("border-b border-border/50", p.anulado && "opacity-50")}>
                  <TableCell className="text-[12px] px-3 whitespace-nowrap">{p.fecha_pago ? format(new Date(p.fecha_pago), "dd/MM/yy", { locale: es }) : "—"}</TableCell>
                  <TableCell className="text-[13px] px-3 font-medium">{prestamo?.id_prestamo || "—"}</TableCell>
                  <TableCell className="text-[13px] px-3 max-w-[200px] truncate">{prestamo?.clientes?.nombre_completo || "—"}</TableCell>
                  <TableCell className="text-[12px] px-3">{p.metodo_pago || "—"}</TableCell>
                  <TableCell className="text-[12px] px-3">
                    {p.anulado ? (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-medium">Anulado</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium">Válido</span>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right text-[13px] px-3 font-medium", p.anulado ? "text-muted-foreground line-through" : "text-success")}>
                    +{$$(Number(p.monto_recibido || 0))}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/50 border-t-2 border-border font-bold">
              <TableCell className="px-3 text-[12px]" colSpan={5}>Total Cobrado (sin anulados)</TableCell>
              <TableCell className="text-right text-[13px] px-3 text-success font-bold">+{$$(totals.cobrado)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Transferencias Tab ────────────────────────────────────────
function useCajaTransferencias(cajaId: string) {
  return useQuery({
    queryKey: ["caja-transferencias-source", cajaId],
    enabled: !!cajaId,
    queryFn: async () => {
      const data = await fetchAllRows(
        supabase
          .from("movimientos_caja")
          .select("id, created_at, tipo, monto, concepto")
          .eq("caja_id", cajaId)
          .is("prestamo_id", null)
          .ilike("concepto", "%transferencia%")
          .order("created_at", { ascending: false })
      );
      return data || [];
    },
  });
}

export function TransferenciasTab({ cajaId }: { cajaId: string }) {
  const { data: rows = [], isLoading } = useCajaTransferencias(cajaId);

  const totals = useMemo(() => {
    let recibidas = 0, enviadas = 0;
    for (const r of rows) {
      if (r.tipo === "entrada") recibidas += Number(r.monto || 0);
      else enviadas += Number(r.monto || 0);
    }
    return { recibidas, enviadas, count: rows.length };
  }, [rows]);

  if (isLoading) return <div className="space-y-2 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (rows.length === 0) return <p className="text-center py-12 text-muted-foreground text-sm mt-4">Sin transferencias en esta caja</p>;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-4 text-[12px] px-1">
        <span className="text-muted-foreground">{totals.count} transferencias</span>
        <span className="text-success font-medium">Recibidas: +{$$(totals.recibidas)}</span>
        <span className="text-destructive font-medium">Enviadas: -{$$(totals.enviadas)}</span>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-border bg-card rounded-lg border">
        {rows.map(r => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate">{r.concepto || "Transferencia"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {r.created_at ? format(new Date(r.created_at), "dd/MM/yy HH:mm", { locale: es }) : "—"}
                </p>
              </div>
              <p className={cn("text-[13px] font-semibold shrink-0", r.tipo === "entrada" ? "text-success" : "text-destructive")}>
                {r.tipo === "entrada" ? "+" : "-"}{$$(Number(r.monto || 0))}
              </p>
            </div>
          </div>
        ))}
        <div className="px-4 py-3 bg-muted/50 border-t-2 border-border font-bold text-[13px]">
          <div className="flex items-center justify-between">
            <span>Totales</span>
            <div className="flex gap-4">
              <span className="text-success">+{$$(totals.recibidas)}</span>
              <span className="text-destructive">-{$$(totals.enviadas)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Fecha</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3">Concepto</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Recibida</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold px-3 text-right">Enviada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id} className="border-b border-border/50">
                <TableCell className="text-[12px] px-3 whitespace-nowrap">{r.created_at ? format(new Date(r.created_at), "dd/MM/yy HH:mm", { locale: es }) : "—"}</TableCell>
                <TableCell className="text-[13px] px-3 max-w-[300px] truncate">{r.concepto || "Transferencia"}</TableCell>
                <TableCell className="text-right text-[13px] px-3 text-success font-medium">{r.tipo === "entrada" ? $$(Number(r.monto || 0)) : ""}</TableCell>
                <TableCell className="text-right text-[13px] px-3 text-destructive font-medium">{r.tipo === "salida" ? $$(Number(r.monto || 0)) : ""}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 border-t-2 border-border font-bold">
              <TableCell className="px-3 text-[12px]" colSpan={2}>Totales</TableCell>
              <TableCell className="text-right text-[13px] px-3 text-success font-bold">{$$(totals.recibidas)}</TableCell>
              <TableCell className="text-right text-[13px] px-3 text-destructive font-bold">{$$(totals.enviadas)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
