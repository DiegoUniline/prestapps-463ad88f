import { Link } from "react-router-dom";
import logoFull from "@/assets/logo-full.png";
import logoIcon from "@/assets/logo-icon.png";
import screenshotDashboard from "@/assets/screenshots/dashboard.jpg";
import screenshotWhatsapp from "@/assets/screenshots/whatsapp.jpg";
import screenshotCobranza from "@/assets/screenshots/cobranza.jpg";
import screenshotStripe from "@/assets/screenshots/stripe.jpg";
import screenshotMapa from "@/assets/screenshots/mapa.jpg";
import screenshotReportes from "@/assets/screenshots/reportes.jpg";
import {
  CreditCard, Users, Wallet, Route, FileText, HandCoins,
  CalendarCheck, Settings, MessageSquare, Star, Percent, MapPin,
  ClipboardList, ShieldCheck, Bell, RefreshCw, PieChart, ScrollText,
  Smartphone, Cloud, Lock, BarChart3, Zap, ArrowRight, CheckCircle2,
  Phone, Mail, Globe, ChevronDown, Receipt, Building2, TrendingUp,
  Wifi, WifiOff, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ─── Showcase Modules ─── */
const showcaseModules = [
  {
    id: "dashboard",
    title: "Dashboard en Tiempo Real",
    desc: "Visualiza toda tu operación de un vistazo: KPIs de cartera, cobranza del día, préstamos vencidos, gráficas de rendimiento y alertas. Todo actualizado al segundo.",
    img: screenshotDashboard,
    reverse: false,
  },
  {
    id: "cobranza",
    title: "Cobranza Diaria Inteligente",
    desc: "Tus cobradores ven su ruta del día desde el celular. Registran pagos con un toque, capturan ubicación GPS automáticamente y generan tickets al instante. Adiós a las libretas.",
    img: screenshotCobranza,
    reverse: true,
  },
  {
    id: "mapa",
    title: "Mapa GPS de Operaciones",
    desc: "Audita que las operaciones se realicen donde deben. Visualiza en un mapa interactivo los puntos de registro de préstamos, cobros y domicilios de clientes para prevenir fraudes.",
    img: screenshotMapa,
    reverse: false,
  },
  {
    id: "reportes",
    title: "Reportes y Análisis Profundo",
    desc: "Reportes de cartera, morosidad, rentabilidad, comisiones por cobrador, y más. Exporta a PDF y Excel. Toma decisiones con datos, no con corazonadas.",
    img: screenshotReportes,
    reverse: true,
  },
];

/* ─── Features Grid ─── */
const features = [
  { icon: CreditCard, title: "Préstamos Completos", desc: "Modalidad fija o sobre saldos insolutos, tablas de amortización automáticas, mora calculada." },
  { icon: HandCoins, title: "Cobranza en Campo", desc: "Registro de pagos desde el celular con GPS, tickets PDF y sincronización offline." },
  { icon: Users, title: "Clientes 360°", desc: "Historial crediticio, scoring, documentos, fotos, préstamos activos en un solo lugar." },
  { icon: Wallet, title: "Control de Cajas", desc: "Múltiples cajas, entradas, salidas, movimientos vinculados. Saldos en tiempo real." },
  { icon: Route, title: "Rutas Organizadas", desc: "Organiza cartera por zonas, asigna cobradores, monitorea rendimiento por ruta." },
  { icon: CalendarCheck, title: "Promesas de Pago", desc: "Registra y da seguimiento a promesas con alertas automáticas de vencimiento." },
  { icon: Receipt, title: "Tickets y Contratos", desc: "PDF personalizables con logo, campos configurables. Se generan automáticamente." },
  { icon: Star, title: "Lead Scoring", desc: "Califica clientes por comportamiento de pago. Préstamos más seguros." },
  { icon: Percent, title: "Comisiones Automáticas", desc: "Calcula comisiones por cobro, por préstamo, y bonos por meta. Sin errores." },
  { icon: RefreshCw, title: "Renovación y Reestructura", desc: "Renueva préstamos o reestructura deudas en pocos clics." },
  { icon: ClipboardList, title: "Solicitudes de Préstamo", desc: "Flujo de aprobación: solicita → aprueba → desembolsa. Auditoría completa." },
  { icon: ShieldCheck, title: "Roles y Permisos", desc: "Admin, Supervisor, Cobrador con permisos granulares por módulo." },
  { icon: Bell, title: "Alertas Inteligentes", desc: "Notificaciones de vencimientos, promesas, metas y eventos del sistema." },
  { icon: ScrollText, title: "Auditoría Total", desc: "Quién hizo qué, cuándo, desde dónde. Transparencia total." },
  { icon: Building2, title: "Multi-Empresa", desc: "Gestiona varias empresas desde una sola cuenta." },
  { icon: WifiOff, title: "Modo Offline", desc: "Funciona sin internet. Los datos se sincronizan al reconectar." },
];

/* ─── Pricing ─── */
const plans = [
  {
    name: "Básico",
    price: "$2,300",
    period: "/mes",
    desc: "Para operaciones pequeñas que están iniciando",
    users: "Hasta 3 usuarios",
    highlight: false,
    features: [
      { text: "1 Empresa", included: true },
      { text: "3 usuarios (Admin + 2 Cobradores)", included: true },
      { text: "Dashboard y KPIs", included: true },
      { text: "Gestión de préstamos", included: true },
      { text: "Cobranza diaria", included: true },
      { text: "Tickets y contratos PDF", included: true },
      { text: "Modo offline + sincronización", included: true },
      { text: "Capacitación (videos)", included: true },
      { text: "WhatsApp automatizado", included: false },
      { text: "Cobro con Stripe", included: false },
      { text: "Mapa GPS", included: false },
      { text: "Reportes avanzados", included: false },
    ],
  },
  {
    name: "Profesional",
    price: "$4,500",
    period: "/mes",
    desc: "Para financieras en crecimiento",
    users: "Hasta 10 usuarios",
    highlight: true,
    badge: "Más popular",
    features: [
      { text: "1 Empresa", included: true },
      { text: "10 usuarios (Admins + Supervisores + Cobradores)", included: true },
      { text: "Todo lo del plan Básico", included: true },
      { text: "WhatsApp automatizado", included: true },
      { text: "Mapa GPS de operaciones", included: true },
      { text: "Reportes avanzados + exportación", included: true },
      { text: "CRM de cobranza", included: true },
      { text: "Lead Scoring", included: true },
      { text: "Comisiones automáticas", included: true },
      { text: "Capacitación (1 hr + videos)", included: true },
      { text: "Cobro con Stripe", included: false },
      { text: "Auditoría completa", included: false },
    ],
  },
  {
    name: "Enterprise",
    price: "A cotizar",
    period: "",
    desc: "Para financieras grandes y grupos",
    users: "Hasta 20 usuarios",
    highlight: false,
    features: [
      { text: "Empresas ilimitadas", included: true },
      { text: "Hasta 20 usuarios", included: true },
      { text: "Todo lo del plan Profesional", included: true },
      { text: "Cobro automático con Stripe", included: true },
      { text: "Auditoría completa", included: true },
      { text: "Permisos granulares por módulo", included: true },
      { text: "Soporte prioritario", included: true },
      { text: "Capacitación incluida (3 hrs)", included: true },
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ═══ Navbar ═══ */}
      <nav className="sticky top-0 z-50 border-b border-black/5 bg-white/95 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-4 sm:px-8 h-[72px]">
          <a href="#inicio" className="relative block h-10 w-40 overflow-hidden" aria-label="PrestApp, ir al inicio">
            <img
              src={logoFull}
              alt="PrestApp"
              className="absolute left-1/2 top-1/2 w-44 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
            />
          </a>
          <div className="hidden lg:flex items-center gap-9 text-sm font-semibold text-neutral-500">
            <a href="#modulos" className="hover:text-neutral-950 transition-colors">Cómo funciona</a>
            <a href="#whatsapp" className="hover:text-neutral-950 transition-colors">Automatización</a>
            <a href="#precios" className="hover:text-neutral-950 transition-colors">Planes</a>
            <a href="#contacto" className="hover:text-neutral-950 transition-colors">Contacto</a>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button size="sm" variant="ghost" className="hidden sm:inline-flex font-semibold text-neutral-700 hover:text-neutral-950">
                Iniciar sesión
              </Button>
            </Link>
            <Link to="/registro">
              <Button size="sm" className="h-10 rounded-full px-5 font-bold shadow-sm">
                Probar gratis <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <section id="inicio" className="relative isolate overflow-hidden bg-[#070707] text-white">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -left-40 top-24 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[130px]" />
          <div className="absolute right-[-10%] top-[-25%] h-[640px] w-[640px] rounded-full bg-[#5d0b21]/30 blur-[150px]" />
          <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:72px_72px]" />
        </div>

        <div className="relative mx-auto max-w-[1400px] px-4 pb-16 pt-14 sm:px-8 sm:pt-20 lg:min-h-[720px] lg:py-20">
          <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] xl:gap-20">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Control financiero para prestamistas
              </div>

              <h1 className="text-[2.8rem] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[4.3rem]">
                Deja de prestar a ciegas.
                <span className="mt-2 block text-primary">Descubre cuánto ganas de verdad.</span>
              </h1>

              <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/65 sm:text-xl">
                PrestApp conecta préstamos, cobranza, gastos y cajas para mostrarte tu utilidad real, el dinero en riesgo y cada peso que debe regresar a tu negocio.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/registro" className="w-full sm:w-auto">
                  <Button size="lg" className="h-14 w-full rounded-full px-7 text-base font-bold shadow-[0_14px_45px_rgba(239,21,75,.28)] sm:w-auto">
                    Quiero tener el control <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <a href="#modulos" className="w-full sm:w-auto">
                  <Button variant="outline" size="lg" className="h-14 w-full rounded-full border-white/15 bg-white/[0.04] px-7 text-base font-bold text-white hover:bg-white/10 hover:text-white sm:w-auto">
                    Ver cómo funciona <ChevronDown className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-white/55">
                {["7 días gratis", "Control desde cualquier lugar", "Acompañamiento al iniciar"].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
              <div className="absolute -inset-8 rounded-[3rem] bg-primary/10 blur-3xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111111] shadow-[0_35px_100px_rgba(0,0,0,.55)]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">PrestApp Control</p>
                    <p className="mt-1 text-sm font-semibold text-white/80">Tu negocio, sin puntos ciegos</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> En vivo
                  </div>
                </div>

                <div className="p-4 sm:p-7">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.055] p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-white/45">Utilidad real estimada</p>
                          <p className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">$84,320</p>
                        </div>
                        <div className="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-300">
                          <TrendingUp className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="mt-6 flex h-20 items-end gap-1.5" aria-label="Tendencia ascendente de utilidad">
                        {[30, 42, 36, 51, 48, 62, 58, 72, 68, 82, 76, 92].map((height, index) => (
                          <span
                            key={index}
                            className={`flex-1 rounded-t-sm ${index > 8 ? "bg-primary" : "bg-white/10"}`}
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                      <Wallet className="mb-4 h-5 w-5 text-primary" />
                      <p className="text-xs font-medium text-white/40 sm:text-sm">Capital en la calle</p>
                      <p className="mt-1 text-xl font-bold sm:text-2xl">$1,248,000</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                      <HandCoins className="mb-4 h-5 w-5 text-primary" />
                      <p className="text-xs font-medium text-white/40 sm:text-sm">Por recuperar hoy</p>
                      <p className="mt-1 text-xl font-bold sm:text-2xl">$42,850</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/[0.09] p-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary/15 p-2.5">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Fugas bajo vigilancia</p>
                        <p className="mt-0.5 text-xs text-white/45">Gastos, atrasos y diferencias de caja</p>
                      </div>
                    </div>
                    <span className="hidden rounded-full bg-primary px-3 py-1 text-xs font-bold sm:inline-flex">Atención</span>
                  </div>
                </div>

                <div className="border-t border-white/10 bg-black/20 px-5 py-3 text-center text-xs font-medium text-white/35 sm:px-7">
                  Vista ilustrativa · Tus cifras se actualizan con cada movimiento
                </div>
              </div>
            </div>
          </div>

          <div className="mt-14 grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] sm:grid-cols-3 lg:mt-16">
            {[
              ["¿Cuánto ganaste este mes?", "Conoce tu utilidad, no solo lo que cobraste."],
              ["¿Dónde está tu dinero?", "Ubica cartera, cajas y cobranza en segundos."],
              ["¿Qué te está costando?", "Detecta atrasos, gastos y diferencias a tiempo."],
            ].map(([question, answer], index) => (
              <div key={question} className={`p-5 sm:p-6 ${index ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""}`}>
                <p className="font-bold text-white">{question}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/45">{answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Module Showcase with Screenshots ═══ */}
      <section id="modulos" className="py-20 md:py-28 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">MÓDULOS</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Cada módulo diseñado para hacer crecer tu negocio
            </h2>
          </div>

          <div className="space-y-24">
            {showcaseModules.map((mod) => (
              <div
                key={mod.id}
                className={`grid lg:grid-cols-2 gap-12 items-center ${mod.reverse ? "lg:direction-rtl" : ""}`}
              >
                <div className={mod.reverse ? "lg:order-2" : ""}>
                  <h3 className="text-2xl sm:text-3xl font-extrabold mb-4">{mod.title}</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">{mod.desc}</p>
                </div>
                <div className={`relative ${mod.reverse ? "lg:order-1" : ""}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-3xl scale-105" />
                  <img
                    src={mod.img}
                    alt={mod.title}
                    className="relative rounded-2xl shadow-xl border"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WhatsApp Section ═══ */}
      <section id="whatsapp" className="py-20 md:py-28 bg-[hsl(142,70%,35%)] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
                <MessageSquare className="h-4 w-4" /> Integración WhatsApp
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-6">
                WhatsApp trabaja por ti mientras tú descansas
              </h2>
              <p className="text-white/80 text-lg leading-relaxed mb-8">
                ¿Cansado de mandar mensajes uno por uno? PrestApp envía <strong className="text-white">automáticamente</strong> recordatorios de pago un día antes del vencimiento, 
                avisos cuando la cuota ya venció, y <strong className="text-white">recibos de pago con imagen tipo ticket</strong> 
                — todo por WhatsApp, sin que tú muevas un dedo.
              </p>
              <div className="space-y-4">
                {[
                  "📩 Recordatorio automático un día antes del vencimiento",
                  "⚠️ Aviso cuando la cuota está vencida",
                  "🧾 Recibo de pago como imagen (ticket visual)",
                  "📝 Plantillas personalizables con variables dinámicas",
                  "📊 Historial de mensajes enviados y errores",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <span className="text-white/90">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <img
                src={screenshotWhatsapp}
                alt="WhatsApp automatizado"
                className="rounded-3xl shadow-2xl max-w-sm w-full"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Stripe Section ═══ */}
      <section id="stripe" className="py-20 md:py-28 bg-[hsl(252,60%,25%)] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-black/20 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="lg:order-2">
              <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
                <CreditCard className="h-4 w-4" /> Cobro con Tarjeta
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-6">
                Cobra cuotas con tarjeta — sin perseguir a nadie
              </h2>
              <p className="text-white/80 text-lg leading-relaxed mb-8">
                Con la integración de <strong className="text-white">Stripe Connect</strong>, tus clientes registran su tarjeta 
                una sola vez y PrestApp cobra automáticamente cada cuota en la fecha de vencimiento. 
                Sin llamadas, sin visitas, sin excusas. <strong className="text-white">El dinero llega directo a tu cuenta.</strong>
              </p>
              <div className="space-y-4">
                {[
                  "💳 El cliente registra su tarjeta vía enlace seguro (WhatsApp o Email)",
                  "🔄 Cobro automático programado en la fecha exacta de vencimiento",
                  "📱 Cobro manual bajo demanda con un clic",
                  "📊 Log completo de cargos exitosos y fallidos",
                  "🔐 PCI-compliant — tú nunca tocas datos de tarjeta",
                  "💰 Cada empresa recibe en su propia cuenta Stripe",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <span className="text-white/90">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:order-1 flex justify-center">
              <img
                src={screenshotStripe}
                alt="Cobro con Stripe"
                className="rounded-2xl shadow-2xl w-full max-w-lg"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Features Grid ═══ */}
      <section className="py-20 md:py-28 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">FUNCIONALIDADES</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              +18 módulos para dominar tu operación
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Todo lo que necesitas para gestionar préstamos, cobranza y administración — en un solo lugar.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <Card key={f.title} className="group border bg-background hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-5">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Benefits ═══ */}
      <section className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">¿POR QUÉ PRESTAPP?</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Porque tu negocio merece más que una hoja de Excel
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Cloud, title: "100% en la Nube", desc: "Accede desde cualquier lugar. Tus datos siempre seguros con backups automáticos. Sin instalar nada." },
              { icon: Smartphone, title: "Funciona en tu Celular", desc: "Tus cobradores trabajan desde su teléfono como una app nativa. Se instala desde el navegador." },
              { icon: Lock, title: "Seguridad Bancaria", desc: "Autenticación robusta, roles granulares, encriptación de datos y auditoría completa." },
              { icon: TrendingUp, title: "Decisiones con Datos", desc: "Dashboard, reportes y scoring automático. Deja de adivinar, empieza a saber." },
              { icon: Zap, title: "Automatización Total", desc: "WhatsApp, Stripe, cálculo de mora y comisiones — todo automático, cero intervención." },
              { icon: Wifi, title: "Funciona Offline", desc: "¿Sin internet en campo? Sin problema. La app guarda los datos y sincroniza cuando regresa la señal." },
            ].map((b) => (
              <div key={b.title} className="flex gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <b.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Pricing ═══ */}
      <section id="precios" className="py-20 md:py-28 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">PRECIOS</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Planes que crecen contigo
            </h2>
            <p className="mt-4 text-muted-foreground">
              Precios en pesos mexicanos (MXN). Sin contratos, cancela cuando quieras.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative border-2 transition-all ${
                  plan.highlight
                    ? "border-primary shadow-xl shadow-primary/10 scale-[1.02]"
                    : "border-border hover:border-primary/30"
                }`}
              >
                {plan.highlight && plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-4 py-1 text-xs font-bold">
                      {plan.badge}
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2 pt-8">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.desc}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-extrabold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                  <p className="text-xs text-primary font-semibold mt-2">{plan.users}</p>
                </CardHeader>
                <CardContent className="pt-4 pb-8">
                  <div className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <div key={f.text} className="flex items-start gap-2.5">
                        {f.included ? (
                          <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${f.included ? "text-foreground" : "text-muted-foreground/50"}`}>
                          {f.text}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link to={plan.name === "Enterprise" ? "#contacto" : "/registro"} className="block">
                    <Button
                      className="w-full font-semibold"
                      variant={plan.highlight ? "default" : "outline"}
                    >
                      {plan.name === "Enterprise" ? "Contactar Ventas" : "Empezar Ahora"}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            * IVA no incluido. Precio por usuario adicional: $150 MXN/mes (Básico), $130 MXN/mes (Profesional). Enterprise se cotiza según necesidades.
          </p>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Los clientes activos conservan el precio de su contrato actual.
          </p>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-20 md:py-28 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            ¿Listo para dejar la libreta y el Excel?
          </h2>
          <p className="mt-4 text-primary-foreground/80 text-lg max-w-xl mx-auto">
            Digitaliza tu operación hoy. Más control, cero errores, clientes contentos 
            y dinero que llega solo. <strong className="text-primary-foreground">Así de fácil.</strong>
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/registro">
              <Button size="lg" variant="secondary" className="text-base px-8 h-12 font-semibold">
                Comenzar Gratis <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href="#contacto">
              <Button size="lg" variant="outline" className="text-base px-8 h-12 font-semibold border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                Hablar con Ventas
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer id="contacto" className="bg-card border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <img src={logoFull} alt="PrestApp" className="h-10 object-contain mb-4" />
              <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
                PrestApp es el sistema SaaS más completo para la gestión de préstamos, cobranza en campo 
                y administración financiera en México y Latinoamérica.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm mb-4 uppercase tracking-wider text-muted-foreground">Producto</h3>
              <div className="space-y-2 text-sm">
                <a href="#modulos" className="block text-muted-foreground hover:text-foreground transition-colors">Módulos</a>
                <a href="#whatsapp" className="block text-muted-foreground hover:text-foreground transition-colors">WhatsApp</a>
                <a href="#stripe" className="block text-muted-foreground hover:text-foreground transition-colors">Cobro con Stripe</a>
                <a href="#precios" className="block text-muted-foreground hover:text-foreground transition-colors">Precios</a>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-sm mb-4 uppercase tracking-wider text-muted-foreground">Contacto</h3>
              <div className="mb-3">
                <p className="text-primary font-semibold">Uniline — Innovación en la Nube</p>
              </div>
              <div className="space-y-2">
                <a href="tel:3171035768" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="h-4 w-4 text-primary" /> 317 103 5768
                </a>
                <a href="mailto:soporte@uniline.mx" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="h-4 w-4 text-primary" /> soporte@uniline.mx
                </a>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4 text-primary" /> uniline.mx
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} PrestApp — Todos los derechos reservados.
            </p>
            <p className="text-xs text-muted-foreground">
              Desarrollado con ❤️ por <span className="text-primary font-medium">Uniline — Innovación en la Nube</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
