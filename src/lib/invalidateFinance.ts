import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate ALL finance-related queries so balances, kardex, movimientos,
 * cobradores, prestamos, etc. stay in sync after any financial mutation.
 *
 * Call this after: pagos, anulaciones, edición de pagos, desembolsos,
 * gastos, traspasos, liquidaciones, comisiones, etc.
 */
export function invalidateFinanceQueries(
  queryClient: QueryClient,
  opts?: { prestamoId?: string }
) {
  // Cajas & kardex
  queryClient.invalidateQueries({ queryKey: ["cajas-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cajas-page"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cajas-options"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["kardex-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["movimientos-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["prestamos-by-caja"], refetchType: "all" });

  // Cobradores & liquidaciones
  queryClient.invalidateQueries({ queryKey: ["cobradores"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["profiles-cobradores"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["liquidaciones"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cortes"], refetchType: "all" });

  // Préstamos
  queryClient.invalidateQueries({ queryKey: ["prestamos-list"], refetchType: "all" });

  // Gastos & comisiones
  queryClient.invalidateQueries({ queryKey: ["gastos"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["comisiones-pagadas"], refetchType: "all" });

  // Pagos globales
  queryClient.invalidateQueries({ queryKey: ["pagos-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cobros-diarios"], refetchType: "all" });

  // Dashboard & prestamos list
  queryClient.invalidateQueries({ queryKey: ["dashboard"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["prestamos-list-v2"], refetchType: "all" });

  // Per-prestamo if provided
  if (opts?.prestamoId) {
    queryClient.invalidateQueries({ queryKey: ["amortizacion", opts.prestamoId], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["pagos", opts.prestamoId], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", opts.prestamoId], refetchType: "all" });
  }
}
