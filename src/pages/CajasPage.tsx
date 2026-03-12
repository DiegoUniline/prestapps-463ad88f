import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ArrowLeft, Pencil, Save, X, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const mockCajas = [
  { id: "caja-1", nombre: "Caja Principal", saldo: 125000, descripcion: "Caja principal de operaciones" },
  { id: "caja-2", nombre: "Caja Secundaria", saldo: 38500, descripcion: "Caja de respaldo" },
  { id: "caja-3", nombre: "Caja Reserva", saldo: 50000, descripcion: "Reserva de capital" },
];

const mockMovimientos = [
  { id: 1, tipo: "entrada", monto: 1200, concepto: "Pago PRE-0002 Cuota #5", fecha: "12/03/2026" },
  { id: 2, tipo: "salida", monto: 10000, concepto: "Desembolso PRE-0006", fecha: "12/03/2026" },
  { id: 3, tipo: "entrada", monto: 500, concepto: "Pago PRE-0001 Cuota #3", fecha: "11/03/2026" },
];

// --- LIST VIEW ---
function CajasListPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cajas</h1>
        <Button onClick={() => navigate("/cajas/nuevo")}><Plus className="h-4 w-4 mr-2" />Nuevo</Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Saldo Actual</TableHead>
              <TableHead>Descripción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockCajas.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/cajas/${c.id}`)}>
                <TableCell className="font-medium">{c.nombre}</TableCell>
                <TableCell className="text-right font-medium">${c.saldo.toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">{c.descripcion}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- DETAIL VIEW ---
function CajaDetallePage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const [editing, setEditing] = useState(isNew);
  const caja = mockCajas.find((c) => c.id === id);
  const [nombre, setNombre] = useState(caja?.nombre || "");
  const [descripcion, setDescripcion] = useState(caja?.descripcion || "");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cajas")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Cajas</p><span className="text-sm text-muted-foreground">/</span>
              <p className="text-sm">{isNew ? "Nueva" : nombre}</p>
            </div>
            <h1 className="text-2xl font-bold">{isNew ? "Nueva Caja" : nombre}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <><Button variant="outline" onClick={() => isNew ? navigate("/cajas") : setEditing(false)}><X className="h-4 w-4 mr-2" />Descartar</Button><Button><Save className="h-4 w-4 mr-2" />Guardar</Button></>
          ) : (
            <><Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button><Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</Button></>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Información</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Nombre</Label>
              {editing ? <Input value={nombre} onChange={(e) => setNombre(e.target.value)} /> : <p className="text-sm font-medium mt-1">{nombre || "—"}</p>}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Saldo Actual</Label>
              <p className="text-sm font-medium mt-1">${(caja?.saldo || 0).toLocaleString()}</p>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Descripción</Label>
              {editing ? <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /> : <p className="text-sm font-medium mt-1">{descripcion || "—"}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {!isNew && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Movimientos</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockMovimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center ${m.tipo === "entrada" ? "bg-success/10" : "bg-destructive/10"}`}>
                        {m.tipo === "entrada" ? <ArrowDownLeft className="h-3 w-3 text-success" /> : <ArrowUpRight className="h-3 w-3 text-destructive" />}
                      </div>
                    </TableCell>
                    <TableCell>{m.concepto}</TableCell>
                    <TableCell className="text-muted-foreground">{m.fecha}</TableCell>
                    <TableCell className={`text-right font-medium ${m.tipo === "entrada" ? "text-success" : "text-destructive"}`}>
                      {m.tipo === "entrada" ? "+" : "-"}${m.monto.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CajasPage() {
  const { id } = useParams();
  return id ? <CajaDetallePage /> : <CajasListPage />;
}
