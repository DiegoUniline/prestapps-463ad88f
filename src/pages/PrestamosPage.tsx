import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const mockPrestamos = [
  { id: "PRE-0001", cliente: "María García", monto: "$10,000", cuotas: "3/12", estado: "Activo", mora: "$0" },
  { id: "PRE-0002", cliente: "Carlos López", monto: "$25,000", cuotas: "7/24", estado: "Vencido", mora: "$1,200" },
  { id: "PRE-0003", cliente: "Ana Martínez", monto: "$5,000", cuotas: "1/6", estado: "Al día", mora: "$0" },
  { id: "PRE-0004", cliente: "José Rodríguez", monto: "$15,000", cuotas: "12/12", estado: "Liquidado", mora: "$0" },
  { id: "PRE-0005", cliente: "Laura Sánchez", monto: "$8,000", cuotas: "5/18", estado: "Activo", mora: "$350" },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Préstamos</h1>
          <p className="text-muted-foreground text-sm">Gestión de préstamos activos</p>
        </div>
        <Button onClick={() => navigate("/prestamos/nuevo")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Préstamo
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por cliente o ID..." className="pl-9" />
      </div>

      <div className="grid gap-3">
        {mockPrestamos.map((p) => (
          <Card key={p.id} className="cursor-pointer hover:border-primary/30 transition-colors">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{p.cliente}</p>
                      <span className="text-xs text-muted-foreground">{p.id}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Monto: {p.monto} · Cuotas: {p.cuotas} · Mora: {p.mora}
                    </p>
                  </div>
                </div>
                <Badge className={estadoColors[p.estado]}>{p.estado}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
