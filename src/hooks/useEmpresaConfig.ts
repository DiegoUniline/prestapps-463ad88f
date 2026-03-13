import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { toast } from "sonner";

export interface TicketCampos {
  cliente_nombre: boolean;
  cliente_dni: boolean;
  cliente_telefono: boolean;
  prestamo_id: boolean;
  fecha_pago: boolean;
  monto_recibido: boolean;
  aplicado_mora: boolean;
  aplicado_interes: boolean;
  aplicado_capital: boolean;
  saldo_pendiente: boolean;
  metodo_pago: boolean;
  cobrador: boolean;
  firma_cliente: boolean;
  firma_cobrador: boolean;
}

export interface ContratoCampos {
  datos_cliente: boolean;
  datos_prestamo: boolean;
  tabla_amortizacion: boolean;
  clausula_mora: boolean;
  firma_cliente: boolean;
  firma_empresa: boolean;
  notas: boolean;
}

export interface EmpresaConfig {
  id: string;
  empresa_id: string;
  ticket_mostrar_logo: boolean;
  ticket_encabezado: string;
  ticket_pie: string;
  ticket_campos: TicketCampos;
  contrato_plantilla: string;
  contrato_campos: ContratoCampos;
}

const DEFAULT_TICKET_CAMPOS: TicketCampos = {
  cliente_nombre: true, cliente_dni: true, cliente_telefono: true,
  prestamo_id: true, fecha_pago: true, monto_recibido: true,
  aplicado_mora: true, aplicado_interes: true, aplicado_capital: true,
  saldo_pendiente: true, metodo_pago: true, cobrador: true,
  firma_cliente: false, firma_cobrador: false,
};

const DEFAULT_CONTRATO_CAMPOS: ContratoCampos = {
  datos_cliente: true, datos_prestamo: true, tabla_amortizacion: true,
  clausula_mora: true, firma_cliente: true, firma_empresa: true, notas: true,
};

const DEFAULT_CONTRATO_PLANTILLA = `Por medio del presente documento, el cliente {{cliente_nombre}}, identificado con {{cliente_documento}} {{cliente_dni}}, con domicilio en {{cliente_direccion}}, se compromete al pago de la cantidad de {{monto_total_pagar}} en {{num_cuotas}} cuotas de {{valor_cuota}} con frecuencia {{frecuencia}}, bajo la modalidad de {{modalidad}} con una tasa de interés del {{tasa_interes}}%.

El primer pago deberá realizarse el día {{fecha_primer_pago}}.

El incumplimiento de pago generará una mora de tipo {{tipo_mora}} con un valor de {{valor_mora}} sobre el saldo de la cuota vencida.

El presente contrato se firma en la ciudad de ______________ a los ____ días del mes de ______________ del año ________.

{{notas}}`;

export function useEmpresaConfig() {
  const { empresaId } = useEmpresa();
  return useQuery({
    queryKey: ["empresa-config", empresaId],
    queryFn: async (): Promise<EmpresaConfig> => {
      const { data, error } = await supabase
        .from("empresa_config" as any)
        .select("*")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const d = data as any;
        return {
          id: d.id,
          empresa_id: d.empresa_id,
          ticket_mostrar_logo: d.ticket_mostrar_logo ?? true,
          ticket_encabezado: d.ticket_encabezado || "",
          ticket_pie: d.ticket_pie || "Gracias por su pago",
          ticket_campos: { ...DEFAULT_TICKET_CAMPOS, ...(d.ticket_campos || {}) },
          contrato_plantilla: d.contrato_plantilla || DEFAULT_CONTRATO_PLANTILLA,
          contrato_campos: { ...DEFAULT_CONTRATO_CAMPOS, ...(d.contrato_campos || {}) },
        };
      }
      // Return defaults if no config exists
      return {
        id: "",
        empresa_id: empresaId,
        ticket_mostrar_logo: true,
        ticket_encabezado: "",
        ticket_pie: "Gracias por su pago",
        ticket_campos: DEFAULT_TICKET_CAMPOS,
        contrato_plantilla: DEFAULT_CONTRATO_PLANTILLA,
        contrato_campos: DEFAULT_CONTRATO_CAMPOS,
      };
    },
  });
}

export function useSaveEmpresaConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: EmpresaConfig) => {
      const payload = {
        empresa_id: config.empresa_id,
        ticket_mostrar_logo: config.ticket_mostrar_logo,
        ticket_encabezado: config.ticket_encabezado,
        ticket_pie: config.ticket_pie,
        ticket_campos: config.ticket_campos,
        contrato_plantilla: config.contrato_plantilla,
        contrato_campos: config.contrato_campos,
        updated_at: new Date().toISOString(),
      };

      if (config.id) {
        const { error } = await supabase
          .from("empresa_config" as any)
          .update(payload as any)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("empresa_config" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, config) => {
      qc.invalidateQueries({ queryKey: ["empresa-config", config.empresa_id] });
      toast.success("Configuración guardada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ empresaId, file }: { empresaId: string; file: File }) => {
      const ext = file.name.split(".").pop();
      const path = `logos/${empresaId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("empresa-assets")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now();

      const { error: updateError } = await supabase
        .from("empresas")
        .update({ logo_url: logoUrl })
        .eq("id", empresaId);
      if (updateError) throw updateError;

      return logoUrl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresas"] });
      qc.invalidateQueries({ queryKey: ["empresa-datos"] });
      toast.success("Logo actualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
