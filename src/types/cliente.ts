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
}

export type ClienteInsert = Omit<Cliente, "id" | "id_cliente" | "created_at">;
