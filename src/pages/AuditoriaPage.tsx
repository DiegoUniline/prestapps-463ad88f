import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc } from "@/lib/supabaseQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginacion, PAGE_SIZE } from "@/hooks/usePaginacion";
import { PaginacionControles } from "@/components/PaginacionControles";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$, fmtDate } from "@/lib/utils";
import { type LucideIcon, ScrollText, Search, HandCoins, XCircle, CreditCard, CalendarCheck, MapPin, MessageSquare } from "lucide-react";
interface AuditEntry {
  id: string;
  tipo: string;
  accion: string;
  descripcion: string;
  usuario: string;
  fecha: string;
  monto?: number;
  icono: LucideIcon;
  color: string;
}

interface AuditRow {
  id: string;
  tipo: "pago" | "anulacion" | "gestion" | "promesa";
  fecha: string | null;
  monto: number | null;
  cliente: string | null;
  detalle: string | null;
  usuario: string;
  accion: string;
  tipo_gestion: string | null;
  fecha_prometida: string | null;
  status: string | null;
}

function toEntry(r: AuditRow): AuditEntry {
  const cliente = r.cliente || "—";
  switch (r.tipo) {
    case "pago":
      return { id: `pago-${r.id}`, tipo: "pago", accion: r.accion, descripcion: `${cliente} — ${$$(r.monto)}`, usuario: r.usuario, fecha: r.fecha || "", monto: Number(r.monto || 0), icono: HandCoins, color: "text-success" };
    case "anulacion":
      return { id: `anulacion-${r.id}`, tipo: "anulacion", accion: r.accion, descripcion: `${cliente} — ${$$(r.monto)}${r.detalle ? ` • ${r.detalle}` : ""}`, usuario: r.usuario, fecha: r.fecha || "", monto: Number(r.monto || 0), icono: XCircle, color: "text-destructive" };
    case "gestion":
      return { id: `gestion-${r.id}`, tipo: "gestion", accion: r.accion, descripcion: `${cliente}${r.detalle ? ` — ${r.detalle}` : ""}`, usuario: r.usuario, fecha: r.fecha || "", icono: r.tipo_gestion === "visita" ? MapPin : r.tipo_gestion === "whatsapp" ? MessageSquare : CreditCard, color: "text-primary" };
    default:
      return { id: `promesa-${r.id}`, tipo: "promesa", accion: r.accion, descripcion: `${$$(r.monto)} para ${r.fecha_prometida} — ${r.status}`, usuario: r.usuario, fecha: r.fecha || "", monto: Number(r.monto || 0), icono: CalendarCheck, color: "text-purple-500" };
  }
}

export default function AuditoriaPage() {
  const { empresaId } = useEmpresa();
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = usePaginacion(`${empresaId}|${filtroTipo}|${debouncedSearch}`);

  // KPIs: conteos por tipo en SQL
  const { data: resumen } = useQuery({
    queryKey: ["audit-resumen", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await rpc<{ total: number; pagos: number; anulaciones: number; gestiones: number; promesas: number }>("auditoria_resumen");
      if (error) throw error;
      return data;
    },
  });

  // Bitácora paginada (pagos, anulaciones, gestiones, promesas) unificada y ordenada en SQL
  const { data: listado, isLoading, isFetching } = useQuery({
    queryKey: ["audit-listado", empresaId, filtroTipo, debouncedSearch, page],
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await rpc<{ rows: AuditRow[]; has_more: boolean }>("auditoria_listado", {
        p_tipo: filtroTipo === "todos" ? null : filtroTipo,
        p_search: debouncedSearch || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return { rows: (data?.rows || []).map(toEntry), hasMore: !!data?.has_more };
    },
  });

  const filtered = listado?.rows || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" />
          Auditoría y Bitácora
        </h1>
        <p className="text-muted-foreground text-sm">Registro completo de actividades del sistema</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p><p className="text-xl font-bold">{resumen?.total ?? 0}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pagos</p><p className="text-xl font-bold text-success">{resumen?.pagos ?? 0}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Anulaciones</p><p className="text-xl font-bold text-destructive">{resumen?.anulaciones ?? 0}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gestiones</p><p className="text-xl font-bold text-primary">{resumen?.gestiones ?? 0}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Promesas</p><p className="text-xl font-bold">{resumen?.promesas ?? 0}</p></Card>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
            <SelectItem value="anulacion">Anulaciones</SelectItem>
            <SelectItem value="gestion">Gestiones</SelectItem>
            <SelectItem value="promesa">Promesas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <>
          {/* MOBILE Cards */}
          <div className="md:hidden space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-[13px]">Sin registros</p>
            ) : filtered.map((e) => {
              const Icon = e.icono;
              return (
                <div key={e.id} className="bg-card rounded-lg border border-border p-3 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
                  <div className="flex items-start gap-2">
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", e.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px]">{e.accion}</Badge>
                        <span className="text-[10px] text-muted-foreground">{e.fecha ? fmtDate(e.fecha, "dd/MM HH:mm") : "—"}</span>
                      </div>
                      <p className="text-[12px] mt-1 truncate">{e.descripcion}</p>
                      <p className="text-[10px] text-muted-foreground">por {e.usuario}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP Table */}
          <Card className="hidden md:block">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-8"></TableHead>
                    <TableHead className="text-xs">Fecha/Hora</TableHead>
                    <TableHead className="text-xs">Acción</TableHead>
                    <TableHead className="text-xs">Descripción</TableHead>
                    <TableHead className="text-xs">Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(e => {
                    const Icon = e.icono;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="px-3"><Icon className={cn("h-4 w-4", e.color)} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {e.fecha ? fmtDate(e.fecha, "dd/MM/yy HH:mm") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{e.accion}</Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[300px] truncate">{e.descripcion}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.usuario}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin registros</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
          <PaginacionControles
            page={page}
            pageSize={PAGE_SIZE}
            hasMore={listado?.hasMore}
            rowsOnPage={filtered.length}
            onPageChange={setPage}
            isFetching={isFetching}
          />
        </>
      )}
      </div>
  );
}
