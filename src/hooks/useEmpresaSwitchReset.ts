import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EMPRESA_SWITCHED_EVENT } from "@/stores/empresaStore";

/**
 * Al cambiar de empresa (super admin → switch_empresa) descarta la caché del tenant anterior:
 * elimina las queries inactivas y reinicia (refetch) las activas, incluidas las que no
 * llevan empresaId en su queryKey. Montar una sola vez dentro de <QueryClientProvider>.
 */
export function useEmpresaSwitchReset() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onSwitch = () => {
      void queryClient.cancelQueries();
      queryClient.removeQueries({ type: "inactive" });
      void queryClient.resetQueries({ type: "active" });
    };
    window.addEventListener(EMPRESA_SWITCHED_EVENT, onSwitch);
    return () => window.removeEventListener(EMPRESA_SWITCHED_EVENT, onSwitch);
  }, [queryClient]);
}
