import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { useEmpresaStore } from "@/stores/empresaStore";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AppLayout from "@/components/AppLayout";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const PrestamosPage = lazy(() => import("@/pages/PrestamosPage"));
const PrestamoDetallePage = lazy(() => import("@/pages/PrestamoDetallePage"));
const NuevoPrestamoPage = lazy(() => import("@/pages/NuevoPrestamoPage"));
const PagosPage = lazy(() => import("@/pages/PagosPage"));
const PromesasPage = lazy(() => import("@/pages/PromesasPage"));
const ClientesPage = lazy(() => import("@/pages/ClientesPage"));
const ClienteDetallePage = lazy(() => import("@/pages/ClienteDetallePage"));
const CajasPage = lazy(() => import("@/pages/CajasPage"));
const RutasPage = lazy(() => import("@/pages/RutasPage"));
const ReportesPage = lazy(() => import("@/pages/ReportesPage"));
const UsuariosPage = lazy(() => import("@/pages/UsuariosPage"));
const CobradoresPage = lazy(() => import("@/pages/CobradoresPage"));
const CobranzaDiariaPage = lazy(() => import("@/pages/CobranzaDiariaPage"));
const EmpresasPage = lazy(() => import("@/pages/EmpresasPage"));
const WhatsAppConfigPage = lazy(() => import("@/pages/WhatsAppConfigPage"));
const CrmCobranzaPage = lazy(() => import("@/pages/CrmCobranzaPage"));
const LeadScoringPage = lazy(() => import("@/pages/LeadScoringPage"));
const GastosPage = lazy(() => import("@/pages/GastosPage"));
const ComisionesPage = lazy(() => import("@/pages/ComisionesPage"));
const MapaGPSPage = lazy(() => import("@/pages/MapaGPSPage"));
const LiquidarRutaPage = lazy(() => import("@/pages/LiquidarRutaPage"));
const CatalogosPage = lazy(() => import("@/pages/CatalogosPage"));
const ConfiguracionEmpresaPage = lazy(() => import("@/pages/ConfiguracionEmpresaPage"));
const SolicitudesPage = lazy(() => import("@/pages/SolicitudesPage"));
const SolicitudPrestamoPage = lazy(() => import("@/pages/SolicitudPrestamoPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return null;
}

/** Initialize all Zustand stores */
function StoreInitializer() {
  const initAuth = useAuthStore((s) => s.initialize);
  const initUI = useUIStore((s) => s.initializeUI);
  const initEmpresa = useEmpresaStore((s) => s.initialize);

  useEffect(() => {
    const cleanupAuth = initAuth();
    const cleanupUI = initUI();
    const cleanupEmpresa = initEmpresa();
    return () => {
      cleanupAuth();
      cleanupUI();
      cleanupEmpresa();
    };
  }, [initAuth, initUI, initEmpresa]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <StoreInitializer />
        <OfflineBanner />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/cobranza" element={<CobranzaDiariaPage />} />
                <Route path="/prestamos" element={<PrestamosPage />} />
                <Route path="/prestamos/:id" element={<PrestamoDetallePage />} />
                <Route path="/pagos" element={<PagosPage />} />
                <Route path="/promesas" element={<PromesasPage />} />
                <Route path="/solicitudes" element={<SolicitudesPage />} />
                <Route path="/solicitudes/nueva" element={<SolicitudPrestamoPage />} />

                <Route path="/clientes" element={<RoleGuard allowed={["admin", "supervisor"]}><ClientesPage /></RoleGuard>} />
                <Route path="/clientes/:id" element={<RoleGuard allowed={["admin", "supervisor"]}><ClienteDetallePage /></RoleGuard>} />
                <Route path="/reportes" element={<RoleGuard allowed={["admin", "supervisor"]}><ReportesPage /></RoleGuard>} />

                <Route path="/prestamos/nuevo" element={<RoleGuard allowed={["admin"]}><NuevoPrestamoPage /></RoleGuard>} />
                <Route path="/cajas" element={<RoleGuard allowed={["admin"]}><CajasPage /></RoleGuard>} />
                <Route path="/cajas/:id" element={<RoleGuard allowed={["admin"]}><CajasPage /></RoleGuard>} />
                <Route path="/rutas" element={<RoleGuard allowed={["admin"]}><RutasPage /></RoleGuard>} />
                <Route path="/rutas/:id" element={<RoleGuard allowed={["admin"]}><RutasPage /></RoleGuard>} />
                <Route path="/cobradores" element={<RoleGuard allowed={["admin"]}><CobradoresPage /></RoleGuard>} />
                <Route path="/usuarios" element={<RoleGuard allowed={["admin"]}><UsuariosPage /></RoleGuard>} />
                <Route path="/usuarios/:id" element={<RoleGuard allowed={["admin"]}><UsuariosPage /></RoleGuard>} />
                <Route path="/empresas" element={<RoleGuard allowed={["admin"]}><EmpresasPage /></RoleGuard>} />
                <Route path="/whatsapp" element={<RoleGuard allowed={["admin"]}><WhatsAppConfigPage /></RoleGuard>} />
                <Route path="/crm" element={<RoleGuard allowed={["admin", "supervisor"]}><CrmCobranzaPage /></RoleGuard>} />
                <Route path="/scoring" element={<RoleGuard allowed={["admin", "supervisor"]}><LeadScoringPage /></RoleGuard>} />
                <Route path="/gastos" element={<RoleGuard allowed={["admin"]}><GastosPage /></RoleGuard>} />
                <Route path="/comisiones" element={<RoleGuard allowed={["admin"]}><ComisionesPage /></RoleGuard>} />
                <Route path="/mapa-gps" element={<RoleGuard allowed={["admin", "supervisor"]}><MapaGPSPage /></RoleGuard>} />
                <Route path="/liquidar-ruta" element={<RoleGuard allowed={["admin"]}><LiquidarRutaPage /></RoleGuard>} />
                <Route path="/catalogos" element={<RoleGuard allowed={["admin"]}><CatalogosPage /></RoleGuard>} />
                <Route path="/configuracion" element={<RoleGuard allowed={["admin"]}><ConfiguracionEmpresaPage /></RoleGuard>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
