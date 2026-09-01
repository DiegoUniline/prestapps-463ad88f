import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import logoFull from "@/assets/logo-full.png";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  CreditCard,
  FileCheck2,
  Fingerprint,
  Gauge,
  HandCoins,
  Landmark,
  LockKeyhole,
  MapPinned,
  MessageCircle,
  MousePointerClick,
  ReceiptText,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  WalletCards,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import "./landing.css";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

type Tour = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
  secondary: string;
  secondaryLabel: string;
  color: string;
  bars: number[];
};

const tours: Tour[] = [
  {
    id: "rentabilidad",
    label: "Rentabilidad",
    eyebrow: "Resultado real",
    title: "Lo cobrado no es lo mismo que lo ganado.",
    description: "PrestApp cruza intereses, gastos, atrasos y movimientos de caja para mostrarte la utilidad real del negocio.",
    metric: "$84,320",
    metricLabel: "Utilidad estimada",
    secondary: "20.1%",
    secondaryLabel: "Margen neto",
    color: "#f0144d",
    bars: [38, 46, 42, 55, 61, 58, 72, 76, 83, 92],
  },
  {
    id: "cobranza",
    label: "Cobranza",
    eyebrow: "Hoy",
    title: "Cada cobrador sabe a quién visitar y cuánto recuperar.",
    description: "Rutas claras, cuotas vencidas, promesas y pagos registrados desde el celular, incluso sin internet.",
    metric: "$42,850",
    metricLabel: "Meta de cobranza",
    secondary: "78%",
    secondaryLabel: "Recuperado hoy",
    color: "#2dd4bf",
    bars: [28, 44, 52, 48, 67, 74, 71, 82, 88, 78],
  },
  {
    id: "riesgo",
    label: "Riesgo",
    eyebrow: "Cartera vigilada",
    title: "Detecta el problema antes de que se convierta en pérdida.",
    description: "Mora, promesas incumplidas y clientes con señales de riesgo aparecen primero, no cuando ya es demasiado tarde.",
    metric: "$63,200",
    metricLabel: "Cartera en atención",
    secondary: "12",
    secondaryLabel: "Alertas prioritarias",
    color: "#f59e0b",
    bars: [76, 68, 72, 61, 58, 50, 46, 39, 34, 26],
  },
  {
    id: "campo",
    label: "Operación",
    eyebrow: "Trazabilidad",
    title: "Sabes qué pasó, quién lo hizo y desde dónde.",
    description: "GPS, hora, usuario, recibo y movimiento de caja quedan conectados en una sola operación auditable.",
    metric: "186",
    metricLabel: "Operaciones verificadas",
    secondary: "100%",
    secondaryLabel: "Con trazabilidad",
    color: "#60a5fa",
    bars: [42, 55, 51, 66, 62, 75, 71, 84, 88, 96],
  },
];

const modules: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  size: "large" | "normal";
  visual: ReactNode;
}> = [
  {
    icon: MessageCircle,
    title: "WhatsApp trabaja aunque tú no estés",
    description: "Recordatorios, avisos y recibos salen automáticamente en el momento correcto.",
    size: "large",
    visual: (
      <div className="landing-chat-stack" aria-hidden="true">
        <div className="landing-chat is-client">¿Cuánto me toca pagar hoy?</div>
        <div className="landing-chat is-system">
          <span className="landing-chat-check">✓</span>
          Tu cuota es de $1,250. Puedes consultar tu recibo aquí.
        </div>
        <div className="landing-chat-status"><span /> Entregado automáticamente</div>
      </div>
    ),
  },
  {
    icon: MapPinned,
    title: "Cobranza con evidencia",
    description: "Ubicación, hora y cobrador vinculados a cada pago.",
    size: "normal",
    visual: (
      <div className="landing-map" aria-hidden="true">
        <span className="landing-map-road road-one" />
        <span className="landing-map-road road-two" />
        <span className="landing-map-pin pin-one"><span /></span>
        <span className="landing-map-pin pin-two"><span /></span>
        <span className="landing-map-pin pin-three"><span /></span>
      </div>
    ),
  },
  {
    icon: WifiOff,
    title: "Funciona sin señal",
    description: "La operación continúa y se sincroniza al recuperar internet.",
    size: "normal",
    visual: (
      <div className="landing-sync" aria-hidden="true">
        <div className="landing-sync-phone"><CheckCircle2 /></div>
        <div className="landing-sync-dots"><i /><i /><i /></div>
        <Cloud className="landing-sync-cloud" />
      </div>
    ),
  },
  {
    icon: Target,
    title: "Riesgo visible, decisiones mejores",
    description: "Scoring, mora y comportamiento de pago reunidos en una lectura clara.",
    size: "large",
    visual: (
      <div className="landing-risk" aria-hidden="true">
        {["Puntual", "Atención", "Crítico"].map((label, index) => (
          <div key={label} className="landing-risk-row">
            <span>{label}</span>
            <div><i style={{ width: `${[82, 48, 21][index]}%` }} /></div>
            <b>{[128, 23, 6][index]}</b>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: ReceiptText,
    title: "Documentos sin retrabajo",
    description: "Contratos, tablas, recibos y estados de cuenta listos para enviar.",
    size: "normal",
    visual: (
      <div className="landing-documents" aria-hidden="true">
        <span><FileCheck2 /></span><span><ReceiptText /></span><span><ShieldCheck /></span>
      </div>
    ),
  },
  {
    icon: Landmark,
    title: "Una vista para cada empresa",
    description: "Cajas, equipos y resultados separados, con control central.",
    size: "normal",
    visual: (
      <div className="landing-companies" aria-hidden="true">
        <span>A</span><span>B</span><span>C</span><i />
      </div>
    ),
  },
];

const plans = [
  {
    name: "Básico",
    price: "$2,300",
    description: "Para una operación pequeña que quiere dejar la libreta.",
    users: "Hasta 3 usuarios",
    features: ["Gestión de préstamos", "Cobranza diaria", "Dashboard y KPIs", "Tickets y contratos", "Modo offline"],
    highlight: false,
  },
  {
    name: "Profesional",
    price: "$4,500",
    description: "Para financieras que necesitan control y crecimiento.",
    users: "Hasta 10 usuarios",
    features: ["Todo lo del plan Básico", "WhatsApp automatizado", "Mapa GPS", "Reportes avanzados", "CRM, scoring y comisiones"],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "A cotizar",
    description: "Para grupos con varias empresas y operación avanzada.",
    users: "Hasta 20 usuarios",
    features: ["Empresas ilimitadas", "Cobros con Stripe", "Auditoría completa", "Permisos granulares", "Soporte prioritario"],
    highlight: false,
  },
];

const flowSteps = [
  { icon: MousePointerClick, label: "Pago registrado", detail: "Desde el celular" },
  { icon: WalletCards, label: "Caja actualizada", detail: "Sin captura doble" },
  { icon: MessageCircle, label: "Recibo enviado", detail: "Por WhatsApp" },
  { icon: BarChart3, label: "Resultado listo", detail: "En tiempo real" },
];

export default function LandingPage() {
  const [activeTour, setActiveTour] = useState(tours[0]);

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-container landing-nav-inner">
          <a href="#inicio" className="landing-brand" aria-label="PrestApp, ir al inicio">
            <img src={logoFull} alt="PrestApp" />
          </a>
          <div className="landing-nav-links">
            <a href="#control">Control</a>
            <a href="#modulos">Módulos</a>
            <a href="#automatizacion">Automatización</a>
            <a href="#precios">Planes</a>
          </div>
          <div className="landing-nav-actions">
            <Link to="/login" className="landing-login">Iniciar sesión</Link>
            <Link to="/registro">
              <Button className="landing-pill landing-pill-small">Probar gratis <ArrowRight /></Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section id="inicio" className="landing-hero">
          <div className="landing-hero-grid" aria-hidden="true" />
          <div className="landing-hero-glow glow-one" aria-hidden="true" />
          <div className="landing-hero-glow glow-two" aria-hidden="true" />

          <div className="landing-container landing-hero-content">
            <div className="landing-hero-copy">
              <div className="landing-kicker"><span /><Sparkles /> Control financiero para prestamistas</div>
              <h1>
                Tu dinero deja de ser una <em>suposición.</em>
              </h1>
              <p>
                PrestApp te muestra cuánto ganas, cuánto tienes en la calle y dónde se está fugando el dinero. Todo conectado, todo comprobable.
              </p>
              <div className="landing-hero-actions">
                <Link to="/registro">
                  <Button className="landing-pill landing-pill-primary">Tomar el control <ArrowRight /></Button>
                </Link>
                <a href="#control" className="landing-text-link">Ver el sistema <span><ChevronRight /></span></a>
              </div>
              <div className="landing-hero-proof">
                <div className="landing-avatar-stack" aria-hidden="true"><span>D</span><span>M</span><span>J</span></div>
                <div><strong>7 días para comprobarlo</strong><small>Configuración acompañada · Sin compromiso</small></div>
              </div>
            </div>

            <div className="landing-command-wrap" aria-label="Vista ilustrativa del centro de control PrestApp">
              <div className="landing-float-note note-one">
                <CheckCircle2 /><div><b>Pago confirmado</b><span>La caja ya se actualizó</span></div>
              </div>
              <div className="landing-float-note note-two">
                <BellRing /><div><b>Riesgo detectado</b><span>3 promesas vencen hoy</span></div>
              </div>

              <div className="landing-command">
                <div className="landing-command-top">
                  <div className="landing-command-dots"><i /><i /><i /></div>
                  <div className="landing-command-title"><Fingerprint /> PrestApp Control</div>
                  <div className="landing-live"><span /> En vivo</div>
                </div>
                <div className="landing-command-body">
                  <aside className="landing-command-side" aria-hidden="true">
                    <div className="is-active"><Gauge /></div><div><HandCoins /></div><div><Users /></div><div><Route /></div><div><BarChart3 /></div>
                  </aside>
                  <div className="landing-command-main">
                    <div className="landing-command-heading">
                      <div><small>Martes, 1 de septiembre</small><strong>Así está tu negocio hoy</strong></div>
                      <button type="button" aria-label="Ver notificaciones"><BellRing /></button>
                    </div>
                    <div className="landing-metric-grid">
                      <div className="landing-metric is-main">
                        <div><span>Utilidad real</span><b>$84,320</b></div>
                        <small><TrendingUp /> +18.4% este mes</small>
                      </div>
                      <div className="landing-metric"><span>Capital en calle</span><b>$1.24M</b><small>186 préstamos activos</small></div>
                      <div className="landing-metric"><span>Por cobrar hoy</span><b>$42,850</b><small>78% recuperado</small></div>
                    </div>
                    <div className="landing-command-bottom">
                      <div className="landing-chart-card">
                        <div><span>Recuperación semanal</span><b>$198,420</b></div>
                        <svg viewBox="0 0 520 150" role="img" aria-label="Gráfica de recuperación semanal ascendente">
                          <defs>
                            <linearGradient id="heroChart" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f0144d" stopOpacity=".38" />
                              <stop offset="100%" stopColor="#f0144d" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path className="landing-chart-area" d="M0,126 C45,112 58,118 95,95 C132,72 153,100 192,79 C230,58 247,66 284,48 C322,29 350,62 391,35 C432,8 474,28 520,10 L520,150 L0,150 Z" />
                          <path className="landing-chart-line" d="M0,126 C45,112 58,118 95,95 C132,72 153,100 192,79 C230,58 247,66 284,48 C322,29 350,62 391,35 C432,8 474,28 520,10" />
                          <circle className="landing-chart-point" cx="520" cy="10" r="5" />
                        </svg>
                      </div>
                      <div className="landing-alert-card">
                        <div className="landing-alert-head"><span>Atención</span><b>3</b></div>
                        <div><i className="is-red" /><span><b>$12,460</b><small>En mora</small></span></div>
                        <div><i className="is-amber" /><span><b>6 clientes</b><small>Promesa por vencer</small></span></div>
                        <div><i className="is-blue" /><span><b>2 diferencias</b><small>Por revisar</small></span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="landing-marquee" aria-label="Principales capacidades">
            <div className="landing-marquee-track">
              {[...Array(2)].flatMap((_, duplicate) => [
                "Rentabilidad real", "Cobranza en campo", "Control de cajas", "Alertas de riesgo", "WhatsApp automático", "GPS y auditoría", "Modo offline",
              ].map((item) => <span key={`${duplicate}-${item}`}><i /> {item}</span>))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-truth-section">
          <div className="landing-container">
            <Reveal className="landing-section-heading landing-section-heading-center">
              <span className="landing-section-label">La diferencia</span>
              <h2>Cobrar mucho no significa <em>ganar bien.</em></h2>
              <p>PrestApp convierte movimientos sueltos en una respuesta clara.</p>
            </Reveal>

            <div className="landing-equation">
              <Reveal className="landing-equation-card is-noise" delay={50}>
                <div className="landing-equation-icon"><CircleDollarSign /></div>
                <span>Lo que normalmente ves</span>
                <strong>$420,000</strong>
                <small>Total cobrado</small>
                <div className="landing-noise-lines"><i /><i /><i /><i /></div>
              </Reveal>
              <div className="landing-equation-symbol" aria-hidden="true">≠</div>
              <Reveal className="landing-equation-card is-control" delay={140}>
                <div className="landing-equation-icon"><TrendingUp /></div>
                <span>Lo que necesitas saber</span>
                <strong>$84,320</strong>
                <small>Utilidad después de gastos y riesgo</small>
                <div className="landing-profit-ring"><span>20.1%</span></div>
              </Reveal>
            </div>

            <div className="landing-answer-grid">
              {[
                [WalletCards, "¿Dónde está mi dinero?", "Cartera, cajas y capital en la calle."],
                [TrendingUp, "¿Cuánto estoy ganando?", "Utilidad y margen, no solo cobranza."],
                [ShieldCheck, "¿Qué está en riesgo?", "Mora, fugas y diferencias detectadas."],
              ].map(([Icon, title, text], index) => {
                const AnswerIcon = Icon as LucideIcon;
                return (
                  <Reveal className="landing-answer" delay={index * 80} key={title as string}>
                    <AnswerIcon /><div><strong>{title as string}</strong><span>{text as string}</span></div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section id="control" className="landing-section landing-tour-section">
          <div className="landing-container">
            <Reveal className="landing-section-heading landing-section-heading-split">
              <div><span className="landing-section-label">Centro de control</span><h2>Una pantalla. <em>Cero puntos ciegos.</em></h2></div>
              <p>Cambia la vista y descubre cómo PrestApp convierte cada parte de la operación en una decisión.</p>
            </Reveal>

            <div className="landing-tour-tabs" role="tablist" aria-label="Vistas del centro de control">
              {tours.map((tour) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTour.id === tour.id}
                  className={activeTour.id === tour.id ? "is-active" : ""}
                  onClick={() => setActiveTour(tour)}
                  key={tour.id}
                >
                  <span>{tour.label}</span><i />
                </button>
              ))}
            </div>

            <div className="landing-tour-panel" style={{ "--tour-color": activeTour.color } as React.CSSProperties}>
              <div className="landing-tour-copy" key={`${activeTour.id}-copy`}>
                <span>{activeTour.eyebrow}</span>
                <h3>{activeTour.title}</h3>
                <p>{activeTour.description}</p>
                <div className="landing-tour-feature"><CheckCircle2 /> Información conectada y actualizada</div>
                <div className="landing-tour-feature"><CheckCircle2 /> Alertas que indican qué atender primero</div>
              </div>
              <div className="landing-tour-ui" key={`${activeTour.id}-ui`}>
                <div className="landing-tour-ui-head"><div><i /><i /><i /></div><span>Resumen de operación</span><b><span /> En vivo</b></div>
                <div className="landing-tour-ui-body">
                  <div className="landing-tour-numbers">
                    <div><span>{activeTour.metricLabel}</span><strong>{activeTour.metric}</strong><small><TrendingUp /> Actualizado ahora</small></div>
                    <div><span>{activeTour.secondaryLabel}</span><strong>{activeTour.secondary}</strong><small>Vs. periodo anterior</small></div>
                  </div>
                  <div className="landing-tour-bars" aria-label={`Visualización de ${activeTour.label}`}>
                    {activeTour.bars.map((bar, index) => <i key={index} style={{ height: `${bar}%`, animationDelay: `${index * 35}ms` }} />)}
                  </div>
                  <div className="landing-tour-legend"><span><i /> Resultado</span><b>Últimos 10 periodos</b></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modulos" className="landing-section landing-modules-section">
          <div className="landing-container">
            <Reveal className="landing-section-heading landing-section-heading-split">
              <div><span className="landing-section-label">El sistema completo</span><h2>No son módulos sueltos. <em>Todo se conecta.</em></h2></div>
              <p>Cada acción alimenta la siguiente. Menos captura, menos errores y más control.</p>
            </Reveal>

            <div className="landing-bento">
              {modules.map((module, index) => (
                <Reveal className={`landing-bento-card ${module.size === "large" ? "is-large" : ""}`} delay={(index % 3) * 70} key={module.title}>
                  <div className="landing-bento-top"><span><module.icon /></span><ChevronRight /></div>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                  {module.visual}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="automatizacion" className="landing-section landing-flow-section">
          <div className="landing-flow-glow" aria-hidden="true" />
          <div className="landing-container">
            <Reveal className="landing-section-heading landing-section-heading-center is-light">
              <span className="landing-section-label">Automatización real</span>
              <h2>Una acción. <em>Todo lo demás sucede.</em></h2>
              <p>PrestApp elimina pasos manuales sin quitarte el control.</p>
            </Reveal>

            <div className="landing-flow">
              <div className="landing-flow-line" aria-hidden="true"><i /></div>
              {flowSteps.map((step, index) => (
                <Reveal className="landing-flow-step" delay={index * 100} key={step.label}>
                  <div><step.icon /></div><strong>{step.label}</strong><span>{step.detail}</span>
                </Reveal>
              ))}
            </div>

            <Reveal className="landing-automation-card">
              <div className="landing-automation-visual" aria-hidden="true">
                <div className="landing-auto-center"><Zap /><span>PrestApp</span></div>
                <div className="landing-auto-node node-a"><MessageCircle /></div>
                <div className="landing-auto-node node-b"><CreditCard /></div>
                <div className="landing-auto-node node-c"><BellRing /></div>
                <div className="landing-auto-node node-d"><ReceiptText /></div>
                <div className="landing-auto-orbit orbit-one" />
                <div className="landing-auto-orbit orbit-two" />
              </div>
              <div className="landing-automation-copy">
                <span className="landing-section-label">Trabaja en segundo plano</span>
                <h3>El sistema hace seguimiento incluso cuando tú no estás mirando.</h3>
                <div className="landing-auto-list">
                  <span><Check /> Recordatorios antes del vencimiento</span>
                  <span><Check /> Alertas cuando algo necesita atención</span>
                  <span><Check /> Recibos enviados al registrar el pago</span>
                  <span><Check /> Reportes listos sin volver a capturar</span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="landing-section landing-security-section">
          <div className="landing-container landing-security-grid">
            <Reveal className="landing-security-copy">
              <span className="landing-section-label">Control que sí puedes comprobar</span>
              <h2>Cada peso deja <em>huella.</em></h2>
              <p>PrestApp registra quién hizo cada movimiento, cuándo ocurrió y cómo impactó la operación.</p>
              <div className="landing-security-items">
                <span><Fingerprint /> Usuario y hora</span><span><MapPinned /> Ubicación GPS</span><span><LockKeyhole /> Permisos por rol</span><span><FileCheck2 /> Historial auditable</span>
              </div>
            </Reveal>
            <Reveal className="landing-audit-card" delay={100}>
              <div className="landing-audit-head"><div><ShieldCheck /></div><span><strong>Auditoría activa</strong><small>Todos los movimientos protegidos</small></span><b>100%</b></div>
              {[
                ["Pago #PA-1842", "Mariana · 11:42", "+ $1,250"],
                ["Salida de caja", "Administrador · 10:18", "- $640"],
                ["Préstamo #PR-0918", "Diego · 09:56", "+ $12,000"],
              ].map((row, index) => (
                <div className="landing-audit-row" key={row[0]}><i className={`audit-${index}`} /><span><strong>{row[0]}</strong><small>{row[1]}</small></span><b>{row[2]}</b><CheckCircle2 /></div>
              ))}
              <div className="landing-audit-scan" />
            </Reveal>
          </div>
        </section>

        <section id="precios" className="landing-section landing-pricing-section">
          <div className="landing-container">
            <Reveal className="landing-section-heading landing-section-heading-center">
              <span className="landing-section-label">Planes claros</span>
              <h2>Empieza con control. <em>Crece sin perderlo.</em></h2>
              <p>Precios mensuales en pesos mexicanos. Sin contratos forzosos.</p>
            </Reveal>

            <div className="landing-pricing-grid">
              {plans.map((plan, index) => (
                <Reveal className={`landing-plan ${plan.highlight ? "is-highlight" : ""}`} delay={index * 80} key={plan.name}>
                  {plan.highlight && <div className="landing-popular"><Sparkles /> Más elegido</div>}
                  <span className="landing-plan-name">{plan.name}</span>
                  <p>{plan.description}</p>
                  <div className="landing-plan-price"><strong>{plan.price}</strong>{plan.price !== "A cotizar" && <span>/mes</span>}</div>
                  <div className="landing-plan-users">{plan.users}</div>
                  <div className="landing-plan-features">
                    {plan.features.map((feature) => <span key={feature}><i><Check /></i>{feature}</span>)}
                  </div>
                  <Link to={plan.name === "Enterprise" ? "/#contacto" : "/registro"}>
                    <Button className={`landing-plan-button ${plan.highlight ? "is-primary" : ""}`}>{plan.name === "Enterprise" ? "Hablar con ventas" : "Probar 7 días"}<ArrowRight /></Button>
                  </Link>
                </Reveal>
              ))}
            </div>
            <p className="landing-pricing-note">IVA no incluido. Los clientes activos conservan las condiciones de su contrato actual.</p>
          </div>
        </section>

        <section className="landing-final-cta">
          <div className="landing-final-grid" aria-hidden="true" />
          <div className="landing-final-orb" aria-hidden="true" />
          <div className="landing-container landing-final-content">
            <Reveal>
              <span className="landing-section-label">Tu siguiente decisión</span>
              <h2>El dinero que no controlas<br /><em>también te cuesta.</em></h2>
              <p>Deja de operar con estimaciones. Conoce tus números y actúa a tiempo.</p>
              <div className="landing-final-actions">
                <Link to="/registro"><Button className="landing-pill landing-pill-primary">Probar PrestApp gratis <ArrowRight /></Button></Link>
                <a href="https://wa.me/523171035768" target="_blank" rel="noreferrer" className="landing-whatsapp-link"><MessageCircle /> Solicitar una demostración</a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer id="contacto" className="landing-footer">
        <div className="landing-container landing-footer-grid">
          <div><a href="#inicio" className="landing-brand"><img src={logoFull} alt="PrestApp" /></a><p>Control financiero y cobranza para negocios de préstamos.</p></div>
          <div><strong>Producto</strong><a href="#control">Centro de control</a><a href="#modulos">Módulos</a><a href="#precios">Planes</a></div>
          <div><strong>Contacto</strong><a href="tel:3171035768">317 103 5768</a><a href="mailto:soporte@uniline.mx">soporte@uniline.mx</a><span>uniline.mx</span></div>
          <div><strong>Acceso</strong><Link to="/login">Iniciar sesión</Link><Link to="/registro">Crear cuenta</Link></div>
        </div>
        <div className="landing-container landing-footer-bottom"><span>© {new Date().getFullYear()} PrestApp</span><span>Desarrollado por Uniline — Innovación en la Nube</span></div>
      </footer>
    </div>
  );
}
