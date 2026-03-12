import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04)]">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon">
          <Bell className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">AD</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
