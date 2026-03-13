import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Banknote, ShieldCheck } from "lucide-react";

const metodosPago = [
  { valor: "Efectivo", descripcion: "Pago en efectivo" },
  { valor: "Transferencia", descripcion: "Transferencia bancaria" },
  { valor: "Otro", descripcion: "Otro método" },
];

const estadosPrestamo = [
  { valor: "Activo", descripcion: "Préstamo vigente con cuotas pendientes", color: "bg-blue-500/15 text-blue-700 border-blue-200" },
  { valor: "Al día", descripcion: "Préstamo al corriente sin atrasos", color: "bg-green-500/15 text-green-700 border-green-200" },
  { valor: "Vencido", descripcion: "Préstamo con cuotas vencidas", color: "bg-red-500/15 text-red-700 border-red-200" },
  { valor: "Liquidado", descripcion: "Préstamo pagado completamente", color: "bg-emerald-500/15 text-emerald-700 border-emerald-200" },
  { valor: "Cancelado", descripcion: "Préstamo cancelado antes de completarse", color: "bg-muted text-muted-foreground border-border" },
  { valor: "Juridico", descripcion: "Préstamo en proceso legal de cobro", color: "bg-orange-500/15 text-orange-700 border-orange-200" },
];

const roles = [
  { valor: "admin", descripcion: "Acceso total al sistema: gestión de usuarios, empresas, cajas, reportes y configuración" },
  { valor: "supervisor", descripcion: "Visualización de rutas asignadas, clientes, reportes y CRM" },
  { valor: "cobrador", descripcion: "Cobranza diaria, registro de pagos y promesas en rutas asignadas" },
];

export default function CatalogosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catálogos del Sistema</h1>
        <p className="text-muted-foreground text-sm mt-1">Valores de referencia utilizados en el sistema</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Métodos de Pago */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-5 w-5 text-primary" />
              Métodos de Pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Valor</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metodosPago.map((m) => (
                  <TableRow key={m.valor}>
                    <TableCell><Badge variant="secondary">{m.valor}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.descripcion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Estados de Préstamo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5 text-primary" />
              Estados de Préstamo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estadosPrestamo.map((e) => (
                  <TableRow key={e.valor}>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${e.color}`}>
                        {e.valor}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.descripcion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Roles */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Roles de Usuario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.valor}>
                    <TableCell><Badge>{r.valor}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.descripcion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
