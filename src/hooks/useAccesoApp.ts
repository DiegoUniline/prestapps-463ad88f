import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { useEmpresaStore } from "@/stores/empresaStore";

export interface SubscriptionStatus {
  subscribed: boolean;
  estado: string;
  suscripcion_id?: string;
  plan_nombre?: string;
  plan_id?: string;
  num_usuarios?: number;
  precio_base?: number;
  periodicidad?: string;
  fecha_proximo_cobro?: string;
  fecha_vencimiento?: string;
  descuento_porcentaje?: number;
  es_manual?: boolean;
  empresa_id?: string;
  card_brand?: string | null;
  card_last4?: string | null;
  stripe_customer_id?: string;
  dias_gracia_restantes?: number | null;
  dias_trial_restantes?: number | null;
  factura_pendiente?: {
    id: string;
    numero_factura: string;
    total: number;
    estado: string;
    periodo_inicio: string;
    periodo_fin: string;
    es_prorrateo?: boolean;
  } | null;
}

export function useAccesoApp() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.email === "diego.leon@uniline.mx";
  const empresaId = useEmpresaStore((s) => s.empresaId);

  const isViewingOtherEmpresa = isSuperAdmin && !!empresaId;

  const { data, isLoading, refetch } = useQuery<SubscriptionStatus>({
    queryKey: ["subscription-status", user?.id, empresaId],
    enabled: !!user && (!isSuperAdmin || isViewingOtherEmpresa),
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      return result as SubscriptionStatus;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // SuperAdmin without empresa context — full access
  if (isSuperAdmin && !isViewingOtherEmpresa) {
    return {
      subscribed: true,
      estado: "activa" as const,
      loading: false,
      data: null as SubscriptionStatus | null,
      refetch,
      showBanner: false,
      blocked: false,
      diasGraciaRestantes: null as number | null,
      diasTrialRestantes: null as number | null,
      facturaPendiente: null as SubscriptionStatus["factura_pendiente"],
    };
  }

  // SuperAdmin viewing another empresa — show real state, never block
  if (isSuperAdmin && isViewingOtherEmpresa) {
    const estado = data?.estado || "sin_suscripcion";
    return {
      subscribed: data?.subscribed || false,
      estado,
      loading: isLoading,
      data: data || null,
      refetch,
      showBanner: false,
      blocked: false,
      diasGraciaRestantes: data?.dias_gracia_restantes ?? null,
      diasTrialRestantes: data?.dias_trial_restantes ?? null,
      facturaPendiente: data?.factura_pendiente ?? null,
    };
  }

  const estado = data?.estado || "sin_suscripcion";
  const subscribed = data?.subscribed || false;

  // Show banner for: trial (countdown), gracia, suspendida, trial_expirado, pendiente_pago
  const showBanner = ["trial", "gracia", "suspendida", "trial_expirado", "pendiente_pago"].includes(estado);

  // Block access for: suspendida, cancelada, sin_suscripcion
  // trial_expirado: only block if grace period is over (dias_gracia_restantes === 0 or null)
  const trialGraceOver = estado === "trial_expirado" && (data?.dias_gracia_restantes === 0 || data?.dias_gracia_restantes === null || data?.dias_gracia_restantes === undefined);
  const blocked = estado === "suspendida" || estado === "cancelada" || estado === "sin_suscripcion" || trialGraceOver;

  return {
    subscribed,
    estado,
    loading: isLoading,
    data: data || null,
    refetch,
    showBanner,
    blocked,
    diasGraciaRestantes: data?.dias_gracia_restantes ?? null,
    diasTrialRestantes: data?.dias_trial_restantes ?? null,
    facturaPendiente: data?.factura_pendiente ?? null,
  };
}
