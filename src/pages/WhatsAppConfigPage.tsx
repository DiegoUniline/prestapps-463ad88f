import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  MessageSquare, Settings, FileText, Send, Clock, AlertTriangle,
  CheckCircle2, XCircle, Loader2, Info, RefreshCw, Ban,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const TEMPLATE_TYPES = [
  {
    tipo: "recibo_pago",
    nombre: "Recibo de Pago",
    descripcion: "Se envía automáticamente al registrar un pago",
    variables: "{cliente}, {monto_recibido}, {folio}, {metodo_pago}, {cuota_num}, {saldo_restante}, {proxima_cuota}",
    default: "✅ *Recibo de Pago*\n\nHola {cliente}, confirmamos tu pago por *${monto_recibido}*.\n\n📋 Folio: {folio}\n💳 Método: {metodo_pago}\n📊 Cuota: {cuota_num}\n💰 Saldo restante: ${saldo_restante}\n📅 Próximo vencimiento: {proxima_cuota}\n\n¡Gracias por tu pago!",
  },
  {
    tipo: "aviso_dia_antes",
    nombre: "Aviso 1 día antes",
    descripcion: "Se envía un día antes del vencimiento de la cuota",
    variables: "{cliente}, {monto_cuota}, {cuota}, {total_cuotas}, {fecha_vencimiento}",
    default: "⏰ *Recordatorio de pago*\n\nHola {cliente}, te recordamos que tu cuota #{cuota} de {total_cuotas} por *${monto_cuota}* vence mañana *{fecha_vencimiento}*.\n\n¡Evita recargos pagando a tiempo!",
  },
  {
    tipo: "aviso_vencido",
    nombre: "Aviso de cuota vencida",
    descripcion: "Se envía cuando una cuota está vencida",
    variables: "{cliente}, {monto_cuota}, {cuota}, {total_cuotas}, {fecha_vencimiento}",
    default: "🔴 *Cuota vencida*\n\nHola {cliente}, tu cuota #{cuota} por *${monto_cuota}* venció el *{fecha_vencimiento}*.\n\nPor favor realiza tu pago lo antes posible para evitar cargos por mora.",
  },
  {
    tipo: "cobranza_manual",
    nombre: "Cobranza Manual",
    descripcion: "Para envío manual desde el módulo CRM",
    variables: "{cliente}, {monto_cuota}, {cuota}, {fecha_vencimiento}, {monto_prestamo}",
    default: "Hola {cliente}, nos comunicamos respecto a su crédito. Su cuota #{cuota} por ${monto_cuota} se encuentra pendiente.\n\nPor favor comuníquese con nosotros para regularizar su situación.",
  },
];

export default function WhatsAppConfigPage() {
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();

  // ── Config ────────────────────────────────
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ["whatsapp-config", empresaId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("whatsapp_config")
        .select("id, empresa_id, activo, api_url, api_token, aviso_dia_antes, aviso_vencido, enviar_recibo_pago, created_at")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState({
    api_token: "",
    enviar_recibo_pago: true,
    aviso_dia_antes: false,
    aviso_vencido: false,
    activo: false,
  });

  useEffect(() => {
    if (config) {
      setForm({
        api_token: config.api_token || "",
        enviar_recibo_pago: config.enviar_recibo_pago ?? true,
        aviso_dia_antes: config.aviso_dia_antes ?? false,
        aviso_vencido: config.aviso_vencido ?? false,
        activo: config.activo ?? false,
      });
    }
  }, [config]);

  // Auto-save with debounce
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  const doSave = useCallback(async (formData: typeof form) => {
    const payload = { ...formData };
    try {
      if (config?.id) {
        const { error } = await (supabase.from as any)("whatsapp_config")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("whatsapp_config")
          .insert({ ...payload, empresa_id: empresaId });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["whatsapp-config", empresaId] });
      toast.success("Configuración guardada");
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  }, [config, empresaId, queryClient]);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => doSave(form), 800);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [form, doSave]);

  // Auto-activate when token is pasted
  const handleTokenChange = (val: string) => {
    const shouldActivate = val.trim().length > 0;
    setForm((f) => ({ ...f, api_token: val, activo: shouldActivate ? true : f.activo }));
  };

  const savingConfig = { isPending: false };

  // ── Templates ────────────────────────────────
  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ["whatsapp-templates", empresaId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("whatsapp_templates")
        .select("id, empresa_id, tipo, nombre, mensaje, activo, created_at")
        .eq("empresa_id", empresaId);
      
      // Auto-seed default templates if none exist
      if (!data || data.length === 0) {
        const defaults = TEMPLATE_TYPES.map((t) => ({
          empresa_id: empresaId,
          tipo: t.tipo,
          nombre: t.nombre,
          mensaje: t.default,
          activo: true,
        }));
        const { data: inserted, error } = await (supabase.from as any)("whatsapp_templates")
          .insert(defaults)
          .select("id, empresa_id, tipo, nombre, mensaje, activo, created_at");
        if (error) {
          console.error("Error seeding templates:", error);
          return [];
        }
        return (inserted || []) as any[];
      }
      
      return (data || []) as any[];
    },
  });

  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateMsg, setTemplateMsg] = useState("");

  const saveTemplate = useMutation({
    mutationFn: async ({ tipo, mensaje }: { tipo: string; mensaje: string }) => {
      const existing = templates?.find((t: any) => t.tipo === tipo);
      const nombre = TEMPLATE_TYPES.find((t) => t.tipo === tipo)?.nombre || tipo;
      if (existing) {
        const { error } = await (supabase.from as any)("whatsapp_templates")
          .update({ mensaje })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("whatsapp_templates")
          .insert({ empresa_id: empresaId, tipo, nombre, mensaje });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates", empresaId] });
      setEditingTemplate(null);
      toast.success("Plantilla guardada");
    },
    onError: (e: any) => toast.error("Error: " + e.message),
  });

  // ── Log ────────────────────────────────
  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["whatsapp-log", empresaId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("whatsapp_log")
        .select("id, telefono, tipo, mensaje, status, error_detalle, created_at")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data || []) as any[];
    },
  });

  // ── Send reminders manually ────────────────
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [editingToken, setEditingToken] = useState(false);
  const [reminderResults, setReminderResults] = useState<{
    open: boolean;
    type: string;
    sent: number;
    errors: number;
    total: number;
    detalles: { cliente: string; telefono: string; cuotas_detalle: string; monto_total: string; num_cuotas: number; status: string; error?: string }[];
  }>({ open: false, type: "", sent: 0, errors: 0, total: 0, detalles: [] });

  const sendReminders = async (type: "dia_antes" | "vencido") => {
    setSendingReminder(type);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-sender", {
        body: { action: "send-reminder", empresa_id: empresaId, reminder_type: type },
      });
      if (error) {
        try {
          const parsed = JSON.parse(error.message || "{}");
          if (parsed?.error?.includes("plantilla")) {
            toast.error(
              `Para enviar avisos de "${type === "dia_antes" ? "día antes" : "vencidos"}" necesitas crear una plantilla. Ve a la pestaña "Plantillas" y agrega una de tipo "${type === "dia_antes" ? "aviso_dia_antes" : "aviso_vencido"}".`,
              { duration: 8000 }
            );
            return;
          }
        } catch {}
        throw error;
      }
      if (data?.error?.includes("plantilla")) {
        toast.error(
          `Para enviar avisos de "${type === "dia_antes" ? "día antes" : "vencidos"}" necesitas crear una plantilla. Ve a la pestaña "Plantillas" y agrega una de tipo "${type === "dia_antes" ? "aviso_dia_antes" : "aviso_vencido"}".`,
          { duration: 8000 }
        );
        return;
      }
      // Show results dialog
      setReminderResults({
        open: true,
        type: type === "dia_antes" ? "Día antes" : "Vencidos",
        sent: data.sent || 0,
        errors: data.errors || 0,
        total: data.total || 0,
        detalles: data.detalles || [],
      });
      refetchLogs();
    } catch (e: any) {
      toast.error("Error al enviar avisos: " + (e.message || "Intenta de nuevo"));
    } finally {
      setSendingReminder(null);
    }
  };

  if (loadingConfig) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm">Configura el envío automático de mensajes por WhatsApp</p>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config"><Settings className="h-3.5 w-3.5 mr-1.5" />Configuración</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="h-3.5 w-3.5 mr-1.5" />Plantillas</TabsTrigger>
          <TabsTrigger value="send"><Send className="h-3.5 w-3.5 mr-1.5" />Envío Manual</TabsTrigger>
          <TabsTrigger value="log"><Clock className="h-3.5 w-3.5 mr-1.5" />Historial</TabsTrigger>
        </TabsList>

        {/* ── CONFIG TAB ── */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conexión WhatsAPI</CardTitle>
              <CardDescription>Ingresa tu API Token y configura las opciones de envío</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>API Token</Label>
                  {!editingToken && form.api_token ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type={showToken ? "text" : "password"}
                        value={form.api_token}
                        disabled
                        className="opacity-70"
                      />
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setShowToken(!showToken)}>
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditingToken(true)}>
                        Editar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type={showToken ? "text" : "password"}
                        placeholder="Ingresa tu API Token de WhatsAPI"
                        value={form.api_token}
                        onChange={(e) => handleTokenChange(e.target.value)}
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setShowToken(!showToken)}>
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      {editingToken && (
                        <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setEditingToken(false); setShowToken(false); }}>
                          Listo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label>URL del API</Label>
                  <Input
                    value="https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy"
                    disabled
                    className="mt-1 opacity-60"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Opciones de Envío Automático</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">Enviar recibo al registrar pago</p>
                      <p className="text-xs text-muted-foreground">Envía imagen del recibo tipo ticket automáticamente</p>
                    </div>
                    <Switch checked={form.enviar_recibo_pago} onCheckedChange={(v) => setForm({ ...form, enviar_recibo_pago: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">Aviso 1 día antes del vencimiento</p>
                      <p className="text-xs text-muted-foreground">Envía recordatorio un día antes de que venza la cuota</p>
                    </div>
                    <Switch checked={form.aviso_dia_antes} onCheckedChange={(v) => setForm({ ...form, aviso_dia_antes: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">Aviso de cuota vencida</p>
                      <p className="text-xs text-muted-foreground">Notifica cuando una cuota no ha sido pagada en la fecha</p>
                    </div>
                    <Switch checked={form.aviso_vencido} onCheckedChange={(v) => setForm({ ...form, aviso_vencido: v })} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Label className="font-semibold">WhatsApp Activo</Label>
                  <Switch checked={form.activo} onCheckedChange={(v) => setForm({ ...form, activo: v })} />
                  <Badge variant={form.activo ? "default" : "secondary"}>{form.activo ? "Activo" : "Inactivo"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Los cambios se guardan automáticamente</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TEMPLATES TAB ── */}
        <TabsContent value="templates">
          <div className="space-y-4">
            {TEMPLATE_TYPES.map((tt) => {
              const saved = templates?.find((t: any) => t.tipo === tt.tipo);
              const isEditing = editingTemplate === tt.tipo;
              const currentMsg = isEditing ? templateMsg : (saved?.mensaje || tt.default);

              return (
                <Card key={tt.tipo}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{tt.nombre}</CardTitle>
                        <CardDescription className="text-xs">{tt.descripcion}</CardDescription>
                      </div>
                      <Badge variant={saved ? "default" : "outline"}>{saved ? "Personalizada" : "Por defecto"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-muted/50 rounded-md p-2">
                      <p className="text-[10px] text-muted-foreground font-mono">Variables: {tt.variables}</p>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Textarea
                          rows={5}
                          value={templateMsg}
                          onChange={(e) => setTemplateMsg(e.target.value)}
                          className="font-mono text-xs"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
                          <Button size="sm" onClick={() => saveTemplate.mutate({ tipo: tt.tipo, mensaje: templateMsg })}>
                            Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <pre className="text-xs whitespace-pre-wrap bg-secondary/50 rounded-md p-3 border">{currentMsg}</pre>
                        <Button variant="outline" size="sm" onClick={() => { setEditingTemplate(tt.tipo); setTemplateMsg(currentMsg); }}>
                          Editar Plantilla
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── SEND TAB ── */}
        <TabsContent value="send">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" />
                  Avisos día antes
                </CardTitle>
                <CardDescription className="text-xs">Envía recordatorios a todos los clientes con cuotas que vencen mañana</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => sendReminders("dia_antes")} disabled={!!sendingReminder} className="w-full">
                  {sendingReminder === "dia_antes" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar Avisos
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Avisos vencidos
                </CardTitle>
                <CardDescription className="text-xs">Envía notificaciones a clientes con cuotas vencidas</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={() => sendReminders("vencido")} disabled={!!sendingReminder} className="w-full">
                  {sendingReminder === "vencido" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar Avisos
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── LOG TAB ── */}
        <TabsContent value="log">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Historial de Mensajes</CardTitle>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : !logs?.length ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No hay mensajes enviados aún
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Teléfono</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Mensaje</TableHead>
                        <TableHead className="text-xs">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {log.created_at ? format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: es }) : "---"}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{log.telefono}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{log.tipo}</Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[300px] truncate">{log.mensaje}</TableCell>
                          <TableCell>
                            {log.status === "enviado" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Reminder Results Dialog ── */}
      <Dialog open={reminderResults.open} onOpenChange={(v) => setReminderResults((r) => ({ ...r, open: v }))}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Resultado de Avisos — {reminderResults.type}
            </DialogTitle>
          </DialogHeader>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-600" />
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{reminderResults.sent}</p>
              <p className="text-[10px] text-muted-foreground">Enviados</p>
            </div>
            <div className="rounded-lg border bg-red-50 dark:bg-red-950/30 p-3 text-center">
              <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{reminderResults.errors}</p>
              <p className="text-[10px] text-muted-foreground">Errores</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <MessageSquare className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-bold">{reminderResults.total}</p>
              <p className="text-[10px] text-muted-foreground">Total cuotas</p>
            </div>
          </div>

          {reminderResults.total === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              <Info className="h-6 w-6 mx-auto mb-2 opacity-40" />
              No se encontraron cuotas que notificar
            </div>
          )}

          {/* Detail table */}
          {reminderResults.detalles.length > 0 && (
            <ScrollArea className="max-h-[300px]">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs">Cuotas</TableHead>
                      <TableHead className="text-xs text-right">Monto Total</TableHead>
                      <TableHead className="text-xs text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminderResults.detalles.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="text-xs font-medium">{d.cliente}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{d.telefono}</div>
                        </TableCell>
                        <TableCell className="text-xs">{d.cuotas_detalle} <span className="text-muted-foreground">({d.num_cuotas})</span></TableCell>
                        <TableCell className="text-xs font-semibold text-right">${d.monto_total}</TableCell>
                        <TableCell className="text-center">
                          {d.status === "enviado" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          ) : d.status === "omitido" ? (
                            <Ban className="h-4 w-4 text-yellow-500 mx-auto" />
                          ) : (
                            <div className="flex flex-col items-center">
                              <XCircle className="h-4 w-4 text-destructive" />
                              {d.error && <span className="text-[9px] text-destructive mt-0.5 max-w-[120px] truncate">{d.error}</span>}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}

          <Button variant="outline" className="w-full" onClick={() => setReminderResults((r) => ({ ...r, open: false }))}>
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
