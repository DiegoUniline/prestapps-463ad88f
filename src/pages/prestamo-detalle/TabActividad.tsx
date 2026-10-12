import { cn, fmtDateTime } from "@/lib/utils";
import { activityColors, type Actividad } from "./utils";

interface TabActividadProps {
  actividad: Actividad[];
}

export function TabActividad({
  actividad,
}: TabActividadProps) {
  return (
    <div className="relative">
      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
      <div className="space-y-5">
        {actividad.length === 0 ? (
          <p className="text-[13px] text-muted-foreground pl-10">Sin actividad registrada</p>
        ) : actividad.slice().reverse().map((a, i) => {
          const dotColor = activityColors[a.tipo] || "bg-muted-foreground";
          return (
            <div key={i} className="relative pl-8">
              <div className={cn("absolute left-[7px] top-1.5 h-2.5 w-2.5 rounded-full", dotColor)} />
              <div>
                <p className="text-[13px]">{a.desc}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {a.usuario} · {fmtDateTime(a.fecha)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
