// Compatibility layer — bridges old Context API to Zustand stores

import { useEmpresaStore } from "@/stores/empresaStore";

export function useEmpresa() {
  const empresaId = useEmpresaStore((s) => s.empresaId);
  const empresaNombre = useEmpresaStore((s) => s.empresaNombre);
  const empresas = useEmpresaStore((s) => s.empresas);
  const setEmpresaId = useEmpresaStore((s) => s.setEmpresaId);
  const loading = useEmpresaStore((s) => s.loading);
  const monedaSimbolo = useEmpresaStore((s) => s.monedaSimbolo);
  const monedaCodigo = useEmpresaStore((s) => s.monedaCodigo);
  return { empresaId, empresaNombre, empresas, setEmpresaId, loading, monedaSimbolo, monedaCodigo };
}
