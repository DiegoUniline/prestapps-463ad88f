import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield } from "lucide-react";

const usuarios = [
  { id: 1, nombre: "Admin Principal", email: "admin@prestapp.com", rol: "Admin", activo: true },
  { id: 2, nombre: "Pedro Ruiz", email: "pedro@prestapp.com", rol: "Cobrador", activo: true },
  { id: 3, nombre: "Juan Torres", email: "juan@prestapp.com", rol: "Cobrador", activo: true },
  { id: 4, nombre: "Ana Supervisora", email: "ana@prestapp.com", rol: "Supervisor", activo: true },
  { id: 5, nombre: "Miguel Ángel", email: "miguel@prestapp.com", rol: "Cobrador", activo: false },
];

const rolColors: Record<string, string> = {
  Admin: "bg-primary text-primary-foreground",
  Supervisor: "bg-warning text-warning-foreground",
  Cobrador: "bg-muted text-muted-foreground",
};

export default function UsuariosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios y Roles</h1>
          <p className="text-muted-foreground text-sm">Gestión de acceso al sistema</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Nuevo Usuario</Button>
      </div>

      <div className="grid gap-3">
        {usuarios.map((u) => (
          <Card key={u.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{u.nombre}</p>
                      {!u.activo && <span className="text-xs text-muted-foreground">(Inactivo)</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <Badge className={rolColors[u.rol]}>{u.rol}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
