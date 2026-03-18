import { useState } from "react";
import { $$ } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format, parseISO, isToday, isTomorrow, isPast } from "date-fns";
import { es } from "date-fns/locale";
import {
  Phone, MessageSquare, MapPin, Mail, FileText, Plus, Eye,
  CalendarIcon, Search, AlertTriangle, Clock, CheckCircle2,
  XCircle, Loader2, Send, Filter, Users, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { WhatsAppPreviewModal } from "@/components/WhatsAppPreviewModal";

const TIPOS_GESTION = [
  { value: "llamada", label: "📞 Llamada", icon: Phone },
  { value: "whatsapp", label: "💬 WhatsApp", icon: MessageSquare },
  { value: "visita", label: "📍 Visita", icon: MapPin },
  { value: "email", label: "✉️ Email", icon: Mail },
  { value: "nota", label: "📝 Nota", icon: FileText },
];

const RESULTADOS = [
  { value: "contactado", label: "Contactado", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "no_contactado", label: "No contactado", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "promesa_pago", label: "Promesa de pago", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "pago_realizado", label: "Pago realizado", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { value: "rechazado", label: "Rechazado", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "buzon", label: "Buzón", color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
];



export default function CrmCobranzaPage() {
  const { empresaId } = useEmpresa();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [openGestion, setOpenGestion] = useState(false);
  const [selectedPrestamo, setSelectedPrestamo] = useState<any>(null);

  // Gestión form
  const [gestionForm, setGestionForm] = useState({
    tipo_gestion: "llamada",
    resultado: "contactado",
    notas: "",
    fecha_seguimiento: "",
  });

  // ── Préstamos con mora (cartera vencida) ────────────────
  const { data: carteraVencida, isLoading } = useQuery({
    queryKey: ["crm-cartera", empresaId],
    queryFn: async () => {
      // Get prestamos with overdue cuotas
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select(`
          id, monto_solicitado, num_cuotas, frecuencia, estado, fecha_registro,
          clientes!inner(id, nombre_completo, telefono, direccion),
          amortizacion(id, num_cuota, fecha_vencimiento, saldo_total, saldo_mora, status, dias_atraso)
        `)
        .eq("empresa_id", empresaId)
        .in("estado", ["Activo", "Al día", "Vencido"])
        .order("created_at", { ascending: false });

      // Process each prestamo
      return (prestamos || []).map((p: any) => {
        const cuotas = p.amortizacion || [];
        const vencidas = cuotas.filter((c: any) => c.status === "Vencida" || (c.dias_atraso && c.dias_atraso > 0));
        const totalMora = cuotas.reduce((s: number, c: any) => s + (c.saldo_mora || 0), 0);
        const totalAdeudado = cuotas.reduce((s: number, c: any) => s + (c.saldo_total || 0), 0);
        const maxDiasAtraso = Math.max(0, ...cuotas.map((c: any) => c.dias_atraso || 0));
        const proximaCuota = cuotas
          .filter((c: any) => c.status !== "Pagada")
          .sort((a: any, b: any) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))[0];

        return {
          ...p,
          cliente: p.clientes,
          cuotasVencidas: vencidas.length,
          totalMora,
          totalAdeudado,
          maxDiasAtraso,
          proximaCuota,
        };
      }).filter((p: any) => p.totalAdeudado > 0);
    },
  });

  // ── Gestiones ────────────────────────────────
  const { data: gestiones } = useQuery({
    queryKey: ["crm-gestiones", empresaId],
    queryFn: async () => {
      const data = await fetchAllRows(
        (supabase.from as any)("crm_gestiones")
          .select("id, cliente_id, prestamo_id, tipo_gestion, resultado, notas, fecha_seguimiento, registrado_por, created_at")
          .eq("empresa_id", empresaId)
          .order("created_at", { ascending: false })
      );
      return data as any[];
    },
  });

  const saveGestion = useMutation({
    mutationFn: async () => {
      if (!selectedPrestamo) return;
      const { error } = await (supabase.from as any)("crm_gestiones").insert({
        empresa_id: empresaId,
        prestamo_id: selectedPrestamo.id,
        cliente_id: selectedPrestamo.cliente.id,
        tipo_gestion: gestionForm.tipo_gestion,
        resultado: gestionForm.resultado,
        notas: gestionForm.notas,
        fecha_seguimiento: gestionForm.fecha_seguimiento || null,
        registrado_por: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-gestiones", empresaId] });
      setOpenGestion(false);
      setGestionForm({ tipo_gestion: "llamada", resultado: "contactado", notas: "", fecha_seguimiento: "" });
      toast.success("Gestión registrada");
    },
    onError: (e: any) => toast.error("Error: " + e.message),
  });

  // ── Send WhatsApp from CRM ────────────────
  const [sendingWA, setSendingWA] = useState<string | null>(null);

  const sendWhatsAppCobranza = async (prestamo: any) => {
    setSendingWA(prestamo.id);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-sender", {
        body: {
          action: "send-text",
          empresa_id: empresaId,
          phone: prestamo.cliente.telefono,
          message: `Hola ${prestamo.cliente.nombre_completo}, nos comunicamos respecto a su crédito. Tiene ${prestamo.cuotasVencidas} cuota(s) vencida(s) por un total de ${$$(prestamo.totalAdeudado)}. Por favor comuníquese con nosotros.`,
          tipo: "cobranza",
          referencia_id: prestamo.id,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Mensaje enviado");
        // Auto-register gestión
        await (supabase.from as any)("crm_gestiones").insert({
          empresa_id: empresaId,
          prestamo_id: prestamo.id,
          cliente_id: prestamo.cliente.id,
          tipo_gestion: "whatsapp",
          resultado: "contactado",
          notas: "Mensaje de cobranza enviado por WhatsApp",
          registrado_por: user?.id || null,
        });
        queryClient.invalidateQueries({ queryKey: ["crm-gestiones", empresaId] });
      } else {
        toast.error("Error enviando: " + (data?.error || "desconocido"));
      }
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setSendingWA(null);
    }
  };

  // ── Filter ────────────────────────────────
  const filtered = (carteraVencida || []).filter((p: any) => {
    const matchSearch = !search || p.cliente.nombre_completo.toLowerCase().includes(search.toLowerCase()) ||
      p.cliente.telefono?.includes(search);
    const matchEstado = filtroEstado === "todos" || 
      (filtroEstado === "vencido" && p.cuotasVencidas > 0) ||
      (filtroEstado === "al_dia" && p.cuotasVencidas === 0);
    return matchSearch && matchEstado;
  }).sort((a: any, b: any) => b.maxDiasAtraso - a.maxDiasAtraso);

  const getGestionesForPrestamo = (prestamoId: string) => 
    (gestiones || []).filter((g: any) => g.prestamo_id === prestamoId);

  const getSeverityColor = (dias: number) => {
    if (dias > 30) return "text-red-600 dark:text-red-400";
    if (dias > 7) return "text-orange-600 dark:text-orange-400";
    if (dias > 0) return "text-yellow-600 dark:text-yellow-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            CRM Cobranza
          </h1>
          <p className="text-muted-foreground text-sm">Seguimiento y gestión de cartera</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cuentas</p>
          <p className="text-xl font-bold">{filtered.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Con mora</p>
          <p className="text-xl font-bold text-destructive">{filtered.filter((p: any) => p.cuotasVencidas > 0).length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total mora</p>
          <p className="text-xl font-bold text-destructive">{$$(filtered.reduce((s: number, p: any) => s + p.totalMora, 0))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total adeudado</p>
          <p className="text-xl font-bold">{$$(filtered.reduce((s: number, p: any) => s + p.totalAdeudado, 0))}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="vencido">Con mora</SelectItem>
            <SelectItem value="al_dia">Al día</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">No hay cuentas que coincidan con los filtros</Card>
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((p: any) => {
              const gests = getGestionesForPrestamo(p.id);
              const lastGestion = gests[0];
              const lastResultado = lastGestion ? RESULTADOS.find((r) => r.value === lastGestion.resultado) : null;

              return (
                <Card key={p.id} className="p-3" onClick={() => navigate(`/prestamos/${p.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{p.cliente.nombre_completo}</p>
                      <p className="text-[11px] text-muted-foreground">{p.cliente.telefono || "Sin teléfono"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm">{$$(p.totalAdeudado)}</p>
                      {p.totalMora > 0 && <p className="text-[10px] text-destructive">Mora: {$$(p.totalMora)}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-2 pt-2 border-t">
                    {p.maxDiasAtraso > 0 && (
                      <span className={cn("text-xs font-bold", getSeverityColor(p.maxDiasAtraso))}>
                        {p.maxDiasAtraso}d atraso
                      </span>
                    )}
                    {p.cuotasVencidas > 0 && (
                      <Badge variant="destructive" className="text-[10px] h-5">{p.cuotasVencidas} vencida{p.cuotasVencidas > 1 ? "s" : ""}</Badge>
                    )}
                    {lastResultado && (
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium ml-auto", lastResultado.color)}>
                        {lastResultado.label}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 mt-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => { setSelectedPrestamo(p); setOpenGestion(true); }}>
                      <Plus className="h-3 w-3 mr-1" /> Gestión
                    </Button>
                    {p.cliente.telefono && (
                      <Button variant="outline" size="sm" className="h-7 text-xs text-green-600" onClick={() => sendWhatsAppCobranza(p)} disabled={sendingWA === p.id}>
                        {sendingWA === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate(`/prestamos/${p.id}`)}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop: Table */}
          <Card className="hidden md:block">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs text-center">Días Atraso</TableHead>
                    <TableHead className="text-xs text-center">Cuotas Vencidas</TableHead>
                    <TableHead className="text-xs text-right">Mora</TableHead>
                    <TableHead className="text-xs text-right">Total Adeudado</TableHead>
                    <TableHead className="text-xs text-center">Gestiones</TableHead>
                    <TableHead className="text-xs text-center">Última Gestión</TableHead>
                    <TableHead className="text-xs text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => {
                    const gests = getGestionesForPrestamo(p.id);
                    const lastGestion = gests[0];
                    const lastResultado = lastGestion ? RESULTADOS.find((r) => r.value === lastGestion.resultado) : null;

                    return (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{p.cliente.nombre_completo}</p>
                            <p className="text-xs text-muted-foreground">{p.cliente.telefono || "Sin teléfono"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("font-bold text-sm", getSeverityColor(p.maxDiasAtraso))}>
                            {p.maxDiasAtraso > 0 ? `${p.maxDiasAtraso}d` : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {p.cuotasVencidas > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">{p.cuotasVencidas}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">0</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-destructive">{$$(p.totalMora)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{$$(p.totalAdeudado)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">{gests.length}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {lastGestion ? (
                            <div className="text-xs">
                              <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium", lastResultado?.color)}>
                                {lastResultado?.label || lastGestion.resultado}
                              </span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {format(new Date(lastGestion.created_at), "dd/MM", { locale: es })}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { setSelectedPrestamo(p); setOpenGestion(true); }}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            {p.cliente.telefono && (
                              <Button variant="outline" size="icon" className="h-7 w-7 text-green-600" onClick={() => sendWhatsAppCobranza(p)} disabled={sendingWA === p.id}>
                                {sendingWA === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/prestamos/${p.id}`)}>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {/* ── Nueva Gestión Modal ── */}
      <Dialog open={openGestion} onOpenChange={setOpenGestion}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base">Registrar Gestión</DialogTitle>
            {selectedPrestamo && (
              <p className="text-sm text-muted-foreground">
                {selectedPrestamo.cliente.nombre_completo} — {$$(selectedPrestamo.totalAdeudado)} adeudado
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo de Gestión</Label>
                <Select value={gestionForm.tipo_gestion} onValueChange={(v) => setGestionForm({ ...gestionForm, tipo_gestion: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_GESTION.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Resultado</Label>
                <Select value={gestionForm.resultado} onValueChange={(v) => setGestionForm({ ...gestionForm, resultado: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESULTADOS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notas</Label>
              <Textarea
                rows={3}
                placeholder="Detalle de la gestión..."
                value={gestionForm.notas}
                onChange={(e) => setGestionForm({ ...gestionForm, notas: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Fecha de seguimiento (opcional)</Label>
              <Input
                type="date"
                value={gestionForm.fecha_seguimiento}
                onChange={(e) => setGestionForm({ ...gestionForm, fecha_seguimiento: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* History for this prestamo */}
            {selectedPrestamo && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Historial de gestiones</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-2">
                    {getGestionesForPrestamo(selectedPrestamo.id).length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Sin gestiones previas</p>
                    ) : (
                      getGestionesForPrestamo(selectedPrestamo.id).map((g: any) => {
                        const res = RESULTADOS.find((r) => r.value === g.resultado);
                        const tipo = TIPOS_GESTION.find((t) => t.value === g.tipo_gestion);
                        return (
                          <div key={g.id} className="border rounded-md p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{tipo?.label || g.tipo_gestion}</span>
                              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", res?.color)}>{res?.label || g.resultado}</span>
                            </div>
                            {g.notas && <p className="text-muted-foreground mt-1">{g.notas}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {g.created_at ? format(new Date(g.created_at), "dd/MM/yyyy HH:mm", { locale: es }) : ""}
                              {g.fecha_seguimiento ? ` • Seguimiento: ${g.fecha_seguimiento}` : ""}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGestion(false)}>Cancelar</Button>
            <Button onClick={() => saveGestion.mutate()} disabled={saveGestion.isPending}>
              {saveGestion.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
