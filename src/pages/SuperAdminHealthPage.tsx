import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, MessageCircle, CreditCard, Database, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface EmpresaHealth {
  id: string;
  nombre: string;
  whatsapp_activo: boolean;
  whatsapp_errores_24h: number;
  whatsapp_ultimo_envio: string | null;
  whatsapp_ultimo_estado: string | null;
  stripe_conectado: boolean;
  prestamos_activos: number;
  suscripcion_estado: string | null;
}

export default function SuperAdminHealthPage() {
  const [empresas, setEmpresas] = useState<EmpresaHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbHealth, setDbHealth] = useState<{ totalPrestamos: number; totalPagos: number; totalEmpresas: number } | null>(null);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Parallel fetch
    const [empresasRes, waConfigRes, waLogRes, stripeRes, suscRes, prestRes, pagosCountRes] = await Promise.all([
      supabase.from("empresas").select("id, nombre").order("nombre"),
      supabase.from("whatsapp_config").select("empresa_id, activo"),
      supabase.from("whatsapp_log").select("empresa_id, status, created_at, error_detalle").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("stripe_connect_accounts").select("empresa_id, charges_enabled"),
      supabase.from("suscripciones").select("empresa_id, estado"),
      supabase.from("prestamos").select("empresa_id, estado"),
      supabase.from("pagos").select("id", { count: "exact", head: true }),
    ]);

    const waMap = new Map((waConfigRes.data || []).map(c => [c.empresa_id, c]));
    const stripeMap = new Map((stripeRes.data || []).map(s => [s.empresa_id, s]));
    const suscMap = new Map((suscRes.data || []).map(s => [s.empresa_id, s.estado]));

    // Errors and last send by empresa
    const erroresMap = new Map<string, number>();
    const ultimoMap = new Map<string, { fecha: string; status: string }>();
    for (const log of (waLogRes.data || [])) {
      if (log.status === "error") {
        erroresMap.set(log.empresa_id, (erroresMap.get(log.empresa_id) || 0) + 1);
      }
      if (!ultimoMap.has(log.empresa_id)) {
        ultimoMap.set(log.empresa_id, { fecha: log.created_at, status: log.status });
      }
    }

    // Loans active by empresa
    const prestamosMap = new Map<string, number>();
    for (const p of (prestRes.data || [])) {
      if (p.estado === "Activo" || p.estado === "Vencido") {
        prestamosMap.set(p.empresa_id, (prestamosMap.get(p.empresa_id) || 0) + 1);
      }
    }

    const list: EmpresaHealth[] = (empresasRes.data || []).map(e => ({
      id: e.id,
      nombre: e.nombre,
      whatsapp_activo: waMap.get(e.id)?.activo || false,
      whatsapp_errores_24h: erroresMap.get(e.id) || 0,
      whatsapp_ultimo_envio: ultimoMap.get(e.id)?.fecha || null,
      whatsapp_ultimo_estado: ultimoMap.get(e.id)?.status || null,
      stripe_conectado: stripeMap.get(e.id)?.charges_enabled || false,
      prestamos_activos: prestamosMap.get(e.id) || 0,
      suscripcion_estado: suscMap.get(e.id) || null,
    }));

    // Sort: most problems first
    list.sort((a, b) => b.whatsapp_errores_24h - a.whatsapp_errores_24h);

    setEmpresas(list);
    setDbHealth({
      totalPrestamos: prestRes.data?.length || 0,
      totalPagos: pagosCountRes.count || 0,
      totalEmpresas: empresasRes.data?.length || 0,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalErrores = empresas.reduce((s, e) => s + e.whatsapp_errores_24h, 0);
  const empresasConProblema = empresas.filter(e => e.whatsapp_errores_24h > 0).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Estado del Sistema"
        subtitle="Diagnóstico en tiempo real de WhatsApp, suscripciones y base de datos"
        actions={
          <Button onClick={load} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
        }
      />

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Empresas</p>
                <p className="text-2xl font-bold mt-1">{dbHealth?.totalEmpresas ?? "—"}</p>
              </div>
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Préstamos totales</p>
                <p className="text-2xl font-bold mt-1">{dbHealth?.totalPrestamos ?? "—"}</p>
              </div>
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Errores WA (24h)</p>
                <p className={`text-2xl font-bold mt-1 ${totalErrores > 0 ? "text-destructive" : ""}`}>{totalErrores}</p>
              </div>
              {totalErrores > 0 ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Empresas con problemas</p>
                <p className={`text-2xl font-bold mt-1 ${empresasConProblema > 0 ? "text-amber-500" : ""}`}>{empresasConProblema}</p>
              </div>
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista por empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status por empresa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="divide-y">
              {empresas.map(e => (
                <div key={e.id} className="p-4 flex items-center justify-between gap-3 hover:bg-muted/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{e.nombre}</p>
                      {e.suscripcion_estado && (
                        <Badge variant={e.suscripcion_estado === "activa" ? "default" : "destructive"} className="text-[10px]">
                          {e.suscripcion_estado}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.prestamos_activos} préstamos activos
                      {e.whatsapp_ultimo_envio && (
                        <>  ·  último WA: {new Date(e.whatsapp_ultimo_envio).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* WhatsApp */}
                    <Badge
                      variant={!e.whatsapp_activo ? "secondary" : e.whatsapp_errores_24h > 0 ? "destructive" : "default"}
                      className="gap-1"
                    >
                      <MessageCircle className="h-3 w-3" />
                      {!e.whatsapp_activo ? "WA off" : e.whatsapp_errores_24h > 0 ? `${e.whatsapp_errores_24h} err` : "OK"}
                    </Badge>
                    {/* Stripe */}
                    <Badge variant={e.stripe_conectado ? "default" : "secondary"} className="gap-1">
                      <CreditCard className="h-3 w-3" />
                      {e.stripe_conectado ? "Stripe" : "—"}
                    </Badge>
                  </div>
                </div>
              ))}
              {empresas.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
                  Todo en orden.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" /> Errores WA cuentan envíos fallidos en las últimas 24h. Si una empresa muestra muchos errores, su instancia UltraMsg/WhatsAPI probablemente está desconectada.
      </p>
    </div>
  );
}
