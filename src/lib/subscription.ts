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

/** Stripe plan config for frontend (precios vigentes para nuevas contrataciones) */
export const PLANES_CONFIG = {
  basico: {
    nombre: "Básico",
    precioBase: 2300,
    usuariosIncluidos: 3,
    precioUsuarioExtra: 150,
    stripe_price_id: "price_1UAvgsCUpJnsv7illt38xs49",
    stripe_product_id: "prod_VBIHaF5wpc4U6Z",
  },
  profesional: {
    nombre: "Profesional",
    precioBase: 4500,
    usuariosIncluidos: 10,
    precioUsuarioExtra: 130,
    stripe_price_id: "price_1UAvhVCUpJnsv7ilHY4y4ho1",
    stripe_product_id: "prod_VBIIIpOJpkTqld",
  },
  enterprise: {
    nombre: "Enterprise",
    precioBase: 0, // a cotizar
    cotizar: true,
    usuariosIncluidos: 20,
    precioUsuarioExtra: 100,
    stripe_price_id: "",
    stripe_product_id: "",
  },
} as const;
