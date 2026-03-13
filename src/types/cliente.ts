export interface Cliente {
  id: string;
  id_cliente: string;
  nombre_completo: string;
  telefono: string | null;
  correo: string | null;
  documento_identidad: "DUI" | "Pasaporte" | "NIT" | "Otro";
  dni: string | null;
  direccion: string | null;
  foto_cliente: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  activo: boolean;
  sexo: "Masculino" | "Femenino" | "Otro" | null;
  situacion_laboral: "Empleado" | "Independiente" | "Desempleado" | "Pensionado" | "Otro" | null;
  ingresos: number | null;
  estado_civil: "Soltero" | "Casado" | "Unión libre" | "Divorciado" | "Viudo" | null;
  dependientes: number;
  estado: "Activo" | "Inactivo" | "Bloqueado" | "En mora";
  created_at: string;
  // Professional fields
  fecha_nacimiento: string | null;
  tipo_vivienda: string | null;
  gastos_mensuales: number | null;
  notas: string | null;
  // Work info
  trabajo_empresa: string | null;
  trabajo_cargo: string | null;
  trabajo_telefono: string | null;
  trabajo_antiguedad: string | null;
  direccion_trabajo: string | null;
  // References
  ref1_nombre: string | null;
  ref1_telefono: string | null;
  ref1_parentesco: string | null;
  ref2_nombre: string | null;
  ref2_telefono: string | null;
  ref2_parentesco: string | null;
  // Guarantor (Aval)
  aval_nombre: string | null;
  aval_telefono: string | null;
  aval_direccion: string | null;
  aval_dni: string | null;
  aval_parentesco: string | null;
}

export type ClienteInsert = Omit<Cliente, "id" | "id_cliente" | "created_at"> & { id_cliente?: string };
