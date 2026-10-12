import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status badge (outline style) ──────────────────────────────────
export function CuotaStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pagada: "border-[hsl(142,72%,37%)] text-[hsl(142,72%,37%)]",
    Vencida: "border-[hsl(0,72%,51%)] text-[hsl(0,72%,51%)]",
    Parcial: "border-[hsl(217,91%,60%)] text-[hsl(217,91%,60%)]",
    Prometida: "border-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]",
    Pendiente: "border-transparent text-[hsl(220,9%,60%)]",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap border",
      styles[status] || styles.Pendiente
    )}>
      {status === "Pagada" && <Check className="h-3 w-3 mr-0.5" />}
      {status}
    </span>
  );
}

// ── Metodo dot ────────────────────────────────────────────────────
export function MetodoDot({ metodo }: { metodo: string }) {
  const color = metodo === "Efectivo" ? "bg-[hsl(142,72%,37%)]" : metodo === "Transferencia" ? "bg-[hsl(217,91%,60%)]" : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {metodo}
    </span>
  );
}

// ── Sidebar field component ───────────────────────────────────────
export function SidebarField({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-1.5", full && "col-span-2")}>
      <p className="text-[11px] uppercase tracking-wider text-foreground font-semibold whitespace-nowrap">{label}</p>
      <p className="text-[12px] text-muted-foreground">{value}</p>
    </div>
  );
}

interface KpiCardsProps {
  kpis: { label: string; value: string; color: string; sub?: string }[];
}

export function KpiCards({
  kpis,
}: KpiCardsProps) {
  return (
    <div className="bg-card px-4 md:px-6 py-3 md:py-4 border-b border-border">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="border border-[hsl(220,14%,91%)] rounded-lg px-3 md:px-4 py-2 md:py-3">
            <p className="text-[10px] md:text-[11px] font-medium uppercase tracking-wider text-[hsl(220,9%,60%)]">{k.label}</p>
            <p className={cn("text-[18px] md:text-[22px] font-bold mt-0.5 leading-tight", k.color)}>{k.value}</p>
            {(k as any).sub && <p className="text-[10px] text-muted-foreground mt-0.5">{(k as any).sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
