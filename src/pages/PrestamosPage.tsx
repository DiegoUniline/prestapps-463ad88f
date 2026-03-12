import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";

const mockPrestamos = [
  { id: "PRE-0001", cliente: "María García", montoSolicitado: 10000, montoPagar: 12000, cuotasPagadas: 3, totalCuotas: 12, caja: "Caja Principal", ruta: "Ruta Centro", cobrador: "Pedro Ruiz", saldo: 9000, mora: 0, estado: "Activo" },
  { id: "PRE-0002", cliente: "Carlos López", montoSolicitado: 25000, montoPagar: 32500, cuotasPagadas: 7, totalCuotas: 24, caja: "Caja Principal", ruta: "Ruta Norte", cobrador: "Juan Torres", saldo: 21800, mora: 1200, estado: "Vencido" },
  { id: "PRE-0003", cliente: "Ana Martínez", montoSolicitado: 5000, montoPagar: 6000, cuotasPagadas: 1, totalCuotas: 6, caja: "Caja Secundaria", ruta: "Ruta Centro", cobrador: "Pedro Ruiz", saldo: 5000, mora: 0, estado: "Al día" },
  { id: "PRE-0004", cliente: "José Rodríguez", montoSolicitado: 15000, montoPagar: 19500, cuotasPagadas: 12, totalCuotas: 12, caja: "Caja Principal", ruta: "Ruta Sur", cobrador: "Miguel Ángel", saldo: 0, mora: 0, estado: "Liquidado" },
  { id: "PRE-0005", cliente: "Laura Sánchez", montoSolicitado: 8000, montoPagar: 10400, cuotasPagadas: 5, totalCuotas: 18, caja: "Caja Reserva", ruta: "Ruta Este", cobrador: "Pedro Ruiz", saldo: 7200, mora: 350, estado: "Activo" },
  { id: "PRE-0006", cliente: "Roberto Díaz", montoSolicitado: 12000, montoPagar: 15600, cuotasPagadas: 0, totalCuotas: 12, caja: "Caja Principal", ruta: "Ruta Norte", cobrador: "Juan Torres", saldo: 15600, mora: 2400, estado: "Juridico" },
];

const estadoColors: Record<string, string> = {
  Activo: "bg-primary text-primary-foreground",
  "Al día": "bg-success text-success-foreground",
  Vencido: "bg-destructive text-destructive-foreground",
  Liquidado: "bg-muted text-muted-foreground",
  Cancelado: "bg-muted text-muted-foreground",
  Juridico: "bg-warning text-warning-foreground",
};

export default function PrestamosPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");

  const filtered = mockPrestamos.filter((p) => {
    const matchSearch = p.cliente.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search.toUpperCase());
    const matchEstado = estadoFilter === "todos" || p.estado === estadoFilter;
    return matchSearch && matchEstado;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Préstamos</h1>
        <Button onClick={() => navigate("/prestamos/nuevo")}>
          <Plus className="h-4 w-4 mr-2" />Nuevo
        </Button>
      </div>

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
            <SelectItem value="Al día">Al día</SelectItem>
            <SelectItem value="Vencido">Vencido</SelectItem>
            <SelectItem value="Liquidado">Liquidado</SelectItem>
            <SelectItem value="Juridico">Jurídico</SelectItem>
            <SelectItem value="Cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Prestado</TableHead>
              <TableHead className="text-right">A Pagar</TableHead>
              <TableHead>Cuotas</TableHead>
              <TableHead>Caja</TableHead>
              <TableHead>Ruta</TableHead>
              <TableHead>Cobrador</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Mora</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No se encontraron préstamos</TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/prestamos/${p.id}`)}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell className="font-medium">{p.cliente}</TableCell>
                  <TableCell className="text-right">${p.montoSolicitado.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${p.montoPagar.toLocaleString()}</TableCell>
                  <TableCell>{p.cuotasPagadas}/{p.totalCuotas}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p.caja}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p.ruta}</TableCell>
                  <TableCell className="text-xs">{p.cobrador}</TableCell>
                  <TableCell className="text-right font-medium">${p.saldo.toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-medium ${p.mora > 0 ? "text-destructive" : ""}`}>
                    ${p.mora.toLocaleString()}
                  </TableCell>
                  <TableCell><Badge className={estadoColors[p.estado]}>{p.estado}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
