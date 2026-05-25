import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { UpdateBanner } from "@/components/shared/UpdateBanner";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { useEmpresaStore } from "@/stores/empresaStore";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import SuperAdminGuard from "@/components/SuperAdminGuard";
import AppLayout from "@/components/AppLayout";

// Direct imports — frequent pages, instant navigation
import LoginPage from "@/pages/LoginPage";
import LandingPage from "@/pages/LandingPage";
import RegisterPage from "@/pages/RegisterPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import HomeRouter from "@/pages/HomeRouter";
import PrestamosPage from "@/pages/PrestamosPage";
import PrestamoDetallePage from "@/pages/PrestamoDetallePage";
import NuevoPrestamoPage from "@/pages/NuevoPrestamoPage";
import PagosPage from "@/pages/PagosPage";
import PromesasPage from "@/pages/PromesasPage";
import ClientesPage from "@/pages/ClientesPage";
import ClienteDetallePage from "@/pages/ClienteDetallePage";
import CajasPage from "@/pages/CajasPage";
import CajaDetallePage from "@/pages/CajaDetallePage";
import RutasPage from "@/pages/RutasPage";
import CobradoresPage from "@/pages/CobradoresPage";
import CobranzaDiariaPage from "@/pages/CobranzaDiariaPage";
import ClienteCobranzaDetallePage from "@/pages/ClienteCobranzaDetallePage";
import CobradorViewPage from "@/pages/CobradorViewPage";
import SolicitudesPage from "@/pages/SolicitudesPage";
import SolicitudPrestamoPage from "@/pages/SolicitudPrestamoPage";
import PlanesCuotasPage from "@/pages/PlanesCuotasPage";
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
const ReporteSemanalPage = lazy(() => import("@/pages/ReporteSemanalPage"));
const AuditoriaPage = lazy(() => import("@/pages/AuditoriaPage"));
const ProductividadPage = lazy(() => import("@/pages/ProductividadPage"));
const MiSuscripcionPage = lazy(() => import("@/pages/MiSuscripcionPage"));
const SuperAdminWhatsAppPage = lazy(() => import("@/pages/SuperAdminWhatsAppPage"));
const SuperAdminPage = lazy(() => import("@/pages/SuperAdminPage"));
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
        <UpdateBanner />
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
              <Route path="/dashboard" element={<HomeRouter />} />
              <Route path="/cobranza" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="cobranza"><CobranzaDiariaPage /></RoleGuard>} />
              <Route path="/cobranza/cliente/:id" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="cobranza"><ClienteCobranzaDetallePage /></RoleGuard>} />
              <Route path="/mi-cobranza" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="mi_cobranza"><CobradorViewPage /></RoleGuard>} />
              <Route path="/prestamos" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="prestamos"><PrestamosPage /></RoleGuard>} />
              <Route path="/prestamos/:id" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="prestamos"><PrestamoDetallePage /></RoleGuard>} />
              <Route path="/planes-cuotas" element={<RoleGuard allowed={["admin", "supervisor"]} module="prestamos"><PlanesCuotasPage /></RoleGuard>} />
              <Route path="/pagos" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="pagos"><PagosPage /></RoleGuard>} />
              <Route path="/promesas" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="promesas"><PromesasPage /></RoleGuard>} />
              <Route path="/solicitudes" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="solicitudes"><SolicitudesPage /></RoleGuard>} />
              <Route path="/solicitudes/nueva" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="solicitudes" action="agregar"><SolicitudPrestamoPage /></RoleGuard>} />
              <Route path="/gastos" element={<RoleGuard allowed={["admin"]} module="gastos"><GastosPage /></RoleGuard>} />

              <Route path="/clientes" element={<RoleGuard allowed={["admin", "supervisor"]} module="clientes"><ClientesPage /></RoleGuard>} />
              <Route path="/clientes/:id" element={<RoleGuard allowed={["admin", "supervisor"]} module="clientes"><ClienteDetallePage /></RoleGuard>} />
              <Route path="/reportes" element={<RoleGuard allowed={["admin", "supervisor"]} module="reportes"><LazyPage><ReportesPage /></LazyPage></RoleGuard>} />

              <Route path="/prestamos/nuevo" element={<RoleGuard allowed={["admin"]} module="prestamos" action="agregar"><NuevoPrestamoPage /></RoleGuard>} />
              <Route path="/cajas" element={<RoleGuard allowed={["admin"]} module="cajas"><CajasPage /></RoleGuard>} />
              <Route path="/cajas/:id" element={<RoleGuard allowed={["admin"]} module="cajas"><CajaDetallePage /></RoleGuard>} />
              <Route path="/rutas" element={<RoleGuard allowed={["admin"]} module="rutas"><RutasPage /></RoleGuard>} />
              <Route path="/rutas/:id" element={<RoleGuard allowed={["admin"]} module="rutas"><RutasPage /></RoleGuard>} />
              <Route path="/cobradores" element={<RoleGuard allowed={["admin"]} module="cobradores"><CobradoresPage /></RoleGuard>} />
              <Route path="/usuarios" element={<RoleGuard allowed={["admin"]} module="usuarios"><LazyPage><UsuariosPage /></LazyPage></RoleGuard>} />
              <Route path="/usuarios/:id" element={<RoleGuard allowed={["admin"]} module="usuarios"><LazyPage><UsuariosPage /></LazyPage></RoleGuard>} />
              <Route path="/super-admin" element={<SuperAdminGuard><LazyPage><SuperAdminPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/empresas" element={<SuperAdminGuard><LazyPage><EmpresasPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/sa-whatsapp" element={<SuperAdminGuard><LazyPage><SuperAdminWhatsAppPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/whatsapp" element={<RoleGuard allowed={["admin"]} module="whatsapp"><LazyPage><WhatsAppConfigPage /></LazyPage></RoleGuard>} />
              <Route path="/crm" element={<RoleGuard allowed={["admin", "supervisor"]} module="crm"><LazyPage><CrmCobranzaPage /></LazyPage></RoleGuard>} />
              <Route path="/scoring" element={<RoleGuard allowed={["admin", "supervisor"]} module="scoring"><LazyPage><LeadScoringPage /></LazyPage></RoleGuard>} />
              <Route path="/comisiones" element={<RoleGuard allowed={["admin"]} module="comisiones"><LazyPage><ComisionesPage /></LazyPage></RoleGuard>} />
              <Route path="/mapa-gps" element={<RoleGuard allowed={["admin", "supervisor"]} module="mapa_gps"><LazyPage><MapaGPSPage /></LazyPage></RoleGuard>} />
              <Route path="/liquidar-ruta" element={<RoleGuard allowed={["admin"]} module="liquidar_ruta"><LazyPage><LiquidarRutaPage /></LazyPage></RoleGuard>} />
              <Route path="/catalogos" element={<RoleGuard allowed={["admin"]} module="catalogos"><LazyPage><CatalogosPage /></LazyPage></RoleGuard>} />
              <Route path="/configuracion" element={<RoleGuard allowed={["admin"]} module="configuracion"><LazyPage><ConfiguracionEmpresaPage /></LazyPage></RoleGuard>} />
              <Route path="/permisos" element={<RoleGuard allowed={["admin"]} module="permisos"><LazyPage><PermisosPage /></LazyPage></RoleGuard>} />
              <Route path="/alertas" element={<RoleGuard allowed={["admin", "supervisor"]}><LazyPage><AlertasPage /></LazyPage></RoleGuard>} />
              <Route path="/renovacion" element={<RoleGuard allowed={["admin"]}><LazyPage><RenovacionPage /></LazyPage></RoleGuard>} />
              <Route path="/rentabilidad" element={<RoleGuard allowed={["admin"]}><LazyPage><RentabilidadPage /></LazyPage></RoleGuard>} />
              <Route path="/reporte-semanal" element={<RoleGuard allowed={["admin"]}><LazyPage><ReporteSemanalPage /></LazyPage></RoleGuard>} />
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
