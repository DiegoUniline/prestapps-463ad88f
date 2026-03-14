import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$ } from "@/lib/utils";
import { ScrollText, Search, HandCoins, XCircle, CreditCard, CalendarCheck, MapPin, MessageSquare } from "lucide-react";
interface AuditEntry {
  id: string;
  tipo: string;
  accion: string;
  descripcion: string;
  usuario: string;
  fecha: string;
  monto?: number;
  icono: any;
  color: string;
}

export default function AuditoriaPage() {
  const { empresaId } = useEmpresa();
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  // Pagos (incluye anulaciones)
  const { data: pagos, isLoading: lp } = useQuery({
    queryKey: ["audit-pagos", empresaId],
    queryFn: async () => {
      const data = await fetchAllRows<any>(
        supabase
          .from("pagos")
          .select("id, monto_recibido, anulado, anulado_por, anulado_en, motivo_anulacion, created_at, registrado_por, prestamo_id, prestamos!inner(clientes!inner(nombre_completo))")
          .eq("empresa_id", empresaId)
          .order("created_at", { ascending: false })
      );
      return data;
    },
  });

  // CRM gestiones
  const { data: gestiones, isLoading: lg } = useQuery({
    queryKey: ["audit-gestiones", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_gestiones")
        .select("id, tipo_gestion, resultado, notas, created_at, registrado_por, prestamo_id, clientes!inner(nombre_completo)")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  // Promesas
  const { data: promesas, isLoading: lpr } = useQuery({
    queryKey: ["audit-promesas", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("promesas_pago")
        .select("id, monto_prometido, fecha_prometida, status, created_at, prestamo_id")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  // Profiles map
  const { data: profiles } = useQuery({
    queryKey: ["audit-profiles", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nombre_completo").eq("empresa_id", empresaId);
      const map: Record<string, string> = {};
      for (const p of data || []) map[p.id] = p.nombre_completo;
      return map;
    },
  });

  const entries: AuditEntry[] = useMemo(() => {
    const list: AuditEntry[] = [];
    const pMap = profiles || {};

    // Pagos
    for (const p of pagos || []) {
      const cliente = (p as any).prestamos?.clientes?.nombre_completo || "—";
      list.push({
        id: `pago-${p.id}`,
        tipo: "pago",
        accion: "Pago registrado",
        descripcion: `${cliente} — ${$$(p.monto_recibido)}`,
        usuario: pMap[p.registrado_por || ""] || "Sistema",
        fecha: p.created_at || "",
        monto: p.monto_recibido,
        icono: HandCoins,
        color: "text-success",
      });

      if (p.anulado) {
        list.push({
          id: `anulacion-${p.id}`,
          tipo: "anulacion",
          accion: "Pago anulado",
          descripcion: `${cliente} — ${$$(p.monto_recibido)}${p.motivo_anulacion ? ` • ${p.motivo_anulacion}` : ""}`,
          usuario: pMap[p.anulado_por || ""] || "Sistema",
          fecha: p.anulado_en || p.created_at || "",
          monto: p.monto_recibido,
          icono: XCircle,
          color: "text-destructive",
        });
      }
    }

    // Gestiones
    for (const g of gestiones || []) {
      const cliente = (g as any).clientes?.nombre_completo || "—";
      const tipoLabel = g.tipo_gestion === "visita" ? "Visita" : g.tipo_gestion === "llamada" ? "Llamada" : g.tipo_gestion === "whatsapp" ? "WhatsApp" : g.tipo_gestion;
      list.push({
        id: `gestion-${g.id}`,
        tipo: "gestion",
        accion: `${tipoLabel}: ${g.resultado}`,
        descripcion: `${cliente}${g.notas ? ` — ${g.notas.slice(0, 80)}` : ""}`,
        usuario: pMap[g.registrado_por || ""] || "Sistema",
        fecha: g.created_at || "",
        icono: g.tipo_gestion === "visita" ? MapPin : g.tipo_gestion === "whatsapp" ? MessageSquare : CreditCard,
        color: "text-primary",
      });
    }

    // Promesas
    for (const p of promesas || []) {
      list.push({
        id: `promesa-${p.id}`,
        tipo: "promesa",
        accion: "Promesa registrada",
        descripcion: `${$$(p.monto_prometido)} para ${p.fecha_prometida} — ${p.status}`,
        usuario: "Sistema",
        fecha: p.created_at || "",
        monto: p.monto_prometido,
        icono: CalendarCheck,
        color: "text-purple-500",
      });
    }

    list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return list;
  }, [pagos, gestiones, promesas, profiles]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filtroTipo !== "todos" && e.tipo !== filtroTipo) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.descripcion.toLowerCase().includes(q) || e.usuario.toLowerCase().includes(q) || e.accion.toLowerCase().includes(q);
      }
      return true;
    });
  }, [entries, search, filtroTipo]);

  const isLoading = lp || lg || lpr;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" />
          Auditoría y Bitácora
        </h1>
        <p className="text-muted-foreground text-sm">Registro completo de actividades del sistema</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p><p className="text-xl font-bold">{entries.length}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pagos</p><p className="text-xl font-bold text-success">{entries.filter(e => e.tipo === "pago").length}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Anulaciones</p><p className="text-xl font-bold text-destructive">{entries.filter(e => e.tipo === "anulacion").length}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gestiones</p><p className="text-xl font-bold text-primary">{entries.filter(e => e.tipo === "gestion").length}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Promesas</p><p className="text-xl font-bold">{entries.filter(e => e.tipo === "promesa").length}</p></Card>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
            <SelectItem value="anulacion">Anulaciones</SelectItem>
            <SelectItem value="gestion">Gestiones</SelectItem>
            <SelectItem value="promesa">Promesas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <Card>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Fecha/Hora</TableHead>
                  <TableHead className="text-xs">Acción</TableHead>
                  <TableHead className="text-xs">Descripción</TableHead>
                  <TableHead className="text-xs">Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map(e => {
                  const Icon = e.icono;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="px-3"><Icon className={cn("h-4 w-4", e.color)} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {e.fecha ? format(new Date(e.fecha), "dd/MM/yy HH:mm", { locale: es }) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{e.accion}</Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{e.descripcion}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.usuario}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin registros</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
