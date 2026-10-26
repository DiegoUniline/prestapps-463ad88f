import { $$ } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Briefcase } from "lucide-react";
import type { PerfilCobrador } from "./hooks";
import { EmptyCard, LoadingCards } from "./cards";

interface TabCarteraProps {
  loadingPerfil: boolean;
  perfil: PerfilCobrador | undefined;
  search: string;
  navigate: (path: string) => void;
}

export function TabCartera({
  loadingPerfil, perfil, search, navigate,
}: TabCarteraProps) {
  return (
    <>
      {loadingPerfil ? (
        <LoadingCards />
      ) : (perfil?.prestamos || []).length === 0 ? (
        <EmptyCard icon={Briefcase} title="Sin préstamos" subtitle="No tienes préstamos asignados." />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Préstamos</p>
              <p className="kpi-num text-lg font-bold text-primary">{perfil!.prestamos.length}</p>
            </div>
            <div className="bg-secondary rounded-lg p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Saldo total</p>
              <p className="kpi-num text-lg font-bold">{$$(perfil!.prestamos.reduce((s, p) => s + p.saldo, 0))}</p>
            </div>
            <div className="bg-destructive/10 rounded-lg p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mora total</p>
              <p className="kpi-num text-lg font-bold text-destructive">{$$(perfil!.prestamos.reduce((s, p) => s + p.mora, 0))}</p>
            </div>
          </div>

          {/* Loan cards */}
          {perfil!.prestamos
            .filter((p) => !search || p.cliente.toLowerCase().includes(search.toLowerCase()))
            .map((p) => (
            <Card key={p.id} className="border-border/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.cliente}</p>
                    <p className="text-[11px] text-muted-foreground">{p.ruta} • {p.frecuencia}</p>
                  </div>
                  <Badge variant={p.estado === "Vencido" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                    {p.estado}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center bg-secondary/50 rounded-md p-2">
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Monto</p>
                    <p className="text-xs font-semibold">{$$(p.monto)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Total</p>
                    <p className="text-xs font-semibold">{$$(p.montoPagar)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Saldo</p>
                    <p className="text-xs font-semibold">{$$(p.saldo)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Cuotas</p>
                    <p className="text-xs font-semibold">{p.pagadas}/{p.cuotas}</p>
                  </div>
                </div>
                {p.mora > 0 && (
                  <p className="text-[11px] text-destructive font-medium">Mora: {$$(p.mora)}</p>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => navigate(`/prestamos/${p.id}`)}>
                  <Eye className="h-3 w-3 mr-1" /> Ver detalle
                </Button>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
