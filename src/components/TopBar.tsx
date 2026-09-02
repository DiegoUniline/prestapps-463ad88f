import { SidebarTrigger } from "@/components/ui/sidebar";
import logoIcon from "@/assets/logo-icon.png";
import { SyncStatusBadge } from "@/components/SyncStatusPanel";
import { useTheme } from "@/contexts/ThemeContext";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { isSuperAdmin } from "@/components/SuperAdminGuard";
import { Moon, Sun, Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MobileMenuSheet } from "@/components/MobileMenuSheet";
import { NotificationBell } from "@/components/NotificationBell";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { empresaId, empresas, setEmpresaId } = useEmpresa();
  const { user, signOut } = useAuth();
  const { role } = useCurrentUserRole();

  const initials = user?.email?.slice(0, 2).toUpperCase() || "??";
  const roleLabel: Record<string, string> = { admin: "Admin", supervisor: "Supervisor", cobrador: "Cobrador" };
  const showEmpresaSwitcher = isSuperAdmin(user?.email) && empresas.length > 1;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/70 bg-background/90 px-3 shadow-[0_10px_30px_-28px_rgba(15,23,42,.5)] backdrop-blur-xl md:px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="hidden md:flex" />
        <div className="flex md:hidden items-center gap-2">
          <MobileMenuSheet role={role} />
          <img src={logoIcon} alt="PrestApp" className="h-7 w-7 rounded-lg object-contain" />
          <span className="font-bold text-sm">PrestApp</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-3">
        {showEmpresaSwitcher && (
          <div className="hidden md:flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <SyncStatusBadge />
        <NotificationBell />
        <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:inline-flex" onClick={toggleTheme}>
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
        <Badge variant="secondary" className="text-[10px] h-6 hidden md:flex">{roleLabel[role] || role}</Badge>
        <Avatar className="h-8 w-8 border border-border/70">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
        </Avatar>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cerrar sesión</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
