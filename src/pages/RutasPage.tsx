import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowLeft, Pencil, Save, X, MapPin, Loader2 } from "lucide-react";

interface Ruta {
  id: string;
  nombre: string;
  descripcion: string | null;
  cobrador_id: string | null;
  created_at: string | null;
  cobradorNombre: string;
  prestamosCount: number;
}

function useRutas(empresaId: string) {
  return useQuery({
    queryKey: ["rutas-page", empresaId],
    queryFn: async () => {
      const { data: rutas, error } = await supabase
        .from("rutas")
        .select("id, nombre, descripcion, cobrador_id, created_at")
        .eq("empresa_id", empresaId)
        .order("nombre");
      if (error) throw error;

      // Get cobrador names
      const cobIds = [...new Set((rutas || []).map(r => r.cobrador_id).filter(Boolean))];
      let cobMap: Record<string, string> = {};
      if (cobIds.length) {
        const { data: cobs } = await (supabase.from as any)("cobradores").select("id, nombre").in("id", cobIds);
        for (const c of cobs || []) cobMap[c.id] = c.nombre;
      }

      // Count prestamos per ruta
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select("ruta_id")
        .not("estado", "in", '("Cancelado","Liquidado")');
      const countMap: Record<string, number> = {};
      for (const p of prestamos || []) {
        if (p.ruta_id) countMap[p.ruta_id] = (countMap[p.ruta_id] || 0) + 1;
      }

      return (rutas || []).map((r): Ruta => ({
        ...r,
        cobradorNombre: r.cobrador_id ? cobMap[r.cobrador_id] || "—" : "Sin asignar",
        prestamosCount: countMap[r.id] || 0,
      }));
    },
  });
}

function useCobradores() {
  return useQuery({
    queryKey: ["cobradores-options"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("cobradores").select("id, nombre").eq("activo", true).order("nombre");
      return data || [];
    },
  });
}

function RutasListPage() {
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const { data: rutas = [], isLoading } = useRutas(empresaId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Rutas</h1>
        <Button size="sm" className="h-8 text-[13px]" onClick={() => navigate("/rutas/nuevo")}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Nueva Ruta
        </Button>
      </div>
      <div className="bg-card rounded-lg border border-border overflow-x-auto shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header border-b">
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Nombre</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Cobrador</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Descripción</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2.5">Préstamos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={4} className="px-3 py-3"><Skeleton className="h-4 w-full" /></TableCell></TableRow>
              ))
            ) : rutas.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-[13px]">No hay rutas registradas</TableCell></TableRow>
            ) : rutas.map((r) => (
              <TableRow key={r.id} className="cursor-pointer border-b border-border/50 hover:bg-table-hover transition-colors" onClick={() => navigate(`/rutas/${r.id}`)}>
                <TableCell className="font-medium text-[13px] px-3"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{r.nombre}</div></TableCell>
                <TableCell className="text-[13px] px-3">{r.cobradorNombre}</TableCell>
                <TableCell className="text-muted-foreground text-[13px] px-3">{r.descripcion || "—"}</TableCell>
                <TableCell className="text-right text-[13px] px-3">{r.prestamosCount}</TableCell>
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
  const queryClient = useQueryClient();
  const { data: cobradores = [] } = useCobradores();

  const { data: ruta, isLoading } = useQuery({
    queryKey: ["ruta-detalle", id],
    queryFn: async () => {
      if (isNew) return null;
      const { data, error } = await supabase.from("rutas").select("id, nombre, descripcion, cobrador_id, empresa_id, created_at").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !isNew,
  });

  // Prestamos in this ruta
  const { data: prestamosRuta = [] } = useQuery({
    queryKey: ["prestamos-ruta", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("prestamos")
        .select("id, monto_solicitado, estado, clientes ( nombre_completo )")
        .eq("ruta_id", id!)
        .not("estado", "in", '("Cancelado")')
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !isNew && !!id,
  });

  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cobradorId, setCobradorId] = useState<string>("");

  // Sync form when ruta loads
  const [synced, setSynced] = useState(false);
  if (ruta && !synced) {
    setNombre(ruta.nombre);
    setDescripcion(ruta.descripcion || "");
    setCobradorId(ruta.cobrador_id || "");
    setSynced(true);
  }

  const handleGuardar = async () => {
    if (!nombre.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from("rutas").insert({
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          cobrador_id: cobradorId || null,
        });
        if (error) throw error;
        toast.success("Ruta creada");
      } else {
        const { error } = await supabase.from("rutas").update({
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          cobrador_id: cobradorId || null,
        }).eq("id", id!);
        if (error) throw error;
        toast.success("Ruta actualizada");
      }
      queryClient.invalidateQueries({ queryKey: ["rutas-page"] });
      queryClient.invalidateQueries({ queryKey: ["ruta-detalle", id] });
      if (isNew) navigate("/rutas");
      else setEditing(false);
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const cobradorNombre = cobradores.find((c: any) => c.id === cobradorId)?.nombre || "Sin asignar";

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
            <>
              <Button variant="outline" onClick={() => isNew ? navigate("/rutas") : setEditing(false)}><X className="h-4 w-4 mr-2" />Descartar</Button>
              <Button onClick={handleGuardar} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button>
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
            {editing ? (
              <Select value={cobradorId} onValueChange={setCobradorId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cobrador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {cobradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <p className="text-sm font-medium mt-1">{cobradorNombre}</p>}
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Descripción</Label>
            {editing ? <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /> : <p className="text-sm font-medium mt-1">{descripcion || "—"}</p>}
          </div>
        </CardContent>
      </Card>
      {!isNew && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Préstamos en esta Ruta ({prestamosRuta.length})</CardTitle></CardHeader>
          <CardContent>
            {prestamosRuta.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay préstamos asignados a esta ruta</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-table-header hover:bg-table-header border-b">
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2">Cliente</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2 text-right">Monto</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-table-header-foreground px-3 py-2">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prestamosRuta.map((p: any) => (
                    <TableRow key={p.id} className="border-b border-border/50 hover:bg-table-hover cursor-pointer" onClick={() => navigate(`/prestamos/${p.id}`)}>
                      <TableCell className="text-[13px] px-3">{(p.clientes as any)?.nombre_completo || "—"}</TableCell>
                      <TableCell className="text-[13px] px-3 text-right">${Number(p.monto_solicitado).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-[13px] px-3">{p.estado}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function RutasPage() {
  const { id } = useParams();
  return id ? <RutaDetallePage /> : <RutasListPage />;
}
