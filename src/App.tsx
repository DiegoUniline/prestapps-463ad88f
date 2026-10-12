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

/** lazy() that reloads once if a chunk from a previous deploy is gone (stale tab after an update) */
const CHUNK_RELOAD_KEY = "chunk-reload-at";
function lazyPage(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch((err) => {
      let last = 0;
      try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0); } catch { /* storage unavailable */ }
      if (Date.now() - last > 10_000) {
        try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())); } catch { /* storage unavailable */ }
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw err;
    })
  );
}

// Eager — entry route only
import LoginPage from "@/pages/LoginPage";

// Lazy — every other route page
const LandingPage = lazyPage(() => import("@/pages/LandingPage"));
const RegisterPage = lazyPage(() => import("@/pages/RegisterPage"));
const ResetPasswordPage = lazyPage(() => import("@/pages/ResetPasswordPage"));
const HomeRouter = lazyPage(() => import("@/pages/HomeRouter"));
const PrestamosPage = lazyPage(() => import("@/pages/PrestamosPage"));
const PrestamoDetallePage = lazyPage(() => import("@/pages/PrestamoDetallePage"));
const NuevoPrestamoPage = lazyPage(() => import("@/pages/NuevoPrestamoPage"));
const PagosPage = lazyPage(() => import("@/pages/PagosPage"));
const PromesasPage = lazyPage(() => import("@/pages/PromesasPage"));
const ClientesPage = lazyPage(() => import("@/pages/ClientesPage"));
const ClienteDetallePage = lazyPage(() => import("@/pages/ClienteDetallePage"));
const CajasPage = lazyPage(() => import("@/pages/CajasPage"));
const CajaDetallePage = lazyPage(() => import("@/pages/CajaDetallePage"));
const RutasPage = lazyPage(() => import("@/pages/RutasPage"));
const CobradoresPage = lazyPage(() => import("@/pages/CobradoresPage"));
const CobranzaDiariaPage = lazyPage(() => import("@/pages/CobranzaDiariaPage"));
const ClienteCobranzaDetallePage = lazyPage(() => import("@/pages/ClienteCobranzaDetallePage"));
const CobradorViewPage = lazyPage(() => import("@/pages/CobradorViewPage"));
const SolicitudesPage = lazyPage(() => import("@/pages/SolicitudesPage"));
const SolicitudPrestamoPage = lazyPage(() => import("@/pages/SolicitudPrestamoPage"));
const PlanesCuotasPage = lazyPage(() => import("@/pages/PlanesCuotasPage"));
const GastosPage = lazyPage(() => import("@/pages/GastosPage"));

const ReportesPage = lazyPage(() => import("@/pages/ReportesPage"));
const UsuariosPage = lazyPage(() => import("@/pages/UsuariosPage"));
const EmpresasPage = lazyPage(() => import("@/pages/EmpresasPage"));
const SuperAdminBuroPage = lazyPage(() => import("@/pages/SuperAdminBuroPage"));
const WhatsAppConfigPage = lazyPage(() => import("@/pages/WhatsAppConfigPage"));
const CrmCobranzaPage = lazyPage(() => import("@/pages/CrmCobranzaPage"));
const LeadScoringPage = lazyPage(() => import("@/pages/LeadScoringPage"));
const ComisionesPage = lazyPage(() => import("@/pages/ComisionesPage"));
const MapaGPSPage = lazyPage(() => import("@/pages/MapaGPSPage"));
const LiquidarRutaPage = lazyPage(() => import("@/pages/LiquidarRutaPage"));
const CatalogosPage = lazyPage(() => import("@/pages/CatalogosPage"));
const ConfiguracionEmpresaPage = lazyPage(() => import("@/pages/ConfiguracionEmpresaPage"));
const PermisosPage = lazyPage(() => import("@/pages/PermisosPage"));
const AlertasPage = lazyPage(() => import("@/pages/AlertasPage"));
const RenovacionPage = lazyPage(() => import("@/pages/RenovacionPage"));
const RentabilidadPage = lazyPage(() => import("@/pages/RentabilidadPage"));
const ReporteSemanalPage = lazyPage(() => import("@/pages/ReporteSemanalPage"));
const AuditoriaPage = lazyPage(() => import("@/pages/AuditoriaPage"));
const ProductividadPage = lazyPage(() => import("@/pages/ProductividadPage"));
const MiSuscripcionPage = lazyPage(() => import("@/pages/MiSuscripcionPage"));
const SuperAdminWhatsAppPage = lazyPage(() => import("@/pages/SuperAdminWhatsAppPage"));
const SuperAdminPage = lazyPage(() => import("@/pages/SuperAdminPage"));
const SuperAdminHealthPage = lazyPage(() => import("@/pages/SuperAdminHealthPage"));
const NotFound = lazyPage(() => import("@/pages/NotFound"));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

// Purge legacy service-worker runtime caches that stored Supabase API/storage responses
if (typeof window !== "undefined" && "caches" in window) {
  ["supabase-api-cache", "supabase-storage-cache"].forEach((name) => {
    caches.delete(name).catch(() => {});
  });
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
            <Route path="/" element={<LazyPage><LandingPage /></LazyPage>} />
            <Route path="/landing" element={<LazyPage><LandingPage /></LazyPage>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<LazyPage><RegisterPage /></LazyPage>} />
            <Route path="/reset-password" element={<LazyPage><ResetPasswordPage /></LazyPage>} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<LazyPage><HomeRouter /></LazyPage>} />
              <Route path="/cobranza" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="cobranza"><LazyPage><CobranzaDiariaPage /></LazyPage></RoleGuard>} />
              <Route path="/cobranza/cliente/:id" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="cobranza"><LazyPage><ClienteCobranzaDetallePage /></LazyPage></RoleGuard>} />
              <Route path="/mi-cobranza" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="mi_cobranza"><LazyPage><CobradorViewPage /></LazyPage></RoleGuard>} />
              <Route path="/prestamos" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="prestamos"><LazyPage><PrestamosPage /></LazyPage></RoleGuard>} />
              <Route path="/prestamos/:id" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="prestamos"><LazyPage><PrestamoDetallePage /></LazyPage></RoleGuard>} />
              <Route path="/planes-cuotas" element={<RoleGuard allowed={["admin", "supervisor"]} module="prestamos"><LazyPage><PlanesCuotasPage /></LazyPage></RoleGuard>} />
              <Route path="/pagos" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="pagos"><LazyPage><PagosPage /></LazyPage></RoleGuard>} />
              <Route path="/promesas" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="promesas"><LazyPage><PromesasPage /></LazyPage></RoleGuard>} />
              <Route path="/solicitudes" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="solicitudes"><LazyPage><SolicitudesPage /></LazyPage></RoleGuard>} />
              <Route path="/solicitudes/nueva" element={<RoleGuard allowed={["admin", "supervisor", "cobrador"]} module="solicitudes" action="agregar"><LazyPage><SolicitudPrestamoPage /></LazyPage></RoleGuard>} />
              <Route path="/gastos" element={<RoleGuard allowed={["admin"]} module="gastos"><LazyPage><GastosPage /></LazyPage></RoleGuard>} />

              <Route path="/clientes" element={<RoleGuard allowed={["admin", "supervisor"]} module="clientes"><LazyPage><ClientesPage /></LazyPage></RoleGuard>} />
              <Route path="/clientes/:id" element={<RoleGuard allowed={["admin", "supervisor"]} module="clientes"><LazyPage><ClienteDetallePage /></LazyPage></RoleGuard>} />
              <Route path="/reportes" element={<RoleGuard allowed={["admin", "supervisor"]} module="reportes"><LazyPage><ReportesPage /></LazyPage></RoleGuard>} />

              <Route path="/prestamos/nuevo" element={<RoleGuard allowed={["admin"]} module="prestamos" action="agregar"><LazyPage><NuevoPrestamoPage /></LazyPage></RoleGuard>} />
              <Route path="/cajas" element={<RoleGuard allowed={["admin"]} module="cajas"><LazyPage><CajasPage /></LazyPage></RoleGuard>} />
              <Route path="/cajas/:id" element={<RoleGuard allowed={["admin"]} module="cajas"><LazyPage><CajaDetallePage /></LazyPage></RoleGuard>} />
              <Route path="/rutas" element={<RoleGuard allowed={["admin"]} module="rutas"><LazyPage><RutasPage /></LazyPage></RoleGuard>} />
              <Route path="/rutas/:id" element={<RoleGuard allowed={["admin"]} module="rutas"><LazyPage><RutasPage /></LazyPage></RoleGuard>} />
              <Route path="/cobradores" element={<RoleGuard allowed={["admin"]} module="cobradores"><LazyPage><CobradoresPage /></LazyPage></RoleGuard>} />
              <Route path="/usuarios" element={<RoleGuard allowed={["admin"]} module="usuarios"><LazyPage><UsuariosPage /></LazyPage></RoleGuard>} />
              <Route path="/usuarios/:id" element={<RoleGuard allowed={["admin"]} module="usuarios"><LazyPage><UsuariosPage /></LazyPage></RoleGuard>} />
              <Route path="/super-admin" element={<SuperAdminGuard><LazyPage><SuperAdminPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/empresas" element={<SuperAdminGuard><LazyPage><EmpresasPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/sa-whatsapp" element={<SuperAdminGuard><LazyPage><SuperAdminWhatsAppPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/sa-health" element={<SuperAdminGuard><LazyPage><SuperAdminHealthPage /></LazyPage></SuperAdminGuard>} />
              <Route path="/sa-buro" element={<SuperAdminGuard><LazyPage><SuperAdminBuroPage /></LazyPage></SuperAdminGuard>} />
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
