import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, Hash, DollarSign, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function usePromesasAll(empresaId: string) {
  return useQuery({
    queryKey: ["promesas-all", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promesas_pago")
        .select(`*, prestamos!promesas_pago_prestamo_id_fkey ( clientes ( nombre_completo ) )`)
        .eq("empresa_id", empresaId)
        .order("fecha_prometida", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

const statusBadge: Record<string, string> = {
  Pendiente: "bg-warning text-warning-foreground",
  Cumplida: "bg-success text-success-foreground",
  Vencida: "bg-destructive text-destructive-foreground",
  Cancelada: "bg-muted text-muted-foreground",
};

export default function PromesasPage() {
  const { empresaId } = useEmpresa();
  const { data: promesas = [], isLoading } = usePromesasAll(empresaId);

  const totalPromesas = promesas.length;
  const pendientes = promesas.filter((p) => p.status === "Pendiente").length;
  const vencidas = promesas.filter((p) => p.status === "Vencida").length;
  const montoTotal = promesas.reduce((s, p) => s + Number(p.monto_prometido || 0), 0);

  const kpis = [
    { label: "Total Promesas", value: String(totalPromesas), icon: Hash, accent: "text-primary" },
    { label: "Pendientes", value: String(pendientes), icon: CalendarCheck, accent: "text-warning" },
    { label: "Vencidas", value: String(vencidas), icon: AlertTriangle, accent: "text-destructive" },
    { label: "Monto Prometido", value: $$(montoTotal), icon: DollarSign, accent: "text-success" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Promesas de Pago</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card rounded-lg border border-border px-4 py-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
              <k.icon className={cn("h-4 w-4", k.accent)} />
            </div>
            <p className="text-lg font-semibold mt-1">{isLoading ? "—" : k.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header border-b">
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cliente</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Fecha Prometida</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Monto</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Notas</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5} className="px-3 py-3"><Skeleton className="h-4 w-full" /></TableCell></TableRow>
              ))
            ) : promesas.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-[13px]">No hay promesas de pago</TableCell></TableRow>
            ) : promesas.map((p: any) => (
              <TableRow key={p.id} className="border-b border-border/50 hover:bg-table-hover transition-colors">
                <TableCell className="font-medium text-[13px] px-3">{p.prestamos?.clientes?.nombre_completo || "—"}</TableCell>
                <TableCell className="text-[13px] px-3">{p.fecha_prometida}</TableCell>
                <TableCell className="text-right font-semibold text-[13px] px-3">{$$(Number(p.monto_prometido))}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground px-3 max-w-[200px] truncate">{p.notas || "—"}</TableCell>
                <TableCell className="px-3">
                  <Badge className={statusBadge[p.status] || "bg-muted text-muted-foreground"}>{p.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
