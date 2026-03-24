import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays, parseISO, subDays, isAfter, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import { cn, $$, fmtDate } from "@/lib/utils";
import {
  AlertTriangle, Bell, CalendarCheck, Clock, Users, TrendingDown,
  ChevronRight, XCircle, Eye, HandCoins, MessageSquare, Loader2,
} from "lucide-react";
interface Alerta {
  id: string;
  tipo: "promesa_incumplida" | "sin_pago" | "vence_manana" | "cobrador_inactivo" | "mora_alta" | "meta_riesgo";
  severidad: "critica" | "alta" | "media" | "info";
  titulo: string;
  descripcion: string;
  prestamoId?: string;
  clienteId?: string;
  cobradorId?: string;
  monto?: number;
}

const SEVERIDAD_STYLES: Record<string, string> = {
  critica: "border-destructive/40 bg-destructive/5",
  alta: "border-orange-500/40 bg-orange-500/5",
  media: "border-yellow-500/40 bg-yellow-500/5",
  info: "border-primary/40 bg-primary/5",
};

const SEVERIDAD_BADGE: Record<string, string> = {
  critica: "bg-destructive text-destructive-foreground",
  alta: "bg-orange-500 text-white",
  media: "bg-yellow-500 text-white",
  info: "bg-primary text-primary-foreground",
};

export default function AlertasPage() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();

  // Promesas incumplidas
  const { data: promesas, isLoading: loadingPromesas } = useQuery({
    queryKey: ["alertas-promesas", empresaId],
    queryFn: async () => {
      const hoy = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase
        .from("promesas_pago")
        .select("id, prestamo_id, cuota_id, monto_prometido, fecha_prometida, status, prestamos!inner(clientes!inner(nombre_completo, id))")
        .eq("empresa_id", empresaId)
        .eq("status", "Pendiente")
        .lt("fecha_prometida", hoy);
      return data || [];
    },
  });

  // Cuotas vencidas sin gestión reciente
  const { data: sinGestion, isLoading: loadingSinGestion } = useQuery({
    queryKey: ["alertas-sin-gestion", empresaId],
    queryFn: async () => {
      const { data: cuotas } = await supabase
        .from("amortizacion")
        .select("id, prestamo_id, num_cuota, saldo_total, dias_atraso, fecha_vencimiento")
        .eq("empresa_id", empresaId)
        .in("status", ["Vencida"])
        .gt("dias_atraso", 7)
        .order("dias_atraso", { ascending: false })
        .limit(50);

      if (!cuotas?.length) return [];

      const prestamoIds = [...new Set(cuotas.map(c => c.prestamo_id))];
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select("id, cliente_id, clientes(nombre_completo)")
        .in("id", prestamoIds);

      const { data: gestiones } = await supabase
        .from("crm_gestiones")
        .select("prestamo_id, created_at")
        .in("prestamo_id", prestamoIds)
        .order("created_at", { ascending: false });

      const lastGestion: Record<string, string> = {};
      for (const g of gestiones || []) {
        if (!lastGestion[g.prestamo_id]) lastGestion[g.prestamo_id] = g.created_at || "";
      }

      const presMap: Record<string, any> = {};
      for (const p of prestamos || []) presMap[p.id] = p;

      return cuotas.map(c => ({
        ...c,
        cliente: (presMap[c.prestamo_id]?.clientes as any)?.nombre_completo || "—",
        clienteId: presMap[c.prestamo_id]?.cliente_id,
        ultimaGestion: lastGestion[c.prestamo_id] || null,
        diasSinGestion: lastGestion[c.prestamo_id]
          ? differenceInDays(new Date(), new Date(lastGestion[c.prestamo_id]))
          : null,
      }));
    },
  });

  // Cuotas que vencen mañana
  const { data: venceManana, isLoading: loadingManana } = useQuery({
    queryKey: ["alertas-vence-manana", empresaId],
    queryFn: async () => {
      const manana = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
      const { data } = await supabase
        .from("amortizacion")
        .select("id, prestamo_id, num_cuota, saldo_total, prestamos!inner(clientes!inner(nombre_completo, id, telefono))")
        .eq("empresa_id", empresaId)
        .eq("fecha_vencimiento", manana)
        .in("status", ["Pendiente", "Parcial"]);
      return data || [];
    },
  });

  // Build alerts
  const alertas: Alerta[] = useMemo(() => {
    const list: Alerta[] = [];

    // Promesas incumplidas
    for (const p of promesas || []) {
      const cliente = (p as any).prestamos?.clientes;
      list.push({
        id: `promesa-${p.id}`,
        tipo: "promesa_incumplida",
        severidad: "critica",
        titulo: `Promesa incumplida: ${cliente?.nombre_completo || "—"}`,
        descripcion: `Prometió ${$$(p.monto_prometido)} para el ${fmtDate(p.fecha_prometida)}`,
        prestamoId: p.prestamo_id,
        clienteId: cliente?.id,
        monto: p.monto_prometido,
      });
    }

    // Sin gestión > 7 días
    for (const c of sinGestion || []) {
      if (c.diasSinGestion === null || c.diasSinGestion > 5) {
        list.push({
          id: `sin-gestion-${c.id}`,
          tipo: "sin_pago",
          severidad: (c.dias_atraso || 0) > 30 ? "critica" : "alta",
          titulo: `${c.cliente} — ${c.dias_atraso}d en mora`,
          descripcion: c.diasSinGestion
            ? `Última gestión hace ${c.diasSinGestion} días. Saldo: ${$$(c.saldo_total || 0)}`
            : `Sin gestiones registradas. Saldo: ${$$(c.saldo_total || 0)}`,
          prestamoId: c.prestamo_id,
          clienteId: c.clienteId,
          monto: c.saldo_total || 0,
        });
      }
    }

    // Vence mañana
    for (const c of venceManana || []) {
      const cliente = (c as any).prestamos?.clientes;
      list.push({
        id: `manana-${c.id}`,
        tipo: "vence_manana",
        severidad: "info",
        titulo: `Cuota #${c.num_cuota} vence mañana: ${cliente?.nombre_completo || "—"}`,
        descripcion: `Monto: ${$$(c.saldo_total || 0)}${cliente?.telefono ? ` • Tel: ${cliente.telefono}` : ""}`,
        prestamoId: c.prestamo_id,
        clienteId: cliente?.id,
        monto: c.saldo_total || 0,
      });
    }

    // Sort by severidad
    const sevOrder: Record<string, number> = { critica: 0, alta: 1, media: 2, info: 3 };
    list.sort((a, b) => sevOrder[a.severidad] - sevOrder[b.severidad]);

    return list;
  }, [promesas, sinGestion, venceManana]);

  const isLoading = loadingPromesas || loadingSinGestion || loadingManana;

  const alertasByTipo = (tipo: string) => alertas.filter(a => a.tipo === tipo);
  const countByTipo = (tipo: string) => alertasByTipo(tipo).length;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          Alertas Inteligentes
        </h1>
        <p className="text-muted-foreground text-sm">Seguimiento proactivo de la cartera</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Promesas incumplidas" count={countByTipo("promesa_incumplida")} icon={XCircle} color="text-destructive" />
        <SummaryCard label="Sin gestión (+7d)" count={countByTipo("sin_pago")} icon={AlertTriangle} color="text-orange-500" />
        <SummaryCard label="Vencen mañana" count={countByTipo("vence_manana")} icon={Clock} color="text-primary" />
        <SummaryCard label="Total alertas" count={alertas.length} icon={Bell} color="text-foreground" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <Tabs defaultValue="todas">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="todas">Todas ({alertas.length})</TabsTrigger>
            <TabsTrigger value="promesa_incumplida">Promesas ({countByTipo("promesa_incumplida")})</TabsTrigger>
            <TabsTrigger value="sin_pago">Sin gestión ({countByTipo("sin_pago")})</TabsTrigger>
            <TabsTrigger value="vence_manana">Mañana ({countByTipo("vence_manana")})</TabsTrigger>
          </TabsList>

          {["todas", "promesa_incumplida", "sin_pago", "vence_manana"].map(tab => (
            <TabsContent key={tab} value={tab} className="mt-3 space-y-2">
              {(tab === "todas" ? alertas : alertasByTipo(tab)).length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">Sin alertas en esta categoría ✓</CardContent></Card>
              ) : (
                (tab === "todas" ? alertas : alertasByTipo(tab)).map(alerta => (
                  <Card key={alerta.id} className={cn("border", SEVERIDAD_STYLES[alerta.severidad])}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge className={cn("text-[10px] h-5", SEVERIDAD_BADGE[alerta.severidad])}>
                              {alerta.severidad}
                            </Badge>
                            <p className="font-medium text-sm truncate">{alerta.titulo}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{alerta.descripcion}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {alerta.prestamoId && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/prestamos/${alerta.prestamoId}`)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function SummaryCard({ label, count, icon: Icon, color }: { label: string; count: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <p className={cn("text-2xl font-bold", count > 0 ? color : "text-muted-foreground")}>{count}</p>
      </CardContent>
    </Card>
  );
}
