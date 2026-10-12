import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, CalendarCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Tab: Corte Semanal ──
const DIAS_SEMANA = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
];

export function CorteSemanalTab() {
  const { empresaId } = useEmpresa();
  const qc = useQueryClient();

  const { data: empresa, isLoading } = useQuery({
    queryKey: ["empresa-corte-config", empresaId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("empresas")
        .select("corte_dia_semana, corte_color_cobrado")
        .eq("id", empresaId)
        .single();
      if (error) throw error;
      return data as { corte_dia_semana: number; corte_color_cobrado: string };
    },
  });

  const [dia, setDia] = useState("1");
  const [color, setColor] = useState("#22c55e");

  useEffect(() => {
    if (empresa) {
      setDia(String(empresa.corte_dia_semana ?? 1));
      setColor(empresa.corte_color_cobrado || "#22c55e");
    }
  }, [empresa]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("empresas")
        .update({ corte_dia_semana: parseInt(dia), corte_color_cobrado: color })
        .eq("id", empresaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresa-corte"] });
      qc.invalidateQueries({ queryKey: ["empresa-corte-config"] });
      toast.success("Configuración de corte guardada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" /> Corte Semanal de Cobranza
          </CardTitle>
          <CardDescription>
            Configura el día en que se reinicia la semana de cobranza y el color del indicador 
            que marca si un cliente ya fue atendido (pago o visita) en la semana actual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Día de inicio de semana</Label>
            <Select value={dia} onValueChange={setDia}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIAS_SEMANA.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              El indicador de "atendido" se reinicia automáticamente cada {DIAS_SEMANA.find((d) => d.value === dia)?.label || "Lunes"}.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Color del indicador</Label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 rounded-md border border-border cursor-pointer"
              />
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Vista previa:</span>
                <span className="inline-block h-4 w-4 rounded-full border border-border/40" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium">Atendido</span>
                <span className="inline-block h-4 w-4 rounded-full border border-border/40" style={{ backgroundColor: "transparent" }} />
                <span className="text-xs text-muted-foreground">Sin atender</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Este círculo aparece junto a cada cliente en la vista de Cobranza Diaria.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        <Save className="h-4 w-4 mr-1" />
        {saveMutation.isPending ? "Guardando..." : "Guardar Configuración de Corte"}
      </Button>
    </div>
  );
}
