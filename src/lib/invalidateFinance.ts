import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate ALL finance-related queries so balances, kardex, movimientos,
 * cobradores, prestamos, etc. stay in sync after any financial mutation.
 *
 * Call this after: pagos, anulaciones, edición de pagos, desembolsos,
 * gastos, traspasos, liquidaciones, comisiones, etc.
 *
 * Uses the default refetchType ("active"): only mounted queries refetch now;
 * inactive ones are marked stale and refetch when their screen mounts again
 * (no query in the app disables refetchOnMount). Refetching every cached
 * finance query ("all") re-downloaded whole tables after each payment.
 */
export function invalidateFinanceQueries(
  queryClient: QueryClient,
  opts?: { prestamoId?: string }
) {
  // Cajas & kardex (all 4 keys + related)
  queryClient.invalidateQueries({ queryKey: ["cajas-all"] });
  queryClient.invalidateQueries({ queryKey: ["cajas-page"] });
  queryClient.invalidateQueries({ queryKey: ["cajas-options"] });
  queryClient.invalidateQueries({ queryKey: ["prestamos-by-caja"] });
  queryClient.invalidateQueries({ queryKey: ["kardex-all"] });
  queryClient.invalidateQueries({ queryKey: ["caja-kardex"] });
  queryClient.invalidateQueries({ queryKey: ["caja-detalle"] });
  queryClient.invalidateQueries({ queryKey: ["movimientos-all"] });
  queryClient.invalidateQueries({ queryKey: ["caja-saldo-real"] });
  queryClient.invalidateQueries({ queryKey: ["caja-stats"] });
  queryClient.invalidateQueries({ queryKey: ["caja-flujo-real"] });
  queryClient.invalidateQueries({ queryKey: ["caja-prestamos-source"] });
  queryClient.invalidateQueries({ queryKey: ["caja-pagos-source"] });
  queryClient.invalidateQueries({ queryKey: ["caja-transferencias-source"] });

  // Cobradores & liquidaciones
  queryClient.invalidateQueries({ queryKey: ["cobradores"] });
  queryClient.invalidateQueries({ queryKey: ["profiles-cobradores"] });
  queryClient.invalidateQueries({ queryKey: ["liquidaciones"] });
  queryClient.invalidateQueries({ queryKey: ["cortes"] });

  // Préstamos
  queryClient.invalidateQueries({ queryKey: ["prestamos-list"] });
  queryClient.invalidateQueries({ queryKey: ["prestamos-list-v2"] });

  // Gastos & comisiones
  queryClient.invalidateQueries({ queryKey: ["gastos"] });
  queryClient.invalidateQueries({ queryKey: ["comisiones-pagadas"] });

  // Pagos globales
  queryClient.invalidateQueries({ queryKey: ["pagos-all"] });
  queryClient.invalidateQueries({ queryKey: ["cobranza-diaria"] });
  queryClient.invalidateQueries({ queryKey: ["cobrador-cobranza"] });
  queryClient.invalidateQueries({ queryKey: ["cobranza-cuentas"] });

  // Per-prestamo if provided
  if (opts?.prestamoId) {
    queryClient.invalidateQueries({ queryKey: ["amortizacion", opts.prestamoId] });
    queryClient.invalidateQueries({ queryKey: ["pagos", opts.prestamoId] });
    queryClient.invalidateQueries({ queryKey: ["prestamo-detalle", opts.prestamoId] });
  }
}
