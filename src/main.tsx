import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Register service worker — prompt user for updates
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("Hay una nueva versión disponible. ¿Actualizar ahora?")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("PrestApp lista para uso offline");
  },
});

createRoot(document.getElementById("root")!).render(<App />);
