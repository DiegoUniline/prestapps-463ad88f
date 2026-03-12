import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin } from "lucide-react";

const rutas = [
  { id: 1, nombre: "Ruta Centro", cobrador: "Pedro Ruiz", prestamos: 15, pendientes: 8 },
  { id: 2, nombre: "Ruta Norte", cobrador: "Juan Torres", prestamos: 22, pendientes: 12 },
  { id: 3, nombre: "Ruta Sur", cobrador: "Miguel Ángel", prestamos: 18, pendientes: 5 },
  { id: 4, nombre: "Ruta Este", cobrador: "Sin asignar", prestamos: 10, pendientes: 7 },
];

export default function RutasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rutas y Cobradores</h1>
          <p className="text-muted-foreground text-sm">Gestión de rutas de cobro</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Nueva Ruta</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rutas.map((r) => (
          <Card key={r.id} className="cursor-pointer hover:border-primary/30 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{r.nombre}</p>
                  <p className="text-sm text-muted-foreground">Cobrador: {r.cobrador}</p>
                </div>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{r.prestamos} préstamos</span>
                <span>{r.pendientes} cobros pendientes hoy</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
