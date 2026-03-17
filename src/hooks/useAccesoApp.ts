import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";

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
}

export function useAccesoApp() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.email === "diego.leon@uniline.mx";

  const { data, isLoading, refetch } = useQuery<SubscriptionStatus>({
    queryKey: ["subscription-status", user?.id],
    enabled: !!user && !isSuperAdmin,
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      return result as SubscriptionStatus;
    },
    refetchInterval: 60_000, // every minute
    staleTime: 30_000,
  });

  // SuperAdmin always has full access
  if (isSuperAdmin) {
    return {
      subscribed: true,
      estado: "activa" as const,
      loading: false,
      data: null as SubscriptionStatus | null,
      refetch,
      showBanner: false,
      blocked: false,
    };
  }

  const estado = data?.estado || "sin_suscripcion";
  const subscribed = data?.subscribed || false;
  const showBanner = estado === "gracia" || estado === "suspendida";
  const blocked = estado === "suspendida" || estado === "cancelada" || estado === "sin_suscripcion";

  return {
    subscribed,
    estado,
    loading: isLoading,
    data: data || null,
    refetch,
    showBanner,
    blocked,
  };
}
