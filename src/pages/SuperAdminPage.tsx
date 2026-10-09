import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MessageSquare, Activity, Landmark } from "lucide-react";

const EmpresasPage = lazy(() => import("@/pages/EmpresasPage"));
const SuperAdminWhatsAppPage = lazy(() => import("@/pages/SuperAdminWhatsAppPage"));
const SuperAdminHealthPage = lazy(() => import("@/pages/SuperAdminHealthPage"));
const SuperAdminBuroPage = lazy(() => import("@/pages/SuperAdminBuroPage"));

const TABS = [
  { value: "empresas", label: "Empresas", icon: Building2 },
  { value: "whatsapp", label: "Notificaciones WA", icon: MessageSquare },
  { value: "health", label: "Estado", icon: Activity },
  { value: "circulo", label: "Círculo de Crédito", icon: Landmark },
] as const;

export default function SuperAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "empresas";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel Super Admin"
        description="Gestión central de empresas, notificaciones y configuración global de PrestApps"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-2 sm:grid-cols-4 h-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="empresas" className="mt-4">
          <Suspense fallback={null}>
            <EmpresasPage embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4">
          <Suspense fallback={null}>
            <SuperAdminWhatsAppPage embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <Suspense fallback={null}>
            <SuperAdminHealthPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="circulo" className="mt-4">
          <Suspense fallback={null}>
            <SuperAdminBuroPage />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
