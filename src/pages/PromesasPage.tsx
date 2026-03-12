import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Plus } from "lucide-react";

const promesas = [
  { id: 1, cliente: "Carlos López", cuota: 5, fechaPrometida: "12/03/2026", monto: "$1,000", notas: "Dice que cobra el viernes", status: "Pendiente" },
  { id: 2, cliente: "José Rodríguez", cuota: 8, fechaPrometida: "15/03/2026", monto: "$800", notas: "Transferencia bancaria", status: "Pendiente" },
  { id: 3, cliente: "Laura Sánchez", cuota: 3, fechaPrometida: "10/03/2026", monto: "$650", notas: "", status: "Vencida" },
];

export default function PromesasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Promesas de Pago</h1>
          <p className="text-muted-foreground text-sm">Seguimiento de compromisos de pago</p>
        </div>
      </div>

      <div className="grid gap-3">
        {promesas.map((p) => (
          <Card key={p.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <CalendarCheck className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium">{p.cliente} — Cuota #{p.cuota}</p>
                    <p className="text-sm text-muted-foreground">
                      Fecha: {p.fechaPrometida} · Monto: {p.monto}
                      {p.notas && ` · ${p.notas}`}
                    </p>
                  </div>
                </div>
                <Badge className={p.status === "Vencida" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}>
                  {p.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
