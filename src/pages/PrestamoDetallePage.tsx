import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Save, X, Calculator } from "lucide-react";

interface CuotaAmortizacion {
  numero: number; capital: number; interes: number; capitalInteres: number;
  fechaVencimiento: string; saldoCapital: number; status: string;
}

function calcularFijo(monto: number, cuotas: number, porcentaje: number, redondeo: number | null): CuotaAmortizacion[] {
  const totalPagar = monto * (1 + porcentaje / 100);
  const cuotaExacta = totalPagar / cuotas;
  const cuotaAplicada = redondeo || cuotaExacta;
  const totalConRedondeo = cuotaAplicada * (cuotas - 1);
  const ultimaCuota = totalPagar - totalConRedondeo;
  const interesPorCuota = (totalPagar - monto) / cuotas;
  const capitalPorCuota = monto / cuotas;
  const hoy = new Date();
  return Array.from({ length: cuotas }, (_, i) => {
    const fecha = new Date(hoy); fecha.setDate(fecha.getDate() + (i + 1) * 7);
    const esUltima = i === cuotas - 1;
    return { numero: i + 1, capital: capitalPorCuota, interes: interesPorCuota,
      capitalInteres: esUltima && redondeo ? ultimaCuota : cuotaAplicada,
      fechaVencimiento: fecha.toLocaleDateString("es"), saldoCapital: monto - capitalPorCuota * (i + 1), status: "Pendiente" };
  });
}

function calcularInsolutos(monto: number, cuotas: number, tasa: number, redondeo: number | null): CuotaAmortizacion[] {
  const r = tasa / 100;
  const cuotaFija = (monto * r * Math.pow(1 + r, cuotas)) / (Math.pow(1 + r, cuotas) - 1);
  const cuotaAplicada = redondeo || cuotaFija;
  let saldo = monto; const hoy = new Date();
  return Array.from({ length: cuotas }, (_, i) => {
    const interes = saldo * r; const esUltima = i === cuotas - 1;
    const capitalInteres = esUltima ? saldo + interes : cuotaAplicada;
    const capital = capitalInteres - interes; saldo = Math.max(0, saldo - capital);
    const fecha = new Date(hoy); fecha.setDate(fecha.getDate() + (i + 1) * 7);
    return { numero: i + 1, capital, interes, capitalInteres, fechaVencimiento: fecha.toLocaleDateString("es"), saldoCapital: saldo, status: "Pendiente" };
  });
}

export default function PrestamoDetallePage() {
  const { id } = useParams();
  const isNew = !id || id === "nuevo";
  const navigate = useNavigate();
  const [editing, setEditing] = useState(isNew);
  const [modalidad, setModalidad] = useState<"fijo" | "insolutos">("fijo");
  const [monto, setMonto] = useState(10000);
  const [cuotas, setCuotas] = useState(12);
  const [tasa, setTasa] = useState(20);
  const [redondeo, setRedondeo] = useState<string>("");
  const [frecuencia, setFrecuencia] = useState("semanal");
  const [empresa, setEmpresa] = useState("");
  const [notas, setNotas] = useState("");

  const tabla = useMemo(() => {
    const r = redondeo ? parseFloat(redondeo) : null;
    return modalidad === "fijo" ? calcularFijo(monto, cuotas, tasa, r) : calcularInsolutos(monto, cuotas, tasa, r);
  }, [modalidad, monto, cuotas, tasa, redondeo]);

  const totalPagar = tabla.reduce((s, c) => s + c.capitalInteres, 0);
  const totalInteres = totalPagar - monto;
  const cuotaEstandar = tabla[0]?.capitalInteres || 0;
  const ultimaCuotaVal = tabla[tabla.length - 1]?.capitalInteres || 0;

  const ReadOrInput = ({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} /> : <p className="text-sm font-medium mt-1">{value || "—"}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/prestamos")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Préstamos</p>
              <span className="text-sm text-muted-foreground">/</span>
              <p className="text-sm">{isNew ? "Nuevo" : id}</p>
            </div>
            <h1 className="text-2xl font-bold">{isNew ? "Nuevo Préstamo" : `Préstamo ${id}`}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => isNew ? navigate("/prestamos") : setEditing(false)}><X className="h-4 w-4 mr-2" />Descartar</Button>
              <Button><Save className="h-4 w-4 mr-2" />Guardar</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Datos del Préstamo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Cliente</Label>
                    <Select><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent><SelectItem value="1">María García</SelectItem><SelectItem value="2">Carlos López</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <ReadOrInput label="Empresa" value={empresa} onChange={setEmpresa} />
                  <div>
                    <Label className="text-xs text-muted-foreground">Cobrador</Label>
                    <Select><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent><SelectItem value="1">Pedro Ruiz</SelectItem><SelectItem value="2">Juan Torres</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ruta</Label>
                    <Select><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent><SelectItem value="1">Ruta Centro</SelectItem><SelectItem value="2">Ruta Norte</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notas</Label>
                    <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-muted-foreground">Cliente</Label><p className="text-sm font-medium mt-1">—</p></div>
                  <div><Label className="text-xs text-muted-foreground">Empresa</Label><p className="text-sm font-medium mt-1">{empresa || "—"}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Cobrador</Label><p className="text-sm font-medium mt-1">—</p></div>
                  <div><Label className="text-xs text-muted-foreground">Ruta</Label><p className="text-sm font-medium mt-1">—</p></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Configuración del Crédito</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {editing && (
                <Tabs value={modalidad} onValueChange={(v) => setModalidad(v as "fijo" | "insolutos")}>
                  <TabsList className="w-full"><TabsTrigger value="fijo" className="flex-1">Interés Fijo</TabsTrigger><TabsTrigger value="insolutos" className="flex-1">Saldos Insolutos</TabsTrigger></TabsList>
                </Tabs>
              )}
              {!editing ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-muted-foreground">Modalidad</Label><p className="text-sm font-medium mt-1 capitalize">{modalidad}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Monto</Label><p className="text-sm font-medium mt-1">${monto.toLocaleString()}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Cuotas</Label><p className="text-sm font-medium mt-1">{cuotas}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Tasa</Label><p className="text-sm font-medium mt-1">{tasa}%</p></div>
                  <div><Label className="text-xs text-muted-foreground">Frecuencia</Label><p className="text-sm font-medium mt-1 capitalize">{frecuencia}</p></div>
                </div>
              ) : (
                <>
                  <ReadOrInput label="Monto ($)" value={monto} onChange={(v) => setMonto(Number(v))} type="number" />
                  <ReadOrInput label="Cuotas" value={cuotas} onChange={(v) => setCuotas(Number(v))} type="number" />
                  <ReadOrInput label={modalidad === "fijo" ? "Ganancia (%)" : "Tasa (%)"} value={tasa} onChange={(v) => setTasa(Number(v))} type="number" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Frecuencia</Label>
                    <Select value={frecuencia} onValueChange={setFrecuencia}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="diario">Diario</SelectItem><SelectItem value="semanal">Semanal</SelectItem><SelectItem value="quincenal">Quincenal</SelectItem><SelectItem value="mensual">Mensual</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <ReadOrInput label="Redondear cuota a ($)" value={redondeo} onChange={setRedondeo} type="number" />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Cuota Estándar", value: cuotaEstandar },
              { label: "Última Cuota", value: ultimaCuotaVal },
              { label: "Total a Pagar", value: totalPagar },
              { label: "Interés Ganado", value: totalInteres, accent: true },
            ].map((k) => (
              <Card key={k.label}><CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-lg font-bold ${k.accent ? "text-primary" : ""}`}>${k.value.toFixed(2)}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tabla de Amortización</CardTitle></div>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Capital</TableHead><TableHead>Interés</TableHead><TableHead>Cuota</TableHead>
                      <TableHead>Fecha Venc.</TableHead><TableHead>Saldo Capital</TableHead><TableHead>Status</TableHead>
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
        </div>
      </div>
    </div>
  );
}
