import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle } from "lucide-react";
import { useState } from "react";

const cuotasPendientes = [
  { num: 5, monto: 1000, mora: 150, interes: 200, capital: 650, fecha: "10/03/2026", status: "Vencida" },
  { num: 6, monto: 1000, mora: 0, interes: 180, capital: 820, fecha: "17/03/2026", status: "Pendiente" },
  { num: 7, monto: 1000, mora: 0, interes: 160, capital: 840, fecha: "24/03/2026", status: "Pendiente" },
];

export default function PagosPage() {
  const [montoRecibido, setMontoRecibido] = useState(1200);

  // Simple waterfall calc for preview
  let restante = montoRecibido;
  const moraTotal = Math.min(restante, 150);
  restante -= moraTotal;
  const interesTotal = Math.min(restante, 200);
  restante -= interesTotal;
  const capitalTotal = restante;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Registro de Pagos</h1>
        <p className="text-muted-foreground text-sm">Registrar pagos a préstamos</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar préstamo por cliente o ID..." className="pl-9" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cuotas Pendientes — PRE-0002 (Carlos López)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cuotasPendientes.map((c) => (
                <div key={c.num} className={`p-3 rounded-lg border ${c.status === "Vencida" ? "border-destructive/30 bg-destructive/5" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Cuota #{c.num}</p>
                      <p className="text-sm text-muted-foreground">
                        Vence: {c.fecha} · Capital: ${c.capital} · Interés: ${c.interes} · Mora: ${c.mora}
                      </p>
                    </div>
                    <Badge className={c.status === "Vencida" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Registrar Pago</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Monto Recibido ($)</Label>
                <Input type="number" value={montoRecibido} onChange={(e) => setMontoRecibido(Number(e.target.value))} />
              </div>
              <div>
                <Label>Caja Destino</Label>
                <Select><SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Caja Principal</SelectItem>
                    <SelectItem value="2">Caja Secundaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Método de Pago</Label>
                <Select><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Distribución del Pago</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">→ Mora</span>
                <span className="font-medium text-destructive">${moraTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">→ Interés</span>
                <span className="font-medium">${interesTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">→ Capital</span>
                <span className="font-medium">${capitalTotal.toFixed(2)}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between text-sm font-bold">
                <span>Total</span>
                <span>${montoRecibido.toFixed(2)}</span>
              </div>
              <Button className="w-full mt-3">
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirmar Pago
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
