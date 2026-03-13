// Compatibility layer — bridges old Context API to Zustand stores

import { useUIStore } from "@/stores/uiStore";

export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  return { theme, toggleTheme };
}
