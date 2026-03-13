import { Link } from "react-router-dom";
import logoFull from "@/assets/logo-full.png";
import logoIcon from "@/assets/logo-icon.png";
import {
  CreditCard, Users, Wallet, Route, FileText, HandCoins,
  CalendarCheck, Settings, UserCheck, MessageSquare,
  Star, Percent, MapPin, ClipboardList, ShieldCheck, Bell,
  RefreshCw, PieChart, ScrollText, Smartphone, Cloud, Lock,
  BarChart3, Zap, ArrowRight, CheckCircle2, Phone, Mail,
  Globe, ChevronDown, Receipt, Building2, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: CreditCard,
    title: "Gestión de Préstamos",
    desc: "Crea préstamos con modalidad fija o sobre saldos insolutos, configura tasas, frecuencias (diario, semanal, quincenal, mensual) y genera tablas de amortización automáticas.",
  },
  {
    icon: HandCoins,
    title: "Cobranza Diaria",
    desc: "Panel de cobranza en tiempo real con vista por ruta, cobrador y estado de cuotas. Registra pagos con geolocalización GPS y genera tickets al instante.",
  },
  {
    icon: Users,
    title: "Clientes 360°",
    desc: "Ficha completa del cliente con historial crediticio, préstamos activos, scoring, documentos y fotos. Todo en un solo lugar.",
  },
  {
    icon: Wallet,
    title: "Control de Cajas",
    desc: "Gestiona múltiples cajas con entradas, salidas y movimientos vinculados a préstamos. Saldos actualizados en tiempo real.",
  },
  {
    icon: Route,
    title: "Rutas y Cobradores",
    desc: "Organiza tu cartera por rutas geográficas, asigna cobradores, y monitorea su rendimiento y comisiones desde un solo panel.",
  },
  {
    icon: CalendarCheck,
    title: "Promesas de Pago",
    desc: "Registra y da seguimiento a promesas de pago con fechas y montos. Alertas automáticas cuando se acerca el vencimiento.",
  },
  {
    icon: Receipt,
    title: "Tickets y Contratos PDF",
    desc: "Genera tickets de pago y contratos personalizables en PDF. Configura campos, logo, encabezado y pie de página.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp Automático",
    desc: "Envía recordatorios de pago, avisos de vencimiento y recibos por WhatsApp de forma automática con plantillas personalizables.",
  },
  {
    icon: PieChart,
    title: "Reportes y Análisis",
    desc: "Reportes de cartera, morosidad, rentabilidad, comisiones y más. Exporta a Excel y PDF con un clic.",
  },
  {
    icon: MapPin,
    title: "Mapa GPS",
    desc: "Visualiza la ubicación de clientes, pagos y visitas en un mapa interactivo. Verifica que los cobradores estén en campo.",
  },
  {
    icon: Star,
    title: "Lead Scoring",
    desc: "Califica automáticamente a tus clientes según su comportamiento de pago y otorga préstamos con mayor seguridad.",
  },
  {
    icon: Percent,
    title: "Comisiones Automáticas",
    desc: "Calcula comisiones por cobro, por préstamo otorgado y bonos por meta. Configura porcentajes por cobrador.",
  },
  {
    icon: RefreshCw,
    title: "Renovación y Reestructura",
    desc: "Renueva préstamos liquidados o reestructura deudas vigentes con nuevas condiciones en pocos clics.",
  },
  {
    icon: ClipboardList,
    title: "Solicitudes de Préstamo",
    desc: "Flujo de aprobación: los cobradores solicitan, los admins aprueban o rechazan. Todo documentado con auditoría.",
  },
  {
    icon: ShieldCheck,
    title: "Roles y Permisos",
    desc: "Tres niveles de acceso (Admin, Supervisor, Cobrador) con permisos granulares por módulo y acción.",
  },
  {
    icon: Bell,
    title: "Alertas Inteligentes",
    desc: "Notificaciones de cuotas vencidas, promesas incumplidas, metas alcanzadas y eventos importantes del sistema.",
  },
  {
    icon: CreditCard,
    title: "Cobro con Stripe",
    desc: "Cobra cuotas con tarjeta de crédito/débito vía Stripe Connect. Cobros automáticos programados en la fecha de vencimiento.",
  },
  {
    icon: ScrollText,
    title: "Auditoría Completa",
    desc: "Registro detallado de cada acción: quién hizo qué, cuándo y desde dónde. Transparencia total para tu operación.",
  },
];

const stats = [
  { value: "18+", label: "Módulos integrados" },
  { value: "3", label: "Roles de usuario" },
  { value: "24/7", label: "Disponibilidad cloud" },
  { value: "100%", label: "Responsive" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Navbar ─── */}
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <img src={logoFull} alt="PrestApp" className="h-9 object-contain" />
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#benefits" className="hover:text-foreground transition-colors">Beneficios</a>
            <a href="#contact" className="hover:text-foreground transition-colors">Contacto</a>
          </div>
          <Link to="/login">
            <Button size="sm" className="font-semibold">
              Iniciar Sesión <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pt-32 md:pb-36 text-center relative">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-8">
            <Zap className="h-4 w-4" /> Sistema SaaS de Gestión de Préstamos
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight max-w-4xl mx-auto">
            Controla tu negocio de
            <span className="text-primary"> préstamos</span> como nunca antes
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            PrestApp es la plataforma todo-en-uno para gestionar préstamos, cobranza, rutas, clientes, 
            comisiones y más. Desde cualquier dispositivo, en la nube.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login">
              <Button size="lg" className="text-base px-8 h-12 font-semibold shadow-lg shadow-primary/25">
                Comenzar Ahora <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href="#features">
              <Button variant="outline" size="lg" className="text-base px-8 h-12 font-semibold">
                Ver Funciones <ChevronDown className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-extrabold text-primary">{s.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-20 md:py-28 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">Funcionalidades</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Todo lo que necesitas en un solo sistema
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Más de 18 módulos diseñados para cubrir cada aspecto de tu operación de préstamos y cobranza.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="group border bg-background hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold text-base mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Benefits ─── */}
      <section id="benefits" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">Beneficios</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              ¿Por qué elegir PrestApp?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Cloud, title: "100% en la Nube", desc: "Accede desde cualquier lugar, sin instalar nada. Tus datos siempre seguros y respaldados automáticamente." },
              { icon: Smartphone, title: "Diseño Responsive", desc: "Funciona perfecto en celular, tablet y computadora. Tus cobradores pueden trabajar desde su teléfono." },
              { icon: Lock, title: "Seguridad Avanzada", desc: "Autenticación robusta, roles granulares, RLS a nivel base de datos y auditoría completa de cada acción." },
              { icon: TrendingUp, title: "Decisiones con Datos", desc: "Dashboard con KPIs en tiempo real, reportes exportables y scoring automático para tomar mejores decisiones." },
              { icon: Zap, title: "Automatización Total", desc: "Cobros automáticos con Stripe, alertas por WhatsApp, cálculo de mora y comisiones sin intervención manual." },
              { icon: Building2, title: "Multi-Empresa", desc: "Gestiona múltiples empresas desde una sola cuenta. Cada una con su configuración, usuarios y cartera independiente." },
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

      {/* ─── CTA ─── */}
      <section className="py-20 md:py-28 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Lleva tu negocio de préstamos al siguiente nivel
          </h2>
          <p className="mt-4 text-primary-foreground/80 text-lg max-w-xl mx-auto">
            Únete a PrestApp y digitaliza tu operación. Más control, menos errores, mejores resultados.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login">
              <Button size="lg" variant="secondary" className="text-base px-8 h-12 font-semibold">
                Acceder al Sistema <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href="#contact">
              <Button size="lg" variant="outline" className="text-base px-8 h-12 font-semibold border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                Contáctanos
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ─── Contact / Footer ─── */}
      <footer id="contact" className="bg-card border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <img src={logoFull} alt="PrestApp" className="h-10 object-contain mb-4" />
              <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
                PrestApp es un sistema SaaS profesional para la gestión integral de préstamos, cobranza y administración financiera. 
                Diseñado para prestamistas, financieras y cooperativas.
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Gestión completa de préstamos y amortización</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Cobranza en campo con GPS y WhatsApp</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Cobros automáticos con tarjeta vía Stripe</span>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg mb-1">Desarrollado por</h3>
                <p className="text-primary font-semibold text-lg">Uniline — Innovación en la Nube</p>
              </div>
              <div className="space-y-3">
                <a href="tel:3171035768" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="h-4 w-4 text-primary" />
                  317 103 5768
                </a>
                <a href="mailto:diego.leon@uniline.mx" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="h-4 w-4 text-primary" />
                  diego.leon@uniline.mx
                </a>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4 text-primary" />
                  uniline.mx
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
