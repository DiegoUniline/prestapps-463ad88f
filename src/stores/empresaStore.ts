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
    // Non-blocking: fire-and-forget profile load
    const loadProfile = (userId: string) => {
      supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", userId)
        .single()
        .then(({ data: profile }) => {
          if (profile?.empresa_id) {
            const empresas = get().empresas;
            set({
              empresaId: profile.empresa_id,
              empresaNombre: empresas.find((e) => e.id === profile.empresa_id)?.nombre || "Empresa",
            });
            localStorage.setItem("empresa_id", profile.empresa_id);
          }
        });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Defer to avoid Supabase deadlock
        setTimeout(() => loadProfile(session.user.id), 0);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  },
}));
