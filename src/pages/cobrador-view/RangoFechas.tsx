import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import type { RangePreset } from "./types";

interface RangoFechasProps {
  activeTab: string;
  rangePreset: RangePreset;
  setRangePreset: (preset: RangePreset) => void;
  setHoy: () => void;
  setSemana: () => void;
  fechaDesde: Date;
  setFechaDesde: (d: Date) => void;
  fechaHasta: Date;
  setFechaHasta: (d: Date) => void;
}

export function RangoFechas({
  activeTab, rangePreset, setRangePreset, setHoy, setSemana, fechaDesde, setFechaDesde,
  fechaHasta, setFechaHasta,
}: RangoFechasProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", ["resumen", "perfil"].includes(activeTab) && "hidden sm:flex")}>
      <Button
        variant={rangePreset === "hoy" ? "default" : "outline"}
        size="sm"
        className="h-9 rounded-full px-4 text-xs"
        onClick={setHoy}
      >
        Hoy
      </Button>
      <Button
        variant={rangePreset === "semana" ? "default" : "outline"}
        size="sm"
        className="h-9 rounded-full px-4 text-xs"
        onClick={setSemana}
      >
        Esta semana
      </Button>

      {/* Custom range */}
      <div className="hidden items-center gap-1 sm:flex">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarIcon className="h-3 w-3" />
              {format(fechaDesde, "dd/MM", { locale: es })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fechaDesde}
              onSelect={(d) => { if (d) { setFechaDesde(d); setRangePreset("custom"); if (d > fechaHasta) setFechaHasta(d); } }}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">—</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarIcon className="h-3 w-3" />
              {format(fechaHasta, "dd/MM", { locale: es })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fechaHasta}
              onSelect={(d) => { if (d) { setFechaHasta(d); setRangePreset("custom"); if (d < fechaDesde) setFechaDesde(d); } }}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
