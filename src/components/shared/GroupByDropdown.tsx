import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Layers, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GroupByOption {
  key: string;
  label: string;
}

interface GroupByDropdownProps {
  options: GroupByOption[];
  value: string | null;
  onChange: (key: string | null) => void;
}

export function GroupByDropdown({ options, value, onChange }: GroupByDropdownProps) {
  const activeLabel = options.find((o) => o.key === value)?.label;

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-[13px] font-medium whitespace-nowrap bg-secondary border-filter-bar-border hover:bg-primary/5",
              value && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            {activeLabel ? `Agrupado: ${activeLabel}` : "Agrupar por"}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="start">
          {options.map((opt) => (
            <button
              key={opt.key}
              className={cn(
                "w-full text-left px-3 py-2 rounded text-[13px] hover:bg-muted transition-colors",
                value === opt.key && "bg-primary/10 font-semibold text-primary"
              )}
              onClick={() => onChange(value === opt.key ? null : opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
