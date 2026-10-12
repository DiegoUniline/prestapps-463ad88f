import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ── Stripe Auto-Charge Toggle ─────────────────────────────────────
export function StripeAutoChargeToggle({ prestamoId, enabled, disabled, onToggled, empresaId }: {
  prestamoId: string; enabled: boolean; disabled: boolean; onToggled: () => void; empresaId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(enabled);

  // Check if Stripe Connect is configured for this empresa
  const { data: stripeStatus } = useQuery({
    queryKey: ["stripe-connect-status-toggle", empresaId],
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
      if (!res.ok) return { connected: false, charges_enabled: false };
      return res.json();
    },
    staleTime: 60_000,
  });

  const stripeConnected = stripeStatus?.connected && stripeStatus?.charges_enabled;

  const handleToggle = async (value: boolean) => {
    if (!stripeConnected) {
      toast.error("Primero debes conectar Stripe en Configuración → Stripe Connect");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("prestamos")
        .update({ cobro_automatico_stripe: value } as any)
        .eq("id", prestamoId);
      if (error) throw error;
      setChecked(value);
      toast.success(value ? "Cobro automático activado" : "Cobro automático desactivado");
      onToggled();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5" /> Cobro Automático Stripe
      </h3>
      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium">
            {checked ? "Activado" : "Desactivado"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {!stripeConnected
              ? "Stripe no está conectado. Configúralo en Configuración → Stripe Connect."
              : checked
                ? "Las cuotas se cobrarán automáticamente a la tarjeta del cliente en su fecha de vencimiento."
                : "Active para cobrar automáticamente las cuotas con tarjeta registrada."}
          </p>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={handleToggle}
          disabled={disabled || loading || !stripeConnected}
        />
      </div>
    </div>
  );
}
