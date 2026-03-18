import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import { setCurrencySymbol } from "@/lib/utils";

interface Empresa {
  id: string;
  nombre: string;
  moneda_simbolo?: string;
}

interface EmpresaState {
  empresaId: string;
  empresaNombre: string;
  monedaSimbolo: string;
  monedaCodigo: string;
  empresas: Empresa[];
  loading: boolean;
  _profileLoadedFor: string | null;

  setEmpresaId: (id: string) => Promise<void>;
  initialize: () => () => void;
}

const DEFAULT_EMPRESA = "00000000-0000-0000-0000-000000000001";

export const useEmpresaStore = create<EmpresaState>((set, get) => ({
  empresaId: localStorage.getItem("empresa_id") || DEFAULT_EMPRESA,
  empresaNombre: "Empresa",
  monedaSimbolo: "$",
  monedaCodigo: "USD",
  empresas: [],
  loading: true,
  _profileLoadedFor: null,

  setEmpresaId: async (id: string) => {
    localStorage.setItem("empresa_id", id);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await (supabase.rpc as any)("switch_empresa", { p_empresa_id: id });
    }
    const empresa = get().empresas.find((e) => e.id === id);
    const simbolo = empresa?.moneda_simbolo || "$";
    setCurrencySymbol(simbolo);
    set({
      empresaId: id,
      empresaNombre: empresa?.nombre || "Empresa",
      monedaSimbolo: simbolo,
    });
  },

  initialize: () => {
    let empresasLoaded = false;
    let profileLoaded = false;

    const maybeFinishLoading = () => {
      if (empresasLoaded && profileLoaded) {
        set({ loading: false });
      }
    };

    const applyCurrency = (empresaId: string, empresas: Empresa[]) => {
      const empresa = empresas.find((e) => e.id === empresaId);
      const simbolo = empresa?.moneda_simbolo || "$";
      setCurrencySymbol(simbolo);
      set({ monedaSimbolo: simbolo });
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
            const empresa = empresas.find((e) => e.id === profile.empresa_id);
            const simbolo = empresa?.moneda_simbolo || "$";
            setCurrencySymbol(simbolo);
            set({
              empresaId: profile.empresa_id,
              empresaNombre: empresa?.nombre || "Empresa",
              monedaSimbolo: simbolo,
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

    // Load empresas list including currency
    (supabase as any)
      .from("empresas")
      .select("id, nombre, moneda_simbolo, moneda_codigo")
      .eq("activa", true)
      .order("nombre")
      .then(({ data }: any) => {
        const empresas: Empresa[] = data || [];
        const currentId = get().empresaId;
        const empresa = empresas.find((e) => e.id === currentId);
        const simbolo = empresa?.moneda_simbolo || "$";
        setCurrencySymbol(simbolo);
        set({
          empresas,
          empresaNombre: empresa?.nombre || "Empresa",
          monedaSimbolo: simbolo,
          monedaCodigo: (empresa as any)?.moneda_codigo || "USD",
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
