import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccesoApp } from "@/hooks/useAccesoApp";
import { useAuthStore } from "@/stores/authStore";
import { calcularCostoMensual } from "@/lib/subscription";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CreditCard, Crown, Shield, Users, Zap, Check, ExternalLink, RefreshCw, Receipt } from "lucide-react";
import { $$ } from "@/lib/utils";

const ESTADO_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  activa: { label: "Activa", variant: "default" },
  trial: { label: "Prueba", variant: "outline" },
  gracia: { label: "En gracia", variant: "secondary" },
  suspendida: { label: "Suspendida", variant: "destructive" },
  cancelada: { label: "Cancelada", variant: "destructive" },
  sin_suscripcion: { label: "Sin plan", variant: "secondary" },
  pendiente_pago: { label: "Pendiente de pago", variant: "secondary" },
};

export default function MiSuscripcionPage() {
  const { data: subData, loading, refetch } = useAccesoApp();
  const user = useAuthStore((s) => s.user);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Check for success/cancel query params
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

  // Fetch available plans
  const { data: planes = [] } = useQuery({
    queryKey: ["planes-disponibles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planes")
        .select("*")
        .eq("activo", true)
        .order("precio_base_mes");
      if (error) throw error;
      return data as Array<{
        id: string;
        nombre: string;
        precio_base_mes: number;
        usuarios_incluidos: number;
        precio_usuario_extra: number;
        descripcion: string;
        stripe_product_id: string;
        stripe_price_id: string;
      }>;
    },
  });

  // Fetch invoices for current empresa
  const { data: facturas = [] } = useQuery({
    queryKey: ["mis-facturas"],
    enabled: !!subData?.empresa_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facturas")
        .select("*")
        .eq("empresa_id", subData!.empresa_id!)
        .order("fecha_emision", { ascending: false })
        .limit(20);
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
      }>;
    },
  });

  const handleCheckout = async (planId: string) => {
    setCheckoutLoading(planId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan_id: planId, num_usuarios: 1 },
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

  const estadoBadge = ESTADO_BADGE[subData?.estado || "sin_suscripcion"] || ESTADO_BADGE.sin_suscripcion;
  const hasActiveSub = subData?.subscribed;
  const planIcons: Record<string, React.ReactNode> = {
    "Básico": <Shield className="h-5 w-5" />,
    "Profesional": <Users className="h-5 w-5" />,
    "Enterprise": <Crown className="h-5 w-5" />,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mi Suscripción</h1>
          <p className="text-sm text-muted-foreground">Gestiona tu plan, método de pago y facturas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {/* Current plan card */}
      {hasActiveSub && subData ? (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                {planIcons[subData.plan_nombre || ""] || <Zap className="h-5 w-5" />}
                {subData.plan_nombre || "Plan Actual"}
              </CardTitle>
              <Badge variant={estadoBadge.variant}>{estadoBadge.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">Precio base</span>
                <span className="font-semibold">{$$(subData.precio_base)}/mes</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Usuarios</span>
                <span className="font-semibold">{subData.num_usuarios}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Próximo cobro</span>
                <span className="font-semibold">{subData.fecha_proximo_cobro || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Periodicidad</span>
                <span className="font-semibold capitalize">{subData.periodicidad || "Mensual"}</span>
              </div>
            </div>

            {subData.card_last4 && (
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{subData.card_brand || "Tarjeta"}</span>
                <span className="text-muted-foreground">terminada en {subData.card_last4}</span>
              </div>
            )}

            {subData.descuento_porcentaje && subData.descuento_porcentaje > 0 ? (
              <div className="text-sm text-green-600 font-medium">
                🎉 Descuento del {subData.descuento_porcentaje}% aplicado
              </div>
            ) : null}

            <div className="flex gap-2 pt-2">
              {!subData.es_manual && (
                <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  {portalLoading ? "Cargando..." : "Gestionar en Stripe"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* No subscription - show plan picker */
        <>
          <div className="text-center py-6">
            <h2 className="text-xl font-semibold">Elige tu plan</h2>
            <p className="text-muted-foreground text-sm mt-1">Selecciona el plan que mejor se adapte a tu negocio</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {planes.map((plan) => {
              const isPro = plan.nombre === "Profesional";
              return (
                <Card key={plan.id} className={`relative ${isPro ? "border-primary shadow-lg" : ""}`}>
                  {isPro && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Más popular</Badge>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-lg">{plan.nombre}</CardTitle>
                    <CardDescription>{plan.descripcion}</CardDescription>
                    <div className="pt-2">
                      <span className="text-3xl font-bold">{$$(plan.precio_base_mes)}</span>
                      <span className="text-muted-foreground">/mes</span>
                    </div>
                    <p className="text-xs text-primary font-medium">Hasta {plan.usuarios_incluidos} usuarios incluidos</p>
                    <p className="text-xs text-muted-foreground">{$$(plan.precio_usuario_extra)}/usuario extra</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      className="w-full"
                      variant={isPro ? "default" : "outline"}
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                    >
                      {checkoutLoading === plan.id ? "Procesando..." : "Contratar"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center">* IVA no incluido. Precios en MXN.</p>
        </>
      )}

      {/* Invoices section */}
      {facturas.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Receipt className="h-5 w-5" /> Mis Facturas
            </h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Usuarios</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facturas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-sm">{f.numero_factura}</TableCell>
                        <TableCell className="text-sm">
                          {f.es_prorrateo ? "Prorrateo" : `${f.periodo_inicio} — ${f.periodo_fin}`}
                        </TableCell>
                        <TableCell>{f.num_usuarios}</TableCell>
                        <TableCell className="font-semibold">{$$(f.total)}</TableCell>
                        <TableCell>
                          <Badge variant={
                            f.estado === "pagada" ? "default" :
                            f.estado === "pendiente" ? "secondary" :
                            "destructive"
                          }>
                            {f.estado === "pagada" ? "Pagada" :
                             f.estado === "pendiente" ? "Pendiente" :
                             f.estado === "fallida" ? "Fallida" : f.estado}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{f.fecha_emision?.split("T")[0] || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
