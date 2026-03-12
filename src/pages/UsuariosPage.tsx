import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, ArrowLeft, Pencil, Save, X, Trash2, Shield } from "lucide-react";

const mockUsuarios = [
  { id: "usr-1", nombre: "Admin Principal", email: "admin@prestapp.com", rol: "Admin", activo: true },
  { id: "usr-2", nombre: "Pedro Ruiz", email: "pedro@prestapp.com", rol: "Cobrador", activo: true },
  { id: "usr-3", nombre: "Juan Torres", email: "juan@prestapp.com", rol: "Cobrador", activo: true },
  { id: "usr-4", nombre: "Ana Supervisora", email: "ana@prestapp.com", rol: "Supervisor", activo: true },
  { id: "usr-5", nombre: "Miguel Ángel", email: "miguel@prestapp.com", rol: "Cobrador", activo: false },
];

const rolColors: Record<string, string> = {
  Admin: "bg-primary text-primary-foreground",
  Supervisor: "bg-warning text-warning-foreground",
  Cobrador: "bg-muted text-muted-foreground",
};

function UsuariosListPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={() => navigate("/usuarios/nuevo")}><Plus className="h-4 w-4 mr-2" />Nuevo</Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead><TableHead>Email</TableHead><TableHead>Rol</TableHead><TableHead className="text-center">Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockUsuarios.map((u) => (
              <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/usuarios/${u.id}`)}>
                <TableCell className="font-medium"><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />{u.nombre}</div></TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell><Badge className={rolColors[u.rol]}>{u.rol}</Badge></TableCell>
                <TableCell className="text-center">{u.activo ? "✓" : "✗"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UsuarioDetallePage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const [editing, setEditing] = useState(isNew);
  const user = mockUsuarios.find((u) => u.id === id);
  const [nombre, setNombre] = useState(user?.nombre || "");
  const [email, setEmail] = useState(user?.email || "");
  const [rol, setRol] = useState(user?.rol || "Cobrador");
  const [activo, setActivo] = useState(user?.activo ?? true);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/usuarios")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2"><p className="text-sm text-muted-foreground">Usuarios</p><span className="text-sm text-muted-foreground">/</span><p className="text-sm">{isNew ? "Nuevo" : nombre}</p></div>
            <h1 className="text-2xl font-bold">{isNew ? "Nuevo Usuario" : nombre}</h1>
          </div>
          {!isNew && <Badge className={rolColors[rol]}>{rol}</Badge>}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <><Button variant="outline" onClick={() => isNew ? navigate("/usuarios") : setEditing(false)}><X className="h-4 w-4 mr-2" />Descartar</Button><Button><Save className="h-4 w-4 mr-2" />Guardar</Button></>
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
            <Label className="text-xs text-muted-foreground">Email</Label>
            {editing ? <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /> : <p className="text-sm font-medium mt-1">{email || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Rol</Label>
            {editing ? (
              <Select value={rol} onValueChange={setRol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Supervisor">Supervisor</SelectItem><SelectItem value="Cobrador">Cobrador</SelectItem></SelectContent>
              </Select>
            ) : <p className="text-sm font-medium mt-1">{rol}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Activo</Label>
            {editing ? <div className="mt-2"><Switch checked={activo} onCheckedChange={setActivo} /></div> : <p className="text-sm font-medium mt-1">{activo ? "Sí" : "No"}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function UsuariosPage() {
  const { id } = useParams();
  return id ? <UsuarioDetallePage /> : <UsuariosListPage />;
}
