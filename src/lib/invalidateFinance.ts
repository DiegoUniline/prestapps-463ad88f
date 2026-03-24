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
  // Cajas & kardex (all 4 keys + related)
  queryClient.invalidateQueries({ queryKey: ["cajas-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cajas-page"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cajas-options"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["prestamos-by-caja"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["kardex-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["caja-kardex"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["caja-detalle"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["movimientos-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["caja-saldo-real"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["caja-stats"], refetchType: "all" });

  // Cobradores & liquidaciones
  queryClient.invalidateQueries({ queryKey: ["cobradores"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["profiles-cobradores"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["liquidaciones"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cortes"], refetchType: "all" });

  // Préstamos
  queryClient.invalidateQueries({ queryKey: ["prestamos-list"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["prestamos-list-v2"], refetchType: "all" });

  // Gastos & comisiones
  queryClient.invalidateQueries({ queryKey: ["gastos"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["comisiones-pagadas"], refetchType: "all" });

  // Pagos globales
  queryClient.invalidateQueries({ queryKey: ["pagos-all"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cobranza-diaria"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cobrador-cobranza"], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["cobranza-cuentas"], refetchType: "all" });

  // Per-prestamo if provided
  if (opts?.prestamoId) {
    queryClient.invalidateQueries({ queryKey: ["amortizacion", opts.prestamoId], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["pagos", opts.prestamoId], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", opts.prestamoId], refetchType: "all" });
  }
}
