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
}

export function useAccesoApp() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.email === "diego.leon@uniline.mx";
  const empresaId = useEmpresaStore((s) => s.empresaId);

  // SuperAdmin viewing their own context (no empresa selected or default)
  // still needs to query if they switched to another empresa
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

  // SuperAdmin without empresa context — full access, no subscription needed
  if (isSuperAdmin && !isViewingOtherEmpresa) {
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

  // SuperAdmin viewing another empresa — show their real subscription but never block
  if (isSuperAdmin && isViewingOtherEmpresa) {
    const estado = data?.estado || "sin_suscripcion";
    return {
      subscribed: data?.subscribed || false,
      estado,
      loading: isLoading,
      data: data || null,
      refetch,
      showBanner: false,
      blocked: false, // never block superadmin
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
