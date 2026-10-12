import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { rpc } from "@/lib/supabaseQuery";
import { usePaginacion, pageRange, PAGE_SIZE } from "@/hooks/usePaginacion";
import { PaginacionControles } from "@/components/PaginacionControles";
import { TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, $$, fmtDate } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

// ── Préstamos Tab ─────────────────────────────────────────────
function useCajaPrestamos(cajaId: string, page: number) {
  const { empresaId } = useEmpresa();
  return useQuery({
    queryKey: ["caja-prestamos-source", cajaId, page, empresaId],
    enabled: !!cajaId && !!empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, to] = pageRange(page);
      const { data, error } = await supabase
        .from("prestamos")
        .select("id, id_prestamo, monto_solicitado, monto_total_pagar, estado, created_at, cliente_id, clientes(nombre_completo)")
        .eq("caja_id", cajaId)
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data || [];
    },
  });
}

// Totales de una pestaña (todas las filas de la caja) calculados en SQL: rpc caja_fuentes_resumen.
function useCajaFuenteResumen<T>(cajaId: string, fuente: "prestamos" | "pagos" | "transferencias", keyPrefix: string) {
  return useQuery({
    queryKey: [keyPrefix, cajaId, "resumen"],
    enabled: !!cajaId,
    queryFn: async () => {
      const { data, error } = await rpc<Record<string, number | string>>("caja_fuentes_resumen", { p_caja_id: cajaId, p_fuente: fuente });
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(data || {})) out[k] = Number(v || 0);
      return out as T;
    },
  });
}

export function PrestamosTab({ cajaId }: { cajaId: string }) {
  const [page, setPage] = usePaginacion(cajaId);
  const { data: prestamos = [], isLoading, isFetching } = useCajaPrestamos(cajaId, page);
  const { data: resumen, isLoading: loadingResumen } = useCajaFuenteResumen<{ count: number; colocado: number; totalPagar: number; cancelados: number }>(cajaId, "prestamos", "caja-prestamos-source");
  const navigate = useNavigate();
  const totals = resumen || { colocado: 0, totalPagar: 0, count: 0, cancelados: 0 };

  if (isLoading || loadingResumen) return <div className="space-y-2 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (totals.count === 0) return <p className="text-center py-12 text-muted-foreground text-sm mt-4">Sin préstamos en esta caja</p>;

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
                <p className="text-[11px] text-muted-foreground">{p.created_at ? fmtDate(p.created_at, "dd/MM/yy") : "—"}</p>
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
                <TableCell className="text-[12px] px-3 whitespace-nowrap">{p.created_at ? fmtDate(p.created_at, "dd/MM/yy") : "—"}</TableCell>
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
      <PaginacionControles page={page} pageSize={PAGE_SIZE} total={totals.count} onPageChange={setPage} isFetching={isFetching} />
    </div>
  );
}

// ── Pagos Tab ─────────────────────────────────────────────────
function useCajaPagos(cajaId: string, page: number) {
  const { empresaId } = useEmpresa();
  return useQuery({
    queryKey: ["caja-pagos-source", cajaId, page, empresaId],
    enabled: !!cajaId && !!empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, to] = pageRange(page);
      const { data, error } = await supabase
        .from("pagos")
        .select("id, monto_recibido, fecha_pago, created_at, anulado, metodo_pago, prestamo_id, prestamos(id_prestamo, clientes(nombre_completo))")
        .eq("caja_id", cajaId)
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data || [];
    },
  });
}

export function PagosTab({ cajaId }: { cajaId: string }) {
  const [page, setPage] = usePaginacion(cajaId);
  const { data: pagos = [], isLoading, isFetching } = useCajaPagos(cajaId, page);
  const { data: resumen, isLoading: loadingResumen } = useCajaFuenteResumen<{ count: number; cobrado: number; anulados: number }>(cajaId, "pagos", "caja-pagos-source");
  const totals = resumen || { cobrado: 0, anulados: 0, count: 0 };

  if (isLoading || loadingResumen) return <div className="space-y-2 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (totals.count === 0) return <p className="text-center py-12 text-muted-foreground text-sm mt-4">Sin pagos en esta caja</p>;

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
                    {p.fecha_pago ? fmtDate(p.fecha_pago, "dd/MM/yy") : "—"}
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
                  <TableCell className="text-[12px] px-3 whitespace-nowrap">{p.fecha_pago ? fmtDate(p.fecha_pago, "dd/MM/yy") : "—"}</TableCell>
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
      <PaginacionControles page={page} pageSize={PAGE_SIZE} total={totals.count} onPageChange={setPage} isFetching={isFetching} />
    </div>
  );
}

// ── Transferencias Tab ────────────────────────────────────────
function useCajaTransferencias(cajaId: string, page: number) {
  const { empresaId } = useEmpresa();
  return useQuery({
    queryKey: ["caja-transferencias-source", cajaId, page, empresaId],
    enabled: !!cajaId && !!empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, to] = pageRange(page);
      const { data, error } = await supabase
        .from("movimientos_caja")
        .select("id, created_at, tipo, monto, concepto")
        .eq("caja_id", cajaId)
        .eq("empresa_id", empresaId)
        .is("prestamo_id", null)
        .ilike("concepto", "%transferencia%")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data || [];
    },
  });
}

export function TransferenciasTab({ cajaId }: { cajaId: string }) {
  const [page, setPage] = usePaginacion(cajaId);
  const { data: rows = [], isLoading, isFetching } = useCajaTransferencias(cajaId, page);
  const { data: resumen, isLoading: loadingResumen } = useCajaFuenteResumen<{ count: number; recibidas: number; enviadas: number }>(cajaId, "transferencias", "caja-transferencias-source");
  const totals = resumen || { recibidas: 0, enviadas: 0, count: 0 };

  if (isLoading || loadingResumen) return <div className="space-y-2 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (totals.count === 0) return <p className="text-center py-12 text-muted-foreground text-sm mt-4">Sin transferencias en esta caja</p>;

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
                  {r.created_at ? fmtDate(r.created_at, "dd/MM/yy HH:mm") : "—"}
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
                <TableCell className="text-[12px] px-3 whitespace-nowrap">{r.created_at ? fmtDate(r.created_at, "dd/MM/yy HH:mm") : "—"}</TableCell>
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
      <PaginacionControles page={page} pageSize={PAGE_SIZE} total={totals.count} onPageChange={setPage} isFetching={isFetching} />
    </div>
  );
}
