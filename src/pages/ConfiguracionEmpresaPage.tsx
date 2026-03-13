import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Building2, Receipt, FileText, Upload, Save, Image as ImageIcon, Eye, Pencil, CreditCard,
} from "lucide-react";
import { StripeConnectTab } from "@/components/StripeConnectTab";
import {
  useEmpresaConfig, useSaveEmpresaConfig, useUploadLogo,
  type EmpresaConfig, type TicketCampos, type ContratoCampos,
} from "@/hooks/useEmpresaConfig";

// ── Tab 1: Datos Generales ──
function DatosGeneralesTab() {
  const { empresaId } = useEmpresa();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadLogo = useUploadLogo();
  const [editing, setEditing] = useState(false);

  const { data: empresa, isLoading } = useQuery({
    queryKey: ["empresa-datos", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nombre, ruc, telefono, direccion, logo_url, activa")
        .eq("id", empresaId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ nombre: "", ruc: "", telefono: "", direccion: "" });

  useEffect(() => {
    if (empresa) {
      setForm({
        nombre: empresa.nombre || "",
        ruc: empresa.ruc || "",
        telefono: empresa.telefono || "",
        direccion: empresa.direccion || "",
      });
    }
  }, [empresa]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nombre.trim()) throw new Error("El nombre es requerido");
      const { error } = await supabase
        .from("empresas")
        .update({
          nombre: form.nombre.trim(),
          ruc: form.ruc || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
        })
        .eq("id", empresaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresa-datos"] });
      qc.invalidateQueries({ queryKey: ["empresas"] });
      toast.success("Datos actualizados");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCancel = () => {
    if (empresa) {
      setForm({
        nombre: empresa.nombre || "",
        ruc: empresa.ruc || "",
        telefono: empresa.telefono || "",
        direccion: empresa.direccion || "",
      });
    }
    setEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El logo no debe superar 2MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    uploadLogo.mutate({ empresaId, file });
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" /> Logo de la Empresa
          </CardTitle>
          <CardDescription>Se usará en tickets, contratos y documentos PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden flex-shrink-0">
              {empresa?.logo_url ? (
                <img src={empresa.logo_url} alt="Logo" className="h-full w-full object-contain p-2" />
              ) : (
                <Building2 className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadLogo.isPending}
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploadLogo.isPending ? "Subiendo..." : "Subir Logo"}
              </Button>
              <p className="text-xs text-muted-foreground">PNG, JPG o SVG. Máximo 2MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Data */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Datos de la Empresa
            </CardTitle>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            {editing ? (
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            ) : (
              <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">{form.nombre || "—"}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>RUC / NIT</Label>
              {editing ? (
                <Input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} />
              ) : (
                <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">{form.ruc || "—"}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              {editing ? (
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              ) : (
                <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">{form.telefono || "—"}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Dirección</Label>
            {editing ? (
              <Textarea value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} rows={2} />
            ) : (
              <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">{form.direccion || "—"}</p>
            )}
          </div>
          {editing && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
function TicketTab() {
  const { empresaId } = useEmpresa();
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
                  <div className="flex justify-between"><span className="text-[#666]">A Mora:</span><span className="font-bold">$5.00</span></div>
                )}
                {local.ticket_campos.aplicado_interes && (
                  <div className="flex justify-between"><span className="text-[#666]">A Interés:</span><span className="font-bold">$15.00</span></div>
                )}
                {local.ticket_campos.aplicado_capital && (
                  <div className="flex justify-between"><span className="text-[#666]">A Capital:</span><span className="font-bold">$30.00</span></div>
                )}
              </div>

              {/* Total */}
              {local.ticket_campos.monto_recibido && (
                <div className="mx-5 border-t-2 border-b-2 border-[#333] py-2 flex justify-between text-[14px] font-bold">
                  <span>TOTAL PAGADO</span>
                  <span>$50.00</span>
                </div>
              )}

              {/* Saldo */}
              <div className="px-5 py-3 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#999] mb-1">Saldo</p>
                <div className="flex justify-between"><span className="text-[#666]">Cuota:</span><span className="font-bold">3 de 12</span></div>
                {local.ticket_campos.saldo_pendiente && (
                  <div className="flex justify-between"><span className="text-[#666]">Saldo Restante:</span><span className="font-bold">$450.00</span></div>
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
function ContratoTab() {
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

// ── Página Principal ──
export default function ConfiguracionEmpresaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración de la Empresa</h1>
        <p className="text-muted-foreground text-sm mt-1">Logo, datos, tickets, contratos y pagos con tarjeta</p>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="datos" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Datos Generales
          </TabsTrigger>
          <TabsTrigger value="ticket" className="gap-1.5">
            <Receipt className="h-4 w-4" /> Ticket de Pago
          </TabsTrigger>
          <TabsTrigger value="contrato" className="gap-1.5">
            <FileText className="h-4 w-4" /> Contrato
          </TabsTrigger>
          <TabsTrigger value="stripe" className="gap-1.5">
            <CreditCard className="h-4 w-4" /> Stripe
          </TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <DatosGeneralesTab />
        </TabsContent>
        <TabsContent value="ticket">
          <TicketTab />
        </TabsContent>
        <TabsContent value="contrato">
          <ContratoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
