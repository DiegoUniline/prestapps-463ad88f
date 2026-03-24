import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAccesoApp } from "@/hooks/useAccesoApp";

export default function AppLayout() {
  const { blocked, loading } = useAccesoApp();
  const location = useLocation();

  // When blocked (suspendida/cancelada/sin_suscripcion), only allow /mi-suscripcion
  const isAllowedRoute = location.pathname === "/mi-suscripcion";

  if (!loading && blocked && !isAllowedRoute) {
    return <Navigate to="/mi-suscripcion" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <SubscriptionBanner />
          <PullToRefresh>
            <main className="p-4 md:p-6 pb-24 md:pb-6">
              <div className="bg-card border border-border rounded-lg p-4 md:p-5">
                <Outlet />
              </div>
            </main>
          </PullToRefresh>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
