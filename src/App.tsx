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
import PermissionGuard from "@/components/PermissionGuard";
import SuperAdminGuard from "@/components/SuperAdminGuard";
import AppLayout from "@/components/AppLayout";

// Direct imports — frequent pages, instant navigation
import LoginPage from "@/pages/LoginPage";
import LandingPage from "@/pages/LandingPage";
import RegisterPage from "@/pages/RegisterPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import PrestamosPage from "@/pages/PrestamosPage";
import PrestamoDetallePage from "@/pages/PrestamoDetallePage";
import NuevoPrestamoPage from "@/pages/NuevoPrestamoPage";
import PagosPage from "@/pages/PagosPage";
import PromesasPage from "@/pages/PromesasPage";
import ClientesPage from "@/pages/ClientesPage";
import ClienteDetallePage from "@/pages/ClienteDetallePage";
import CajasPage from "@/pages/CajasPage";
import RutasPage from "@/pages/RutasPage";
import CobradoresPage from "@/pages/CobradoresPage";
import CobranzaDiariaPage from "@/pages/CobranzaDiariaPage";
import ClienteCobranzaDetallePage from "@/pages/ClienteCobranzaDetallePage";
import CobradorViewPage from "@/pages/CobradorViewPage";
import SolicitudesPage from "@/pages/SolicitudesPage";
import SolicitudPrestamoPage from "@/pages/SolicitudPrestamoPage";
import GastosPage from "@/pages/GastosPage";

// Lazy — infrequent/heavy pages
const ReportesPage = lazy(() => import("@/pages/ReportesPage"));
const UsuariosPage = lazy(() => import("@/pages/UsuariosPage"));
const EmpresasPage = lazy(() => import("@/pages/EmpresasPage"));
const WhatsAppConfigPage = lazy(() => import("@/pages/WhatsAppConfigPage"));
const CrmCobranzaPage = lazy(() => import("@/pages/CrmCobranzaPage"));
const LeadScoringPage = lazy(() => import("@/pages/LeadScoringPage"));
const ComisionesPage = lazy(() => import("@/pages/ComisionesPage"));
const MapaGPSPage = lazy(() => import("@/pages/MapaGPSPage"));
const LiquidarRutaPage = lazy(() => import("@/pages/LiquidarRutaPage"));
const CatalogosPage = lazy(() => import("@/pages/CatalogosPage"));
const ConfiguracionEmpresaPage = lazy(() => import("@/pages/ConfiguracionEmpresaPage"));
const PermisosPage = lazy(() => import("@/pages/PermisosPage"));
const AlertasPage = lazy(() => import("@/pages/AlertasPage"));
const RenovacionPage = lazy(() => import("@/pages/RenovacionPage"));
const RentabilidadPage = lazy(() => import("@/pages/RentabilidadPage"));
const AuditoriaPage = lazy(() => import("@/pages/AuditoriaPage"));
const ProductividadPage = lazy(() => import("@/pages/ProductividadPage"));
const MiSuscripcionPage = lazy(() => import("@/pages/MiSuscripcionPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

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
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<PermissionGuard module="dashboard"><DashboardPage /></PermissionGuard>} />
              <Route path="/cobranza" element={<PermissionGuard module="cobranza"><CobranzaDiariaPage /></PermissionGuard>} />
              <Route path="/cobranza/cliente/:id" element={<PermissionGuard module="cobranza"><ClienteCobranzaDetallePage /></PermissionGuard>} />
              <Route path="/mi-cobranza" element={<PermissionGuard module="mi_cobranza"><CobradorViewPage /></PermissionGuard>} />
              <Route path="/prestamos" element={<PermissionGuard module="prestamos"><PrestamosPage /></PermissionGuard>} />
              <Route path="/prestamos/:id" element={<PermissionGuard module="prestamos"><PrestamoDetallePage /></PermissionGuard>} />
              <Route path="/pagos" element={<PermissionGuard module="pagos"><PagosPage /></PermissionGuard>} />
              <Route path="/promesas" element={<PermissionGuard module="promesas"><PromesasPage /></PermissionGuard>} />
              <Route path="/solicitudes" element={<PermissionGuard module="solicitudes"><SolicitudesPage /></PermissionGuard>} />
              <Route path="/solicitudes/nueva" element={<PermissionGuard module="solicitudes"><SolicitudPrestamoPage /></PermissionGuard>} />
              <Route path="/gastos" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="gastos"><GastosPage /></PermissionGuard></RoleGuard>} />

              <Route path="/clientes" element={<RoleGuard allowed={["admin", "supervisor"]}><PermissionGuard module="clientes"><ClientesPage /></PermissionGuard></RoleGuard>} />
              <Route path="/clientes/:id" element={<RoleGuard allowed={["admin", "supervisor"]}><PermissionGuard module="clientes"><ClienteDetallePage /></PermissionGuard></RoleGuard>} />
              <Route path="/reportes" element={<RoleGuard allowed={["admin", "supervisor"]}><PermissionGuard module="reportes"><LazyPage><ReportesPage /></LazyPage></PermissionGuard></RoleGuard>} />

              <Route path="/prestamos/nuevo" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="prestamos"><NuevoPrestamoPage /></PermissionGuard></RoleGuard>} />
              <Route path="/cajas" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="cajas"><CajasPage /></PermissionGuard></RoleGuard>} />
              <Route path="/cajas/:id" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="cajas"><CajasPage /></PermissionGuard></RoleGuard>} />
              <Route path="/rutas" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="rutas"><RutasPage /></PermissionGuard></RoleGuard>} />
              <Route path="/rutas/:id" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="rutas"><RutasPage /></PermissionGuard></RoleGuard>} />
              <Route path="/cobradores" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="cobradores"><CobradoresPage /></PermissionGuard></RoleGuard>} />
              <Route path="/usuarios" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="usuarios"><LazyPage><UsuariosPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/usuarios/:id" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="usuarios"><LazyPage><UsuariosPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/empresas" element={<SuperAdminGuard><LazyPage><EmpresasPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/whatsapp" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="whatsapp"><LazyPage><WhatsAppConfigPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/crm" element={<RoleGuard allowed={["admin", "supervisor"]}><PermissionGuard module="crm"><LazyPage><CrmCobranzaPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/scoring" element={<RoleGuard allowed={["admin", "supervisor"]}><PermissionGuard module="scoring"><LazyPage><LeadScoringPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/comisiones" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="comisiones"><LazyPage><ComisionesPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/mapa-gps" element={<RoleGuard allowed={["admin", "supervisor"]}><PermissionGuard module="mapa_gps"><LazyPage><MapaGPSPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/liquidar-ruta" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="liquidar_ruta"><LazyPage><LiquidarRutaPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/catalogos" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="catalogos"><LazyPage><CatalogosPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/configuracion" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="configuracion"><LazyPage><ConfiguracionEmpresaPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/permisos" element={<RoleGuard allowed={["admin"]}><PermissionGuard module="permisos"><LazyPage><PermisosPage /></LazyPage></PermissionGuard></RoleGuard>} />
              <Route path="/alertas" element={<RoleGuard allowed={["admin", "supervisor"]}><LazyPage><AlertasPage /></LazyPage></RoleGuard>} />
              <Route path="/renovacion" element={<RoleGuard allowed={["admin"]}><LazyPage><RenovacionPage /></LazyPage></RoleGuard>} />
              <Route path="/rentabilidad" element={<RoleGuard allowed={["admin"]}><LazyPage><RentabilidadPage /></LazyPage></RoleGuard>} />
              <Route path="/auditoria" element={<RoleGuard allowed={["admin"]}><LazyPage><AuditoriaPage /></LazyPage></RoleGuard>} />
              <Route path="/productividad" element={<RoleGuard allowed={["admin", "supervisor"]}><LazyPage><ProductividadPage /></LazyPage></RoleGuard>} />
              <Route path="/mi-suscripcion" element={<RoleGuard allowed={["admin"]}><LazyPage><MiSuscripcionPage /></LazyPage></RoleGuard>} />
            </Route>
            <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
