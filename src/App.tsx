import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { EmpresaProvider } from "@/contexts/EmpresaContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
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
import ReportesPage from "@/pages/ReportesPage";
import UsuariosPage from "@/pages/UsuariosPage";
import CobradoresPage from "@/pages/CobradoresPage";
import CobranzaDiariaPage from "@/pages/CobranzaDiariaPage";
import EmpresasPage from "@/pages/EmpresasPage";
import WhatsAppConfigPage from "@/pages/WhatsAppConfigPage";
import CrmCobranzaPage from "@/pages/CrmCobranzaPage";
import LeadScoringPage from "@/pages/LeadScoringPage";
import GastosPage from "@/pages/GastosPage";
import ComisionesPage from "@/pages/ComisionesPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <EmpresaProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  {/* Accesible a todos los roles */}
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/cobranza" element={<CobranzaDiariaPage />} />
                  <Route path="/prestamos" element={<PrestamosPage />} />
                  <Route path="/prestamos/:id" element={<PrestamoDetallePage />} />
                  <Route path="/pagos" element={<PagosPage />} />
                  <Route path="/promesas" element={<PromesasPage />} />

                  {/* Admin y Supervisor */}
                  <Route path="/clientes" element={<RoleGuard allowed={["admin", "supervisor"]}><ClientesPage /></RoleGuard>} />
                  <Route path="/clientes/:id" element={<RoleGuard allowed={["admin", "supervisor"]}><ClienteDetallePage /></RoleGuard>} />
                  <Route path="/reportes" element={<RoleGuard allowed={["admin", "supervisor"]}><ReportesPage /></RoleGuard>} />

                  {/* Solo Admin */}
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
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </EmpresaProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
