import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Filter, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useClientes, useUpdateCliente } from "@/hooks/useClientes";
import { toast } from "sonner";

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
  const { data: clientes, isLoading } = useClientes({ search, estado: estadoFilter });
  const updateCliente = useUpdateCliente();

  const handleToggleActivo = (id: string, activo: boolean) => {
    updateCliente.mutate(
      { id, activo: !activo },
      { onSuccess: () => toast.success(`Cliente ${!activo ? "activado" : "desactivado"}`) }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm">
            {clientes?.length ?? 0} clientes registrados
          </p>
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
            placeholder="Buscar por nombre, ID o teléfono..."
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

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : clientes?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No se encontraron clientes</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/clientes/nuevo")}>
              <Plus className="h-4 w-4 mr-2" />
              Crear primer cliente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {clientes?.map((cliente) => (
            <Card
              key={cliente.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => navigate(`/clientes/${cliente.id}`)}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    {cliente.foto_cliente ? (
                      <AvatarImage src={cliente.foto_cliente} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {cliente.nombre_completo
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{cliente.nombre_completo}</p>
                      <span className="text-xs text-muted-foreground">{cliente.id_cliente}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {cliente.telefono || "Sin teléfono"} · {cliente.situacion_laboral || "—"}
                    </p>
                  </div>
                  <Badge className={estadoColors[cliente.estado] || "bg-muted text-muted-foreground"}>
                    {cliente.estado}
                  </Badge>
                  <Switch
                    checked={cliente.activo}
                    onCheckedChange={() => handleToggleActivo(cliente.id, cliente.activo)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
