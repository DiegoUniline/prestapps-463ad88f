import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Empresa {
  id: string;
  nombre: string;
}

interface EmpresaContextType {
  empresaId: string;
  empresaNombre: string;
  empresas: Empresa[];
  setEmpresaId: (id: string) => void;
  loading: boolean;
}

const DEFAULT_EMPRESA = "00000000-0000-0000-0000-000000000001";

const EmpresaContext = createContext<EmpresaContextType>({
  empresaId: DEFAULT_EMPRESA,
  empresaNombre: "Empresa Principal",
  empresas: [],
  setEmpresaId: () => {},
  loading: true,
});

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresaId, setEmpresaId] = useState(DEFAULT_EMPRESA);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("empresa_id");
    if (stored) setEmpresaId(stored);

    (supabase.from as any)("empresas")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre")
      .then(({ data }: any) => {
        setEmpresas(data || []);
        setLoading(false);
      });
  }, []);

  const handleSetEmpresa = (id: string) => {
    setEmpresaId(id);
    localStorage.setItem("empresa_id", id);
  };

  const empresaNombre = empresas.find((e) => e.id === empresaId)?.nombre || "Empresa";

  return (
    <EmpresaContext.Provider value={{ empresaId, empresaNombre, empresas, setEmpresaId: handleSetEmpresa, loading }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export const useEmpresa = () => useContext(EmpresaContext);
