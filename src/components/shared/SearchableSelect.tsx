import { useState, useRef, useEffect, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Search, Plus } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  /** Show a "Create new" button at the bottom when search has no results or always */
  onCreate?: () => void;
  createLabel?: string;
  /** Allow "none" option */
  allowNone?: boolean;
  noneLabel?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "No se encontraron resultados",
  className,
  triggerClassName,
  disabled,
  onCreate,
  createLabel = "Crear nuevo",
  allowNone = false,
  noneLabel = "Ninguno",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle && o.subtitle.toLowerCase().includes(q))
    );
  }, [options, search]);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel =
    value === "__none__"
      ? noneLabel
      : selectedOption
      ? selectedOption.label
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-9 text-sm",
            !value && !selectedOption && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0 w-[--radix-popover-trigger-width]", className)}
        align="start"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Options list */}
        <div className="max-h-[220px] overflow-y-auto p-1">
          {allowNone && (
            <button
              type="button"
              onClick={() => {
                onValueChange("__none__");
                setOpen(false);
              }}
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors",
                value === "__none__" && "bg-accent"
              )}
            >
              <Check
                className={cn(
                  "mr-2 h-3.5 w-3.5",
                  value === "__none__" ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="text-muted-foreground italic">{noneLabel}</span>
            </button>
          )}

          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          )}

          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors",
                value === option.value && "bg-accent"
              )}
            >
              <Check
                className={cn(
                  "mr-2 h-3.5 w-3.5 shrink-0",
                  value === option.value ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex flex-col items-start min-w-0">
                <span className="truncate">{option.label}</span>
                {option.subtitle && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {option.subtitle}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Create button */}
        {onCreate && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {createLabel}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
