import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

interface Empresa {
  id: string;
  nombre: string;
}

interface EmpresaState {
  empresaId: string;
  empresaNombre: string;
  empresas: Empresa[];
  loading: boolean;

  setEmpresaId: (id: string) => void;
  initialize: () => () => void;
}

const DEFAULT_EMPRESA = "00000000-0000-0000-0000-000000000001";

export const useEmpresaStore = create<EmpresaState>((set, get) => ({
  empresaId: localStorage.getItem("empresa_id") || DEFAULT_EMPRESA,
  empresaNombre: "Empresa",
  empresas: [],
  loading: true,

  setEmpresaId: (id: string) => {
    set({ empresaId: id, empresaNombre: get().empresas.find((e) => e.id === id)?.nombre || "Empresa" });
    localStorage.setItem("empresa_id", id);
  },

  initialize: () => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("empresa_id")
          .eq("id", session.user.id)
          .single();

        if (profile?.empresa_id) {
          const empresas = get().empresas;
          set({
            empresaId: profile.empresa_id,
            empresaNombre: empresas.find((e) => e.id === profile.empresa_id)?.nombre || "Empresa",
          });
          localStorage.setItem("empresa_id", profile.empresa_id);
        }
      }
    });

    // Load empresas list
    supabase
      .from("empresas")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre")
      .then(({ data }) => {
        const empresas = data || [];
        const currentId = get().empresaId;
        set({
          empresas,
          empresaNombre: empresas.find((e) => e.id === currentId)?.nombre || "Empresa",
          loading: false,
        });
      });

    // Load from profile on init
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("empresa_id")
          .eq("id", session.user.id)
          .single();

        if (profile?.empresa_id) {
          set({ empresaId: profile.empresa_id });
          localStorage.setItem("empresa_id", profile.empresa_id);
        }
      }
    });

    return () => subscription.unsubscribe();
  },
}));
