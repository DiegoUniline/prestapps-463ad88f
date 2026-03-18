import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Register service worker only in production to avoid dev preview cache/runtime conflicts
if (import.meta.env.PROD) {
  registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new Event("app:sw-update-available"));
    },
    onOfflineReady() {
      console.log("PrestApp lista para uso offline");
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
