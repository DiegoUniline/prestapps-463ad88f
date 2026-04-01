import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageSquare, Search, Filter, CheckCircle2, XCircle, Ban, Eye, Edit2, Save,
  RefreshCw, Building2, Phone, Clock, Send, Wifi, WifiOff, Key, Globe, AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/* ── helper to call the SA edge function ── */
async function saFetch(action: string, method = "GET", body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke("sa-notifications", {
    method: method as any,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : body,
  });

  // For GET with query params, use raw fetch
  if (method === "GET") {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sa-notifications?action=${action}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  // POST
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sa-notifications?action=${action}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

/* ────────────────────────────────────────────── */
/* System notification templates                  */
/* ────────────────────────────────────────────── */
interface SystemTemplate {
  key: string;
  label: string;
  description: string;
  defaultMessage: string;
  variables: string[];
}

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    key: "factura_generada_stripe",
    label: "Factura generada (Stripe auto)",
    description: "Se envía el día 1 cuando la empresa tiene cobro automático por Stripe",
    variables: ["{empresa}", "{mes}", "{factura}", "{monto}", "{plan}", "{usuarios}", "{dias_gracia}"],
    defaultMessage:
      `Hola 👋 *{empresa}*\n\nGracias por usar *PrestApps*. Hemos generado tu factura del mes de *{mes}*.\n\n🧾 *{factura}*\n💵 *{monto} MXN* · {plan} ({usuarios} usuario(s))\n\n💳 Se cobrará automáticamente a tu tarjeta.\nSi el cobro falla, cuentas con *{dias_gracia} días* antes de que se pause tu servicio.\n\n¿Necesitas cambiar tu tarjeta? Entra a *Mi Suscripción* en la app. 📱`,
  },
  {
    key: "factura_generada_manual",
    label: "Factura generada (pago manual)",
    description: "Se envía el día 1 cuando la empresa NO tiene Stripe configurado",
    variables: ["{empresa}", "{mes}", "{factura}", "{monto}", "{plan}", "{usuarios}", "{fecha_limite}", "{dias_gracia}"],
    defaultMessage:
      `Hola 👋 *{empresa}*\n\nGracias por usar *PrestApps*. Tu factura de *{mes}* ya está lista.\n\n🧾 *{factura}*\n💵 *{monto} MXN* · {plan} ({usuarios} usuario(s))\n📅 Fecha límite: *{fecha_limite}*\n\nTienes *{dias_gracia} días* para pagar sin que se interrumpa tu servicio.\n\n👉 Entra a *Mi Suscripción* en la app para completar tu pago. 📱`,
  },
  {
    key: "pago_exitoso",
    label: "Pago exitoso",
    description: "Confirmación cuando se procesa el cobro correctamente",
    variables: ["{empresa}", "{monto}", "{mes}", "{factura}", "{proximo_cobro}"],
    defaultMessage:
      `✅ *{empresa}* — Pago confirmado\n\nTu pago de *{monto} MXN* del mes de *{mes}* se procesó correctamente.\n\n🧾 {factura}\n📅 Próximo cobro: *{proximo_cobro}*\n\n¡Sigue creciendo tu negocio con *PrestApps*! 💪`,
  },
  {
    key: "recordatorio_gracia",
    label: "Recordatorio (período de gracia)",
    description: "Se envía diariamente durante los días de gracia (días 2-3)",
    variables: ["{empresa}", "{dias_restantes}"],
    defaultMessage:
      `⏳ *{empresa}* — Pago pendiente\n\nTu suscripción sigue sin pagarse. Te quedan *{dias_restantes} día(s)* antes de que pausemos tu servicio.\n\n👉 Entra a *Mi Suscripción* en la app y resuelve tu pago hoy.\n\n¡Estamos para ayudarte! 🙏`,
  },
  {
    key: "suscripcion_suspendida",
    label: "Suscripción suspendida",
    description: "Se envía cuando se agota el período de gracia (día 4)",
    variables: ["{empresa}"],
    defaultMessage:
      `⚠️ *{empresa}* — Servicio pausado\n\nNo recibimos tu pago a tiempo y tu cuenta ha sido suspendida temporalmente.\n\n🔒 Los módulos operativos están restringidos hasta que regularices tu pago.\n\nPara reactivar al instante:\n1️⃣ Abre la app → *Mi Suscripción*\n2️⃣ Registra o actualiza tu método de pago\n3️⃣ Tu acceso se restaura de inmediato ✅\n\nTus datos están seguros, no se perderá nada. 🔐\n\n¿Necesitas ayuda? Responde aquí y te apoyamos. 💬`,
  },
  {
    key: "recordatorio_vencimiento_trial",
    label: "Recordatorio pre-vencimiento (Trial)",
    description: "Se envía 1 día antes de que termine el período de prueba",
    variables: ["{empresa}", "{fecha_vencimiento}", "{plan}", "{precio}", "{link_pago}"],
    defaultMessage:
      `👋 *{empresa}*\n\nTu prueba gratuita de *PrestApps* termina *mañana {fecha_vencimiento}*. ⏰\n\n🎯 No pierdas el avance que llevas — activa tu plan y sigue operando sin pausa.\n\n📦 {plan}\n💵 Desde *{precio} MXN/mes*\n\n👉 Paga aquí y renueva al instante:\n{link_pago}\n\nTu información está segura 🔐 y lista para seguir trabajando.`,
  },
  {
    key: "recordatorio_vencimiento_activa",
    label: "Recordatorio pre-vencimiento (Activa)",
    description: "Se envía 1 día antes de que venza la suscripción activa",
    variables: ["{empresa}", "{fecha_vencimiento}", "{plan}", "{precio}", "{link_pago}"],
    defaultMessage:
      `👋 *{empresa}*\n\nTu suscripción de *PrestApps* vence *mañana {fecha_vencimiento}*. ⏰\n\n📦 {plan}\n💵 *{precio} MXN/mes*\n\nRenueva hoy para que tu servicio no se interrumpa:\n\n👉 Paga con un clic:\n{link_pago}\n\nAl pagar, tu plan se activa de inmediato. ✅\nTus datos están seguros. 🔐`,
  },
  {
    key: "alerta_pago_suscripcion",
    label: "Pago de suscripción recibido (webhook)",
    description: "Se envía cuando Stripe confirma el pago vía webhook",
    variables: ["{empresa}", "{monto}", "{factura}", "{proximo_cobro}"],
    defaultMessage:
      `¡Hola! 🎉\n\nTu pago de suscripción de *{empresa}* se procesó correctamente.\n\n✅ *Monto cobrado:* {monto} MXN\n📅 *Próximo cobro:* {proximo_cobro}\n🧾 *Factura:* {factura}\n\nGracias por confiar en *PrestApps*. ¡Sigue creciendo tu negocio! 🚀\n\nSi tienes dudas sobre tu factura, responde a este mensaje. 💬`,
  },
];

/* ────────────────────────────────────────────── */
/* Main Page                                      */
/* ────────────────────────────────────────────── */
export default function SuperAdminWhatsAppPage({ embedded }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [empresaFilter, setEmpresaFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [editingTemplate, setEditingTemplate] = useState<SystemTemplate | null>(null);
  const [editedMessage, setEditedMessage] = useState("");
  const [origenFilter, setOrigenFilter] = useState<string>("all");
  const [sysUrl, setSysUrl] = useState("");
  const [sysToken, setSysToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // System notification tipos
  const SYSTEM_TIPOS = ["factura_generada", "pago_exitoso", "recordatorio_gracia", "suscripcion_suspendida", "recordatorio_vencimiento", "alerta_pago"];

  // Fetch ALL whatsapp logs via edge function (bypasses RLS)
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["sa-whatsapp-logs"],
    queryFn: () => saFetch("logs"),
  });

  // Fetch empresas
  const { data: empresas } = useQuery({
    queryKey: ["sa-empresas-list"],
    queryFn: () => saFetch("empresas"),
  });

  // Fetch saved templates
  const { data: savedTemplates } = useQuery({
    queryKey: ["sa-system-templates"],
    queryFn: () => saFetch("templates"),
  });

  // Fetch WA configs for all empresas
  const { data: waConfigs, isLoading: configsLoading } = useQuery({
    queryKey: ["sa-wa-configs"],
    queryFn: () => saFetch("wa-configs"),
  });

  // Fetch system WA config
  const { data: systemWaConfig } = useQuery({
    queryKey: ["sa-system-wa-config"],
    queryFn: () => saFetch("system-wa-config"),
  });

  // Sync system config into local state
  React.useEffect(() => {
    const cfg = systemWaConfig as any;
    if (cfg?.api_url && !sysUrl) setSysUrl(cfg.api_url);
    if (cfg?.api_token && !sysToken) setSysToken(cfg.api_token);
  }, [systemWaConfig]);

  // Save template
  const saveTemplate = useMutation({
    mutationFn: async ({ key, message }: { key: string; message: string }) => {
      return saFetch("save-template", "POST", { template_key: key, message_template: message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sa-system-templates"] });
      toast.success("Plantilla guardada correctamente");
      setEditingTemplate(null);
    },
    onError: (e: any) => toast.error("Error: " + e.message),
  });

  // Get unique tipos
  const tipos = useMemo(() => {
    if (!logs) return [];
    return [...new Set(logs.map((l: any) => l.tipo))].sort();
  }, [logs]);

  // Filter logs
  const filtered = useMemo(() => {
    if (!logs) return [];
    return logs.filter((l: any) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (tipoFilter !== "all" && l.tipo !== tipoFilter) return false;
      if (empresaFilter !== "all" && l.empresa_id !== empresaFilter) return false;
      if (origenFilter === "sistema" && !SYSTEM_TIPOS.includes(l.tipo)) return false;
      if (origenFilter === "empresa" && SYSTEM_TIPOS.includes(l.tipo)) return false;
      if (search) {
        const s = search.toLowerCase();
        const empresa = (l.empresas as any)?.nombre || "";
        return (
          l.telefono?.toLowerCase().includes(s) ||
          l.mensaje?.toLowerCase().includes(s) ||
          empresa.toLowerCase().includes(s) ||
          l.tipo?.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [logs, statusFilter, tipoFilter, empresaFilter, search]);

  const getStatusIcon = (status: string) => {
    if (status === "enviado") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
    return <Ban className="h-4 w-4 text-muted-foreground" />;
  };

  const getTemplateMessage = (key: string, defaultMsg: string) => {
    const saved = savedTemplates?.find((t: any) => t.template_key === key);
    return saved?.message_template || defaultMsg;
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Centro de Notificaciones"
          description="Monitoreo global de mensajes WhatsApp y gestión de plantillas del sistema"
        />
      )}

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs" className="gap-2">
            <MessageSquare className="h-4 w-4" /> Mensajes Enviados
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Key className="h-4 w-4" /> Config API
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <Edit2 className="h-4 w-4" /> Plantillas del Sistema
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Logs ── */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar teléfono, mensaje, empresa..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                  <SelectTrigger className="w-[200px]">
                    <Building2 className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las empresas</SelectItem>
                    {empresas?.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={tipoFilter} onValueChange={setTipoFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    {tipos.map((t: string) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="enviado">✅ Enviado</SelectItem>
                    <SelectItem value="error">❌ Error</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={origenFilter} onValueChange={setOrigenFilter}>
                  <SelectTrigger className="w-[150px]">
                    <Globe className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Origen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="sistema">🏢 Sistema (PrestApps)</SelectItem>
                    <SelectItem value="empresa">📋 Empresa (Cobranza)</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["sa-whatsapp-logs"] })}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold">{logs?.length || 0}</div>
                <div className="text-xs text-muted-foreground">Total mensajes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-emerald-600">
                  {logs?.filter((l: any) => l.status === "enviado").length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Enviados</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-destructive">
                  {logs?.filter((l: any) => l.status === "error").length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Errores</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold">{filtered.length}</div>
                <div className="text-xs text-muted-foreground">Filtrados</div>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Fecha</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                          Cargando...
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No se encontraron mensajes
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((log: any) => (
                        <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                          <TableCell className="text-xs font-mono">
                            {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: es })}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(log.empresas as any)?.nombre || "—"}
                          </TableCell>
                          <TableCell className="text-sm font-mono">{log.telefono}</TableCell>
                          <TableCell className="space-x-1">
                            <Badge variant="secondary" className="text-xs">{log.tipo}</Badge>
                            {SYSTEM_TIPOS.includes(log.tipo) ? (
                              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Sistema</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Empresa</Badge>
                            )}
                          </TableCell>
                          <TableCell>{getStatusIcon(log.status)}</TableCell>
                          <TableCell>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          {/* ── System WA Config ── */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                API de WhatsApp del Sistema (PrestApps)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Esta es la API central de PrestApps para enviar notificaciones de facturación, suscripciones, pagos y recordatorios a todas las empresas.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sys-url" className="text-sm font-medium">API URL</Label>
                  <Input
                    id="sys-url"
                    placeholder="https://api.ejemplo.com/send"
                    value={sysUrl}
                    onChange={(e) => setSysUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sys-token" className="text-sm font-medium">API Token</Label>
                  <div className="flex gap-2">
                    <Input
                      id="sys-token"
                      type={showToken ? "text" : "password"}
                      placeholder="Tu token de API"
                      value={sysToken}
                      onChange={(e) => setSysToken(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  disabled={savingConfig}
                  onClick={async () => {
                    setSavingConfig(true);
                    try {
                      await saFetch("save-system-wa-config", "POST", { api_url: sysUrl, api_token: sysToken });
                      queryClient.invalidateQueries({ queryKey: ["sa-system-wa-config"] });
                      toast.success("Configuración del sistema guardada");
                    } catch (e: any) {
                      toast.error("Error: " + e.message);
                    } finally {
                      setSavingConfig(false);
                    }
                  }}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {savingConfig ? "Guardando..." : "Guardar"}
                </Button>
                {(systemWaConfig as any)?.api_url && (systemWaConfig as any)?.api_token ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <Wifi className="h-3 w-3 mr-1" /> Configurado
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Sin configurar
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Per-empresa configs ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                APIs de WhatsApp por Empresa (Cobranza)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cada empresa configura su propia API para enviar avisos de cobranza a sus clientes.
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>API URL</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead className="w-[100px]">Estado</TableHead>
                      <TableHead>Avisos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                          Cargando...
                        </TableCell>
                      </TableRow>
                    ) : !waConfigs?.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No hay configuraciones de WhatsApp
                        </TableCell>
                      </TableRow>
                    ) : (
                      waConfigs.map((cfg: any) => (
                        <TableRow key={cfg.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {(cfg.empresas as any)?.nombre || cfg.empresa_id?.slice(0, 8)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded break-all max-w-[250px] block">
                              {cfg.api_url || "—"}
                            </code>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {cfg.api_token ? `${cfg.api_token.slice(0, 8)}...${cfg.api_token.slice(-4)}` : "—"}
                            </code>
                          </TableCell>
                          <TableCell>
                            {cfg.activo ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                <Wifi className="h-3 w-3 mr-1" /> Activo
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <WifiOff className="h-3 w-3 mr-1" /> Inactivo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {cfg.aviso_dia_antes && <Badge variant="outline" className="text-[10px]">Día antes</Badge>}
                              {cfg.aviso_vencido && <Badge variant="outline" className="text-[10px]">Vencido</Badge>}
                              {cfg.recibo_pago && <Badge variant="outline" className="text-[10px]">Recibo</Badge>}
                              {!cfg.aviso_dia_antes && !cfg.aviso_vencido && !cfg.recibo_pago && (
                                <span className="text-xs text-muted-foreground">Ninguno</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Plantillas de Notificación del Sistema
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Estos son los mensajes que PrestApps envía automáticamente a los administradores de cada empresa.
                Puedes editar el texto manteniendo las variables entre llaves.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {SYSTEM_TEMPLATES.map((tmpl) => {
                const currentMsg = getTemplateMessage(tmpl.key, tmpl.defaultMessage);
                const isCustomized = savedTemplates?.some((t: any) => t.template_key === tmpl.key);

                return (
                  <Card key={tmpl.key} className="border">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm">{tmpl.label}</h4>
                            {isCustomized && (
                              <Badge variant="outline" className="text-xs text-primary border-primary/30">
                                Personalizado
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{tmpl.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {tmpl.variables.map((v) => (
                              <Badge key={v} variant="secondary" className="text-[10px] font-mono">{v}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingTemplate(tmpl);
                            setEditedMessage(currentMsg);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-xs whitespace-pre-wrap font-mono max-h-[120px] overflow-auto">
                        {currentMsg}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Log detail ── */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Detalle del mensaje
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-muted-foreground text-xs">Empresa</Label>
                  <div className="font-medium">{(selectedLog.empresas as any)?.nombre || "—"}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Teléfono</Label>
                  <div className="font-mono flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {selectedLog.telefono}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Tipo</Label>
                  <Badge variant="secondary">{selectedLog.tipo}</Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="flex items-center gap-1">
                    {getStatusIcon(selectedLog.status)}
                    <span className="capitalize">{selectedLog.status}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground text-xs">Fecha</Label>
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="h-3.5 w-3.5" />
                    {format(new Date(selectedLog.created_at), "dd 'de' MMMM yyyy, HH:mm:ss", { locale: es })}
                  </div>
                </div>
                {selectedLog.error_detalle && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs">Error</Label>
                    <div className="text-destructive text-sm bg-destructive/10 rounded p-2">
                      {selectedLog.error_detalle}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Mensaje</Label>
                <div className="mt-1 bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-[250px] overflow-auto">
                  {selectedLog.mensaje || "Sin mensaje"}
                </div>
              </div>
              {selectedLog.imagen_url && (
                <div>
                  <Label className="text-muted-foreground text-xs">Imagen</Label>
                  <img src={selectedLog.imagen_url} alt="Adjunto" className="mt-1 rounded max-h-40" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Edit template ── */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar plantilla: {editingTemplate?.label}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{editingTemplate.description}</p>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground mr-1">Variables disponibles:</span>
                {editingTemplate.variables.map((v) => (
                  <Badge key={v} variant="secondary" className="text-[10px] font-mono cursor-pointer"
                    onClick={() => setEditedMessage((prev) => prev + v)}
                  >{v}</Badge>
                ))}
              </div>
              <Textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setEditedMessage(editingTemplate.defaultMessage)}
                >
                  Restaurar original
                </Button>
                <Button
                  onClick={() => saveTemplate.mutate({ key: editingTemplate.key, message: editedMessage })}
                  disabled={saveTemplate.isPending}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {saveTemplate.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
