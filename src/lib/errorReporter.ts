import { rpc } from "@/lib/supabaseQuery";

/** Bump on notable releases; the entry chunk hash below identifies the exact build. */
const APP_RELEASE = "2026.10.13";

const DEDUPE_MS = 60_000;
const MAX_PER_SESSION = 50;

const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  // Chunk de un deploy anterior: lazyPage en App.tsx ya recarga la página
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Unable to preload CSS/i,
];

const NETWORK = /Failed to fetch|NetworkError when attempting to fetch|Load failed|Network request failed/i;

const recent = new Map<string, number>();
let sent = 0;
let version: string | null = null;

function appVersion(): string {
  if (version) return version;
  let build = "";
  try {
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
    build = entry?.src.split("/").pop()?.replace(/\.js$/, "") || "";
  } catch { /* sin DOM */ }
  version = [import.meta.env.MODE, APP_RELEASE, build].filter(Boolean).join(":");
  return version;
}

function normalize(error: unknown): { mensaje: string; stack: string | null; extra: Record<string, unknown> } {
  if (error instanceof Error) {
    return { mensaje: `${error.name && error.name !== "Error" ? error.name + ": " : ""}${error.message}`, stack: error.stack || null, extra: {} };
  }
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown; stack?: unknown };
    if (typeof e.message === "string") {
      const extra: Record<string, unknown> = {};
      if (e.code) extra.code = e.code;
      if (e.details) extra.details = e.details;
      if (e.hint) extra.hint = e.hint;
      return { mensaje: e.message, stack: typeof e.stack === "string" ? e.stack : null, extra };
    }
    try {
      return { mensaje: JSON.stringify(error).slice(0, 1000), stack: null, extra: {} };
    } catch { /* circular */ }
  }
  return { mensaje: String(error), stack: null, extra: {} };
}

/** Sends an error to public.client_errors via RPC. Never throws. */
export function reportError(error: unknown, extra: Record<string, unknown> = {}): void {
  try {
    const n = normalize(error);
    const mensaje = n.mensaje.trim();
    if (!mensaje || IGNORED.some((re) => re.test(mensaje))) return;
    if (NETWORK.test(mensaje) && typeof navigator !== "undefined" && !navigator.onLine) return;

    const now = Date.now();
    const last = recent.get(mensaje);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(mensaje, now);
    if (recent.size > 200) {
      for (const [k, t] of recent) if (now - t >= DEDUPE_MS) recent.delete(k);
    }

    if (sent >= MAX_PER_SESSION) return;
    sent++;

    if (import.meta.env.DEV) {
      console.error("[errorReporter]", error, extra);
      return;
    }

    const payload = { ...n.extra, ...extra };
    rpc("log_client_error", {
      p_mensaje: mensaje.slice(0, 1000),
      p_stack: n.stack ? n.stack.slice(0, 8000) : null,
      p_url: window.location.origin + window.location.pathname,
      p_user_agent: navigator.userAgent.slice(0, 400),
      p_version: appVersion(),
      p_extra: Object.keys(payload).length ? payload : null,
    }).then(undefined, () => { /* nunca propagar */ });
  } catch { /* nunca propagar */ }
}

let installed = false;

/** Global handlers for uncaught errors and unhandled promise rejections. */
export function installErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev: ErrorEvent) => {
    reportError(ev.error ?? ev.message, {
      source: "window.onerror",
      ...(ev.filename ? { file: `${ev.filename}:${ev.lineno}:${ev.colno}` } : {}),
    });
  });
  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    reportError(ev.reason, { source: "unhandledrejection" });
  });
}

