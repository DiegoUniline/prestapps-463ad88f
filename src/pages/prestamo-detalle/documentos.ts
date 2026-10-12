import { $$, fmtDate } from "@/lib/utils";
import type { PrestamoDetalle, CuotaAmort, PagoRow, PromesaRow, Actividad } from "./utils";

export function buildActividad({ prestamo, pagosRaw, promesasRaw, cobradoresAll }: {
  prestamo: PrestamoDetalle;
  pagosRaw: PagoRow[];
  promesasRaw: PromesaRow[];
  cobradoresAll: { id: string; nombre: string }[];
}): Actividad[] {
  // Activity timeline
  const findUserName = (userId: string | null | undefined) => {
    if (!userId) return "—";
    const profile = cobradoresAll.find((c: any) => c.id === userId);
    return profile?.nombre || userId.slice(0, 8);
  };

  const actividad = [
    { tipo: "registro", desc: "Préstamo registrado", usuario: findUserName(prestamo.generado_por), fecha: prestamo.created_at || prestamo.fecha_registro || "" },
    ...pagosRaw.map((pg) => ({
      tipo: pg.anulado ? "anulacion" : "pago",
      desc: pg.anulado
        ? `Pago anulado — ${$$(Number(pg.monto_recibido))}${pg.motivo_anulacion ? ` (${pg.motivo_anulacion})` : ""}`
        : `Pago recibido — ${$$(Number(pg.monto_recibido))} (${pg.metodo_pago || "Efectivo"})`,
      usuario: pg.anulado ? findUserName(pg.anulado_por) : findUserName(pg.registrado_por),
      fecha: pg.anulado ? (pg.anulado_en || pg.created_at || "") : (pg.created_at || ""),
    })),
    ...promesasRaw.map((pr) => ({
      tipo: pr.status === "Incumplida" ? "promesa_incumplida" : "promesa",
      desc: `Promesa de pago — ${$$(Number(pr.monto_prometido))} para ${fmtDate(pr.fecha_prometida)}`,
      usuario: "—",
      fecha: pr.created_at || "",
    })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  return actividad;
}

export function buildPdfData({ prestamo, cliente, caja, ruta, estado, empresaData, amort, pagosRaw }: {
  prestamo: PrestamoDetalle;
  cliente: PrestamoDetalle["clientes"];
  caja: PrestamoDetalle["cajas"];
  ruta: PrestamoDetalle["rutas"];
  estado: string;
  empresaData: { nombre: string; logo_url: string | null } | null | undefined;
  amort: CuotaAmort[];
  pagosRaw: PagoRow[];
}) {
  const pdfPrestamo = {
    id: prestamo.id,
    clienteNombre: cliente?.nombre_completo || "—",
    clienteDni: cliente?.dni || "",
    clienteDireccion: cliente?.direccion || "",
    clienteTelefono: cliente?.telefono || "",
    empresa: prestamo.empresa || "—",
    modalidad: prestamo.modalidad,
    montoSolicitado: Number(prestamo.monto_solicitado),
    montoTotalPagar: Number(prestamo.monto_total_pagar || 0),
    numCuotas: prestamo.num_cuotas,
    frecuencia: prestamo.frecuencia,
    tasaInteres: Number(prestamo.tasa_interes || 0),
    cuotaCalculada: Number(prestamo.cuota_calculada || 0),
    cuotaRedondeada: Number(prestamo.cuota_redondeada || 0),
    gastosLegales: Number(prestamo.gastos_legales || 0),
    tipoMora: prestamo.tipo_mora || "porcentaje",
    valorMora: Number(prestamo.valor_mora || 0),
    estado,
    fechaRegistro: fmtDate(prestamo.fecha_registro),
    fechaPrimerPago: fmtDate(prestamo.fecha_primer_pago),
    caja: caja?.nombre || "—",
    ruta: ruta?.nombre || "—",
    notas: prestamo.notas || "",
    logoUrl: empresaData?.logo_url,
    empresaNombre: empresaData?.nombre,
  };

  const pdfCuotas = amort.map(c => ({
    num_cuota: c.num_cuota,
    capital: Number(c.capital || 0),
    interes: Number(c.interes || 0),
    capital_interes: Number(c.capital_interes || 0),
    fecha_vencimiento: c.fecha_vencimiento,
    dias_atraso: Number(c.dias_atraso || 0),
    mora: Number(c.mora || 0),
    saldo_total: Number(c.saldo_total || 0),
    status: c.status || "Pendiente",
    fecha_pagada: c.fecha_pagada,
    capital_pagado: Number(c.capital_pagado || 0),
    interes_pagado: Number(c.interes_pagado || 0),
    mora_pagada: Number(c.mora_pagada || 0),
  }));

  const pdfPagos = pagosRaw.map(p => ({
    created_at: p.created_at || "",
    monto_recibido: Number(p.monto_recibido),
    aplicado_mora: Number(p.aplicado_mora || 0),
    aplicado_interes: Number(p.aplicado_interes || 0),
    aplicado_capital: Number(p.aplicado_capital || 0),
    metodo_pago: p.metodo_pago || "Efectivo",
    cajaNombre: (p.cajas as any)?.nombre || "—",
  }));

  return { pdfPrestamo, pdfCuotas, pdfPagos };
}
