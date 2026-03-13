import React, { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  onClearAll?: () => void;
  hasActiveFilters?: boolean;
}

export const FilterBar = React.memo(function FilterBar({
  search, onSearchChange, searchPlaceholder = "Buscar...",
  children, onClearAll, hasActiveFilters,
}: FilterBarProps) {
  const handleClear = useCallback(() => {
    onSearchChange("");
    onClearAll?.();
  }, [onSearchChange, onClearAll]);

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-filter-bar border border-filter-bar-border">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8 h-8 text-sm"
        />
      </div>
      {children}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={handleClear}>
          <X className="h-3 w-3" /> Limpiar
        </Button>
      )}
    </div>
  );
});
