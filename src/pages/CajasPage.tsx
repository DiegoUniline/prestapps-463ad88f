import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const cajas = [
  { id: 1, nombre: "Caja Principal", saldo: 125000, movimientos: 45 },
  { id: 2, nombre: "Caja Secundaria", saldo: 38500, movimientos: 12 },
  { id: 3, nombre: "Caja Reserva", saldo: 50000, movimientos: 3 },
];

const movimientos = [
  { id: 1, tipo: "entrada", monto: 1200, concepto: "Pago PRE-0002 Cuota #5", caja: "Principal", fecha: "12/03/2026" },
  { id: 2, tipo: "salida", monto: 10000, concepto: "Desembolso PRE-0006", caja: "Principal", fecha: "12/03/2026" },
  { id: 3, tipo: "entrada", monto: 500, concepto: "Pago PRE-0001 Cuota #3", caja: "Principal", fecha: "11/03/2026" },
  { id: 4, tipo: "entrada", monto: 800, concepto: "Pago PRE-0005 Cuota #5", caja: "Secundaria", fecha: "11/03/2026" },
];

export default function CajasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cajas</h1>
          <p className="text-muted-foreground text-sm">Gestión de cajas y movimientos</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Nueva Caja</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cajas.map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{c.nombre}</p>
              <p className="text-2xl font-bold mt-1">${c.saldo.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.movimientos} movimientos</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos Movimientos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {movimientos.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${m.tipo === "entrada" ? "bg-success/10" : "bg-destructive/10"}`}>
                  {m.tipo === "entrada" ? <ArrowDownLeft className="h-4 w-4 text-success" /> : <ArrowUpRight className="h-4 w-4 text-destructive" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{m.concepto}</p>
                  <p className="text-xs text-muted-foreground">{m.caja} · {m.fecha}</p>
                </div>
              </div>
              <span className={`font-medium ${m.tipo === "entrada" ? "text-success" : "text-destructive"}`}>
                {m.tipo === "entrada" ? "+" : "-"}${m.monto.toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
