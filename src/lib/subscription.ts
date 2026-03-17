/**
 * Proration calculator for mid-cycle subscription starts.
 */
export function calcularProrrateo(
  fechaContratacion: Date,
  precioMensualTotal: number
): { montoProrateo: number; diasCobrados: number; fechaProximoCobro: Date } {
  const hoy = fechaContratacion;
  const primerDiaSiguienteMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasRestantes = Math.ceil(
    (primerDiaSiguienteMes.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
  );
  const precioDiario = precioMensualTotal / diasEnMes;
  const montoProrateo = Math.round(precioDiario * diasRestantes * 100) / 100;
  return { montoProrateo, diasCobrados: diasRestantes, fechaProximoCobro: primerDiaSiguienteMes };
}

/**
 * Calculate total monthly cost for a plan + extra users.
 */
export function calcularCostoMensual(
  precioBase: number,
  usuariosIncluidos: number,
  precioUsuarioExtra: number,
  numUsuarios: number,
  descuento: number = 0
): { subtotal: number; descuentoMonto: number; total: number; extraUsers: number } {
  const extraUsers = Math.max(0, numUsuarios - usuariosIncluidos);
  const subtotal = precioBase + (extraUsers * precioUsuarioExtra);
  const descuentoMonto = subtotal * (descuento / 100);
  const total = subtotal - descuentoMonto;
  return { subtotal, descuentoMonto, total, extraUsers };
}

/** Stripe plan config for frontend */
export const PLANES_CONFIG = {
  basico: {
    nombre: "Básico",
    precioBase: 499,
    usuariosIncluidos: 3,
    precioUsuarioExtra: 150,
    stripe_price_id: "price_1TC4ahCUpJnsv7ilvYouPVl0",
    stripe_product_id: "prod_UAPP1fKeVHbENq",
  },
  profesional: {
    nombre: "Profesional",
    precioBase: 999,
    usuariosIncluidos: 10,
    precioUsuarioExtra: 130,
    stripe_price_id: "price_1TC4bACUpJnsv7ilLvDTXwNl",
    stripe_product_id: "prod_UAPQJHWgG5SGXe",
  },
  enterprise: {
    nombre: "Enterprise",
    precioBase: 1999,
    usuariosIncluidos: 20,
    precioUsuarioExtra: 100,
    stripe_price_id: "price_1TC4bUCUpJnsv7ilFvHHo47k",
    stripe_product_id: "prod_UAPQq47CHfuZzX",
  },
} as const;
