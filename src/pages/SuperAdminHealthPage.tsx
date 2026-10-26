import { useState, useEffect, useCallback } from "react";
import { rpc } from "@/lib/supabaseQuery";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, MessageCircle, CreditCard, Database, Clock, Bug, Gauge } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface EmpresaHealth {
  empresa_id: string;
  nombre: string;
  activa: boolean;
  plan: string;
  prestamos_activos: number;
  prestamos_total: number;
  pagos_30d: number;
  monto_pagos_30d: number;
  usuarios: number;
  usuarios_activos: number;
  wa_activo: boolean;
  wa_errores_24h: number;
  wa_ultimo_envio: string | null;
  wa_ultimo_estado: string | null;
  stripe_conectado: boolean;
  suscripcion_estado: string | null;
  errores_cliente_24h: number;
}

interface ErrorGrupo {
  clave: string;
  mensaje: string;
  conteo: number;
  usuarios: number;
  empresas: number;
  primero: string;
  ultimo: string;
  stack: string | null;
  url: string | null;
  version: string | null;
  empresa_nombre: string | null;
}

interface ErroresResumen {
  total: number;
  total_24h: number;
  grupos: ErrorGrupo[];
}

interface ConsultaLenta {
  calls: number;
  total_ms: number;
  mean_ms: number;
  filas: number;
  query: string;
}

interface TablaStat {
  tabla: string;
  filas: number;
  filas_muertas: number;
  seq_scan: number;
  idx_scan: number;
  tamano_bytes: number;
  ultimo_vacuum: string | null;
  ultimo_analyze: string | null;
}

const PERIODOS = [
  { label: "24h", horas: 24 },
  { label: "7 días", horas: 24 * 7 },
  { label: "30 días", horas: 24 * 30 },
];

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const fmtNum = (n: number) => Number(n || 0).toLocaleString("es-MX");

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

function SectionError({ msg }: { msg: string }) {
  return (
    <div className="p-4 text-sm text-destructive flex items-center gap-2">
      <AlertTriangle className="h-4 w-4" /> {msg}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="p-4 space-y-2">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

export default function SuperAdminHealthPage() {
  const [empresas, setEmpresas] = useState<EmpresaHealth[]>([]);
  const [errores, setErrores] = useState<ErroresResumen | null>(null);
  const [lentas, setLentas] = useState<ConsultaLenta[]>([]);
  const [tablas, setTablas] = useState<TablaStat[]>([]);
  const [fallos, setFallos] = useState<Record<string, string>>({});
  const [periodo, setPeriodo] = useState(24 * 7);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const desde = new Date(Date.now() - periodo * 60 * 60 * 1000).toISOString();
    const [empRes, errRes, lentasRes, tablasRes] = await Promise.all([
      rpc<EmpresaHealth[]>("admin_tenant_summary"),
      rpc<ErroresResumen>("admin_client_errors", { p_limit: 100, p_offset: 0, p_desde: desde }),
      rpc<ConsultaLenta[]>("admin_slow_queries", { p_limit: 25 }),
      rpc<TablaStat[]>("admin_table_stats"),
    ]);
    const f: Record<string, string> = {};
    if (empRes.error) f.empresas = empRes.error.message;
    if (errRes.error) f.errores = errRes.error.message;
    if (lentasRes.error) f.lentas = lentasRes.error.message;
    if (tablasRes.error) f.tablas = tablasRes.error.message;
    setFallos(f);
    setEmpresas(empRes.data || []);
    setErrores(errRes.data || null);
    setLentas(lentasRes.data || []);
    setTablas(tablasRes.data || []);
    setLoading(false);
  }, [periodo]);

  useEffect(() => { load(); }, [load]);

  const totalErroresWa = empresas.reduce((s, e) => s + Number(e.wa_errores_24h || 0), 0);
  const totalActivos = empresas.reduce((s, e) => s + Number(e.prestamos_activos || 0), 0);
  const empresasConProblema = empresas.filter(e => e.wa_errores_24h > 0 || e.errores_cliente_24h > 0).length;
  const erroresCliente24h = errores?.total_24h ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Estado del Sistema"
        description="Diagnóstico de WhatsApp, errores de la app, rendimiento de la base de datos y empresas"
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
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Empresas</p>
                <p className="kpi-num text-2xl font-bold mt-1">{loading ? "—" : empresas.length}</p>
              </div>
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Préstamos activos</p>
                <p className="kpi-num text-2xl font-bold mt-1">{loading ? "—" : fmtNum(totalActivos)}</p>
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
                <p className={`text-2xl font-bold mt-1 ${totalErroresWa > 0 ? "text-destructive" : ""}`}>{totalErroresWa}</p>
              </div>
              {totalErroresWa > 0 ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Errores app (24h)</p>
                <p className={`text-2xl font-bold mt-1 ${erroresCliente24h > 0 ? "text-amber-500" : ""}`}>{erroresCliente24h}</p>
              </div>
              <Bug className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="empresas">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="empresas">Empresas{empresasConProblema > 0 ? ` (${empresasConProblema})` : ""}</TabsTrigger>
          <TabsTrigger value="errores">Errores recientes</TabsTrigger>
          <TabsTrigger value="lentas">Consultas lentas</TabsTrigger>
          <TabsTrigger value="tablas">Tablas</TabsTrigger>
        </TabsList>

        {/* Resumen por empresa */}
        <TabsContent value="empresas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status por empresa</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <ListSkeleton /> : fallos.empresas ? <SectionError msg={fallos.empresas} /> : (
                <div className="divide-y">
                  {empresas.map(e => (
                    <div key={e.empresa_id} className="p-4 flex items-center justify-between gap-3 hover:bg-muted/40">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{e.nombre}</p>
                          {!e.activa && <Badge variant="secondary" className="text-[10px]">inactiva</Badge>}
                          {e.suscripcion_estado && (
                            <Badge variant={e.suscripcion_estado === "activa" ? "default" : "destructive"} className="text-[10px]">
                              {e.suscripcion_estado}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtNum(e.prestamos_activos)} préstamos activos de {fmtNum(e.prestamos_total)}
                          {"  ·  "}{fmtNum(e.pagos_30d)} pagos (30d)
                          {"  ·  "}{e.usuarios_activos}/{e.usuarios} usuarios
                          {e.wa_ultimo_envio && <>  ·  último WA: {fmtFecha(e.wa_ultimo_envio)}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                        {e.errores_cliente_24h > 0 && (
                          <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                            <Bug className="h-3 w-3" />
                            {e.errores_cliente_24h}
                          </Badge>
                        )}
                        <Badge
                          variant={!e.wa_activo ? "secondary" : e.wa_errores_24h > 0 ? "destructive" : "default"}
                          className="gap-1"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {!e.wa_activo ? "WA off" : e.wa_errores_24h > 0 ? `${e.wa_errores_24h} err` : "OK"}
                        </Badge>
                        <Badge variant={e.stripe_conectado ? "default" : "secondary"} className="gap-1">
                          <CreditCard className="h-3 w-3" />
                          {e.stripe_conectado ? "Stripe" : "—"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {empresas.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">Sin empresas.</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errores de la app agrupados */}
        <TabsContent value="errores">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                Errores recientes{errores ? ` · ${fmtNum(errores.total)}` : ""}
              </CardTitle>
              <div className="flex gap-1">
                {PERIODOS.map(p => (
                  <Button
                    key={p.horas}
                    size="sm"
                    variant={periodo === p.horas ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setPeriodo(p.horas)}
                    disabled={loading}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <ListSkeleton /> : fallos.errores ? <SectionError msg={fallos.errores} /> : (
                <div className="divide-y">
                  {(errores?.grupos || []).map(g => (
                    <div key={g.clave} className="p-4 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium break-words min-w-0">{g.mensaje}</p>
                        <Badge variant={g.conteo >= 10 ? "destructive" : "secondary"} className="flex-shrink-0">
                          {fmtNum(g.conteo)}×
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Último: {fmtFecha(g.ultimo)}
                        {"  ·  "}{g.usuarios} usuario{g.usuarios === 1 ? "" : "s"}
                        {"  ·  "}{g.empresas} empresa{g.empresas === 1 ? "" : "s"}
                        {g.empresa_nombre && <>  ·  {g.empresa_nombre}</>}
                        {g.url && <>  ·  {g.url.replace(/^https?:\/\/[^/]+/, "")}</>}
                        {g.version && <>  ·  v {g.version}</>}
                      </p>
                      {g.stack && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">Stack</summary>
                          <pre className="mt-1 p-2 rounded bg-muted overflow-x-auto whitespace-pre-wrap break-all max-h-64">{g.stack}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                  {(errores?.grupos || []).length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
                      Sin errores reportados en el periodo.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* pg_stat_statements */}
        <TabsContent value="lentas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consultas con más tiempo total</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <ListSkeleton /> : fallos.lentas ? <SectionError msg={fallos.lentas} /> : (
                <div className="divide-y">
                  {lentas.map((q, i) => (
                    <div key={i} className="p-4 space-y-1">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant={q.mean_ms >= 500 ? "destructive" : q.mean_ms >= 100 ? "secondary" : "outline"} className="gap-1">
                          <Gauge className="h-3 w-3" /> {fmtNum(q.mean_ms)} ms prom.
                        </Badge>
                        <span className="text-muted-foreground">{fmtNum(q.calls)} llamadas</span>
                        <span className="text-muted-foreground">· total {fmtNum(Math.round(q.total_ms / 1000))} s</span>
                        <span className="text-muted-foreground">· {fmtNum(q.filas)} filas</span>
                      </div>
                      <pre className="text-[11px] p-2 rounded bg-muted overflow-x-auto whitespace-pre-wrap break-all max-h-40">{q.query}</pre>
                    </div>
                  ))}
                  {lentas.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Sin datos. La extensión pg_stat_statements no está habilitada o no hay estadísticas aún.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tablas */}
        <TabsContent value="tablas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tablas (esquema public)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? <ListSkeleton /> : fallos.tablas ? <SectionError msg={fallos.tablas} /> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-medium p-3">Tabla</th>
                      <th className="text-right font-medium p-3">Filas</th>
                      <th className="text-right font-medium p-3">Muertas</th>
                      <th className="text-right font-medium p-3">Seq scan</th>
                      <th className="text-right font-medium p-3">Idx scan</th>
                      <th className="text-right font-medium p-3">Tamaño</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tablas.map(t => {
                      const seqHeavy = t.filas > 10_000 && t.seq_scan > t.idx_scan;
                      return (
                        <tr key={t.tabla} className="hover:bg-muted/40">
                          <td className="p-3 font-mono text-xs">{t.tabla}</td>
                          <td className="p-3 text-right tabular-nums">{fmtNum(t.filas)}</td>
                          <td className={`p-3 text-right tabular-nums ${t.filas_muertas > t.filas * 0.2 && t.filas_muertas > 1000 ? "text-amber-500" : ""}`}>{fmtNum(t.filas_muertas)}</td>
                          <td className={`p-3 text-right tabular-nums ${seqHeavy ? "text-destructive font-medium" : ""}`}>{fmtNum(t.seq_scan)}</td>
                          <td className="p-3 text-right tabular-nums">{fmtNum(t.idx_scan)}</td>
                          <td className="p-3 text-right tabular-nums">{fmtBytes(Number(t.tamano_bytes))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" /> Errores WA cuentan envíos fallidos en las últimas 24h; si una empresa muestra muchos, su instancia UltraMsg/WhatsAPI probablemente está desconectada. Errores app se conservan 30 días. En Tablas, rojo = tabla grande leída sobre todo con seq scan (posible índice faltante).
      </p>
    </div>
  );
}
