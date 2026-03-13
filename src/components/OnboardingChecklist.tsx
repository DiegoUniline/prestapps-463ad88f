import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp,
  Building2, Wallet, Users, FileText, MapPin, UserCheck, Rocket, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: any;
  route: string;
  check: (data: any) => boolean;
}

const STEPS: Step[] = [
  {
    id: "empresa",
    title: "Configura tu empresa",
    description: "Agrega el nombre, logo y datos fiscales de tu empresa.",
    icon: Building2,
    route: "/configuracion",
    check: (d) => !!d.empresa?.nombre && d.empresa.nombre !== "",
  },
  {
    id: "caja",
    title: "Crea una caja",
    description: "Las cajas controlan el flujo de dinero. Crea al menos una para empezar.",
    icon: Wallet,
    route: "/cajas",
    check: (d) => (d.cajas?.length || 0) > 0,
  },
  {
    id: "ruta",
    title: "Crea una ruta de cobro",
    description: "Organiza tu cobranza asignando zonas o rutas a tus cobradores.",
    icon: MapPin,
    route: "/rutas",
    check: (d) => (d.rutas?.length || 0) > 0,
  },
  {
    id: "cobrador",
    title: "Registra un cobrador",
    description: "Agrega al menos un usuario cobrador para asignarle préstamos.",
    icon: UserCheck,
    route: "/usuarios",
    check: (d) => (d.cobradores?.length || 0) > 0,
  },
  {
    id: "cliente",
    title: "Registra tu primer cliente",
    description: "Agrega los datos del cliente al que le otorgarás un préstamo.",
    icon: Users,
    route: "/clientes",
    check: (d) => (d.clientes?.length || 0) > 0,
  },
  {
    id: "prestamo",
    title: "Crea tu primer préstamo",
    description: "Otorga un préstamo a un cliente y genera la tabla de amortización.",
    icon: FileText,
    route: "/prestamos/nuevo",
    check: (d) => (d.prestamos?.length || 0) > 0,
  },
];

const DISMISS_KEY = "onboarding_dismissed";

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(`${DISMISS_KEY}_${empresaId}`) === "true";
  });

  const { data } = useQuery({
    queryKey: ["onboarding-check", empresaId],
    queryFn: async () => {
      const [
        { data: empresa },
        { data: cajas },
        { data: rutas },
        { data: cobradores },
        { data: clientes },
        { data: prestamos },
      ] = await Promise.all([
        supabase.from("empresas").select("nombre, logo_url").eq("id", empresaId).single(),
        supabase.from("cajas").select("id").eq("empresa_id", empresaId).limit(1),
        supabase.from("rutas").select("id").eq("empresa_id", empresaId).limit(1),
        supabase.from("profiles").select("id").eq("empresa_id", empresaId).limit(2),
        supabase.from("clientes").select("id").eq("empresa_id", empresaId).limit(1),
        supabase.from("prestamos").select("id").eq("empresa_id", empresaId).limit(1),
      ]);
      return { empresa, cajas, rutas, cobradores, clientes, prestamos };
    },
    staleTime: 30_000,
  });

  const completedSteps = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(STEPS.filter((s) => s.check(data)).map((s) => s.id));
  }, [data]);

  const progress = (completedSteps.size / STEPS.length) * 100;
  const allDone = completedSteps.size === STEPS.length;

  useEffect(() => {
    if (allDone) {
      const timer = setTimeout(() => {
        localStorage.setItem(`${DISMISS_KEY}_${empresaId}`, "true");
        setDismissed(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [allDone, empresaId]);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(`${DISMISS_KEY}_${empresaId}`, "true");
    setDismissed(true);
  };

  // Find first incomplete step
  const nextStep = STEPS.find((s) => !completedSteps.has(s.id));

  return (
    <Card className="border-primary/20 shadow-sm overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-semibold">
              {allDone ? "¡Todo listo! 🎉" : "Primeros pasos"}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground font-medium">
              {completedSteps.size}/{STEPS.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            {(allDone || completedSteps.size >= 3) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <Progress value={progress} className="h-1.5 mt-2" />
      </CardHeader>

      {/* Steps */}
      {!collapsed && (
        <CardContent className="px-4 pb-4 pt-1">
          {allDone ? (
            <p className="text-sm text-muted-foreground mt-1">
              Has completado toda la configuración inicial. ¡Ya puedes gestionar tu cartera de préstamos!
            </p>
          ) : (
            <div className="space-y-1 mt-1">
              {STEPS.map((step) => {
                const done = completedSteps.has(step.id);
                const isNext = nextStep?.id === step.id;
                const Icon = step.icon;
                return (
                  <button
                    key={step.id}
                    onClick={() => !done && navigate(step.route)}
                    disabled={done}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      done
                        ? "opacity-60"
                        : isNext
                        ? "bg-primary/5 hover:bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    ) : (
                      <Circle
                        className={cn(
                          "h-5 w-5 mt-0.5 shrink-0",
                          isNext ? "text-primary" : "text-muted-foreground/40"
                        )}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium leading-tight",
                          done && "line-through text-muted-foreground"
                        )}
                      >
                        {step.title}
                      </p>
                      {isNext && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {step.description}
                        </p>
                      )}
                    </div>
                    {isNext && !done && (
                      <span className="text-xs font-medium text-primary shrink-0 mt-0.5">
                        Ir →
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
