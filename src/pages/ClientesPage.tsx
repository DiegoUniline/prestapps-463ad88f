import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";

const mockClientes = [
  { id: "CLI-0001", nombre: "María García", telefono: "7777-1234", estado: "Activo", sexo: "Femenino", situacion: "Empleado", activo: true },
  { id: "CLI-0002", nombre: "Carlos López", telefono: "7777-5678", estado: "En mora", sexo: "Masculino", situacion: "Independiente", activo: true },
  { id: "CLI-0003", nombre: "Ana Martínez", telefono: "7777-9012", estado: "Activo", sexo: "Femenino", situacion: "Empleado", activo: true },
  { id: "CLI-0004", nombre: "José Rodríguez", telefono: "7777-3456", estado: "Bloqueado", sexo: "Masculino", situacion: "Desempleado", activo: false },
  { id: "CLI-0005", nombre: "Laura Sánchez", telefono: "7777-7890", estado: "Activo", sexo: "Femenino", situacion: "Pensionado", activo: true },
];

const estadoColors: Record<string, string> = {
  Activo: "bg-success text-success-foreground",
  "En mora": "bg-destructive text-destructive-foreground",
  Bloqueado: "bg-muted text-muted-foreground",
  Inactivo: "bg-muted text-muted-foreground",
};

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const navigate = useNavigate();

  const filtered = mockClientes.filter((c) => {
    const matchSearch = c.nombre.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search);
    const matchEstado = estadoFilter === "todos" || c.estado === estadoFilter;
    return matchSearch && matchEstado;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm">{mockClientes.length} clientes registrados</p>
        </div>
        <Button onClick={() => navigate("/clientes/nuevo")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Estado" />
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

      <div className="grid gap-3">
        {filtered.map((cliente) => (
          <Card key={cliente.id} className="cursor-pointer hover:border-primary/30 transition-colors">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {cliente.nombre.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{cliente.nombre}</p>
                    <span className="text-xs text-muted-foreground">{cliente.id}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{cliente.telefono} · {cliente.situacion}</p>
                </div>
                <Badge className={estadoColors[cliente.estado]}>{cliente.estado}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
