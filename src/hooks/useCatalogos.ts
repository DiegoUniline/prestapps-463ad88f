import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaStore } from "@/stores/empresaStore";
import { toast } from "sonner";
import type { Enums } from "@/integrations/supabase/types";

type SimpleCatalogTable = "cat_frecuencias_pago" | "cat_tipos_documento" | "cat_estados_civiles" | "cat_situaciones_laborales";

// ── Generic simple catalog (nombre, descripcion, activo) ──
export interface CatalogoSimple {
  id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
}

function useSimpleCatalog(table: SimpleCatalogTable, queryKey: string) {
  return useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id, nombre, descripcion, activo")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as CatalogoSimple[];
    },
  });
}

function useUpsertSimple(table: SimpleCatalogTable, queryKey: string, label: string) {
  const qc = useQueryClient();
  const empresaId = useEmpresaStore((s) => s.empresaId);
  return useMutation({
    mutationFn: async (item: Partial<CatalogoSimple> & { nombre: string }) => {
      if (item.id) {
        const { error } = await supabase
          .from(table)
          .update({ nombre: item.nombre, descripcion: item.descripcion, activo: item.activo })
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table)
          .insert({ nombre: item.nombre, descripcion: item.descripcion ?? "", activo: item.activo ?? true, empresa_id: empresaId });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); toast.success(`${label} guardado`); },
    onError: (e: Error) => toast.error(e.message),
  });
}

function useDeleteSimple(table: SimpleCatalogTable, queryKey: string, label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); toast.success(`${label} eliminado`); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Métodos de Pago ──
export interface MetodoPago {
  id: string;
  nombre: string;
  requiere_validacion: boolean;
  descripcion: string;
  activo: boolean;
}

export function useMetodosPago() {
  return useQuery({
    queryKey: ["cat-metodos-pago"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_metodos_pago")
        .select("id, nombre, requiere_validacion, descripcion, activo")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as MetodoPago[];
    },
  });
}

export function useMetodosPagoActivos() {
  return useQuery({
    queryKey: ["cat-metodos-pago-activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_metodos_pago")
        .select("id, nombre, requiere_validacion")
        .eq("activo", true)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as Pick<MetodoPago, "id" | "nombre" | "requiere_validacion">[];
    },
  });
}

export function useUpsertMetodoPago() {
  const qc = useQueryClient();
  const empresaId = useEmpresaStore((s) => s.empresaId);
  return useMutation({
    mutationFn: async (item: Partial<MetodoPago> & { nombre: string }) => {
      if (item.id) {
        const { error } = await supabase
          .from("cat_metodos_pago")
          .update({ nombre: item.nombre, requiere_validacion: item.requiere_validacion, descripcion: item.descripcion, activo: item.activo })
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cat_metodos_pago")
          .insert({ nombre: item.nombre, requiere_validacion: item.requiere_validacion ?? false, descripcion: item.descripcion ?? "", activo: item.activo ?? true, empresa_id: empresaId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-metodos-pago"] });
      qc.invalidateQueries({ queryKey: ["cat-metodos-pago-activos"] });
      toast.success("Método de pago guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteMetodoPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cat_metodos_pago").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-metodos-pago"] });
      qc.invalidateQueries({ queryKey: ["cat-metodos-pago-activos"] });
      toast.success("Método de pago eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Estados de Préstamo ──
export interface EstadoPrestamo {
  id: string;
  nombre: string;
  color: string;
  descripcion: string;
  activo: boolean;
}

export function useEstadosPrestamo() {
  return useQuery({
    queryKey: ["cat-estados-prestamo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_estados_prestamo")
        .select("id, nombre, color, descripcion, activo")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as EstadoPrestamo[];
    },
  });
}

export function useUpsertEstadoPrestamo() {
  const qc = useQueryClient();
  const empresaId = useEmpresaStore((s) => s.empresaId);
  return useMutation({
    mutationFn: async (item: Partial<EstadoPrestamo> & { nombre: string }) => {
      if (item.id) {
        const { error } = await supabase
          .from("cat_estados_prestamo")
          .update({ nombre: item.nombre, color: item.color, descripcion: item.descripcion, activo: item.activo })
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cat_estados_prestamo")
          .insert({ nombre: item.nombre, color: item.color ?? "", descripcion: item.descripcion ?? "", activo: item.activo ?? true, empresa_id: empresaId });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cat-estados-prestamo"] }); toast.success("Estado guardado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteEstadoPrestamo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cat_estados_prestamo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cat-estados-prestamo"] }); toast.success("Estado eliminado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Frecuencias de Pago ──
export const useFrecuenciasPago = () => useSimpleCatalog("cat_frecuencias_pago", "cat-frecuencias-pago");
export const useUpsertFrecuenciaPago = () => useUpsertSimple("cat_frecuencias_pago", "cat-frecuencias-pago", "Frecuencia");
export const useDeleteFrecuenciaPago = () => useDeleteSimple("cat_frecuencias_pago", "cat-frecuencias-pago", "Frecuencia");

export function useFrecuenciasPagoActivas() {
  return useQuery({
    queryKey: ["cat-frecuencias-pago-activas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_frecuencias_pago")
        .select("id, nombre")
        .eq("activo", true)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as { id: string; nombre: string }[];
    },
  });
}

// ── Tipos de Documento ──
export const useTiposDocumento = () => useSimpleCatalog("cat_tipos_documento", "cat-tipos-documento");
export const useUpsertTipoDocumento = () => useUpsertSimple("cat_tipos_documento", "cat-tipos-documento", "Tipo de documento");
export const useDeleteTipoDocumento = () => useDeleteSimple("cat_tipos_documento", "cat-tipos-documento", "Tipo de documento");

// ── Estados Civiles ──
export const useEstadosCiviles = () => useSimpleCatalog("cat_estados_civiles", "cat-estados-civiles");
export const useUpsertEstadoCivil = () => useUpsertSimple("cat_estados_civiles", "cat-estados-civiles", "Estado civil");
export const useDeleteEstadoCivil = () => useDeleteSimple("cat_estados_civiles", "cat-estados-civiles", "Estado civil");

// ── Situaciones Laborales ──
export const useSituacionesLaborales = () => useSimpleCatalog("cat_situaciones_laborales", "cat-situaciones-laborales");
export const useUpsertSituacionLaboral = () => useUpsertSimple("cat_situaciones_laborales", "cat-situaciones-laborales", "Situación laboral");
export const useDeleteSituacionLaboral = () => useDeleteSimple("cat_situaciones_laborales", "cat-situaciones-laborales", "Situación laboral");

// ── Planes de Cuotas ──
export interface PlanCuota {
  id: string;
  nombre: string;
  num_cuotas: number;
  tasa_interes: number;
  comision_colocador: number;
  comision_cobrador: number;
  frecuencia: string;
  modalidad: string;
  tipo_mora: string;
  valor_mora: number;
  activo: boolean;
}

export function usePlanesCuotas() {
  return useQuery({
    queryKey: ["cat-planes-cuotas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_cuotas")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as PlanCuota[];
    },
  });
}

export function usePlanesCuotasActivos() {
  return useQuery({
    queryKey: ["cat-planes-cuotas-activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_cuotas")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data || []) as unknown as PlanCuota[];
    },
  });
}

export function useUpsertPlanCuota() {
  const qc = useQueryClient();
  const empresaId = useEmpresaStore((s) => s.empresaId);
  return useMutation({
    mutationFn: async (item: Partial<PlanCuota> & { nombre: string }) => {
      const payload = {
        nombre: item.nombre,
        num_cuotas: item.num_cuotas ?? 1,
        tasa_interes: item.tasa_interes ?? 0,
        comision_colocador: item.comision_colocador ?? 0,
        comision_cobrador: item.comision_cobrador ?? 0,
        frecuencia: (item.frecuencia ?? "semanal") as Enums<"frecuencia_pago">,
        modalidad: (item.modalidad ?? "fijo") as Enums<"prestamo_modalidad">,
        tipo_mora: (item.tipo_mora ?? "porcentaje") as Enums<"tipo_mora">,
        valor_mora: item.valor_mora ?? 0,
        activo: item.activo ?? true,
      };
      if (item.id) {
        const { error } = await supabase.from("cat_cuotas").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cat_cuotas").insert({ ...payload, empresa_id: empresaId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-planes-cuotas"] });
      qc.invalidateQueries({ queryKey: ["cat-planes-cuotas-activos"] });
      toast.success("Plan de cuotas guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePlanCuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cat_cuotas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-planes-cuotas"] });
      qc.invalidateQueries({ queryKey: ["cat-planes-cuotas-activos"] });
      toast.success("Plan de cuotas eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
