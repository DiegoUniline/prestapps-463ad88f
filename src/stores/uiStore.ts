import { create } from "zustand";

type Theme = "light" | "dark";

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  isOnline: boolean;

  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setSidebarCollapsed: (v: boolean) => void;
  initializeUI: () => () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: (localStorage.getItem("prestapp-theme") === "dark" ? "dark" : "light") as Theme,
  sidebarCollapsed: false,
  isOnline: navigator.onLine,

  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    set({ theme: next });
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    localStorage.setItem("prestapp-theme", next);
  },

  setTheme: (t: Theme) => {
    set({ theme: t });
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);
    localStorage.setItem("prestapp-theme", t);
  },

  setSidebarCollapsed: (v: boolean) => set({ sidebarCollapsed: v }),

  initializeUI: () => {
    // Apply initial theme
    const t = get().theme;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);

    // Online/offline listeners
    const online = () => set({ isOnline: true });
    const offline = () => set({ isOnline: false });
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  },
}));
