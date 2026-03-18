import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, ArrowLeft, Pencil, Save, X, Trash2, Loader2, Search, Eye, EyeOff } from "lucide-react";

const rolColors: Record<string, string> = {
  admin: "bg-primary text-primary-foreground",
  supervisor: "bg-warning text-warning-foreground",
  cobrador: "bg-muted text-muted-foreground",
};
const rolLabels: Record<string, string> = { admin: "Admin", supervisor: "Supervisor", cobrador: "Cobrador" };

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
  empresa_id: string | null;
  comision_tipo: string;
  comision_cobros_equipo: number;
  comision_prestamos: number;
  bono_meta_monto: number;
  bono_meta_objetivo: number;
  rutas_asignadas: string[];
}

interface Ruta { id: string; nombre: string; }

function useUsuarios(empresaId: string) {
  return useQuery({
    queryKey: ["usuarios", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "list", empresa_id: empresaId },
      });
      if (error) throw error;
      return (data || []) as UserProfile[];
    },
  });
}

function useRutas(empresaId: string) {
  return useQuery({
    queryKey: ["rutas-list", empresaId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("rutas").select("id, nombre").eq("empresa_id", empresaId).order("nombre");
      if (error) throw error;
      return (data || []) as Ruta[];
    },
  });
}

// ── List ──────────────────────────────────────────────────────────
function UsuariosListPage() {
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const { data: usuarios, isLoading } = useUsuarios(empresaId);
  const [search, setSearch] = useState("");

  const filtered = (usuarios || []).filter(
    (u) => u.nombre_completo.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={() => navigate("/usuarios/nuevo")}><Plus className="h-4 w-4 mr-2" />Nuevo</Button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {/* MOBILE Cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-4"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
        )) : filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-[13px]">No hay usuarios</p>
        ) : filtered.map((u) => (
          <div key={u.id} className="bg-card rounded-lg border border-border shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)] p-3 cursor-pointer active:bg-muted/50 transition-colors" onClick={() => navigate(`/usuarios/${u.id}`)}>
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0">
                {u.foto_url && <AvatarImage src={u.foto_url} />}
                <AvatarFallback className="bg-primary/10 text-primary text-[11px]">
                  {u.nombre_completo.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[13px] truncate">{u.nombre_completo}</p>
                  <Badge className={cn("text-[9px] shrink-0", rolColors[u.rol] || rolColors.cobrador)}>{rolLabels[u.rol] || u.rol}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12px] font-medium">{u.porcentaje_comision}%</p>
                <p className="text-[10px] text-muted-foreground">{u.activo ? "Activo" : "Inactivo"}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP Table */}
      <div className="hidden md:block bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header border-b">
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Usuario</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Email</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Rol</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Comisión</TableHead>
              <TableHead className="text-center text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j} className="px-3"><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>
            )) : filtered.map((u) => (
              <TableRow key={u.id} className="cursor-pointer border-b border-border/50 hover:bg-table-hover transition-colors" onClick={() => navigate(`/usuarios/${u.id}`)}>
                <TableCell className="px-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {u.foto_url && <AvatarImage src={u.foto_url} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {u.nombre_completo.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-[13px]">{u.nombre_completo}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-[13px] px-3">{u.email}</TableCell>
                <TableCell className="px-3"><Badge className={rolColors[u.rol] || rolColors.cobrador}>{rolLabels[u.rol] || u.rol}</Badge></TableCell>
                <TableCell className="text-[13px] px-3">{u.porcentaje_comision}%</TableCell>
                <TableCell className="text-center text-[13px] px-3">{u.activo ? "✓" : "✗"}</TableCell>
              </TableRow>
            ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-[13px]">No hay usuarios</TableCell></TableRow>
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
  const { empresaId } = useEmpresa();
  const { data: usuarios } = useUsuarios(empresaId);
  const { data: rutas } = useRutas(empresaId);
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

  // Supervisor fields
  const [rutasAsignadas, setRutasAsignadas] = useState<string[]>([]);
  const [comisionTipo, setComisionTipo] = useState("ninguna");
  const [comisionCobros, setComisionCobros] = useState("0");
  const [comisionPrestamos, setComisionPrestamos] = useState("0");
  const [bonoMonto, setBonoMonto] = useState("0");
  const [bonoObjetivo, setBonoObjetivo] = useState("0");

  useEffect(() => {
    if (user) {
      setNombre(user.nombre_completo);
      setEmail(user.email);
      setTelefono(user.telefono || "");
      setDireccion(user.direccion || "");
      setRol(rolLabels[user.rol] || "Cobrador");
      setComision(String(user.porcentaje_comision));
      setActivo(user.activo);
      setRutasAsignadas(user.rutas_asignadas || []);
      setComisionTipo(user.comision_tipo || "ninguna");
      setComisionCobros(String(user.comision_cobros_equipo || 0));
      setComisionPrestamos(String(user.comision_prestamos || 0));
      setBonoMonto(String(user.bono_meta_monto || 0));
      setBonoObjetivo(String(user.bono_meta_objetivo || 0));
    }
  }, [user]);

  const toggleRuta = (rutaId: string) => {
    setRutasAsignadas((prev) => prev.includes(rutaId) ? prev.filter((r) => r !== rutaId) : [...prev, rutaId]);
  };

  const isSupervisor = rol === "Supervisor";

  const handleSave = async () => {
    if (!nombre.trim() || !email.trim()) { toast.error("Nombre y email son obligatorios"); return; }
    if (isNew && !password) { toast.error("La contraseña es obligatoria"); return; }

    setSaving(true);
    try {
      const payload = {
        nombre_completo: nombre.trim(),
        telefono: telefono.trim() || null,
        direccion: direccion.trim() || null,
        rol,
        porcentaje_comision: parseFloat(comision) || 0,
        activo,
        empresa_id: empresaId,
        comision_tipo: isSupervisor ? comisionTipo : "ninguna",
        comision_cobros_equipo: parseFloat(comisionCobros) || 0,
        comision_prestamos: parseFloat(comisionPrestamos) || 0,
        bono_meta_monto: parseFloat(bonoMonto) || 0,
        bono_meta_objetivo: parseFloat(bonoObjetivo) || 0,
        rutas_asignadas: isSupervisor ? rutasAsignadas : [],
      };

      if (isNew) {
        const { data, error } = await supabase.functions.invoke("manage-users", {
          body: { action: "create", email, password, ...payload },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Usuario creado");
        queryClient.invalidateQueries({ queryKey: ["usuarios"] });
        navigate("/usuarios");
      } else {
        const { data, error } = await supabase.functions.invoke("manage-users", {
          body: { action: "update", user_id: id, password: password || undefined, ...payload },
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

  const initials = nombre ? nombre.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "??";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/usuarios")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Usuarios</p><span className="text-sm text-muted-foreground">/</span>
              <p className="text-sm">{isNew ? "Nuevo" : nombre}</p>
            </div>
            <h1 className="text-2xl font-bold">{isNew ? "Nuevo Usuario" : nombre}</h1>
          </div>
          {!isNew && user && <Badge className={rolColors[user.rol] || rolColors.cobrador}>{rolLabels[user.rol] || user.rol}</Badge>}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => (isNew ? navigate("/usuarios") : setEditing(false))} disabled={saving}><X className="h-4 w-4 mr-2" />Descartar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={saving}><Trash2 className="h-4 w-4 mr-2" />Eliminar</Button>
            </>
          )}
        </div>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          {user?.foto_url && <AvatarImage src={user.foto_url} />}
          <AvatarFallback className="bg-primary/10 text-primary text-2xl">{initials}</AvatarFallback>
        </Avatar>
        {!isNew && <div><p className="font-semibold text-lg">{nombre}</p><p className="text-sm text-muted-foreground">{email}</p></div>}
      </div>

      {/* Info */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Información del Usuario</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Nombre completo *</Label>
            {editing ? <Input value={nombre} onChange={(e) => setNombre(e.target.value)} /> : <p className="text-sm font-medium mt-1">{nombre || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email *</Label>
            {editing && isNew ? <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /> : <p className="text-sm font-medium mt-1">{email || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Teléfono</Label>
            {editing ? <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /> : <p className="text-sm font-medium mt-1">{telefono || "—"}</p>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Dirección</Label>
            {editing ? <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /> : <p className="text-sm font-medium mt-1">{direccion || "—"}</p>}
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
            <Label className="text-xs text-muted-foreground">% Comisión personal</Label>
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
                <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? "Contraseña" : "Dejar vacío para no cambiar"} />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supervisor config */}
      {(isSupervisor || (!editing && user?.rol === "supervisor")) && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Rutas Asignadas</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(rutas || []).map((r) => (
                    <label key={r.id} className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                      <Checkbox checked={rutasAsignadas.includes(r.id)} onCheckedChange={() => toggleRuta(r.id)} />
                      <span className="text-sm">{r.nombre}</span>
                    </label>
                  ))}
                  {(rutas || []).length === 0 && <p className="text-sm text-muted-foreground col-span-full">No hay rutas creadas</p>}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {rutasAsignadas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin rutas asignadas</p>
                  ) : (
                    rutasAsignadas.map((rid) => {
                      const ruta = rutas?.find((r) => r.id === rid);
                      return <Badge key={rid} variant="secondary">{ruta?.nombre || rid}</Badge>;
                    })
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Comisiones de Supervisor</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tipo de comisión</Label>
                    <Select value={comisionTipo} onValueChange={setComisionTipo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguna">Sin comisión extra</SelectItem>
                        <SelectItem value="cobros_equipo">% sobre cobros de su equipo</SelectItem>
                        <SelectItem value="prestamos_generados">% sobre préstamos generados</SelectItem>
                        <SelectItem value="ambos">Ambos (cobros + préstamos)</SelectItem>
                        <SelectItem value="bono_meta">Bono fijo por meta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(comisionTipo === "cobros_equipo" || comisionTipo === "ambos") && (
                    <div>
                      <Label className="text-xs text-muted-foreground">% Comisión sobre cobros del equipo</Label>
                      <Input type="number" min="0" max="100" step="0.5" value={comisionCobros} onChange={(e) => setComisionCobros(e.target.value)} />
                    </div>
                  )}
                  {(comisionTipo === "prestamos_generados" || comisionTipo === "ambos") && (
                    <div>
                      <Label className="text-xs text-muted-foreground">% Comisión sobre préstamos generados</Label>
                      <Input type="number" min="0" max="100" step="0.5" value={comisionPrestamos} onChange={(e) => setComisionPrestamos(e.target.value)} />
                    </div>
                  )}
                  {comisionTipo === "bono_meta" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Monto del bono ($)</Label>
                        <Input type="number" min="0" step="1" value={bonoMonto} onChange={(e) => setBonoMonto(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Meta de cobranza ($)</Label>
                        <Input type="number" min="0" step="1" value={bonoObjetivo} onChange={(e) => setBonoObjetivo(e.target.value)} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tipo</Label>
                    <p className="text-sm font-medium mt-1">
                      {{ ninguna: "Sin comisión extra", cobros_equipo: "% sobre cobros del equipo", prestamos_generados: "% sobre préstamos", ambos: "Cobros + Préstamos", bono_meta: "Bono por meta" }[comisionTipo] || comisionTipo}
                    </p>
                  </div>
                  {(comisionTipo === "cobros_equipo" || comisionTipo === "ambos") && (
                    <div><Label className="text-xs text-muted-foreground">% Cobros equipo</Label><p className="text-sm font-medium mt-1">{comisionCobros}%</p></div>
                  )}
                  {(comisionTipo === "prestamos_generados" || comisionTipo === "ambos") && (
                    <div><Label className="text-xs text-muted-foreground">% Préstamos</Label><p className="text-sm font-medium mt-1">{comisionPrestamos}%</p></div>
                  )}
                  {comisionTipo === "bono_meta" && (
                    <>
                      <div><Label className="text-xs text-muted-foreground">Bono</Label><p className="text-sm font-medium mt-1">${bonoMonto}</p></div>
                      <div><Label className="text-xs text-muted-foreground">Meta</Label><p className="text-sm font-medium mt-1">${bonoObjetivo}</p></div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function UsuariosPage() {
  const { id } = useParams();
  return id ? <UsuarioDetallePage /> : <UsuariosListPage />;
}
