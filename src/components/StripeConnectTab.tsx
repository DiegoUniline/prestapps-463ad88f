import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, ExternalLink, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

interface ConnectStatus {
  connected: boolean;
  onboarding_complete?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  stripe_account_id?: string;
}

export function StripeConnectTab() {
  const { empresaId } = useEmpresa();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: status, isLoading, refetch } = useQuery<ConnectStatus>({
    queryKey: ["stripe-connect-status", empresaId],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/stripe-connect-status?empresa_id=${empresaId}`;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error("Failed to check status");
      return res.json();
    },
    staleTime: 30_000,
  });

  const startOnboarding = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-onboard", {
        body: {
          empresa_id: empresaId,
          return_url: window.location.href,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.already_connected) {
        toast.success("La cuenta de Stripe ya está conectada");
        refetch();
        return;
      }

      if (data?.url) {
        window.open(data.url, "_blank");
        toast.info("Se abrió Stripe en una nueva pestaña. Completa el proceso y luego regresa aquí.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al conectar con Stripe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Stripe Connect
          </CardTitle>
          <CardDescription>
            Conecta tu cuenta de Stripe para cobrar con tarjeta de crédito/débito a tus clientes.
            Cada empresa gestiona su propia cuenta de Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando estado de Stripe...
            </div>
          ) : status?.connected ? (
            <div className="space-y-4">
              {/* Status indicators */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                  {status.onboarding_complete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Onboarding</p>
                    <p className="text-xs text-muted-foreground">
                      {status.onboarding_complete ? "Completado" : "Pendiente"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                  {status.charges_enabled ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Cobros</p>
                    <p className="text-xs text-muted-foreground">
                      {status.charges_enabled ? "Habilitados" : "Deshabilitados"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                  {status.payouts_enabled ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Pagos</p>
                    <p className="text-xs text-muted-foreground">
                      {status.payouts_enabled ? "Habilitados" : "Deshabilitados"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Account badge */}
              <div className="flex items-center gap-2">
                <Badge variant={status.charges_enabled ? "default" : "secondary"}>
                  {status.charges_enabled ? "Stripe Activo" : "Stripe Pendiente"}
                </Badge>
                {status.stripe_account_id && (
                  <span className="text-xs text-muted-foreground font-mono">{status.stripe_account_id}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {!status.onboarding_complete && (
                  <Button onClick={startOnboarding} disabled={loading} className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Completar Onboarding
                  </Button>
                )}
                <Button variant="outline" onClick={() => refetch()} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Actualizar Estado
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border-2 border-dashed border-border bg-muted/20 text-center">
                <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">No hay cuenta de Stripe conectada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Conecta tu cuenta de Stripe para poder cobrar cuotas con tarjeta de crédito/débito
                </p>
              </div>
              <Button onClick={startOnboarding} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Conectar Stripe
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">¿Cómo funciona?</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li><span className="font-medium text-foreground">Conecta tu cuenta de Stripe</span> — Serás redirigido a Stripe para completar el registro.</li>
            <li><span className="font-medium text-foreground">Registra tarjetas de clientes</span> — Envía un enlace seguro por WhatsApp o email para que el cliente registre su tarjeta.</li>
            <li><span className="font-medium text-foreground">Cobra cuotas</span> — Puedes cobrar manualmente desde el detalle del préstamo o configurar cobro automático.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
