import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";
import { useEmpresaConfig, useSaveEmpresaConfig, type EmpresaConfig, type ContratoCampos } from "@/hooks/useEmpresaConfig";

// ── Contract field labels ──
const CONTRATO_FIELD_LABELS: Record<keyof ContratoCampos, string> = {
  datos_cliente: "Sección de datos del cliente",
  datos_prestamo: "Condiciones del crédito",
  tabla_amortizacion: "Tabla de amortización / plan de pagos",
  clausula_mora: "Cláusula de mora",
  firma_cliente: "Línea de firma del cliente",
  firma_empresa: "Línea de firma de la empresa",
  notas: "Notas adicionales",
};

const CONTRATO_PLACEHOLDERS = [
  { tag: "{{cliente_nombre}}", desc: "Nombre del cliente" },
  { tag: "{{cliente_dni}}", desc: "Documento de identidad" },
  { tag: "{{cliente_documento}}", desc: "Tipo de documento" },
  { tag: "{{cliente_direccion}}", desc: "Dirección del cliente" },
  { tag: "{{cliente_telefono}}", desc: "Teléfono del cliente" },
  { tag: "{{monto_solicitado}}", desc: "Monto solicitado" },
  { tag: "{{monto_total_pagar}}", desc: "Monto total a pagar" },
  { tag: "{{num_cuotas}}", desc: "Número de cuotas" },
  { tag: "{{valor_cuota}}", desc: "Valor de cuota" },
  { tag: "{{frecuencia}}", desc: "Frecuencia de pago" },
  { tag: "{{modalidad}}", desc: "Modalidad del préstamo" },
  { tag: "{{tasa_interes}}", desc: "Tasa de interés" },
  { tag: "{{tipo_mora}}", desc: "Tipo de mora" },
  { tag: "{{valor_mora}}", desc: "Valor de mora" },
  { tag: "{{fecha_primer_pago}}", desc: "Fecha primer pago" },
  { tag: "{{fecha_registro}}", desc: "Fecha de registro" },
  { tag: "{{empresa_nombre}}", desc: "Nombre de la empresa" },
  { tag: "{{notas}}", desc: "Notas del préstamo" },
];

// ── Tab 3: Contrato ──
export function ContratoTab() {
  const { data: config, isLoading } = useEmpresaConfig();
  const saveConfig = useSaveEmpresaConfig();
  const [local, setLocal] = useState<EmpresaConfig | null>(null);

  useEffect(() => {
    if (config) setLocal({ ...config });
  }, [config]);

  if (isLoading || !local) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  const toggleField = (field: keyof ContratoCampos) => {
    setLocal({
      ...local,
      contrato_campos: { ...local.contrato_campos, [field]: !local.contrato_campos[field] },
    });
  };

  const insertPlaceholder = (tag: string) => {
    setLocal({
      ...local,
      contrato_plantilla: local.contrato_plantilla + " " + tag,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Secciones */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Secciones del Contrato</CardTitle>
            <CardDescription>Activa o desactiva las secciones que aparecerán en el PDF</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(CONTRATO_FIELD_LABELS) as (keyof ContratoCampos)[]).map((field) => (
              <div key={field} className="flex items-center justify-between p-2 rounded-lg border">
                <span className="text-sm">{CONTRATO_FIELD_LABELS[field]}</span>
                <Switch
                  checked={local.contrato_campos[field]}
                  onCheckedChange={() => toggleField(field)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Plantilla */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plantilla del Contrato</CardTitle>
              <CardDescription>
                Edita el texto del contrato. Usa los campos disponibles para insertar datos automáticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Campos disponibles (clic para insertar):</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTRATO_PLACEHOLDERS.map((p) => (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => insertPlaceholder(p.tag)}
                      className="inline-flex items-center rounded border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-mono hover:bg-muted transition-colors"
                      title={p.desc}
                    >
                      {p.tag}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={local.contrato_plantilla}
                onChange={(e) => setLocal({ ...local, contrato_plantilla: e.target.value })}
                rows={16}
                className="font-mono text-sm"
                placeholder="Escribe el texto del contrato aquí..."
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Button onClick={() => saveConfig.mutate(local)} disabled={saveConfig.isPending} className="w-full">
        <Save className="h-4 w-4 mr-1" />
        {saveConfig.isPending ? "Guardando..." : "Guardar Configuración de Contrato"}
      </Button>
    </div>
  );
}
