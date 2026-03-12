import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Filter, Loader2, Users, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useClientes, useUpdateCliente } from "@/hooks/useClientes";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const estadoColors: Record<string, string> = {
  Activo: "bg-success text-success-foreground",
  "En mora": "bg-destructive text-destructive-foreground",
  Bloqueado: "bg-muted text-muted-foreground",
  Inactivo: "bg-muted text-muted-foreground",
};

const $$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

function useEstadosCuenta() {
  return useQuery({
    queryKey: ["estados-cuenta"],
    queryFn: async () => {
      // 1. All clients
      const { data: clientes, error: cErr } = await supabase
        .from("clientes")
        .select("id, id_cliente, nombre_completo")
        .eq("activo", true)
        .order("nombre_completo");
      if (cErr) throw cErr;

      // 2. All active loans with cobrador
      const { data: prestamos, error: pErr } = await supabase
        .from("prestamos")
        .select("id, cliente_id, cobrador_id")
        .in("estado", ["Activo", "Al día", "Vencido"]);
      if (pErr) throw pErr;

      const prestamoIds = (prestamos || []).map((p) => p.id);
      if (prestamoIds.length === 0) {
        return (clientes || []).map((c) => ({
          cliente_id: c.id,
          id_cliente: c.id_cliente,
          nombre_completo: c.nombre_completo,
          saldo_total: 0,
          cuotas_vencidas: 0,
          saldo_moroso: 0,
          cobrador_nombre: null,
        })) as EstadoCuenta[];
      }

      // 3. All unpaid cuotas for those loans
      const { data: cuotas, error: aErr } = await supabase
        .from("amortizacion")
        .select("prestamo_id, saldo_total, saldo_mora, status")
        .in("prestamo_id", prestamoIds)
        .neq("status", "Pagada");
      if (aErr) throw aErr;

      // 4. Cobradores
      const cobradorIds = [...new Set((prestamos || []).map((p) => p.cobrador_id).filter(Boolean))];
      let cobradorMap: Record<string, string> = {};
      if (cobradorIds.length > 0) {
        const { data: cobradores } = await (supabase.from as any)("cobradores")
          .select("id, nombre")
          .in("id", cobradorIds);
        for (const c of cobradores || []) {
          cobradorMap[c.id] = c.nombre;
        }
      }

      // Build per-client map
      const prestamoByCliente: Record<string, typeof prestamos> = {};
      for (const p of prestamos || []) {
        if (!prestamoByCliente[p.cliente_id]) prestamoByCliente[p.cliente_id] = [];
        prestamoByCliente[p.cliente_id].push(p);
      }

      const cuotaByPrestamo: Record<string, typeof cuotas> = {};
      for (const c of cuotas || []) {
        if (!cuotaByPrestamo[c.prestamo_id]) cuotaByPrestamo[c.prestamo_id] = [];
        cuotaByPrestamo[c.prestamo_id].push(c);
      }

      const result: EstadoCuenta[] = (clientes || []).map((cli) => {
        const cliPrestamos = prestamoByCliente[cli.id] || [];
        let saldoTotal = 0;
        let cuotasVencidas = 0;
        let saldoMoroso = 0;
        let cobradorNombre: string | null = null;

        for (const p of cliPrestamos) {
          const pCuotas = cuotaByPrestamo[p.id] || [];
          for (const c of pCuotas) {
            saldoTotal += Number(c.saldo_total || 0);
            if (c.status === "Vencida") {
              cuotasVencidas++;
              saldoMoroso += Number(c.saldo_total || 0);
            }
          }
          if (p.cobrador_id && cobradorMap[p.cobrador_id]) {
            cobradorNombre = cobradorMap[p.cobrador_id];
          }
        }

        return {
          cliente_id: cli.id,
          id_cliente: cli.id_cliente,
          nombre_completo: cli.nombre_completo,
          saldo_total: saldoTotal,
          cuotas_vencidas: cuotasVencidas,
          saldo_moroso: saldoMoroso,
          cobrador_nombre: cobradorNombre,
        };
      });

      // Only return clients that have active loans
      return result.filter((r) => r.saldo_total > 0 || r.cuotas_vencidas > 0);
    },
  });
}

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [searchEC, setSearchEC] = useState("");
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const { data: clientes, isLoading } = useClientes({ search, estado: estadoFilter, empresaId });
  const updateCliente = useUpdateCliente();
  const { data: estados, isLoading: loadingEC } = useEstadosCuenta();

  const handleToggleActivo = (e: React.MouseEvent, id: string, activo: boolean) => {
    e.stopPropagation();
    updateCliente.mutate(
      { id, activo: !activo },
      { onSuccess: () => toast.success(`Cliente ${!activo ? "activado" : "desactivado"}`) }
    );
  };

  const filteredEstados = (estados || []).filter(
    (ec) =>
      ec.nombre_completo.toLowerCase().includes(searchEC.toLowerCase()) ||
      ec.id_cliente.toLowerCase().includes(searchEC.toLowerCase())
  );

  const totalDeuda = filteredEstados.reduce((s, e) => s + e.saldo_total, 0);
  const totalMoroso = filteredEstados.reduce((s, e) => s + e.saldo_moroso, 0);
  const totalVencidas = filteredEstados.reduce((s, e) => s + e.cuotas_vencidas, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={() => navigate("/clientes/nuevo")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo
        </Button>
      </div>

      <Tabs defaultValue="listado" className="space-y-4">
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
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="w-36">
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
            <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
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
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-[13px]">
                        No se encontraron clientes
                      </TableCell>
                    </TableRow>
                  ) : (
                    clientes?.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer border-b border-border/50 hover:bg-table-hover transition-colors" onClick={() => navigate(`/clientes/${c.id}`)}>
                        <TableCell className="font-mono text-[12px] px-3">{c.id_cliente}</TableCell>
                        <TableCell className="font-medium text-[13px] px-3">{c.nombre_completo}</TableCell>
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
          )}
        </TabsContent>

        {/* ── Tab: Estados de Cuenta ────────────────────────── */}
        <TabsContent value="estados" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 bg-card">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Deuda Total</p>
              <p className="text-2xl font-bold mt-1">{$$(totalDeuda)}</p>
            </div>
            <div className="border rounded-lg p-4 bg-card">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Moroso</p>
              <p className="text-2xl font-bold mt-1 text-destructive">{$$(totalMoroso)}</p>
            </div>
            <div className="border rounded-lg p-4 bg-card">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Cuotas Vencidas</p>
              <p className="text-2xl font-bold mt-1">{totalVencidas}</p>
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
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Saldo Total</TableHead>
                    <TableHead className="text-center">Cuotas Vencidas</TableHead>
                    <TableHead className="text-right">Saldo Moroso</TableHead>
                    <TableHead>Cobrador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEstados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay estados de cuenta
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEstados.map((ec) => (
                      <TableRow
                        key={ec.cliente_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/clientes/${ec.cliente_id}`)}
                      >
                        <TableCell className="font-mono text-xs">{ec.id_cliente}</TableCell>
                        <TableCell className="font-medium">{ec.nombre_completo}</TableCell>
                        <TableCell className="text-right font-semibold">{$$(ec.saldo_total)}</TableCell>
                        <TableCell className="text-center">
                          {ec.cuotas_vencidas > 0 ? (
                            <Badge variant="destructive">{ec.cuotas_vencidas}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={ec.saldo_moroso > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                            {$$(ec.saldo_moroso)}
                          </span>
                        </TableCell>
                        <TableCell>{ec.cobrador_nombre || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
