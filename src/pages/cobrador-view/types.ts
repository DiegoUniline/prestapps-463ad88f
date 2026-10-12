

// ── Types ───────────────────────────────────────────────────────
export interface CuotaCobrador {
  cuotaId: string;
  prestamoId: string;
  clienteNombre: string;
  clienteId: string;
  clienteTelefono: string | null;
  clienteDireccion: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  numCuota: number;
  totalCuotas: number;
  capitalInteres: number;
  saldoTotal: number;
  saldoMora: number;
  saldoCapital: number;
  saldoInteres: number;
  moraPagada: number;
  interesPagado: number;
  capitalPagado: number;
  fechaVencimiento: string;
  status: string;
  diasAtraso: number;
  ruta: string;
  rutaId: string | null;
  cobradorId: string | null;
  cajaId: string | null;
  pagada: boolean;
  cobradaEnRango: boolean;
  montoPagado: number;
}

export interface PagoHistorial {
  id: string;
  prestamoId: string;
  clienteNombre: string;
  montoRecibido: number;
  aplicadoCapital: number;
  aplicadoInteres: number;
  aplicadoMora: number;
  metodoPago: string;
  fechaPago: string;
  anulado: boolean;
  numCuota: number | null;
}

export type RangePreset = "hoy" | "semana" | "custom";

export interface PendienteGrupo {
  prestamoId: string;
  clienteNombre: string;
  clienteId: string;
  clienteTelefono: string | null;
  clienteDireccion: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  ruta: string;
  rutaId: string | null;
  cobradorId: string | null;
  cuotas: CuotaCobrador[];
  saldoTotal: number;
  saldoMora: number;
  diasAtrasoMax: number;
  proximaCuota: number;
  totalCuotas: number;
}

export interface CobranzaKpis {
  total: number;
  cobradas: number;
  pendientes: number;
  porCobrar: number;
  cobrado: number;
  mora: number;
  pct: number;
}
