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
          empresa_id: string | null
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
          empresa_id?: string | null
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
          empresa_id?: string | null
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
            foreignKeyName: "amortizacion_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
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
          empresa_id: string | null
          id: string
          nombre: string
          saldo_actual: number | null
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          saldo_actual?: number | null
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          saldo_actual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cajas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_estados_civiles: {
        Row: {
          activo: boolean
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_estados_civiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_estados_prestamo: {
        Row: {
          activo: boolean
          color: string | null
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          color?: string | null
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          color?: string | null
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_estados_prestamo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_frecuencias_pago: {
        Row: {
          activo: boolean
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_frecuencias_pago_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_metodos_pago: {
        Row: {
          activo: boolean
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          requiere_validacion: boolean
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          requiere_validacion?: boolean
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          requiere_validacion?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cat_metodos_pago_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_situaciones_laborales: {
        Row: {
          activo: boolean
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_situaciones_laborales_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_tipos_documento: {
        Row: {
          activo: boolean
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_tipos_documento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean | null
          aval_direccion: string | null
          aval_dni: string | null
          aval_nombre: string | null
          aval_parentesco: string | null
          aval_telefono: string | null
          correo: string | null
          created_at: string | null
          dependientes: number | null
          direccion: string | null
          direccion_trabajo: string | null
          dni: string | null
          documento_identidad:
            | Database["public"]["Enums"]["documento_tipo"]
            | null
          empresa_id: string | null
          estado: Database["public"]["Enums"]["cliente_estado"] | null
          estado_civil: Database["public"]["Enums"]["estado_civil"] | null
          fecha_nacimiento: string | null
          foto_cliente: string | null
          gastos_mensuales: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          id_cliente: string
          ingresos: number | null
          nombre_completo: string
          notas: string | null
          ref1_nombre: string | null
          ref1_parentesco: string | null
          ref1_telefono: string | null
          ref2_nombre: string | null
          ref2_parentesco: string | null
          ref2_telefono: string | null
          sexo: Database["public"]["Enums"]["sexo_tipo"] | null
          situacion_laboral:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono: string | null
          tipo_vivienda: string | null
          trabajo_antiguedad: string | null
          trabajo_cargo: string | null
          trabajo_empresa: string | null
          trabajo_telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          aval_direccion?: string | null
          aval_dni?: string | null
          aval_nombre?: string | null
          aval_parentesco?: string | null
          aval_telefono?: string | null
          correo?: string | null
          created_at?: string | null
          dependientes?: number | null
          direccion?: string | null
          direccion_trabajo?: string | null
          dni?: string | null
          documento_identidad?:
            | Database["public"]["Enums"]["documento_tipo"]
            | null
          empresa_id?: string | null
          estado?: Database["public"]["Enums"]["cliente_estado"] | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          fecha_nacimiento?: string | null
          foto_cliente?: string | null
          gastos_mensuales?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          id_cliente?: string
          ingresos?: number | null
          nombre_completo: string
          notas?: string | null
          ref1_nombre?: string | null
          ref1_parentesco?: string | null
          ref1_telefono?: string | null
          ref2_nombre?: string | null
          ref2_parentesco?: string | null
          ref2_telefono?: string | null
          sexo?: Database["public"]["Enums"]["sexo_tipo"] | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono?: string | null
          tipo_vivienda?: string | null
          trabajo_antiguedad?: string | null
          trabajo_cargo?: string | null
          trabajo_empresa?: string | null
          trabajo_telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          aval_direccion?: string | null
          aval_dni?: string | null
          aval_nombre?: string | null
          aval_parentesco?: string | null
          aval_telefono?: string | null
          correo?: string | null
          created_at?: string | null
          dependientes?: number | null
          direccion?: string | null
          direccion_trabajo?: string | null
          dni?: string | null
          documento_identidad?:
            | Database["public"]["Enums"]["documento_tipo"]
            | null
          empresa_id?: string | null
          estado?: Database["public"]["Enums"]["cliente_estado"] | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          fecha_nacimiento?: string | null
          foto_cliente?: string | null
          gastos_mensuales?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          id_cliente?: string
          ingresos?: number | null
          nombre_completo?: string
          notas?: string | null
          ref1_nombre?: string | null
          ref1_parentesco?: string | null
          ref1_telefono?: string | null
          ref2_nombre?: string | null
          ref2_parentesco?: string | null
          ref2_telefono?: string | null
          sexo?: Database["public"]["Enums"]["sexo_tipo"] | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono?: string | null
          tipo_vivienda?: string | null
          trabajo_antiguedad?: string | null
          trabajo_cargo?: string | null
          trabajo_empresa?: string | null
          trabajo_telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobradores: {
        Row: {
          activo: boolean
          created_at: string | null
          efectivo_en_mano: number
          empresa_id: string | null
          id: string
          nombre: string
          porcentaje_comision: number
          telefono: string | null
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          efectivo_en_mano?: number
          empresa_id?: string | null
          id?: string
          nombre: string
          porcentaje_comision?: number
          telefono?: string | null
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          efectivo_en_mano?: number
          empresa_id?: string | null
          id?: string
          nombre?: string
          porcentaje_comision?: number
          telefono?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cortes: {
        Row: {
          caja_id: string
          cobrador_id: string
          created_at: string | null
          empresa_id: string | null
          id: string
          monto_comision: number
          monto_depositado: number
          monto_efectivo: number
          periodo_desde: string | null
          periodo_hasta: string | null
          porcentaje_usado: number
          total_cobrado: number
        }
        Insert: {
          caja_id: string
          cobrador_id: string
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          monto_comision?: number
          monto_depositado?: number
          monto_efectivo?: number
          periodo_desde?: string | null
          periodo_hasta?: string | null
          porcentaje_usado?: number
          total_cobrado?: number
        }
        Update: {
          caja_id?: string
          cobrador_id?: string
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          monto_comision?: number
          monto_depositado?: number
          monto_efectivo?: number
          periodo_desde?: string | null
          periodo_hasta?: string | null
          porcentaje_usado?: number
          total_cobrado?: number
        }
        Relationships: [
          {
            foreignKeyName: "cortes_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_cobrador_id_fkey"
            columns: ["cobrador_id"]
            isOneToOne: false
            referencedRelation: "cobradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_gestiones: {
        Row: {
          cliente_id: string
          created_at: string | null
          empresa_id: string | null
          fecha_seguimiento: string | null
          id: string
          notas: string | null
          prestamo_id: string
          registrado_por: string | null
          resultado: string
          tipo_gestion: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          empresa_id?: string | null
          fecha_seguimiento?: string | null
          id?: string
          notas?: string | null
          prestamo_id: string
          registrado_por?: string | null
          resultado: string
          tipo_gestion: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          empresa_id?: string | null
          fecha_seguimiento?: string | null
          id?: string
          notas?: string | null
          prestamo_id?: string
          registrado_por?: string | null
          resultado?: string
          tipo_gestion?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_gestiones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_gestiones_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_config: {
        Row: {
          contrato_campos: Json | null
          contrato_plantilla: string | null
          created_at: string | null
          empresa_id: string
          id: string
          ticket_campos: Json | null
          ticket_encabezado: string | null
          ticket_mostrar_logo: boolean | null
          ticket_pie: string | null
          updated_at: string | null
        }
        Insert: {
          contrato_campos?: Json | null
          contrato_plantilla?: string | null
          created_at?: string | null
          empresa_id: string
          id?: string
          ticket_campos?: Json | null
          ticket_encabezado?: string | null
          ticket_mostrar_logo?: boolean | null
          ticket_pie?: string | null
          updated_at?: string | null
        }
        Update: {
          contrato_campos?: Json | null
          contrato_plantilla?: string | null
          created_at?: string | null
          empresa_id?: string
          id?: string
          ticket_campos?: Json | null
          ticket_encabezado?: string | null
          ticket_mostrar_logo?: boolean | null
          ticket_pie?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          activa: boolean
          created_at: string | null
          direccion: string | null
          id: string
          logo_url: string | null
          max_usuarios: number
          nombre: string
          plan: string
          ruc: string | null
          telefono: string | null
        }
        Insert: {
          activa?: boolean
          created_at?: string | null
          direccion?: string | null
          id?: string
          logo_url?: string | null
          max_usuarios?: number
          nombre: string
          plan?: string
          ruc?: string | null
          telefono?: string | null
        }
        Update: {
          activa?: boolean
          created_at?: string | null
          direccion?: string | null
          id?: string
          logo_url?: string | null
          max_usuarios?: number
          nombre?: string
          plan?: string
          ruc?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      folios: {
        Row: {
          empresa_id: string
          id: string
          prefijo: string
          tipo: string
          ultimo_folio: number
        }
        Insert: {
          empresa_id?: string
          id?: string
          prefijo?: string
          tipo: string
          ultimo_folio?: number
        }
        Update: {
          empresa_id?: string
          id?: string
          prefijo?: string
          tipo?: string
          ultimo_folio?: number
        }
        Relationships: [
          {
            foreignKeyName: "folios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_caja: {
        Row: {
          caja_id: string
          concepto: string | null
          created_at: string | null
          empresa_id: string | null
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
          empresa_id?: string | null
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
          empresa_id?: string | null
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
            foreignKeyName: "movimientos_caja_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
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
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          aplicado_capital: number | null
          aplicado_interes: number | null
          aplicado_mora: number | null
          caja_id: string | null
          cobrador_id: string | null
          created_at: string | null
          cuota_id: string | null
          empresa_id: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido: number
          motivo_anulacion: string | null
          prestamo_id: string
          registrado_por: string | null
          ruta_id: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          aplicado_capital?: number | null
          aplicado_interes?: number | null
          aplicado_mora?: number | null
          caja_id?: string | null
          cobrador_id?: string | null
          created_at?: string | null
          cuota_id?: string | null
          empresa_id?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido: number
          motivo_anulacion?: string | null
          prestamo_id: string
          registrado_por?: string | null
          ruta_id?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          aplicado_capital?: number | null
          aplicado_interes?: number | null
          aplicado_mora?: number | null
          caja_id?: string | null
          cobrador_id?: string | null
          created_at?: string | null
          cuota_id?: string | null
          empresa_id?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido?: number
          motivo_anulacion?: string | null
          prestamo_id?: string
          registrado_por?: string | null
          ruta_id?: string | null
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
            foreignKeyName: "pagos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
        ]
      }
      prestamos: {
        Row: {
          caja_id: string | null
          cancelado_en: string | null
          cancelado_por: string | null
          cliente_id: string
          cobrador_id: string | null
          cobro_automatico_stripe: boolean
          created_at: string | null
          cuota_calculada: number | null
          cuota_redondeada: number | null
          empresa: string | null
          empresa_id: string | null
          estado: Database["public"]["Enums"]["prestamo_estado"] | null
          fecha_primer_pago: string | null
          fecha_registro: string | null
          frecuencia: Database["public"]["Enums"]["frecuencia_pago"]
          gastos_legales: number | null
          generado_por: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          modalidad: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado: number
          monto_total_pagar: number | null
          motivo_cancelacion: string | null
          notas: string | null
          num_cuotas: number
          reestructurado_de: string | null
          ruta_id: string | null
          tasa_interes: number | null
          tipo_mora: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora: number | null
        }
        Insert: {
          caja_id?: string | null
          cancelado_en?: string | null
          cancelado_por?: string | null
          cliente_id: string
          cobrador_id?: string | null
          cobro_automatico_stripe?: boolean
          created_at?: string | null
          cuota_calculada?: number | null
          cuota_redondeada?: number | null
          empresa?: string | null
          empresa_id?: string | null
          estado?: Database["public"]["Enums"]["prestamo_estado"] | null
          fecha_primer_pago?: string | null
          fecha_registro?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_pago"]
          gastos_legales?: number | null
          generado_por?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          modalidad: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado: number
          monto_total_pagar?: number | null
          motivo_cancelacion?: string | null
          notas?: string | null
          num_cuotas: number
          reestructurado_de?: string | null
          ruta_id?: string | null
          tasa_interes?: number | null
          tipo_mora?: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora?: number | null
        }
        Update: {
          caja_id?: string | null
          cancelado_en?: string | null
          cancelado_por?: string | null
          cliente_id?: string
          cobrador_id?: string | null
          cobro_automatico_stripe?: boolean
          created_at?: string | null
          cuota_calculada?: number | null
          cuota_redondeada?: number | null
          empresa?: string | null
          empresa_id?: string | null
          estado?: Database["public"]["Enums"]["prestamo_estado"] | null
          fecha_primer_pago?: string | null
          fecha_registro?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_pago"]
          gastos_legales?: number | null
          generado_por?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          modalidad?: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado?: number
          monto_total_pagar?: number | null
          motivo_cancelacion?: string | null
          notas?: string | null
          num_cuotas?: number
          reestructurado_de?: string | null
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
            foreignKeyName: "prestamos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestamos_reestructurado_de_fkey"
            columns: ["reestructurado_de"]
            isOneToOne: false
            referencedRelation: "prestamos"
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
      profiles: {
        Row: {
          activo: boolean
          bono_meta_monto: number | null
          bono_meta_objetivo: number | null
          caja_id: string | null
          comision_cobros_equipo: number | null
          comision_prestamos: number | null
          comision_tipo: string | null
          created_at: string | null
          direccion: string | null
          efectivo_en_mano: number
          empresa_id: string | null
          foto_url: string | null
          id: string
          nombre_completo: string
          porcentaje_comision: number
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          bono_meta_monto?: number | null
          bono_meta_objetivo?: number | null
          caja_id?: string | null
          comision_cobros_equipo?: number | null
          comision_prestamos?: number | null
          comision_tipo?: string | null
          created_at?: string | null
          direccion?: string | null
          efectivo_en_mano?: number
          empresa_id?: string | null
          foto_url?: string | null
          id: string
          nombre_completo?: string
          porcentaje_comision?: number
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          bono_meta_monto?: number | null
          bono_meta_objetivo?: number | null
          caja_id?: string | null
          comision_cobros_equipo?: number | null
          comision_prestamos?: number | null
          comision_tipo?: string | null
          created_at?: string | null
          direccion?: string | null
          efectivo_en_mano?: number
          empresa_id?: string | null
          foto_url?: string | null
          id?: string
          nombre_completo?: string
          porcentaje_comision?: number
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      promesas_pago: {
        Row: {
          created_at: string | null
          cuota_id: string | null
          empresa_id: string | null
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
          empresa_id?: string | null
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
          empresa_id?: string | null
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
            foreignKeyName: "promesas_pago_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
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
      role_permissions: {
        Row: {
          action: string
          allowed: boolean
          created_at: string | null
          empresa_id: string | null
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          action: string
          allowed?: boolean
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          action?: string
          allowed?: boolean
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas: {
        Row: {
          cobrador_id: string | null
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          cobrador_id?: string | null
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          cobrador_id?: string | null
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_prestamo: {
        Row: {
          aprobado_por: string | null
          caja_id: string | null
          cliente_id: string
          created_at: string | null
          empresa_id: string | null
          fecha_primer_pago: string | null
          frecuencia: Database["public"]["Enums"]["frecuencia_pago"] | null
          gastos_legales: number | null
          id: string
          modalidad: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado: number
          motivo_rechazo: string | null
          notas: string | null
          num_cuotas: number
          prestamo_generado_id: string | null
          rechazado_por: string | null
          resuelto_en: string | null
          ruta_id: string | null
          solicitado_por: string | null
          status: string
          tasa_interes: number | null
          tipo_mora: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora: number | null
        }
        Insert: {
          aprobado_por?: string | null
          caja_id?: string | null
          cliente_id: string
          created_at?: string | null
          empresa_id?: string | null
          fecha_primer_pago?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_pago"] | null
          gastos_legales?: number | null
          id?: string
          modalidad: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado: number
          motivo_rechazo?: string | null
          notas?: string | null
          num_cuotas: number
          prestamo_generado_id?: string | null
          rechazado_por?: string | null
          resuelto_en?: string | null
          ruta_id?: string | null
          solicitado_por?: string | null
          status?: string
          tasa_interes?: number | null
          tipo_mora?: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora?: number | null
        }
        Update: {
          aprobado_por?: string | null
          caja_id?: string | null
          cliente_id?: string
          created_at?: string | null
          empresa_id?: string | null
          fecha_primer_pago?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_pago"] | null
          gastos_legales?: number | null
          id?: string
          modalidad?: Database["public"]["Enums"]["prestamo_modalidad"]
          monto_solicitado?: number
          motivo_rechazo?: string | null
          notas?: string | null
          num_cuotas?: number
          prestamo_generado_id?: string | null
          rechazado_por?: string | null
          resuelto_en?: string | null
          ruta_id?: string | null
          solicitado_por?: string | null
          status?: string
          tasa_interes?: number | null
          tipo_mora?: Database["public"]["Enums"]["tipo_mora"] | null
          valor_mora?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_prestamo_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_prestamo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_prestamo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_prestamo_prestamo_generado_id_fkey"
            columns: ["prestamo_generado_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_prestamo_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_charges_log: {
        Row: {
          cliente_id: string
          created_at: string | null
          cuota_id: string | null
          empresa_id: string
          error_mensaje: string | null
          id: string
          moneda: string
          monto: number
          prestamo_id: string
          status: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          cuota_id?: string | null
          empresa_id?: string
          error_mensaje?: string | null
          id?: string
          moneda?: string
          monto: number
          prestamo_id: string
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          cuota_id?: string | null
          empresa_id?: string
          error_mensaje?: string | null
          id?: string
          moneda?: string
          monto?: number
          prestamo_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_charges_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_charges_log_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "amortizacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_charges_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_charges_log_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "prestamos"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_connect_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string | null
          empresa_id: string
          id: string
          onboarding_complete: boolean
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string | null
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string | null
          empresa_id?: string
          id?: string
          onboarding_complete?: boolean
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string | null
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string | null
          empresa_id?: string
          id?: string
          onboarding_complete?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_accounts_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_payment_methods: {
        Row: {
          activo: boolean
          brand: string | null
          cliente_id: string
          created_at: string | null
          empresa_id: string
          exp_month: number | null
          exp_year: number | null
          id: string
          last4: string | null
          stripe_customer_id: string
          stripe_payment_method_id: string | null
        }
        Insert: {
          activo?: boolean
          brand?: string | null
          cliente_id: string
          created_at?: string | null
          empresa_id?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          last4?: string | null
          stripe_customer_id: string
          stripe_payment_method_id?: string | null
        }
        Update: {
          activo?: boolean
          brand?: string | null
          cliente_id?: string
          created_at?: string | null
          empresa_id?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          last4?: string | null
          stripe_customer_id?: string
          stripe_payment_method_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_payment_methods_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_payment_methods_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_rutas: {
        Row: {
          created_at: string | null
          id: string
          ruta_id: string
          supervisor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ruta_id: string
          supervisor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ruta_id?: string
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_rutas_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_rutas_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_config: {
        Row: {
          activo: boolean
          api_token: string
          api_url: string
          aviso_dia_antes: boolean
          aviso_vencido: boolean
          created_at: string | null
          empresa_id: string
          enviar_recibo_pago: boolean
          id: string
        }
        Insert: {
          activo?: boolean
          api_token?: string
          api_url?: string
          aviso_dia_antes?: boolean
          aviso_vencido?: boolean
          created_at?: string | null
          empresa_id: string
          enviar_recibo_pago?: boolean
          id?: string
        }
        Update: {
          activo?: boolean
          api_token?: string
          api_url?: string
          aviso_dia_antes?: boolean
          aviso_vencido?: boolean
          created_at?: string | null
          empresa_id?: string
          enviar_recibo_pago?: boolean
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_log: {
        Row: {
          created_at: string | null
          empresa_id: string | null
          error_detalle: string | null
          id: string
          imagen_url: string | null
          mensaje: string | null
          referencia_id: string | null
          status: string
          telefono: string
          tipo: string
        }
        Insert: {
          created_at?: string | null
          empresa_id?: string | null
          error_detalle?: string | null
          id?: string
          imagen_url?: string | null
          mensaje?: string | null
          referencia_id?: string | null
          status?: string
          telefono: string
          tipo: string
        }
        Update: {
          created_at?: string | null
          empresa_id?: string | null
          error_detalle?: string | null
          id?: string
          imagen_url?: string | null
          mensaje?: string | null
          referencia_id?: string | null
          status?: string
          telefono?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          activo: boolean
          created_at: string | null
          empresa_id: string
          id: string
          mensaje: string
          nombre: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          empresa_id: string
          id?: string
          mensaje?: string
          nombre?: string
          tipo: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          empresa_id?: string
          id?: string
          mensaje?: string
          nombre?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cobrador_by_user: {
        Args: { p_user_id: string }
        Returns: {
          id: string
        }[]
      }
      get_user_empresa_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_folio: {
        Args: { p_empresa_id: string; p_tipo: string }
        Returns: string
      }
      recalcular_mora: { Args: { p_prestamo_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "cobrador"
      cliente_estado: "Activo" | "Inactivo" | "Bloqueado" | "En mora"
      cuota_status: "Pendiente" | "Pagada" | "Parcial" | "Vencida" | "Prometida"
      documento_tipo: "DUI" | "Pasaporte" | "NIT" | "Otro" | "INE"
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
        | "Reestructurado"
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
      documento_tipo: ["DUI", "Pasaporte", "NIT", "Otro", "INE"],
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
        "Reestructurado",
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
