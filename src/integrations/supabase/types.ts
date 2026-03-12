export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      amortizacion: {
        Row: {
          avisado: boolean | null
          capital: number | null
          capital_interes: number | null
          capital_pagado: number | null
          descuento_mora: number | null
          dias_atraso: number | null
          empresa: string | null
          fecha_calculo: string | null
          fecha_pagada: string | null
          fecha_vencimiento: string
          id: string
          interes: number | null
          interes_pagado: number | null
          mora: number | null
          mora_pagada: number | null
          num_cuota: number
          prestamo_id: string
          saldo_capital: number | null
          saldo_interes: number | null
          saldo_mora: number | null
          saldo_total: number | null
          status: Database["public"]["Enums"]["cuota_status"] | null
        }
        Insert: {
          avisado?: boolean | null
          capital?: number | null
          capital_interes?: number | null
          capital_pagado?: number | null
          descuento_mora?: number | null
          dias_atraso?: number | null
          empresa?: string | null
          fecha_calculo?: string | null
          fecha_pagada?: string | null
          fecha_vencimiento: string
          id?: string
          interes?: number | null
          interes_pagado?: number | null
          mora?: number | null
          mora_pagada?: number | null
          num_cuota: number
          prestamo_id: string
          saldo_capital?: number | null
          saldo_interes?: number | null
          saldo_mora?: number | null
          saldo_total?: number | null
          status?: Database["public"]["Enums"]["cuota_status"] | null
        }
        Update: {
          avisado?: boolean | null
          capital?: number | null
          capital_interes?: number | null
          capital_pagado?: number | null
          descuento_mora?: number | null
          dias_atraso?: number | null
          empresa?: string | null
          fecha_calculo?: string | null
          fecha_pagada?: string | null
          fecha_vencimiento?: string
          id?: string
          interes?: number | null
          interes_pagado?: number | null
          mora?: number | null
          mora_pagada?: number | null
          num_cuota?: number
          prestamo_id?: string
          saldo_capital?: number | null
          saldo_interes?: number | null
          saldo_mora?: number | null
          saldo_total?: number | null
          status?: Database["public"]["Enums"]["cuota_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "amortizacion_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          created_at: string | null
          descripcion: string | null
          id: string
          nombre: string
          saldo_actual: number | null
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          saldo_actual?: number | null
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          saldo_actual?: number | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          activo: boolean | null
          correo: string | null
          created_at: string | null
          dependientes: number | null
          direccion: string | null
          dni: string | null
          documento_identidad:
            | Database["public"]["Enums"]["documento_tipo"]
            | null
          estado: Database["public"]["Enums"]["cliente_estado"] | null
          estado_civil: Database["public"]["Enums"]["estado_civil"] | null
          foto_cliente: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          id_cliente: string
          ingresos: number | null
          nombre_completo: string
          sexo: Database["public"]["Enums"]["sexo_tipo"] | null
          situacion_laboral:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          correo?: string | null
          created_at?: string | null
          dependientes?: number | null
          direccion?: string | null
          dni?: string | null
          documento_identidad?:
            | Database["public"]["Enums"]["documento_tipo"]
            | null
          estado?: Database["public"]["Enums"]["cliente_estado"] | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          foto_cliente?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          id_cliente?: string
          ingresos?: number | null
          nombre_completo: string
          sexo?: Database["public"]["Enums"]["sexo_tipo"] | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          correo?: string | null
          created_at?: string | null
          dependientes?: number | null
          direccion?: string | null
          dni?: string | null
          documento_identidad?:
            | Database["public"]["Enums"]["documento_tipo"]
            | null
          estado?: Database["public"]["Enums"]["cliente_estado"] | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          foto_cliente?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          id_cliente?: string
          ingresos?: number | null
          nombre_completo?: string
          sexo?: Database["public"]["Enums"]["sexo_tipo"] | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono?: string | null
        }
        Relationships: []
      }
      movimientos_caja: {
        Row: {
          caja_id: string
          concepto: string | null
          created_at: string | null
          id: string
          monto: number
          prestamo_id: string | null
          registrado_por: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
        }
        Insert: {
          caja_id: string
          concepto?: string | null
          created_at?: string | null
          id?: string
          monto: number
          prestamo_id?: string | null
          registrado_por?: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
        }
        Update: {
          caja_id?: string
          concepto?: string | null
          created_at?: string | null
          id?: string
          monto?: number
          prestamo_id?: string | null
          registrado_por?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          aplicado_capital: number | null
          aplicado_interes: number | null
          aplicado_mora: number | null
          caja_id: string | null
          created_at: string | null
          cuota_id: string | null
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido: number
          prestamo_id: string
          registrado_por: string | null
        }
        Insert: {
          aplicado_capital?: number | null
          aplicado_interes?: number | null
          aplicado_mora?: number | null
          caja_id?: string | null
          created_at?: string | null
          cuota_id?: string | null
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido: number
          prestamo_id: string
          registrado_por?: string | null
        }
        Update: {
          aplicado_capital?: number | null
          aplicado_interes?: number | null
          aplicado_mora?: number | null
          caja_id?: string | null
          created_at?: string | null
          cuota_id?: string | null
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido?: number
          prestamo_id?: string
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "amortizacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
        ]
      }
      prestamos: {
        Row: {
          caja_id: string | null
          cliente_id: string
          cobrador_id: string | null
          created_at: string | null
          cuota_calculada: number | null
          cuota_redondeada: number | null
          empresa: string | null
          estado: Database["public"]["Enums"]["prestamo_estado"] | null
          fecha_primer_pago: string | null
          fecha_registro: string | null
          frecuencia: Database["public"]["Enums"]["frecuencia_pago"]
          gastos_legales: number | null
          generado_por: string | null
          id: string
          modalidad: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado: number
          monto_total_pagar: number | null
          notas: string | null
          num_cuotas: number
          ruta_id: string | null
          tasa_interes: number | null
          tipo_mora: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora: number | null
        }
        Insert: {
          caja_id?: string | null
          cliente_id: string
          cobrador_id?: string | null
          created_at?: string | null
          cuota_calculada?: number | null
          cuota_redondeada?: number | null
          empresa?: string | null
          estado?: Database["public"]["Enums"]["prestamo_estado"] | null
          fecha_primer_pago?: string | null
          fecha_registro?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_pago"]
          gastos_legales?: number | null
          generado_por?: string | null
          id?: string
          modalidad: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado: number
          monto_total_pagar?: number | null
          notas?: string | null
          num_cuotas: number
          ruta_id?: string | null
          tasa_interes?: number | null
          tipo_mora?: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora?: number | null
        }
        Update: {
          caja_id?: string | null
          cliente_id?: string
          cobrador_id?: string | null
          created_at?: string | null
          cuota_calculada?: number | null
          cuota_redondeada?: number | null
          empresa?: string | null
          estado?: Database["public"]["Enums"]["prestamo_estado"] | null
          fecha_primer_pago?: string | null
          fecha_registro?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_pago"]
          gastos_legales?: number | null
          generado_por?: string | null
          id?: string
          modalidad?: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado?: number
          monto_total_pagar?: number | null
          notas?: string | null
          num_cuotas?: number
          ruta_id?: string | null
          tasa_interes?: number | null
          tipo_mora?: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prestamos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestamos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestamos_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
        ]
      }
      promesas_pago: {
        Row: {
          created_at: string | null
          cuota_id: string | null
          fecha_prometida: string
          id: string
          monto_prometido: number
          notas: string | null
          prestamo_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          cuota_id?: string | null
          fecha_prometida: string
          id?: string
          monto_prometido: number
          notas?: string | null
          prestamo_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          cuota_id?: string | null
          fecha_prometida?: string
          id?: string
          monto_prometido?: number
          notas?: string | null
          prestamo_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promesas_pago_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "amortizacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas: {
        Row: {
          cobrador_id: string | null
          created_at: string | null
          descripcion: string | null
          id: string
          nombre: string
        }
        Insert: {
          cobrador_id?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          cobrador_id?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "cobrador"
      cliente_estado: "Activo" | "Inactivo" | "Bloqueado" | "En mora"
      cuota_status: "Pendiente" | "Pagada" | "Parcial" | "Vencida" | "Prometida"
      documento_tipo: "DUI" | "Pasaporte" | "NIT" | "Otro"
      estado_civil:
        | "Soltero"
        | "Casado"
        | "Unión libre"
        | "Divorciado"
        | "Viudo"
      frecuencia_pago: "diario" | "semanal" | "quincenal" | "mensual"
      metodo_pago: "Efectivo" | "Transferencia" | "Otro"
      movimiento_tipo: "entrada" | "salida"
      prestamo_estado:
        | "Activo"
        | "Al día"
        | "Vencido"
        | "Liquidado"
        | "Cancelado"
        | "Juridico"
      prestamo_modalidad: "fijo" | "insolutos"
      sexo_tipo: "Masculino" | "Femenino" | "Otro"
      situacion_laboral:
        | "Empleado"
        | "Independiente"
        | "Desempleado"
        | "Pensionado"
        | "Otro"
      tipo_mora: "porcentaje" | "fijo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "cobrador"],
      cliente_estado: ["Activo", "Inactivo", "Bloqueado", "En mora"],
      cuota_status: ["Pendiente", "Pagada", "Parcial", "Vencida", "Prometida"],
      documento_tipo: ["DUI", "Pasaporte", "NIT", "Otro"],
      estado_civil: ["Soltero", "Casado", "Unión libre", "Divorciado", "Viudo"],
      frecuencia_pago: ["diario", "semanal", "quincenal", "mensual"],
      metodo_pago: ["Efectivo", "Transferencia", "Otro"],
      movimiento_tipo: ["entrada", "salida"],
      prestamo_estado: [
        "Activo",
        "Al día",
        "Vencido",
        "Liquidado",
        "Cancelado",
        "Juridico",
      ],
      prestamo_modalidad: ["fijo", "insolutos"],
      sexo_tipo: ["Masculino", "Femenino", "Otro"],
      situacion_laboral: [
        "Empleado",
        "Independiente",
        "Desempleado",
        "Pensionado",
        "Otro",
      ],
      tipo_mora: ["porcentaje", "fijo"],
    },
  },
} as const
