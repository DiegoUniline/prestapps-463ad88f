import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <PullToRefresh>
            <main className="p-4 md:p-6 pb-24 md:pb-6">
              <Outlet />
            </main>
          </PullToRefresh>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
