import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, ArrowLeft, Pencil, Save, X, Trash2, Shield, Loader2, Search, Eye, EyeOff } from "lucide-react";

const rolColors: Record<string, string> = {
  admin: "bg-primary text-primary-foreground",
  supervisor: "bg-warning text-warning-foreground",
  cobrador: "bg-muted text-muted-foreground",
};

const rolLabels: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  cobrador: "Cobrador",
};

interface UserProfile {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  direccion: string | null;
  foto_url: string | null;
  porcentaje_comision: number;
  activo: boolean;
  email: string;
  rol: string;
}

function useUsuarios() {
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "list" },
      });
      if (error) throw error;
      return (data || []) as UserProfile[];
    },
  });
}

// ── List ──────────────────────────────────────────────────────────
function UsuariosListPage() {
  const navigate = useNavigate();
  const { data: usuarios, isLoading } = useUsuarios();
  const [search, setSearch] = useState("");

  const filtered = (usuarios || []).filter(
    (u) =>
      u.nombre_completo.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={() => navigate("/usuarios/nuevo")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Comisión</TableHead>
              <TableHead className="text-center">Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/usuarios/${u.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {u.foto_url && <AvatarImage src={u.foto_url} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {u.nombre_completo.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{u.nombre_completo}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge className={rolColors[u.rol] || rolColors.cobrador}>{rolLabels[u.rol] || u.rol}</Badge>
                    </TableCell>
                    <TableCell>{u.porcentaje_comision}%</TableCell>
                    <TableCell className="text-center">{u.activo ? "✓" : "✗"}</TableCell>
                  </TableRow>
                ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay usuarios</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Detail / Create ───────────────────────────────────────────────
function UsuarioDetallePage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: usuarios } = useUsuarios();
  const user = usuarios?.find((u) => u.id === id);

  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [rol, setRol] = useState("Cobrador");
  const [comision, setComision] = useState("0");
  const [activo, setActivo] = useState(true);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user) {
      setNombre(user.nombre_completo);
      setEmail(user.email);
      setTelefono(user.telefono || "");
      setDireccion(user.direccion || "");
      setRol(rolLabels[user.rol] || "Cobrador");
      setComision(String(user.porcentaje_comision));
      setActivo(user.activo);
    }
  }, [user]);

  const handleSave = async () => {
    if (!nombre.trim() || !email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    if (isNew && !password) {
      toast.error("La contraseña es obligatoria");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const { data, error } = await supabase.functions.invoke("manage-users", {
          body: {
            action: "create",
            email,
            password,
            nombre_completo: nombre.trim(),
            telefono: telefono.trim() || null,
            direccion: direccion.trim() || null,
            rol,
            porcentaje_comision: parseFloat(comision) || 0,
            activo,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Usuario creado");
        queryClient.invalidateQueries({ queryKey: ["usuarios"] });
        navigate("/usuarios");
      } else {
        const { data, error } = await supabase.functions.invoke("manage-users", {
          body: {
            action: "update",
            user_id: id,
            nombre_completo: nombre.trim(),
            telefono: telefono.trim() || null,
            direccion: direccion.trim() || null,
            rol,
            porcentaje_comision: parseFloat(comision) || 0,
            activo,
            password: password || undefined,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Usuario actualizado");
        queryClient.invalidateQueries({ queryKey: ["usuarios"] });
        setEditing(false);
        setPassword("");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este usuario permanentemente?")) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "delete", user_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Usuario eliminado");
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      navigate("/usuarios");
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const initials = nombre
    ? nombre.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/usuarios")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Usuarios</p>
              <span className="text-sm text-muted-foreground">/</span>
              <p className="text-sm">{isNew ? "Nuevo" : nombre}</p>
            </div>
            <h1 className="text-2xl font-bold">{isNew ? "Nuevo Usuario" : nombre}</h1>
          </div>
          {!isNew && user && <Badge className={rolColors[user.rol] || rolColors.cobrador}>{rolLabels[user.rol] || user.rol}</Badge>}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => (isNew ? navigate("/usuarios") : setEditing(false))} disabled={saving}>
                <X className="h-4 w-4 mr-2" />Descartar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" />Editar
              </Button>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={saving}>
                <Trash2 className="h-4 w-4 mr-2" />Eliminar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Avatar section */}
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          {user?.foto_url && <AvatarImage src={user.foto_url} />}
          <AvatarFallback className="bg-primary/10 text-primary text-2xl">{initials}</AvatarFallback>
        </Avatar>
        {!isNew && <div><p className="font-semibold text-lg">{nombre}</p><p className="text-sm text-muted-foreground">{email}</p></div>}
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Información del Usuario</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Nombre completo *</Label>
            {editing ? <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" /> : <p className="text-sm font-medium mt-1">{nombre || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email *</Label>
            {editing && isNew ? <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" /> : <p className="text-sm font-medium mt-1">{email || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Teléfono</Label>
            {editing ? <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="7000-0000" /> : <p className="text-sm font-medium mt-1">{telefono || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Dirección</Label>
            {editing ? <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección" /> : <p className="text-sm font-medium mt-1">{direccion || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Rol</Label>
            {editing ? (
              <Select value={rol} onValueChange={setRol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Supervisor">Supervisor</SelectItem>
                  <SelectItem value="Cobrador">Cobrador</SelectItem>
                </SelectContent>
              </Select>
            ) : <p className="text-sm font-medium mt-1">{rol}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">% Comisión</Label>
            {editing ? <Input type="number" min="0" max="100" step="0.5" value={comision} onChange={(e) => setComision(e.target.value)} /> : <p className="text-sm font-medium mt-1">{comision}%</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Activo</Label>
            {editing ? <div className="mt-2"><Switch checked={activo} onCheckedChange={setActivo} /></div> : <p className="text-sm font-medium mt-1">{activo ? "Sí" : "No"}</p>}
          </div>
          {editing && (
            <div>
              <Label className="text-xs text-muted-foreground">{isNew ? "Contraseña *" : "Nueva contraseña (opcional)"}</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isNew ? "Contraseña" : "Dejar vacío para no cambiar"}
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────
export default function UsuariosPage() {
  const { id } = useParams();
  return id ? <UsuarioDetallePage /> : <UsuariosListPage />;
}
