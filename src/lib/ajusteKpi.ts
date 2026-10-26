// Reduce el tamaño de letra de cada .kpi-num hasta que su contenido quepa en el ancho disponible.
// Nunca agranda: el tamaño original (clases de Tailwind) es el máximo.
const MIN_PX = 11;

function ajustar(el: HTMLElement) {
  el.style.fontSize = "";
  const disponible = el.clientWidth;
  const necesario = el.scrollWidth;
  if (!disponible || necesario <= disponible + 0.5) return;
  const base = parseFloat(getComputedStyle(el).fontSize);
  el.style.fontSize = `${Math.max(MIN_PX, Math.floor((base * disponible * 10) / necesario) / 10)}px`;
}

export function instalarAjusteKpi() {
  if (typeof window === "undefined" || !("ResizeObserver" in window)) return;

  const pendientes = new Set<HTMLElement>();
  let frame = 0;
  const programar = (el: HTMLElement) => {
    pendientes.add(el);
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const lote = [...pendientes];
        pendientes.clear();
        lote.forEach((e) => e.isConnected && ajustar(e));
      });
    }
  };

  const ro = new ResizeObserver((entries) => entries.forEach((e) => programar(e.target as HTMLElement)));
  const observados = new WeakSet<HTMLElement>();
  const registrar = (el: HTMLElement) => {
    if (!observados.has(el)) {
      observados.add(el);
      ro.observe(el);
    }
    programar(el);
  };
  const buscar = (raiz: ParentNode) => {
    if (raiz instanceof HTMLElement && raiz.classList.contains("kpi-num")) registrar(raiz);
    raiz.querySelectorAll?.<HTMLElement>(".kpi-num").forEach(registrar);
  };

  new MutationObserver((muts) => {
    for (const m of muts) {
      const nodo = m.target instanceof HTMLElement ? m.target : m.target.parentElement;
      const kpi = nodo?.closest<HTMLElement>(".kpi-num");
      if (kpi) programar(kpi);
      m.addedNodes.forEach((n) => n instanceof HTMLElement && buscar(n));
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  buscar(document);
  document.fonts?.ready.then(() => document.querySelectorAll<HTMLElement>(".kpi-num").forEach(programar));
}
