import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { cn, $$, fmtDate } from "@/lib/utils";
import type { PromesaRow } from "./utils";

// Promesas status badge
const promesaStatusStyle: Record<string, string> = {
  Pendiente: "border-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]",
  Cumplida: "border-[hsl(142,72%,37%)] text-[hsl(142,72%,37%)]",
  Incumplida: "border-[hsl(0,72%,51%)] text-[hsl(0,72%,51%)]",
};

interface TabPromesasProps {
  promesasRaw: PromesaRow[];
  isCancelado: boolean;
}

export function TabPromesas({
  promesasRaw, isCancelado,
}: TabPromesasProps) {
  return (
    <>
      <div className="flex justify-end px-5 py-2.5 border-b border-border">
        <Button variant="outline" size="sm" className="h-7 text-[12px]" disabled={isCancelado}><Plus className="h-3 w-3 mr-1" />Nueva Promesa</Button>
      </div>

      {/* Mobile: Cards */}
      <div className="md:hidden space-y-2 p-3">
        {promesasRaw.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-[13px]">Sin promesas</p>
        ) : promesasRaw.map((pr) => (
          <div key={pr.id} className="border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border", promesaStatusStyle[pr.status || "Pendiente"] || promesaStatusStyle.Pendiente)}>
                {pr.status || "Pendiente"}
              </span>
              <span className="text-[14px] font-bold">{$$(Number(pr.monto_prometido))}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-muted-foreground">F. Prometida</span><span>{fmtDate(pr.fecha_prometida)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Creado</span><span>{fmtDate(pr.created_at)}</span></div>
            </div>
            {pr.notas && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{pr.notas}</p>}
          </div>
        ))}
      </div>

      {/* Desktop: Table */}
      <div className="overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-[hsl(210,20%,98%)] hover:bg-[hsl(210,20%,98%)]">
              {["Cuota #", "F. Prometida", "Monto", "Notas", "Status", "Creado", "Acción"].map((h) => (
                <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(220,9%,42%)] px-3 py-2 whitespace-nowrap border-b border-[hsl(220,14%,91%)]">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {promesasRaw.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-[13px]">Sin promesas</TableCell></TableRow>
            ) : promesasRaw.map((pr) => (
              <TableRow key={pr.id} className="border-b border-[hsl(220,14%,96%)] hover:bg-[hsl(210,20%,98%)]">
                <TableCell className="px-3 text-[12px]">{pr.cuota_id ? "—" : "—"}</TableCell>
                <TableCell className="px-3 text-[12px]">{fmtDate(pr.fecha_prometida)}</TableCell>
                <TableCell className="px-3 text-[13px] font-medium">{$$(Number(pr.monto_prometido))}</TableCell>
                <TableCell className="px-3 text-[12px] text-muted-foreground max-w-[200px] truncate">{pr.notas || "—"}</TableCell>
                <TableCell className="px-3">
                  <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border", promesaStatusStyle[pr.status || "Pendiente"] || promesaStatusStyle.Pendiente)}>
                    {pr.status || "Pendiente"}
                  </span>
                </TableCell>
                <TableCell className="px-3 text-[12px] text-muted-foreground">{fmtDate(pr.created_at)}</TableCell>
                <TableCell className="px-3">
                  <button className="text-[11px] text-muted-foreground hover:text-primary transition-colors">Editar</button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
