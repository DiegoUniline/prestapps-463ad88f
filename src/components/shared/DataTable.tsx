import React, { useState, useMemo, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => React.ReactNode;
  getValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pageSize?: number;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string;
  skeletonRows?: number;
}

function DataTableInner<T>({
  columns, data, loading = false, pageSize = 50,
  emptyState, onRowClick, getRowClassName, skeletonRows = 8,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }, [sortKey]);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.getValue) return data;
    return [...data].sort((a, b) => {
      const va = col.getValue!(a);
      const vb = col.getValue!(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = useMemo(() => sorted.slice(page * pageSize, (page + 1) * pageSize), [sorted, page, pageSize]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <>{emptyState || <p className="text-center text-muted-foreground py-12">Sin datos</p>}</>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header">
              {columns.map((col) => (
                <TableHead key={col.key} className={cn("text-table-header-foreground text-xs", col.className)}>
                  {col.sortable ? (
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort(col.key)}>
                      {col.header}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row, i) => (
              <TableRow
                key={i}
                className={cn(
                  onRowClick && "cursor-pointer hover:bg-table-hover",
                  getRowClassName?.(row)
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={cn("text-sm", col.className)}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{sorted.length} registros · Página {page + 1}/{totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const DataTable = React.memo(DataTableInner) as typeof DataTableInner;
