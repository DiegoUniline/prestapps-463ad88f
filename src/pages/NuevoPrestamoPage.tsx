import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Calculator } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CuotaAmortizacion {
  numero: number;
  capital: number;
  interes: number;
  capitalInteres: number;
  fechaVencimiento: string;
  saldoCapital: number;
  status: string;
}

function calcularFijo(monto: number, cuotas: number, porcentaje: number, redondeo: number | null): CuotaAmortizacion[] {
  const totalPagar = monto * (1 + porcentaje / 100);
  const cuotaExacta = totalPagar / cuotas;
  const cuotaAplicada = redondeo || cuotaExacta;
  const totalConRedondeo = cuotaAplicada * (cuotas - 1);
  const ultimaCuota = totalPagar - totalConRedondeo;
  const interesTotal = totalPagar - monto;
  const interesPorCuota = interesTotal / cuotas;
  const capitalPorCuota = (monto) / cuotas;

  const hoy = new Date();
  return Array.from({ length: cuotas }, (_, i) => {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() + (i + 1) * 7);
    const esUltima = i === cuotas - 1;
    return {
      numero: i + 1,
      capital: capitalPorCuota,
      interes: interesPorCuota,
      capitalInteres: esUltima && redondeo ? ultimaCuota : cuotaAplicada,
      fechaVencimiento: fecha.toLocaleDateString("es"),
      saldoCapital: monto - capitalPorCuota * (i + 1),
      status: "Pendiente",
    };
  });
}

function calcularInsolutos(monto: number, cuotas: number, tasaPeriodica: number, redondeo: number | null): CuotaAmortizacion[] {
  const r = tasaPeriodica / 100;
  const cuotaFija = (monto * r * Math.pow(1 + r, cuotas)) / (Math.pow(1 + r, cuotas) - 1);
  const cuotaAplicada = redondeo || cuotaFija;
  let saldo = monto;
  const hoy = new Date();

  return Array.from({ length: cuotas }, (_, i) => {
    const interes = saldo * r;
    const esUltima = i === cuotas - 1;
    let capitalInteres = esUltima ? saldo + interes : cuotaAplicada;
    const capital = capitalInteres - interes;
    saldo = Math.max(0, saldo - capital);
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() + (i + 1) * 7);

    return {
      numero: i + 1,
      capital,
      interes,
      capitalInteres,
      fechaVencimiento: fecha.toLocaleDateString("es"),
      saldoCapital: saldo,
      status: "Pendiente",
    };
  });
}

export default function NuevoPrestamoPage() {
  const navigate = useNavigate();
  const [modalidad, setModalidad] = useState<"fijo" | "insolutos">("fijo");
  const [monto, setMonto] = useState(10000);
  const [cuotas, setCuotas] = useState(12);
  const [tasa, setTasa] = useState(20);
  const [redondeo, setRedondeo] = useState<string>("");
  const [frecuencia, setFrecuencia] = useState("semanal");

  const tabla = useMemo(() => {
    const r = redondeo ? parseFloat(redondeo) : null;
    if (modalidad === "fijo") return calcularFijo(monto, cuotas, tasa, r);
    return calcularInsolutos(monto, cuotas, tasa, r);
  }, [modalidad, monto, cuotas, tasa, redondeo]);

  const totalPagar = tabla.reduce((s, c) => s + c.capitalInteres, 0);
  const totalInteres = totalPagar - monto;
  const cuotaEstandar = tabla[0]?.capitalInteres || 0;
  const ultimaCuota = tabla[tabla.length - 1]?.capitalInteres || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/prestamos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nuevo Préstamo</h1>
          <p className="text-muted-foreground text-sm">Configurar y previsualizar el préstamo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Datos del Préstamo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Select><SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">María García</SelectItem>
                    <SelectItem value="2">Carlos López</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empresa</Label>
                <Input placeholder="Nombre de empresa/cartera" />
              </div>
              <div>
                <Label>Cobrador Asignado</Label>
                <Select><SelectTrigger><SelectValue placeholder="Seleccionar cobrador" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Pedro Ruiz</SelectItem>
                    <SelectItem value="2">Juan Torres</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ruta</Label>
                <Select><SelectTrigger><SelectValue placeholder="Seleccionar ruta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Ruta Centro</SelectItem>
                    <SelectItem value="2">Ruta Norte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notas internas</Label>
                <Textarea placeholder="Observaciones..." rows={3} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Configuración del Crédito</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={modalidad} onValueChange={(v) => setModalidad(v as "fijo" | "insolutos")}>
                <TabsList className="w-full">
                  <TabsTrigger value="fijo" className="flex-1">Interés Fijo</TabsTrigger>
                  <TabsTrigger value="insolutos" className="flex-1">Saldos Insolutos</TabsTrigger>
                </TabsList>
              </Tabs>
              <div>
                <Label>Monto Solicitado ($)</Label>
                <Input type="number" value={monto} onChange={(e) => setMonto(Number(e.target.value))} />
              </div>
              <div>
                <Label>Número de Cuotas</Label>
                <Input type="number" value={cuotas} onChange={(e) => setCuotas(Number(e.target.value))} />
              </div>
              <div>
                <Label>{modalidad === "fijo" ? "Porcentaje de Ganancia (%)" : "Tasa de Interés Periódica (%)"}</Label>
                <Input type="number" value={tasa} onChange={(e) => setTasa(Number(e.target.value))} />
              </div>
              <div>
                <Label>Frecuencia de Pago</Label>
                <Select value={frecuencia} onValueChange={setFrecuencia}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diario">Diario</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quincenal">Quincenal</SelectItem>
                    <SelectItem value="mensual">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Redondear Cuota a ($)</Label>
                <Input type="number" placeholder="Ej: 160" value={redondeo} onChange={(e) => setRedondeo(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground">Cuota Estándar</p>
              <p className="text-lg font-bold">${cuotaEstandar.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground">Última Cuota</p>
              <p className="text-lg font-bold">${ultimaCuota.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground">Total a Pagar</p>
              <p className="text-lg font-bold">${totalPagar.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground">Interés Ganado</p>
              <p className="text-lg font-bold text-primary">${totalInteres.toFixed(2)}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Tabla de Amortización (Preview)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Capital</TableHead>
                      <TableHead>Interés</TableHead>
                      <TableHead>Cuota</TableHead>
                      <TableHead>Fecha Venc.</TableHead>
                      <TableHead>Saldo Capital</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabla.map((row) => (
                      <TableRow key={row.numero}>
                        <TableCell className="font-medium">{row.numero}</TableCell>
                        <TableCell>${row.capital.toFixed(2)}</TableCell>
                        <TableCell>${row.interes.toFixed(2)}</TableCell>
                        <TableCell className="font-medium">${row.capitalInteres.toFixed(2)}</TableCell>
                        <TableCell>{row.fechaVencimiento}</TableCell>
                        <TableCell>${Math.max(0, row.saldoCapital).toFixed(2)}</TableCell>
                        <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate("/prestamos")}>Cancelar</Button>
            <Button>Guardar Préstamo</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
