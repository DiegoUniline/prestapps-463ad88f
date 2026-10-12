import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Notif {
  id: string;
  titulo: string;
  mensaje: string | null;
  tipo: string;
  link: string | null;
  leida: boolean;
  created_at: string;
}

const TIPO_COLOR: Record<string, string> = {
  info: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
};

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const unread = items.filter((n) => !n.leida).length;

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notificaciones")
      .select("id, titulo, mensaje, tipo, link, leida, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data || []) as Notif[]);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    const interval = setInterval(load, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.id]);

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase
      .from("notificaciones")
      .update({ leida: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("leida", false);
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
  };

  const handleClick = async (n: Notif) => {
    if (!n.leida) {
      await supabase.from("notificaciones").update({ leida: true, read_at: new Date().toISOString() }).eq("id", n.id);
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, leida: true } : it)));
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold flex items-center justify-center rounded-full"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-semibold">Notificaciones</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllRead}>
              <CheckCheck className="h-3 w-3" />
              Marcar leídas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sin notificaciones</div>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex gap-2.5",
                    !n.leida && "bg-muted/30",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full mt-1.5 flex-shrink-0", TIPO_COLOR[n.tipo] || TIPO_COLOR.info)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-tight", !n.leida && "font-semibold")}>{n.titulo}</p>
                    {n.mensaje && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensaje}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}