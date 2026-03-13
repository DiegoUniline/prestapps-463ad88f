import { SidebarTrigger } from "@/components/ui/sidebar";
import logoIcon from "@/assets/logo-icon.png";
import { useTheme } from "@/contexts/ThemeContext";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { Moon, Sun, Bell, Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { empresaId, empresas, setEmpresaId } = useEmpresa();
  const { user, signOut } = useAuth();
  const { role } = useCurrentUserRole();

  const initials = user?.email?.slice(0, 2).toUpperCase() || "??";
  const roleLabel: Record<string, string> = { admin: "Admin", supervisor: "Supervisor", cobrador: "Cobrador" };

  return (
    <header className="h-14 border-b flex items-center justify-between px-3 md:px-4 bg-card shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="hidden md:flex" />
        <div className="flex md:hidden items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">P</span>
          </div>
          <span className="font-bold text-sm">PrestApp</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-3">
        {empresas.length > 1 && (
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
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
        <Badge variant="secondary" className="text-[10px] h-6 hidden md:flex">{roleLabel[role] || role}</Badge>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
        </Avatar>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
        </Avatar>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cerrar sesión</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
