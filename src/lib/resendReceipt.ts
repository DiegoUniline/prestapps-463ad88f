import { supabase } from "@/integrations/supabase/client";
import { sendReceiptAsImage } from "@/lib/whatsappReceipt";

/**
 * Re-sends the last (or a specific) payment receipt for a loan via WhatsApp.
 * Returns success boolean and optional error message.
 */
export async function resendReceiptForPrestamo(opts: {
  empresaId: string;
  prestamoId: string;
  pagoId?: string; // optional specific payment; defaults to last non-anulado
}): Promise<{ success: boolean; error?: string }> {
  const { empresaId, prestamoId, pagoId } = opts;

  // 1. Fetch payment
  let pagoQuery = supabase
    .from("pagos")
    .select("id, monto_recibido, aplicado_capital, aplicado_interes, aplicado_mora, metodo_pago, fecha_pago, created_at, cuota_id, cobrador_id")
    .eq("prestamo_id", prestamoId)
    .eq("anulado", false);

  if (pagoId) pagoQuery = pagoQuery.eq("id", pagoId);
  else pagoQuery = pagoQuery.order("created_at", { ascending: false }).limit(1);

  const { data: pagos, error: pagoErr } = await pagoQuery;
  if (pagoErr) return { success: false, error: pagoErr.message };
  const pago = pagos?.[0];
  if (!pago) return { success: false, error: "No hay pagos para reenviar" };

  // 2. Loan + client + cobrador
  const [{ data: prestamo }, { data: empresa }] = await Promise.all([
    supabase
      .from("prestamos")
      .select("id, id_prestamo, num_cuotas, clientes!inner(nombre_completo, telefono, dni)")
      .eq("id", prestamoId)
      .single(),
    supabase
      .from("empresas")
      .select("nombre, telefono, direccion, logo_url")
      .eq("id", empresaId)
      .single(),
  ]);

  const cliente = (prestamo as any)?.clientes;
  if (!cliente?.telefono) return { success: false, error: "Cliente sin teléfono" };

  // 3. Cuota num + remaining
  let cuotaNum: number | string = "";
  if (pago.cuota_id) {
    const { data: cuota } = await supabase
      .from("amortizacion")
      .select("num_cuota")
      .eq("id", pago.cuota_id)
      .maybeSingle();
    cuotaNum = cuota?.num_cuota || "";
  }

  const { data: remainingCuotas } = await supabase
    .from("amortizacion")
    .select("saldo_total, num_cuota, fecha_vencimiento")
    .eq("prestamo_id", prestamoId)
    .neq("status", "Pagada")
    .order("num_cuota");
  const saldoRestante = (remainingCuotas || []).reduce(
    (s: number, c: any) => s + Number(c.saldo_total || 0),
    0
  );
  const proxima = remainingCuotas?.[0];

  // 4. Cobrador name
  let cobradorNombre = "";
  if (pago.cobrador_id) {
    const { data: cob } = await supabase
      .from("profiles")
      .select("nombre_completo")
      .eq("id", pago.cobrador_id)
      .maybeSingle();
    cobradorNombre = cob?.nombre_completo || "";
  }

  const folio = (prestamo as any)?.id_prestamo || `PRE-${prestamoId.slice(0, 8)}`;
  const monto = Number(pago.monto_recibido || 0);
  const fechaStr = pago.fecha_pago
    ? new Date(pago.fecha_pago + "T12:00:00").toLocaleDateString("es-MX", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : undefined;

  return sendReceiptAsImage(
    empresaId,
    cliente.telefono,
    {
      pago: {
        folio,
        monto_recibido: monto,
        aplicado_mora: Number(pago.aplicado_mora || 0),
        aplicado_interes: Number(pago.aplicado_interes || 0),
        aplicado_capital: Number(pago.aplicado_capital || 0),
        metodo_pago: pago.metodo_pago || "Efectivo",
        cuota_num: cuotaNum,
        saldo_restante: saldoRestante,
        proxima_cuota: proxima?.fecha_vencimiento || "",
        monto_proxima: Number(proxima?.saldo_total || 0),
        fecha: fechaStr,
        cobrador_nombre: cobradorNombre,
      },
      empresa: empresa || { nombre: "Empresa" },
      cliente: { nombre: cliente.nombre_completo, dni: cliente.dni, telefono: cliente.telefono },
      prestamo: { folio, num_cuotas: prestamo?.num_cuotas || 0 },
    },
    `📄 Recibo (reenvío) ${folio} por $${monto.toFixed(2)}.`,
  );
}