import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  color?: string;
  description?: string;
  loading?: boolean;
}

export const KPICard = React.memo(function KPICard({ label, value, icon: Icon, color, description, loading }: KPICardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-7 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {Icon && (
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", color || "bg-primary/10")}>
              <Icon className={cn("h-5 w-5", color ? "text-inherit" : "text-primary")} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
