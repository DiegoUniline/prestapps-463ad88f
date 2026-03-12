import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ArrowLeft, Pencil, Save, X, Trash2, MapPin } from "lucide-react";

const mockRutas = [
  { id: "ruta-1", nombre: "Ruta Centro", cobrador: "Pedro Ruiz", descripcion: "Zona centro de la ciudad", prestamos: 15 },
  { id: "ruta-2", nombre: "Ruta Norte", cobrador: "Juan Torres", descripcion: "Zona norte", prestamos: 22 },
  { id: "ruta-3", nombre: "Ruta Sur", cobrador: "Miguel Ángel", descripcion: "Zona sur", prestamos: 18 },
  { id: "ruta-4", nombre: "Ruta Este", cobrador: "Sin asignar", descripcion: "Zona este", prestamos: 10 },
];

function RutasListPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rutas</h1>
        <Button onClick={() => navigate("/rutas/nuevo")}><Plus className="h-4 w-4 mr-2" />Nuevo</Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead><TableHead>Cobrador</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Préstamos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockRutas.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/rutas/${r.id}`)}>
                <TableCell className="font-medium"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{r.nombre}</div></TableCell>
                <TableCell>{r.cobrador}</TableCell>
                <TableCell className="text-muted-foreground">{r.descripcion}</TableCell>
                <TableCell className="text-right">{r.prestamos}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RutaDetallePage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const [editing, setEditing] = useState(isNew);
  const ruta = mockRutas.find((r) => r.id === id);
  const [nombre, setNombre] = useState(ruta?.nombre || "");
  const [descripcion, setDescripcion] = useState(ruta?.descripcion || "");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/rutas")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2"><p className="text-sm text-muted-foreground">Rutas</p><span className="text-sm text-muted-foreground">/</span><p className="text-sm">{isNew ? "Nueva" : nombre}</p></div>
            <h1 className="text-2xl font-bold">{isNew ? "Nueva Ruta" : nombre}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <><Button variant="outline" onClick={() => isNew ? navigate("/rutas") : setEditing(false)}><X className="h-4 w-4 mr-2" />Descartar</Button><Button><Save className="h-4 w-4 mr-2" />Guardar</Button></>
          ) : (
            <><Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button><Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</Button></>
          )}
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Información</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            {editing ? <Input value={nombre} onChange={(e) => setNombre(e.target.value)} /> : <p className="text-sm font-medium mt-1">{nombre || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cobrador</Label>
            {editing ? <Input placeholder="Seleccionar cobrador" /> : <p className="text-sm font-medium mt-1">{ruta?.cobrador || "—"}</p>}
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Descripción</Label>
            {editing ? <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /> : <p className="text-sm font-medium mt-1">{descripcion || "—"}</p>}
          </div>
        </CardContent>
      </Card>
      {!isNew && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Préstamos en esta Ruta</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground py-4 text-center">No hay préstamos asignados a esta ruta</p></CardContent>
        </Card>
      )}
    </div>
  );
}

export default function RutasPage() {
  const { id } = useParams();
  return id ? <RutaDetallePage /> : <RutasListPage />;
}
