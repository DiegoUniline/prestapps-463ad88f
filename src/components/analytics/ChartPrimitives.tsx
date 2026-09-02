import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, $$ } from "@/lib/utils";

export const ANALYTICS_COLORS = {
  primary: "#f0144d",
  primarySoft: "#ff5b82",
  success: "#13b981",
  cyan: "#0ea5c9",
  blue: "#4f7cff",
  warning: "#f59e0b",
  danger: "#ef4444",
  violet: "#8b5cf6",
  slate: "#94a3b8",
} as const;

export const ANALYTICS_PALETTE = [
  ANALYTICS_COLORS.primary,
  ANALYTICS_COLORS.success,
  ANALYTICS_COLORS.blue,
  ANALYTICS_COLORS.warning,
  ANALYTICS_COLORS.violet,
  ANALYTICS_COLORS.cyan,
  ANALYTICS_COLORS.danger,
];

type Tone = "positive" | "negative" | "neutral" | "warning";

export function TrendPill({ value, label, tone }: { value: string; label?: string; tone: Tone }) {
  const Icon = tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : Minus;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold",
      tone === "positive" && "border-success/20 bg-success/10 text-success",
      tone === "negative" && "border-destructive/20 bg-destructive/10 text-destructive",
      tone === "warning" && "border-warning/20 bg-warning/10 text-warning",
      tone === "neutral" && "border-border bg-muted/60 text-muted-foreground",
    )}>
      <Icon className="h-3 w-3" />{value}{label && <span className="font-normal opacity-75">{label}</span>}
    </span>
  );
}

export function AnalyticsChartCard({
  title,
  description,
  eyebrow = "Analítica",
  meta,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden border-border/70 shadow-[0_18px_45px_-32px_rgba(15,23,42,.35)]", className)}>
      <CardHeader className="border-b border-border/60 bg-muted/15 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
            <CardTitle className="mt-1 text-[15px] font-semibold tracking-tight">{title}</CardTitle>
            {description && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{meta}{action}</div>
        </div>
      </CardHeader>
      <CardContent className={cn("p-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

type TooltipEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
};

export function AnalyticsTooltip({
  active,
  payload,
  label,
  valueFormatter = $$,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[168px] rounded-xl border border-white/10 bg-[#111217]/95 p-3 text-white shadow-2xl backdrop-blur-xl">
      {label !== undefined && <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</p>}
      <div className="space-y-2">
        {payload.map((item, index) => {
          const numericValue = typeof item.value === "number" ? item.value : Number(item.value || 0);
          return (
            <div key={`${String(item.dataKey)}-${index}`} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-2 text-[11px] text-white/65">
                <i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <strong className="text-[12px] font-semibold tabular-nums">{valueFormatter(numericValue)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type DonutDatum = { name: string; value: number; color?: string };

export function DonutBreakdown({
  data,
  centerLabel,
  centerValue,
  valueFormatter = $$,
}: {
  data: DonutDatum[];
  centerLabel: string;
  centerValue?: string;
  valueFormatter?: (value: number) => string;
}) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const enriched = data.map((item, index) => ({ ...item, color: item.color || ANALYTICS_PALETTE[index % ANALYTICS_PALETTE.length] }));

  if (!enriched.length) {
    return <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">Sin datos para este periodo</div>;
  }

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[190px_minmax(0,1fr)]">
      <div className="relative h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={enriched}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={82}
              paddingAngle={3}
              cornerRadius={6}
              stroke="transparent"
            >
              {enriched.map(item => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip content={<AnalyticsTooltip valueFormatter={valueFormatter} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{centerLabel}</span>
          <strong className="mt-1 max-w-[108px] truncate text-center text-sm font-bold tracking-tight">{centerValue || valueFormatter(total)}</strong>
        </div>
      </div>
      <div className="space-y-2">
        {enriched.slice(0, 7).map(item => {
          const share = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-[11px] font-medium">
                  <i className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.name}
                </p>
                <div className="ml-4 mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(share, 2)}%`, backgroundColor: item.color }} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold tabular-nums">{valueFormatter(item.value)}</p>
                <p className="text-[9px] text-muted-foreground">{share.toFixed(1)}%</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
