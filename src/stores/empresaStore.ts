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
  _profileLoadedFor: string | null;

  setEmpresaId: (id: string) => void;
  initialize: () => () => void;
}

const DEFAULT_EMPRESA = "00000000-0000-0000-0000-000000000001";

export const useEmpresaStore = create<EmpresaState>((set, get) => ({
  empresaId: localStorage.getItem("empresa_id") || DEFAULT_EMPRESA,
  empresaNombre: "Empresa",
  empresas: [],
  loading: true,
  _profileLoadedFor: null,

  setEmpresaId: async (id: string) => {
    localStorage.setItem("empresa_id", id);
    // Update profile first so get_user_empresa_id() returns the new empresa (RLS)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.from("profiles").update({ empresa_id: id }).eq("id", session.user.id);
    }
    // Now update state — queries will refetch with correct RLS context
    set({ empresaId: id, empresaNombre: get().empresas.find((e) => e.id === id)?.nombre || "Empresa" });
  },

  initialize: () => {
    let empresasLoaded = false;
    let profileLoaded = false;

    const maybeFinishLoading = () => {
      if (empresasLoaded && profileLoaded) {
        set({ loading: false });
      }
    };

    const loadProfile = (userId: string) => {
      if (get()._profileLoadedFor === userId) {
        profileLoaded = true;
        maybeFinishLoading();
        return;
      }
      set({ _profileLoadedFor: userId });
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
          profileLoaded = true;
          maybeFinishLoading();
        });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setTimeout(() => loadProfile(session.user.id), 0);
      } else {
        set({ _profileLoadedFor: null });
        profileLoaded = true;
        maybeFinishLoading();
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
        });
        empresasLoaded = true;
        maybeFinishLoading();
      });

    // Load from profile on init
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        profileLoaded = true;
        maybeFinishLoading();
      }
    });

    return () => subscription.unsubscribe();
  },
}));
