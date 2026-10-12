import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  pageSize: number;
  /** Total de filas filtradas; si se desconoce, pasar `hasMore`. */
  total?: number | null;
  /** Para listados sin conteo: hay otra página después de ésta. */
  hasMore?: boolean;
  /** Filas en la página actual (cuando no hay total). */
  rowsOnPage?: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
  className?: string;
}

export function PaginacionControles({ page, pageSize, total, hasMore, rowsOnPage, onPageChange, isFetching, className }: Props) {
  const known = typeof total === "number";
  const from = known ? (total === 0 ? 0 : page * pageSize + 1) : rowsOnPage ? page * pageSize + 1 : 0;
  const to = known ? Math.min((page + 1) * pageSize, total) : page * pageSize + (rowsOnPage || 0);
  const canNext = known ? to < total : !!hasMore;
  if (known && total <= pageSize && page === 0) return null;
  if (!known && page === 0 && !hasMore) return null;

  return (
    <div className={cn("flex items-center justify-end gap-1 text-[12px] text-muted-foreground", className)}>
      {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
      <span>
        {from}-{to}
        {known ? ` de ${total}` : ""}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Página anterior"
        disabled={page === 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Página siguiente"
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
