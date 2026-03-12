import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { EmpresaProvider } from "@/contexts/EmpresaContext";
import AppLayout from "@/components/AppLayout";
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
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <EmpresaProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/prestamos" element={<PrestamosPage />} />
                <Route path="/prestamos/nuevo" element={<NuevoPrestamoPage />} />
                <Route path="/prestamos/:id" element={<PrestamoDetallePage />} />
              <Route path="/pagos" element={<PagosPage />} />
              <Route path="/cobranza" element={<CobranzaDiariaPage />} />
                <Route path="/promesas" element={<PromesasPage />} />
                <Route path="/clientes" element={<ClientesPage />} />
                <Route path="/clientes/:id" element={<ClienteDetallePage />} />
                <Route path="/cajas" element={<CajasPage />} />
                <Route path="/cajas/:id" element={<CajasPage />} />
                <Route path="/rutas" element={<RutasPage />} />
                <Route path="/rutas/:id" element={<RutasPage />} />
                <Route path="/cobradores" element={<CobradoresPage />} />
                <Route path="/reportes" element={<ReportesPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/usuarios/:id" element={<UsuariosPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </EmpresaProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
