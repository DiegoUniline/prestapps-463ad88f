import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Filter, Loader2, Users, FileText } from "lucide-react";
import ClientesBulkImportExport from "@/components/ClientesBulkImportExport";
import { useNavigate } from "react-router-dom";
import { useClientes, useUpdateCliente } from "@/hooks/useClientes";
import { useAtendidos } from "@/hooks/useAtendidos";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc } from "@/lib/supabaseQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginacion, PAGE_SIZE } from "@/hooks/usePaginacion";
import { PaginacionControles } from "@/components/PaginacionControles";
import { toast } from "sonner";

const estadoColors: Record<string, string> = {
  Activo: "bg-success text-success-foreground",
  "En mora": "bg-destructive text-destructive-foreground",
  Bloqueado: "bg-muted text-muted-foreground",
  Inactivo: "bg-muted text-muted-foreground",
};
import { $$ } from "@/lib/utils";
// ── Estado de Cuenta hook ─────────────────────────────────────────
interface EstadoCuenta {
  cliente_id: string;
  id_cliente: string;
  nombre_completo: string;
  saldo_total: number;
  cuotas_vencidas: number;
  saldo_moroso: number;
  cobrador_nombre: string | null;
}

interface EstadosCuentaPagina {
  rows: EstadoCuenta[];
  total: number;
  saldo_total: number;
  saldo_moroso: number;
  cuotas_vencidas: number;
}

// Agregado y paginado en SQL (rpc estados_cuenta_listado): totales sobre todos los filtrados, filas solo de la página.
function useEstadosCuenta(empresaId: string, search: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ["estados-cuenta", empresaId, search, page],
    enabled: !!empresaId && enabled,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await rpc<EstadosCuentaPagina>("estados_cuenta_listado", {
        p_search: search || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return {
        total: Number(data?.total || 0),
        saldo_total: Number(data?.saldo_total || 0),
        saldo_moroso: Number(data?.saldo_moroso || 0),
        cuotas_vencidas: Number(data?.cuotas_vencidas || 0),
        rows: (data?.rows || []).map((e) => ({
          ...e,
          saldo_total: Number(e.saldo_total || 0),
          cuotas_vencidas: Number(e.cuotas_vencidas || 0),
          saldo_moroso: Number(e.saldo_moroso || 0),
        })),
      } as EstadosCuentaPagina;
    },
  });
}

export default function ClientesPage() {
  const [tab, setTab] = useState("listado");
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [searchEC, setSearchEC] = useState("");
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedSearchEC = useDebouncedValue(searchEC, 300);
  const [page, setPage] = usePaginacion(`${empresaId}|${estadoFilter}|${debouncedSearch}`);
  const [pageEC, setPageEC] = usePaginacion(`${empresaId}|${debouncedSearchEC}`);
  const { data: clientesPage, isLoading, isFetching } = useClientes({ search: debouncedSearch, estado: estadoFilter, empresaId, page });
  const clientes = clientesPage?.rows;
  const updateCliente = useUpdateCliente();
  const { data: estadosPage, isLoading: loadingEC, isFetching: fetchingEC } = useEstadosCuenta(empresaId, debouncedSearchEC, pageEC, tab === "estados");
  const clienteIdsPagina = useMemo(() => (clientes || []).map((c) => c.id), [clientes]);
  const { clienteIds: atendidoClienteIds, color: atendidoColor } = useAtendidos(empresaId, { clienteIds: clienteIdsPagina });

  const handleToggleActivo = (e: React.MouseEvent, id: string, activo: boolean) => {
    e.stopPropagation();
    updateCliente.mutate(
      { id, activo: !activo },
      { onSuccess: () => toast.success(`Cliente ${!activo ? "activado" : "desactivado"}`) }
    );
  };

  const filteredEstados = estadosPage?.rows || [];
  const totalDeuda = estadosPage?.saldo_total || 0;
  const totalMoroso = estadosPage?.saldo_moroso || 0;
  const totalVencidas = estadosPage?.cuotas_vencidas || 0;
  const totalEstados = estadosPage?.total || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold">Clientes</h1>
          <div className="flex items-center gap-2">
            <ClientesBulkImportExport />
            <Button size="sm" className="h-8 text-[13px]" onClick={() => navigate("/clientes/nuevo")}>
              <Plus className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Nuevo Cliente</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="listado" className="gap-2">
              <Users className="h-4 w-4" />
              Listado
            </TabsTrigger>
            <TabsTrigger value="estados" className="gap-2">
              <FileText className="h-4 w-4" />
              Estados de Cuenta
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Listado ──────────────────────────────────── */}
          <TabsContent value="listado" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="En mora">En mora</SelectItem>
                  <SelectItem value="Bloqueado">Bloqueado</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header hover:bg-table-header border-b">
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">ID</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Nombre</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Teléfono</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Documento</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Situación</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Estado</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5 text-center">Activo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientes?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron clientes</TableCell>
                      </TableRow>
                    ) : (
                      clientes?.map((c) => (
                        <TableRow key={c.id} className="cursor-pointer border-b border-border/50 hover:bg-table-hover transition-colors" onClick={() => navigate(`/clientes/${c.id}`)}>
                          <TableCell className="font-mono text-[12px] px-3">{c.id_cliente}</TableCell>
                          <TableCell className="font-medium text-[13px] px-3">
                            <div className="flex items-center gap-1.5">
                              {atendidoClienteIds.has(c.id) && (
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: atendidoColor }}
                                  title="Atendido esta semana"
                                />
                              )}
                              {c.nombre_completo}
                            </div>
                          </TableCell>
                          <TableCell className="text-[13px] px-3">{c.telefono || "—"}</TableCell>
                          <TableCell className="text-[13px] px-3">{c.dni || "—"}</TableCell>
                          <TableCell className="text-[13px] px-3">{c.situacion_laboral || "—"}</TableCell>
                          <TableCell className="px-3">
                            <Badge className={estadoColors[c.estado] || "bg-muted text-muted-foreground"}>{c.estado}</Badge>
                          </TableCell>
                          <TableCell className="text-center px-3">
                            <Switch checked={c.activo} onClick={(e) => handleToggleActivo(e, c.id, c.activo)} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {clientes?.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-[13px]">No se encontraron clientes</p>
                ) : (
                  clientes?.map((c) => (
                    <div key={c.id} className="border rounded-lg p-3 cursor-pointer active:bg-muted/50" onClick={() => navigate(`/clientes/${c.id}`)}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {atendidoClienteIds.has(c.id) && (
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: atendidoColor }} />
                            )}
                            <p className="font-medium text-[13px] truncate">{c.nombre_completo}</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{c.id_cliente} · {c.telefono || "Sin tel."}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge className={estadoColors[c.estado] || "bg-muted text-muted-foreground"}>{c.estado}</Badge>
                          <Switch checked={c.activo} onClick={(e) => handleToggleActivo(e, c.id, c.activo)} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <PaginacionControles
                page={page}
                pageSize={PAGE_SIZE}
                total={clientesPage?.total}
                onPageChange={setPage}
                isFetching={isFetching}
              />
              </>
            )}
          </TabsContent>

        {/* ── Tab: Estados de Cuenta ────────────────────────── */}
          <TabsContent value="estados" className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border rounded-lg p-3 md:p-4">
                <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">Deuda Total</p>
                <p className="text-xl md:text-2xl font-bold mt-1">{$$(totalDeuda)}</p>
              </div>
              <div className="border rounded-lg p-3 md:p-4">
                <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">Saldo Moroso</p>
                <p className="text-xl md:text-2xl font-bold mt-1 text-destructive">{$$(totalMoroso)}</p>
              </div>
              <div className="border rounded-lg p-3 md:p-4">
                <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">Cuotas Vencidas</p>
                <p className="text-xl md:text-2xl font-bold mt-1">{totalVencidas}</p>
              </div>
            </div>

            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar cliente..." value={searchEC} onChange={(e) => setSearchEC(e.target.value)} className="pl-9" />
            </div>

            {loadingEC ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header hover:bg-table-header border-b">
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">ID</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cliente</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Saldo Total</TableHead>
                      <TableHead className="text-center text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cuotas Vencidas</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Saldo Moroso</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cobrador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEstados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-[13px]">
                          No hay estados de cuenta
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {filteredEstados.map((ec) => (
                          <TableRow
                            key={ec.cliente_id}
                            className="cursor-pointer border-b border-border/50 hover:bg-table-hover transition-colors"
                            onClick={() => navigate(`/clientes/${ec.cliente_id}`)}
                          >
                            <TableCell className="font-mono text-[12px] px-3">{ec.id_cliente}</TableCell>
                            <TableCell className="font-medium text-[13px] px-3">{ec.nombre_completo}</TableCell>
                            <TableCell className="text-right font-semibold text-[13px] px-3">{$$(ec.saldo_total)}</TableCell>
                            <TableCell className="text-center px-3">
                              {ec.cuotas_vencidas > 0 ? (
                                <Badge variant="destructive">{ec.cuotas_vencidas}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-[13px]">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right px-3">
                              <span className={ec.saldo_moroso > 0 ? "text-destructive font-semibold text-[13px]" : "text-muted-foreground text-[13px]"}>
                                {$$(ec.saldo_moroso)}
                              </span>
                            </TableCell>
                            <TableCell className="text-[13px] px-3">{ec.cobrador_nombre || "—"}</TableCell>
                          </TableRow>
                        ))}
                        {filteredEstados.length > 0 && (
                          <TableRow className="bg-muted/40 border-t-2 border-border font-bold">
                            <TableCell className="px-3 text-[11px] uppercase text-muted-foreground font-bold" colSpan={2}>Totales ({totalEstados})</TableCell>
                            <TableCell className="text-right font-bold text-[13px] px-3">{$$(totalDeuda)}</TableCell>
                            <TableCell className="text-center font-bold text-[13px] px-3">{totalVencidas}</TableCell>
                            <TableCell className="text-right font-bold text-destructive text-[13px] px-3">{$$(totalMoroso)}</TableCell>
                            <TableCell className="px-3" />
                          </TableRow>
                        )}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            <PaginacionControles
              page={pageEC}
              pageSize={PAGE_SIZE}
              total={estadosPage?.total}
              onPageChange={setPageEC}
              isFetching={fetchingEC}
            />
          </TabsContent>
        </Tabs>
    </div>
  );
}
