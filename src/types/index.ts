export type AppRole = "admin" | "supervisor" | "cobrador";

export type PrestamoEstado = "Activo" | "Al día" | "Vencido" | "Liquidado" | "Cancelado" | "Juridico" | "Reestructurado";
export type CuotaStatus = "Pendiente" | "Pagada" | "Parcial" | "Vencida" | "Prometida";
export type FrecuenciaPago = "diario" | "semanal" | "quincenal" | "mensual";
export type PrestamoModalidad = "fijo" | "insolutos";
export type TipoMora = "porcentaje" | "fijo";
export type MetodoPago = "Efectivo" | "Transferencia" | "Otro";
export type MovimientoTipo = "entrada" | "salida";
export type ClienteEstado = "Activo" | "Inactivo" | "Bloqueado" | "En mora";

export interface Prestamo {
  id: string;
  clienteId: string;
  montoSolicitado: number;
  montoTotalPagar: number;
  numCuotas: number;
  frecuencia: FrecuenciaPago;
  modalidad: PrestamoModalidad;
  tasaInteres: number;
  estado: PrestamoEstado;
  fechaRegistro: string;
  fechaPrimerPago: string;
  cajaId: string | null;
  rutaId: string | null;
  cobradorId: string | null;
  cuotaCalculada: number | null;
  cuotaRedondeada: number | null;
  gastosLegales: number;
  tipoMora: TipoMora;
  valorMora: number;
  empresaId: string;
}

export interface Cuota {
  id: string;
  prestamoId: string;
  numCuota: number;
  fechaVencimiento: string;
  capital: number;
  interes: number;
  capitalInteres: number;
  mora: number;
  capitalPagado: number;
  interesPagado: number;
  moraPagada: number;
  saldoCapital: number;
  saldoInteres: number;
  saldoMora: number;
  saldoTotal: number;
  status: CuotaStatus;
  diasAtraso: number;
  fechaPagada: string | null;
}

export interface Pago {
  id: string;
  prestamoId: string;
  cuotaId: string | null;
  montoRecibido: number;
  aplicadoCapital: number;
  aplicadoInteres: number;
  aplicadoMora: number;
  metodoPago: MetodoPago;
  cajaId: string | null;
  rutaId: string | null;
  cobradorId: string | null;
  anulado: boolean;
  createdAt: string;
}

export interface Cliente {
  id: string;
  idCliente: string;
  nombreCompleto: string;
  telefono: string | null;
  correo: string | null;
  dni: string | null;
  direccion: string | null;
  activo: boolean;
  estado: ClienteEstado;
  empresaId: string;
}

export interface Promesa {
  id: string;
  prestamoId: string;
  cuotaId: string | null;
  fechaPrometida: string;
  montoPrometido: number;
  status: string;
  notas: string | null;
}

export interface Usuario {
  id: string;
  nombreCompleto: string;
  email: string;
  rol: AppRole;
  activo: boolean;
  empresaId: string;
}

export interface Caja {
  id: string;
  nombre: string;
  saldoActual: number;
  empresaId: string;
}

export interface Ruta {
  id: string;
  nombre: string;
  cobradorId: string | null;
  empresaId: string;
}
