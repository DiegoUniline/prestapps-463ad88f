import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Eye } from "lucide-react";
import { useEmpresaConfig, useSaveEmpresaConfig, type EmpresaConfig, type TicketCampos } from "@/hooks/useEmpresaConfig";

// ── Ticket field labels ──
const TICKET_FIELD_LABELS: Record<keyof TicketCampos, string> = {
  cliente_nombre: "Nombre del cliente",
  cliente_dni: "Documento de identidad",
  cliente_telefono: "Teléfono del cliente",
  prestamo_id: "ID del préstamo",
  fecha_pago: "Fecha del pago",
  monto_recibido: "Monto recibido",
  aplicado_mora: "Desglose: Mora",
  aplicado_interes: "Desglose: Interés",
  aplicado_capital: "Desglose: Capital",
  saldo_pendiente: "Saldo pendiente",
  metodo_pago: "Método de pago",
  cobrador: "Nombre del cobrador",
  firma_cliente: "Línea de firma del cliente",
  firma_cobrador: "Línea de firma del cobrador",
};

// ── Tab 2: Diseño del Ticket ──
export function TicketTab() {
  const { empresaId, monedaSimbolo } = useEmpresa();
  const { data: config, isLoading } = useEmpresaConfig();
  const { data: empresa } = useQuery({
    queryKey: ["empresa-datos", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("logo_url")
        .eq("id", empresaId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const saveConfig = useSaveEmpresaConfig();
  const [local, setLocal] = useState<EmpresaConfig | null>(null);

  useEffect(() => {
    if (config) setLocal({ ...config });
  }, [config]);

  if (isLoading || !local) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  const toggleField = (field: keyof TicketCampos) => {
    setLocal({
      ...local,
      ticket_campos: { ...local.ticket_campos, [field]: !local.ticket_campos[field] },
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Settings */}
      <div className="lg:col-span-3 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Encabezado y Pie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Mostrar logo en el ticket</Label>
              <Switch
                checked={local.ticket_mostrar_logo}
                onCheckedChange={(v) => setLocal({ ...local, ticket_mostrar_logo: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto de encabezado</Label>
              <Input
                value={local.ticket_encabezado}
                onChange={(e) => setLocal({ ...local, ticket_encabezado: e.target.value })}
                placeholder="Ej: Recibo de Pago Oficial"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto de pie de página</Label>
              <Input
                value={local.ticket_pie}
                onChange={(e) => setLocal({ ...local, ticket_pie: e.target.value })}
                placeholder="Ej: Gracias por su pago"
                maxLength={200}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campos del Ticket</CardTitle>
            <CardDescription>Selecciona qué información aparecerá en el ticket de pago</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(TICKET_FIELD_LABELS) as (keyof TicketCampos)[]).map((field) => (
                <div key={field} className="flex items-center justify-between p-2 rounded-lg border">
                  <span className="text-sm">{TICKET_FIELD_LABELS[field]}</span>
                  <Switch
                    checked={local.ticket_campos[field]}
                    onCheckedChange={() => toggleField(field)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button onClick={() => saveConfig.mutate(local)} disabled={saveConfig.isPending} className="w-full">
          <Save className="h-4 w-4 mr-1" />
          {saveConfig.isPending ? "Guardando..." : "Guardar Configuración de Ticket"}
        </Button>
      </div>

      {/* Preview - Vertical Ticket Style */}
      <div className="lg:col-span-2">
        <Card className="sticky top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> Vista Previa del Ticket
            </CardTitle>
            <CardDescription>Así se verá el recibo enviado por WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <div className="w-[300px] bg-white text-black rounded-lg shadow-lg border border-border/40 font-mono text-[11px] overflow-hidden">
              {/* Header */}
              <div className="bg-[#f8f9fa] px-5 py-4 text-center border-b border-dashed border-[#ddd]">
                {local.ticket_mostrar_logo && (
                  <div className="flex justify-center mb-2">
                    {empresa?.logo_url ? (
                      <img src={empresa.logo_url} alt="Logo" className="h-10 w-auto object-contain" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-[#eee] flex items-center justify-center text-[#999] text-[8px]">LOGO</div>
                    )}
                  </div>
                )}
                {local.ticket_encabezado && (
                  <p className="font-bold text-[13px] tracking-[2px] uppercase text-[#333]">{local.ticket_encabezado}</p>
                )}
                <div className="mt-2">
                  <span className="inline-block bg-[#22c55e] text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">✓ Pago Recibido</span>
                </div>
              </div>

              {/* Datos Recibo */}
              <div className="px-5 py-3 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#999] mb-1">Datos del Recibo</p>
                {local.ticket_campos.prestamo_id && (
                  <div className="flex justify-between"><span className="text-[#666]">Folio:</span><span className="font-bold">REC-0042</span></div>
                )}
                {local.ticket_campos.fecha_pago && (
                  <div className="flex justify-between"><span className="text-[#666]">Fecha:</span><span className="font-bold">13/Mar/2026 14:30</span></div>
                )}
                {local.ticket_campos.metodo_pago && (
                  <div className="flex justify-between"><span className="text-[#666]">Método:</span><span className="font-bold">Efectivo</span></div>
                )}
              </div>

              <div className="border-t border-dashed border-[#ddd] mx-5" />

              {/* Cliente */}
              <div className="px-5 py-3 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#999] mb-1">Cliente</p>
                {local.ticket_campos.cliente_nombre && (
                  <div className="flex justify-between"><span className="text-[#666]">Nombre:</span><span className="font-bold">Juan Pérez</span></div>
                )}
                {local.ticket_campos.cliente_dni && (
                  <div className="flex justify-between"><span className="text-[#666]">Documento:</span><span className="font-bold">00000000-0</span></div>
                )}
                {local.ticket_campos.cliente_telefono && (
                  <div className="flex justify-between"><span className="text-[#666]">Teléfono:</span><span className="font-bold">7000-0000</span></div>
                )}
              </div>

              <div className="border-t border-dashed border-[#ddd] mx-5" />

              {/* Desglose */}
              <div className="px-5 py-3 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#999] mb-1">Desglose del Pago</p>
                {local.ticket_campos.aplicado_mora && (
                  <div className="flex justify-between"><span className="text-[#666]">A Mora:</span><span className="font-bold">{monedaSimbolo}5.00</span></div>
                )}
                {local.ticket_campos.aplicado_interes && (
                  <div className="flex justify-between"><span className="text-[#666]">A Interés:</span><span className="font-bold">{monedaSimbolo}15.00</span></div>
                )}
                {local.ticket_campos.aplicado_capital && (
                  <div className="flex justify-between"><span className="text-[#666]">A Capital:</span><span className="font-bold">{monedaSimbolo}30.00</span></div>
                )}
              </div>

              {/* Total */}
              {local.ticket_campos.monto_recibido && (
                <div className="mx-5 border-t-2 border-b-2 border-[#333] py-2 flex justify-between text-[14px] font-bold">
                  <span>TOTAL PAGADO</span>
                  <span>{monedaSimbolo}50.00</span>
                </div>
              )}

              {/* Saldo */}
              <div className="px-5 py-3 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#999] mb-1">Saldo</p>
                <div className="flex justify-between"><span className="text-[#666]">Cuota:</span><span className="font-bold">3 de 12</span></div>
                {local.ticket_campos.saldo_pendiente && (
                  <div className="flex justify-between"><span className="text-[#666]">Saldo Restante:</span><span className="font-bold">{monedaSimbolo}450.00</span></div>
                )}
                <div className="flex justify-between"><span className="text-[#666]">Próx. Venc.:</span><span className="font-bold">20/Mar/2026</span></div>
              </div>

              {/* Firmas */}
              {(local.ticket_campos.firma_cliente || local.ticket_campos.firma_cobrador) && (
                <div className="px-5 py-3 border-t border-dashed border-[#ddd]">
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    {local.ticket_campos.firma_cliente && (
                      <div className="text-center"><div className="border-t border-[#333] mt-6 pt-1 text-[9px] text-[#666]">Firma Cliente</div></div>
                    )}
                    {local.ticket_campos.firma_cobrador && (
                      <div className="text-center"><div className="border-t border-[#333] mt-6 pt-1 text-[9px] text-[#666]">Firma Cobrador</div></div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer */}
              {local.ticket_pie && (
                <div className="bg-[#f8f9fa] px-5 py-3 text-center border-t border-dashed border-[#ddd]">
                  <p className="text-[10px] text-[#999] italic">{local.ticket_pie}</p>
                  <p className="text-[9px] text-[#bbb] mt-0.5">© {new Date().getFullYear()}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
