import { create } from "zustand";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "supervisor" | "cobrador";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole;
  roleLoading: boolean;
  profileId: string | null;
  cobradorId: string | null;
  rutaIds: string[];
  inactivityTimer: ReturnType<typeof setTimeout> | null;

  initialize: () => () => void;
  signOut: () => Promise<void>;
  fetchRole: (userId: string) => Promise<void>;
  resetInactivityTimer: () => void;
}

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  role: "admin",
  roleLoading: true,
  profileId: null,
  cobradorId: null,
  rutaIds: [],
  inactivityTimer: null,

  initialize: () => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        set({ session, user: session?.user ?? null, loading: false });
        if (session?.user) {
          // Defer role fetch to avoid Supabase deadlock
          setTimeout(() => get().fetchRole(session.user.id), 0);
          get().resetInactivityTimer();
        } else {
          set({ role: "admin", roleLoading: false, cobradorId: null, rutaIds: [] });
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false });
      if (session?.user) {
        get().fetchRole(session.user.id);
        get().resetInactivityTimer();
      } else {
        set({ roleLoading: false });
      }
    });

    // Activity listeners for inactivity timeout
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    const handler = () => get().resetInactivityTimer();
    events.forEach((e) => document.addEventListener(e, handler, { passive: true }));

    return () => {
      subscription.unsubscribe();
      events.forEach((e) => document.removeEventListener(e, handler));
      const timer = get().inactivityTimer;
      if (timer) clearTimeout(timer);
    };
  },

  signOut: async () => {
    const timer = get().inactivityTimer;
    if (timer) clearTimeout(timer);
    try {
      await supabase.auth.signOut();
    } catch {
      // Force clear
    }
    set({ session: null, user: null, role: "admin", cobradorId: null, rutaIds: [], inactivityTimer: null });
  },

  fetchRole: async (userId: string) => {
    set({ roleLoading: true });
    try {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const roles = (roleRows || []).map((r) => r.role as AppRole);
      const role: AppRole = roles.includes("admin")
        ? "admin"
        : roles.includes("supervisor")
        ? "supervisor"
        : roles.includes("cobrador")
        ? "cobrador"
        : "admin";

      let cobradorId: string | null = null;
      let rutaIds: string[] = [];

      if (role === "cobrador") {
        const { data } = await supabase.rpc("get_cobrador_by_user", { p_user_id: userId });
        if (data && Array.isArray(data) && data.length > 0) {
          cobradorId = (data[0] as { id: string }).id;
        }
        if (cobradorId) {
          const { data: rutaData } = await supabase
            .from("rutas")
            .select("id")
            .eq("cobrador_id", cobradorId);
          rutaIds = (rutaData || []).map((r) => r.id);
        }
      }

      if (role === "supervisor") {
        const { data: supData } = await supabase
          .from("supervisor_rutas")
          .select("ruta_id")
          .eq("supervisor_id", userId);
        rutaIds = (supData || []).map((r) => r.ruta_id);
      }

      set({ role, profileId: userId, cobradorId, rutaIds, roleLoading: false });
    } catch {
      set({ role: "admin", roleLoading: false });
    }
  },

  resetInactivityTimer: () => {
    const prev = get().inactivityTimer;
    if (prev) clearTimeout(prev);
    if (!get().user) return;

    const timer = setTimeout(() => {
      if (get().user) {
        get().signOut();
      }
    }, INACTIVITY_TIMEOUT);
    set({ inactivityTimer: timer });
  },
}));
