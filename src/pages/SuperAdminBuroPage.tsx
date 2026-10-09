import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Download, KeyRound, Loader2, Plus, Save, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { $$ } from "@/lib/utils";

interface BuroConfig {
  api_url: string;
  usuario: string;
  api_key_mask: string | null;
  tiene_password: boolean;
  tiene_llave: boolean;
  certificado: string | null;
  tiene_cert_cdc: boolean;
  activo: boolean;
}

interface EmpresaBuro {
  id: string;
  nombre: string;
  habilitado: boolean;
  creditos: number;
  precio_consulta: number;
  consultas_mes: number;
  importe_mes: number;
}

async function buroAdmin<T = { ok: boolean }>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("buro-admin", { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as { context?: Response }).context?.json())?.error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return data as T;
}

const URL_HINT = "https://services.circulodecredito.com.mx/reporte-pm/v2/rcc-pm";

function Estado({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

export default function SuperAdminBuroPage() {
  const qc = useQueryClient();
  const cdcRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["sa-buro"],
    queryFn: () => buroAdmin<{ config: BuroConfig; empresas: EmpresaBuro[] }>("get"),
  });

  const [form, setForm] = useState({ api_url: "", usuario: "", api_key: "", password: "", activo: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { habilitado: boolean; precio_consulta: string; cantidad: string }>>({});

  useEffect(() => {
    if (data?.config) {
      setForm((f) => ({ ...f, api_url: data.config.api_url, usuario: data.config.usuario, activo: data.config.activo, api_key: "", password: "" }));
    }
    if (data?.empresas) {
      setEdits(Object.fromEntries(data.empresas.map((e) => [e.id, { habilitado: e.habilitado, precio_consulta: String(e.precio_consulta), cantidad: "" }])));
    }
  }, [data]);

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(okMsg);
      await qc.invalidateQueries({ queryKey: ["sa-buro"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const descargarCert = (pem: string) => {
    const url = URL.createObjectURL(new Blob([pem], { type: "application/x-pem-file" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "prestaapp_circulo_cert.pem";
    a.click();
    URL.revokeObjectURL(url);
  };

  const subirCdc = async (file: File) => {
    const pem = await file.text();
    await run("cdc", () => buroAdmin("subir_cert_cdc", { pem }), "Certificado de Círculo cargado");
    if (cdcRef.current) cdcRef.current.value = "";
  };

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const cfg = data.config;
  const listo = cfg.tiene_llave && cfg.tiene_cert_cdc && cfg.tiene_password && !!cfg.api_key_mask && !!cfg.api_url && !!cfg.usuario;
  const totalMes = data.empresas.reduce((s, e) => s + e.importe_mes, 0);
  const consultasMes = data.empresas.reduce((s, e) => s + e.consultas_mes, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Círculo de Crédito" description="Credenciales globales y venta de consultas PM por empresa" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Paso 1: llaves */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1. Certificados</CardTitle>
            <CardDescription>Genera tu certificado, súbelo al portal y carga el de Círculo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Estado ok={cfg.tiene_llave} label="Llave y certificado generados" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={busy === "llaves"}
                onClick={() => {
                  if (cfg.tiene_llave && !confirm("Ya existe un certificado. Si generas otro tendrás que volver a subirlo al portal. ¿Continuar?")) return;
                  run("llaves", () => buroAdmin("generar_llaves"), "Certificado generado");
                }}>
                {busy === "llaves" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1" />}
                {cfg.tiene_llave ? "Regenerar" : "Generar"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" disabled={!cfg.certificado} onClick={() => descargarCert(cfg.certificado!)}>
                <Download className="h-4 w-4 mr-1" />Descargar
              </Button>
            </div>
            <Estado ok={cfg.tiene_cert_cdc} label="Certificado de Círculo cargado" />
            <input ref={cdcRef} type="file" accept=".pem,.crt,.cer,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && subirCdc(e.target.files[0])} />
            <Button size="sm" variant="outline" className="w-full" disabled={busy === "cdc"} onClick={() => cdcRef.current?.click()}>
              {busy === "cdc" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Subir cdc_cert.pem
            </Button>
          </CardContent>
        </Card>

        {/* Paso 2: credenciales */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">2. Credenciales de la app</CardTitle>
            <CardDescription>Datos de la app "prestaapp" en el portal de Círculo.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">URL del API (RCC PM v2)</Label>
              <Input value={form.api_url} placeholder={URL_HINT} onChange={(e) => setForm({ ...form, api_url: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">x-api-key (Consumer Key)</Label>
              <Input value={form.api_key} placeholder={cfg.api_key_mask || ""} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Usuario</Label>
              <Input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contraseña</Label>
              <Input type="password" value={form.password} placeholder={cfg.tiene_password ? "••••••••" : ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={form.activo} disabled={!listo && !form.activo} onCheckedChange={(v) => setForm({ ...form, activo: v })} />
                <span className="text-sm">Servicio activo</span>
              </div>
              <Button size="sm" disabled={busy === "cfg"} onClick={() => run("cfg", () => buroAdmin("save_config", form), "Configuración guardada")}>
                {busy === "cfg" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Paso 3: empresas */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-sm">3. Empresas</CardTitle>
            <CardDescription>Habilita, fija precio y asigna créditos (1 crédito = 1 consulta).</CardDescription>
          </div>
          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Este mes</div>
            <b>{consultasMes} consultas · {$$(totalMes)}</b>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-center">Habilitada</TableHead>
                <TableHead className="w-28">Precio</TableHead>
                <TableHead className="text-center">Créditos</TableHead>
                <TableHead className="text-center">Mes</TableHead>
                <TableHead className="w-56">Asignar créditos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.empresas.map((e) => {
                const ed = edits[e.id] || { habilitado: e.habilitado, precio_consulta: String(e.precio_consulta), cantidad: "" };
                const set = (patch: Partial<typeof ed>) => setEdits((p) => ({ ...p, [e.id]: { ...ed, ...patch } }));
                const cambio = ed.habilitado !== e.habilitado || Number(ed.precio_consulta) !== e.precio_consulta;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.nombre}</TableCell>
                    <TableCell className="text-center"><Switch checked={ed.habilitado} onCheckedChange={(v) => set({ habilitado: v })} /></TableCell>
                    <TableCell><Input type="number" min={0} step="0.01" className="h-8" value={ed.precio_consulta} onChange={(ev) => set({ precio_consulta: ev.target.value })} /></TableCell>
                    <TableCell className="text-center">
                      <Badge variant={e.creditos > 0 ? "default" : "secondary"}>{e.creditos}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs">{e.consultas_mes} · {$$(e.importe_mes)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Input type="number" className="h-8" placeholder="+10 / -2" value={ed.cantidad} onChange={(ev) => set({ cantidad: ev.target.value })} />
                        <Button size="sm" variant="outline" className="h-8" disabled={!Number(ed.cantidad) || busy === `cr-${e.id}`}
                          onClick={() => run(`cr-${e.id}`, async () => {
                            await buroAdmin("asignar_creditos", { empresa_id: e.id, cantidad: Number(ed.cantidad) });
                            set({ cantidad: "" });
                          }, "Créditos actualizados")}>
                          {busy === `cr-${e.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" className="h-8" disabled={!cambio || busy === `em-${e.id}`}
                        onClick={() => run(`em-${e.id}`, () => buroAdmin("save_empresa", {
                          empresa_id: e.id, habilitado: ed.habilitado, precio_consulta: Number(ed.precio_consulta),
                        }), "Empresa actualizada")}>
                        {busy === `em-${e.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
