import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccesoApp } from "@/hooks/useAccesoApp";
import { useAuthStore } from "@/stores/authStore";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { calcularCostoMensual } from "@/lib/subscription";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CreditCard, Crown, Shield, Users, Zap, Check, ExternalLink,
  RefreshCw, Receipt, ArrowRight, CalendarDays, AlertCircle,
  ShoppingCart, Minus, Plus, ChevronRight, Clock, FileText
} from "lucide-react";
import { $$, cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const ESTADO_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  activa: { label: "Activa", variant: "default", color: "text-emerald-600" },
  trial: { label: "Prueba gratuita", variant: "outline", color: "text-blue-600" },
  trial_expirado: { label: "Prueba expirada", variant: "destructive", color: "text-destructive" },
  gracia: { label: "En gracia", variant: "secondary", color: "text-amber-600" },
  suspendida: { label: "Suspendida", variant: "destructive", color: "text-destructive" },
  cancelada: { label: "Cancelada", variant: "destructive", color: "text-destructive" },
  sin_suscripcion: { label: "Sin plan", variant: "secondary", color: "text-muted-foreground" },
  pendiente_pago: { label: "Pendiente de pago", variant: "secondary", color: "text-amber-600" },
  sin_empresa: { label: "Sin empresa", variant: "secondary", color: "text-muted-foreground" },
};

const PLAN_FEATURES: Record<string, string[]> = {
  "Básico": [
    "Hasta 3 usuarios",
    "Gestión de préstamos",
    "Cobranza diaria",
    "Reportes básicos",
    "Capacitación por videos",
  ],
  "Profesional": [
    "Hasta 10 usuarios",
    "Todo de Básico +",
    "Reportes avanzados",
    "WhatsApp automático",
    "GPS y mapas",
    "1 hora de capacitación",
  ],
  "Enterprise": [
    "Hasta 20 usuarios",
    "Todo de Profesional +",
    "Stripe Connect",
    "Auditoría completa",
    "CRM cobranza",
    "Soporte prioritario",
    "3 horas de capacitación",
  ],
};

type Plan = {
  id: string;
  nombre: string;
  precio_base_mes: number;
  usuarios_incluidos: number;
  precio_usuario_extra: number;
  descripcion: string;
  stripe_product_id: string;
  stripe_price_id: string;
};

export default function MiSuscripcionPage() {
  const { data: subData, loading, refetch, subscribed, estado } = useAccesoApp();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { empresaId: storeEmpresaId, empresaNombre } = useEmpresa();
  const isSuperAdmin = user?.email === "diego.leon@uniline.mx";
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [numUsuarios, setNumUsuarios] = useState(1);
  const [showAllFacturas, setShowAllFacturas] = useState(false);
  const [selectPlanLoading, setSelectPlanLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast.success("¡Suscripción activada exitosamente!");
      refetch();
      window.history.replaceState({}, "", "/mi-suscripcion");
    } else if (params.get("checkout") === "cancel") {
      toast.info("Proceso de pago cancelado");
      window.history.replaceState({}, "", "/mi-suscripcion");
    }
  }, [refetch]);

  const { data: planes = [] } = useQuery({
    queryKey: ["planes-disponibles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planes")
        .select("*")
        .eq("activo", true)
        .order("precio_base_mes");
      if (error) throw error;
      return data as Plan[];
    },
  });

  const empresaId = subData?.empresa_id || storeEmpresaId;

  // Count active users for this empresa
  const { data: activeUsersCount = 0 } = useQuery({
    queryKey: ["empresa-users-count", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId!)
        .eq("activo", true);
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: facturas = [] } = useQuery({
    queryKey: ["mis-facturas", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facturas")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("fecha_emision", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Array<{
        id: string;
        numero_factura: string;
        periodo_inicio: string;
        periodo_fin: string;
        num_usuarios: number;
        total: number;
        estado: string;
        fecha_emision: string;
        fecha_pago: string | null;
        es_prorrateo: boolean;
        subtotal: number;
        descuento_porcentaje: number;
        precio_unitario: number;
      }>;
    },
  });

  const handleCheckout = async (planId: string, usuarios?: number) => {
    setCheckoutLoading(planId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan_id: planId, num_usuarios: usuarios || numUsuarios },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al crear sesión de pago");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al abrir portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const estadoKey = subData?.estado || estado || "sin_suscripcion";
  const estadoBadge = ESTADO_BADGE[estadoKey] || ESTADO_BADGE.sin_suscripcion;
  const hasActiveSub = subscribed || (subData?.subscribed ?? false);
  const isPendientePago = estadoKey === "pendiente_pago";

  const planIcons: Record<string, React.ReactNode> = {
    "Básico": <Shield className="h-5 w-5" />,
    "Profesional": <Users className="h-5 w-5" />,
    "Enterprise": <Crown className="h-5 w-5" />,
  };

  const planColorsCard: Record<string, string> = {
    "Básico": "border-border",
    "Profesional": "border-primary shadow-md shadow-primary/10",
    "Enterprise": "border-amber-400/60 shadow-md shadow-amber-400/10",
  };

  const planColorsBg: Record<string, string> = {
    "Básico": "bg-secondary",
    "Profesional": "bg-primary/5",
    "Enterprise": "bg-amber-50 dark:bg-amber-950/20",
  };

  // Current plan object
  const currentPlan = useMemo(() => {
    if (!subData?.plan_id) return null;
    return planes.find((p) => p.id === subData.plan_id) || null;
  }, [planes, subData?.plan_id]);

  // Days until next charge / expiration
  const daysUntilCharge = useMemo(() => {
    const dateStr = subData?.fecha_proximo_cobro || subData?.fecha_vencimiento;
    if (!dateStr) return null;
    try {
      return differenceInDays(parseISO(dateStr), new Date());
    } catch {
      return null;
    }
  }, [subData]);

  // Cost calculation for change plan dialog
  const selectedPlan = planes.find((p) => p.id === selectedPlanId);
  const costCalc = useMemo(() => {
    if (!selectedPlan) return null;
    return calcularCostoMensual(
      selectedPlan.precio_base_mes,
      selectedPlan.usuarios_incluidos,
      selectedPlan.precio_usuario_extra,
      numUsuarios,
    );
  }, [selectedPlan, numUsuarios]);

  // Current cost for comparison
  const currentCost = useMemo(() => {
    if (!currentPlan || !subData) return 0;
    const c = calcularCostoMensual(
      currentPlan.precio_base_mes,
      currentPlan.usuarios_incluidos,
      currentPlan.precio_usuario_extra,
      subData.num_usuarios || 1,
      subData.descuento_porcentaje || 0,
    );
    return c.total;
  }, [currentPlan, subData]);

  const displayedFacturas = showAllFacturas ? facturas : facturas.slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Determine if we should show the "current plan" card
  const showCurrentPlan = hasActiveSub && subData;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mi Suscripción</h1>
          <p className="text-sm text-muted-foreground">Gestiona tu plan, método de pago y facturas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {/* ── SUPERADMIN CARD ───────────────────────────────── */}
      {isSuperAdmin && !subData && (
        <Card className="border-amber-400/50 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-600" />
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Super Administrador</h2>
                <p className="text-sm text-muted-foreground">Acceso total al sistema — sin restricciones de plan</p>
              </div>
              <Badge variant="default" className="ml-auto bg-amber-500 text-white">Ilimitado</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── SIN SUSCRIPCIÓN — Estado actual ────────────────── */}
      {!showCurrentPlan && (
        <Card className="border-destructive/30 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-destructive/60 to-destructive/30" />
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Sin suscripción activa</h2>
                  <p className="text-sm text-muted-foreground">
                    {empresaNombre || "Tu empresa"} no tiene un plan contratado
                  </p>
                </div>
              </div>
              <Badge variant={estadoBadge.variant} className="text-sm px-3 py-1">
                {estadoBadge.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <KpiCell
                label="Usuarios activos"
                value={String(activeUsersCount)}
                icon={<Users className="h-3.5 w-3.5" />}
              />
              <KpiCell
                label="Plan actual"
                value="Ninguno"
                icon={<CreditCard className="h-3.5 w-3.5" />}
              />
              <KpiCell
                label="Estado"
                value={estadoBadge.label}
                icon={<AlertCircle className="h-3.5 w-3.5" />}
              />
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">👇 Contrata un plan para continuar</p>
              <p>Selecciona uno de los planes de abajo. Asegúrate de elegir suficientes usuarios para tu equipo ({activeUsersCount} activos actualmente).</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PLAN ACTUAL (con suscripción) ─────────────────── */}
      {showCurrentPlan && (
        <Card className="border-primary/30 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60" />
          <CardContent className="p-5 space-y-5">
            {/* Row 1: Plan name + status badge */}
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {planIcons[subData.plan_nombre || ""] || <Zap className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{subData.plan_nombre || "Plan Actual"}</h2>
                  <p className="text-xs text-muted-foreground">
                    {currentPlan
                      ? `Incluye ${currentPlan.usuarios_incluidos} usuarios · ${$$(currentPlan.precio_usuario_extra)}/extra`
                      : "—"}
                  </p>
                </div>
              </div>
              <Badge variant={estadoBadge.variant} className="text-sm px-3 py-1">
                {estadoBadge.label}
              </Badge>
            </div>

            {/* Row 2: KPIs grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCell
                label="Costo mensual"
                value={$$(subData.precio_base || 0)}
                icon={<CreditCard className="h-3.5 w-3.5" />}
              />
              <KpiCell
                label="Usuarios"
                value={`${activeUsersCount} / ${subData.num_usuarios || 1}`}
                icon={<Users className="h-3.5 w-3.5" />}
                sub={activeUsersCount > (subData.num_usuarios || 1) ? "⚠️ Excedido" : `${(subData.num_usuarios || 1) - activeUsersCount} disponibles`}
                subColor={activeUsersCount > (subData.num_usuarios || 1) ? "text-destructive" : undefined}
              />
              <KpiCell
                label="Próximo cobro"
                value={subData.fecha_proximo_cobro
                  ? formatDateShort(subData.fecha_proximo_cobro)
                  : "—"}
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                sub={daysUntilCharge !== null
                  ? daysUntilCharge >= 0
                    ? `en ${daysUntilCharge} días`
                    : `vencido hace ${Math.abs(daysUntilCharge)} días`
                  : undefined}
                subColor={daysUntilCharge !== null && daysUntilCharge < 0 ? "text-destructive" : undefined}
              />
              <KpiCell
                label="Vencimiento"
                value={subData.fecha_vencimiento
                  ? formatDateShort(subData.fecha_vencimiento)
                  : "—"}
                icon={<Clock className="h-3.5 w-3.5" />}
              />
            </div>

            {/* Payment method */}
            {subData.card_last4 && (
              <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-secondary">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize font-medium">{subData.card_brand || "Tarjeta"}</span>
                <span className="text-muted-foreground">terminada en</span>
                <span className="font-mono font-semibold">{subData.card_last4}</span>
              </div>
            )}

            {subData.descuento_porcentaje && subData.descuento_porcentaje > 0 ? (
              <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 rounded-lg">
                🎉 Descuento del {subData.descuento_porcentaje}% aplicado a tu suscripción
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => {
                  setSelectedPlanId(subData.plan_id || planes[0]?.id || "");
                  setNumUsuarios(subData.num_usuarios || 1);
                  setChangeOpen(true);
                }}
                className="gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Cambiar plan o usuarios
              </Button>

              {!subData.es_manual && (
                <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  {portalLoading ? "Cargando..." : "Gestionar pagos"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PLANES DISPONIBLES ─────────────────────────────── */}
      <Separator />
      <div className="text-center py-4">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-3">
          <Zap className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold">
          {showCurrentPlan ? "Planes disponibles" : "Elige tu plan"}
        </h2>
        <p className="text-muted-foreground text-sm mt-1 max-w-md mx-auto">
          Selecciona el plan que mejor se adapte a tu negocio. Todos incluyen prueba gratuita de 7 días.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {planes.map((plan) => {
          const isPro = plan.nombre === "Profesional";
          const isCurrent = showCurrentPlan && plan.id === subData?.plan_id;
          const features = PLAN_FEATURES[plan.nombre] || [];

          return (
            <Card
              key={plan.id}
              className={cn(
                "relative flex flex-col",
                isCurrent
                  ? "border-primary/50 bg-primary/[0.02] ring-2 ring-primary/20"
                  : planColorsCard[plan.nombre] || "border-border"
              )}
            >
              {isCurrent && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Tu plan actual
                </Badge>
              )}
              {!isCurrent && isPro && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Más popular
                </Badge>
              )}

              <CardHeader className="text-center pb-2">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center mx-auto mb-1",
                  planColorsBg[plan.nombre] || "bg-secondary"
                )}>
                  {planIcons[plan.nombre] || <Zap className="h-5 w-5" />}
                </div>
                <CardTitle className="text-lg">{plan.nombre}</CardTitle>
                <CardDescription className="text-xs">{plan.descripcion}</CardDescription>
                <div className="pt-3">
                  <span className="text-3xl font-extrabold">{$$(plan.precio_base_mes)}</span>
                  <span className="text-muted-foreground text-sm">/mes</span>
                </div>
                <p className="text-xs text-primary font-semibold mt-1">
                  Hasta {plan.usuarios_incluidos} usuarios incluidos
                </p>
                <p className="text-[11px] text-muted-foreground">
                  +{$$(plan.precio_usuario_extra)}/usuario extra
                </p>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col pt-0 gap-4">
                <ul className="space-y-2 flex-1">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px]">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setNumUsuarios(subData?.num_usuarios || 1);
                      setChangeOpen(true);
                    }}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Agregar usuarios
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isPro ? "default" : "outline"}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setNumUsuarios(plan.usuarios_incluidos);
                      setChangeOpen(true);
                    }}
                  >
                    {showCurrentPlan
                      ? (plan.precio_base_mes > (subData?.precio_base || 0) ? "Upgrade" : "Cambiar")
                      : "Contratar"
                    }
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        * Precios en MXN + IVA. Facturación mensual anclada al día 1.
      </p>

      {/* ── HISTORIAL DE FACTURAS ──────────────────────────── */}
      <Separator />
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Historial de Facturas
          </h2>
          {facturas.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllFacturas(!showAllFacturas)}
              className="text-xs gap-1"
            >
              {showAllFacturas ? "Mostrar menos" : `Ver todas (${facturas.length})`}
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showAllFacturas && "rotate-90")} />
            </Button>
          )}
        </div>

        {facturas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aún no tienes facturas registradas</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Número</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-center">Usuarios</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Emisión</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedFacturas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.numero_factura || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {f.es_prorrateo ? (
                          <Badge variant="outline" className="text-[10px]">Prorrateo</Badge>
                        ) : (
                          <span className="text-xs">
                            {formatDateShort(f.periodo_inicio)} — {formatDateShort(f.periodo_fin)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{f.num_usuarios}</TableCell>
                      <TableCell className="text-right text-sm">{$$(f.subtotal || f.total)}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        {$$(f.total)}
                        {f.descuento_porcentaje > 0 && (
                          <span className="text-[10px] text-emerald-600 block">-{f.descuento_porcentaje}%</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <FacturaBadge estado={f.estado} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {f.fecha_emision ? formatDateShort(f.fecha_emision) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {f.fecha_pago ? formatDateShort(f.fecha_pago) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── DIALOG: CARRITO — ELEGIR PLAN + USUARIOS ───────── */}
      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              {hasActiveSub ? "Cambiar plan o usuarios" : "Configura tu plan"}
            </DialogTitle>
            <DialogDescription>
              {hasActiveSub
                ? "Selecciona el plan y cantidad de usuarios que necesitas"
                : "Elige tu plan y la cantidad de usuarios. Se generará una factura para que realices el pago."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Plan selector */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Plan</Label>
              <Select value={selectedPlanId} onValueChange={(v) => {
                setSelectedPlanId(v);
                const p = planes.find((pl) => pl.id === v);
                if (p && numUsuarios < p.usuarios_incluidos) {
                  setNumUsuarios(p.usuarios_incluidos);
                }
              }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {planes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} — {$$(p.precio_base_mes)}/mes ({p.usuarios_incluidos} usuarios incl.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Users stepper */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Usuarios</Label>
              <div className="flex items-center gap-3 mt-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!selectedPlan || numUsuarios <= (selectedPlan?.usuarios_incluidos || 1)}
                  onClick={() => setNumUsuarios(Math.max(selectedPlan?.usuarios_incluidos || 1, numUsuarios - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-2xl font-bold w-12 text-center">{numUsuarios}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setNumUsuarios(numUsuarios + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {selectedPlan && numUsuarios <= selectedPlan.usuarios_incluidos && (
                  <span className="text-xs text-muted-foreground">
                    Incluidos en el plan
                  </span>
                )}
                {selectedPlan && numUsuarios > selectedPlan.usuarios_incluidos && (
                  <span className="text-xs text-primary font-medium">
                    +{numUsuarios - selectedPlan.usuarios_incluidos} extra(s) × {$$(selectedPlan.precio_usuario_extra)}
                  </span>
                )}
              </div>
            </div>

            {/* Cost breakdown */}
            {costCalc && selectedPlan && (
              <div className="bg-secondary rounded-lg p-4 space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Resumen de tu pedido
                </p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan {selectedPlan.nombre} (base)</span>
                  <span>{$$(selectedPlan.precio_base_mes)}</span>
                </div>
                {costCalc.extraUsers > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {costCalc.extraUsers} usuario(s) extra × {$$(selectedPlan.precio_usuario_extra)}
                    </span>
                    <span>{$$(costCalc.extraUsers * selectedPlan.precio_usuario_extra)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costo mensual completo</span>
                  <span className="font-semibold">{$$(costCalc.total)}/mes</span>
                </div>

                {/* Proration note */}
                {!hasActiveSub && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                      <span>
                        Se generará una factura {new Date().getDate() !== 1 ? "prorrateada por los días restantes del mes" : "por el mes completo"}.
                        La facturación regular se ancla al día 1 de cada mes.
                      </span>
                    </div>
                  </>
                )}

                {/* Difference vs current */}
                {hasActiveSub && currentCost > 0 && (
                  <div className={cn(
                    "text-xs pt-1",
                    costCalc.total > currentCost ? "text-amber-600" :
                    costCalc.total < currentCost ? "text-emerald-600" : "text-muted-foreground"
                  )}>
                    {costCalc.total > currentCost
                      ? `↑ +${$$(costCalc.total - currentCost)}/mes vs tu plan actual`
                      : costCalc.total < currentCost
                        ? `↓ -${$$(currentCost - costCalc.total)}/mes vs tu plan actual`
                        : "Sin cambio respecto a tu plan actual"}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (hasActiveSub) {
                  // Existing subscriber → Stripe checkout for plan change
                  handleCheckout(selectedPlanId, numUsuarios);
                  setChangeOpen(false);
                } else {
                  // New subscriber → select-plan generates invoice, then redirect to Stripe
                  setSelectPlanLoading(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("select-plan", {
                      body: { plan_id: selectedPlanId, num_usuarios: numUsuarios },
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    toast.success(
                      `Factura por ${$$(data.factura.total)} generada. Redirigiendo a pago...`,
                      { duration: 4000 }
                    );
                    // Invalidate queries so facturas and subscription show immediately
                    queryClient.invalidateQueries({ queryKey: ["mis-facturas"] });
                    queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
                    setChangeOpen(false);

                    // Now redirect to Stripe checkout
                    const { data: checkoutData, error: checkoutErr } = await supabase.functions.invoke("create-checkout", {
                      body: { plan_id: selectedPlanId, num_usuarios: numUsuarios },
                    });
                    if (checkoutErr) throw checkoutErr;
                    if (checkoutData?.url) {
                      window.open(checkoutData.url, "_blank");
                    }
                  } catch (err: any) {
                    toast.error(err.message || "Error al seleccionar plan");
                  } finally {
                    setSelectPlanLoading(false);
                  }
                }
              }}
              disabled={!selectedPlanId || selectPlanLoading || checkoutLoading !== null}
              className="gap-2"
            >
              {selectPlanLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
              ) : (
                <Receipt className="h-4 w-4" />
              )}
              {selectPlanLoading
                ? "Procesando..."
                : hasActiveSub
                  ? "Cambiar y pagar"
                  : "Generar factura y pagar"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────

function KpiCell({ label, value, icon, sub, subColor }: {
  label: string; value: string; icon: React.ReactNode; sub?: string; subColor?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-secondary space-y-0.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-base font-bold">{value}</p>
      {sub && <p className={cn("text-[11px]", subColor || "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}

function FacturaBadge({ estado }: { estado: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pagada: { label: "Pagada", variant: "default" },
    pendiente: { label: "Pendiente", variant: "secondary" },
    fallida: { label: "Fallida", variant: "destructive" },
    cancelada: { label: "Cancelada", variant: "outline" },
  };
  const c = config[estado] || { label: estado, variant: "outline" as const };
  return <Badge variant={c.variant} className="text-[10px]">{c.label}</Badge>;
}

function formatDateShort(dateStr: string) {
  try {
    const d = dateStr.includes("T") ? parseISO(dateStr) : parseISO(dateStr + "T00:00:00");
    return format(d, "dd MMM yyyy", { locale: es });
  } catch {
    return dateStr?.split("T")[0] || "—";
  }
}
