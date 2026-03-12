import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const mockPrestamos = [
  { id: "PRE-0001", cliente: "María García", monto: 10000, cuotasPagadas: 3, totalCuotas: 12, estado: "Activo", mora: 0 },
  { id: "PRE-0002", cliente: "Carlos López", monto: 25000, cuotasPagadas: 7, totalCuotas: 24, estado: "Vencido", mora: 1200 },
  { id: "PRE-0003", cliente: "Ana Martínez", monto: 5000, cuotasPagadas: 1, totalCuotas: 6, estado: "Al día", mora: 0 },
  { id: "PRE-0004", cliente: "José Rodríguez", monto: 15000, cuotasPagadas: 12, totalCuotas: 12, estado: "Liquidado", mora: 0 },
  { id: "PRE-0005", cliente: "Laura Sánchez", monto: 8000, cuotasPagadas: 5, totalCuotas: 18, estado: "Activo", mora: 350 },
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

  const filtered = mockPrestamos.filter(
    (p) => p.cliente.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search.toUpperCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Préstamos</h1>
        <Button onClick={() => navigate("/prestamos/nuevo")}>
          <Plus className="h-4 w-4 mr-2" />Nuevo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Cuotas</TableHead>
              <TableHead className="text-right">Mora</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/prestamos/${p.id}`)}>
                <TableCell className="font-mono text-xs">{p.id}</TableCell>
                <TableCell className="font-medium">{p.cliente}</TableCell>
                <TableCell className="text-right">${p.monto.toLocaleString()}</TableCell>
                <TableCell>{p.cuotasPagadas}/{p.totalCuotas}</TableCell>
                <TableCell className="text-right">${p.mora.toLocaleString()}</TableCell>
                <TableCell><Badge className={estadoColors[p.estado]}>{p.estado}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
