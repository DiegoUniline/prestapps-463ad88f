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
  Building2, Receipt, FileText, Upload, Save, Image as ImageIcon, Eye, Pencil, CreditCard, CalendarCheck, Send, FileDown, Phone, MessageSquare, Coins,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StripeConnectTab } from "@/components/StripeConnectTab";
import {
  useEmpresaConfig, useSaveEmpresaConfig, useUploadLogo,
  type EmpresaConfig, type TicketCampos, type ContratoCampos,
} from "@/hooks/useEmpresaConfig";
import { setCurrencySymbol } from "@/lib/utils";
import { useEmpresaStore } from "@/stores/empresaStore";

const MONEDAS = [
  { codigo: "USD", simbolo: "$", nombre: "Dólar estadounidense (USD)" },
  { codigo: "MXN", simbolo: "$", nombre: "Peso mexicano (MXN)" },
  { codigo: "COP", simbolo: "$", nombre: "Peso colombiano (COP)" },
  { codigo: "ARS", simbolo: "$", nombre: "Peso argentino (ARS)" },
  { codigo: "CLP", simbolo: "$", nombre: "Peso chileno (CLP)" },
  { codigo: "PEN", simbolo: "S/", nombre: "Sol peruano (PEN)" },
  { codigo: "GTQ", simbolo: "Q", nombre: "Quetzal guatemalteco (GTQ)" },
  { codigo: "HNL", simbolo: "L", nombre: "Lempira hondureño (HNL)" },
  { codigo: "NIO", simbolo: "C$", nombre: "Córdoba nicaragüense (NIO)" },
  { codigo: "CRC", simbolo: "₡", nombre: "Colón costarricense (CRC)" },
  { codigo: "PAB", simbolo: "B/.", nombre: "Balboa panameño (PAB)" },
  { codigo: "DOP", simbolo: "RD$", nombre: "Peso dominicano (DOP)" },
  { codigo: "BRL", simbolo: "R$", nombre: "Real brasileño (BRL)" },
  { codigo: "UYU", simbolo: "$U", nombre: "Peso uruguayo (UYU)" },
  { codigo: "BOB", simbolo: "Bs", nombre: "Boliviano (BOB)" },
  { codigo: "PYG", simbolo: "₲", nombre: "Guaraní paraguayo (PYG)" },
  { codigo: "VES", simbolo: "Bs.D", nombre: "Bolívar venezolano (VES)" },
  { codigo: "EUR", simbolo: "€", nombre: "Euro (EUR)" },
];

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
      const { data, error } = await (supabase as any)
        .from("empresas")
        .select("id, nombre, ruc, telefono, direccion, logo_url, activa, dias_gracia, dias_por_vencer, lada_pais, moneda_simbolo, moneda_codigo")
        .eq("id", empresaId)
        .single();
      if (error) throw error;
      return data as { id: string; nombre: string; ruc: string | null; telefono: string | null; direccion: string | null; logo_url: string | null; activa: boolean; dias_gracia: number; lada_pais: string; moneda_simbolo: string; moneda_codigo: string };
    },
  });

  const [form, setForm] = useState({ nombre: "", ruc: "", telefono: "", direccion: "", dias_gracia: 0, lada_pais: "52", moneda_codigo: "USD", moneda_simbolo: "$" });

  useEffect(() => {
    if (empresa) {
      setForm({
        nombre: empresa.nombre || "",
        ruc: empresa.ruc || "",
        telefono: empresa.telefono || "",
        direccion: empresa.direccion || "",
        dias_gracia: empresa.dias_gracia ?? 0,
        lada_pais: empresa.lada_pais || "52",
        moneda_codigo: empresa.moneda_codigo || "USD",
        moneda_simbolo: empresa.moneda_simbolo || "$",
      });
    }
  }, [empresa]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nombre.trim()) throw new Error("El nombre es requerido");
      const { error } = await (supabase as any)
        .from("empresas")
        .update({
          nombre: form.nombre.trim(),
          ruc: form.ruc || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          dias_gracia: form.dias_gracia,
          lada_pais: form.lada_pais || "52",
          moneda_simbolo: form.moneda_simbolo || "$",
          moneda_codigo: form.moneda_codigo || "USD",
        })
        .eq("id", empresaId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Update global currency symbol immediately
      setCurrencySymbol(form.moneda_simbolo);
      useEmpresaStore.setState({ monedaSimbolo: form.moneda_simbolo, monedaCodigo: form.moneda_codigo });
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
        dias_gracia: empresa.dias_gracia ?? 0,
        lada_pais: empresa.lada_pais || "52",
        moneda_codigo: empresa.moneda_codigo || "USD",
        moneda_simbolo: empresa.moneda_simbolo || "$",
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
              <Label>Lada de país</Label>
              {editing ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">+</span>
                  <Input value={form.lada_pais} onChange={(e) => setForm({ ...form, lada_pais: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="52" className="w-24" />
                  <span className="text-xs text-muted-foreground">Ej: 52 (MX), 1 (US), 57 (CO), 51 (PE)</span>
                </div>
              ) : (
                <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">+{form.lada_pais || "52"}</p>
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
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Coins className="h-4 w-4 text-primary" /> Moneda</Label>
            <p className="text-xs text-muted-foreground">Se usará en todo el sistema: reportes, tickets, contratos y pantallas</p>
            {editing ? (
              <Select
                value={form.moneda_codigo}
                onValueChange={(val) => {
                  const m = MONEDAS.find((m) => m.codigo === val);
                  if (m) setForm({ ...form, moneda_codigo: m.codigo, moneda_simbolo: m.simbolo });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      <span className="font-semibold mr-1">{m.simbolo}</span> {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">
                {form.moneda_simbolo} — {MONEDAS.find((m) => m.codigo === form.moneda_codigo)?.nombre || form.moneda_codigo}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Días de gracia para mora</Label>
            <p className="text-xs text-muted-foreground">Número de días después del vencimiento antes de marcar como "Vencido"</p>
            {editing ? (
              <Input type="number" min={0} max={90} value={form.dias_gracia} onChange={(e) => setForm({ ...form, dias_gracia: parseInt(e.target.value) || 0 })} />
            ) : (
              <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">{form.dias_gracia} día{form.dias_gracia !== 1 ? "s" : ""}</p>
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

function CorteSemanalTab() {
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

// ── Tab: Simulador ──
function SimuladorTab() {
  const { empresaId } = useEmpresa();
  const { data: config } = useEmpresaConfig();
  const { data: empresa } = useQuery({
    queryKey: ["empresa-datos", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("nombre, telefono, direccion, logo_url")
        .eq("id", empresaId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [phone, setPhone] = useState("");
  const [sendingTicket, setSendingTicket] = useState(false);
  const [sendingText, setSendingText] = useState(false);
  const [testMessage, setTestMessage] = useState("Hola, este es un mensaje de prueba desde PrestApps 🚀");

  // Mock data for previews
  const mockPago = {
    folio: "REC-0042",
    monto_recibido: 50,
    aplicado_mora: 5,
    aplicado_interes: 15,
    aplicado_capital: 30,
    metodo_pago: "Efectivo",
    cuota_num: "3",
    saldo_restante: 450,
    proxima_cuota: "20/Mar/2026",
    monto_proxima: 50,
    descuento: 0,
    pago_id: "test-pago",
  };
  const mockCliente = { nombre: "Juan Pérez (Prueba)", telefono: phone };
  const mockPrestamo = { folio: "PRE-0015", num_cuotas: 12 };
  const mockEmpresa = {
    nombre: empresa?.nombre || "Mi Empresa",
    telefono: empresa?.telefono || "",
    direccion: empresa?.direccion || "",
    logo_url: empresa?.logo_url || null,
  };

  const handleSendTicket = async () => {
    if (!phone.trim()) { toast.error("Ingresa un número de teléfono"); return; }
    setSendingTicket(true);
    try {
      const { sendReceiptAsImage } = await import("@/lib/whatsappReceipt");
      const result = await sendReceiptAsImage(
        empresaId,
        phone.trim(),
        {
          pago: mockPago,
          empresa: mockEmpresa,
          cliente: { nombre: mockCliente.nombre },
          prestamo: mockPrestamo,
        },
        `✅ Recibo de pago ${mockPago.folio} por $${mockPago.monto_recibido.toFixed(2)}. Gracias por su pago.`,
        true,
      );
      if (result.success) {
        toast.success("Ticket enviado correctamente por WhatsApp");
      } else {
        toast.error(result.error || "Error al enviar el ticket");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al enviar");
    } finally {
      setSendingTicket(false);
    }
  };

  const handleSendText = async () => {
    if (!phone.trim()) { toast.error("Ingresa un número de teléfono"); return; }
    if (!testMessage.trim()) { toast.error("Escribe un mensaje"); return; }
    setSendingText(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-sender", {
        body: {
           action: "send-text",
          empresa_id: empresaId,
          phone: phone.trim(),
          message: testMessage.trim(),
          tipo: "prueba",
          test: true,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Mensaje enviado correctamente por WhatsApp");
      } else {
        toast.error(data?.error || "Error al enviar el mensaje");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al enviar");
    } finally {
      setSendingText(false);
    }
  };

  const handleDownloadContract = async () => {
    try {
      const { generarContrato } = await import("@/lib/pdfDocuments");
      const prestamoData = {
        id: "test-simulador-id",
        clienteNombre: "Juan Pérez (Prueba)",
        clienteDni: "00000000-0",
        clienteDireccion: "Calle Ejemplo #123, Ciudad",
        clienteTelefono: "7000-0000",
        empresa: empresa?.nombre || "Mi Empresa",
        modalidad: "fijo",
        montoSolicitado: 1000,
        montoTotalPagar: 1200,
        numCuotas: 12,
        frecuencia: "Semanal",
        tasaInteres: 20,
        cuotaCalculada: 100,
        cuotaRedondeada: 100,
        gastosLegales: 0,
        tipoMora: "porcentaje",
        valorMora: 5,
        estado: "Activo",
        fechaRegistro: new Date().toISOString().slice(0, 10),
        fechaPrimerPago: new Date().toISOString().slice(0, 10),
        caja: "Caja Principal",
        ruta: "Ruta Centro",
        notas: "Contrato de prueba generado desde el simulador",
        logoUrl: empresa?.logo_url || null,
        empresaNombre: empresa?.nombre || "Mi Empresa",
      };
      const mockCuotas = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + (i + 1) * 7);
        return {
          num_cuota: i + 1,
          capital: 83.33,
          interes: 16.67,
          capital_interes: 100,
          fecha_vencimiento: d.toISOString().slice(0, 10),
          dias_atraso: 0,
          mora: 0,
          saldo_total: 100,
          status: "Pendiente",
          fecha_pagada: null,
          capital_pagado: 0,
          interes_pagado: 0,
          mora_pagada: 0,
        };
      });
      const doc = await generarContrato(prestamoData, mockCuotas);
      doc.save("contrato-prueba.pdf");
      toast.success("Contrato descargado");
    } catch (e: any) {
      toast.error(e.message || "Error al generar contrato");
    }
  };

  const handleDownloadTicket = async () => {
    try {
      const { generarReciboPagos } = await import("@/lib/pdfDocuments");
      const prestamoData = {
        id: "test-simulador-id",
        clienteNombre: "Juan Pérez (Prueba)",
        clienteDni: "00000000-0",
        clienteDireccion: "Calle Ejemplo #123",
        clienteTelefono: "7000-0000",
        empresa: empresa?.nombre || "Mi Empresa",
        modalidad: "fijo",
        montoSolicitado: 1000,
        montoTotalPagar: 1200,
        numCuotas: 12,
        frecuencia: "Semanal",
        tasaInteres: 20,
        cuotaCalculada: 100,
        cuotaRedondeada: 100,
        gastosLegales: 0,
        tipoMora: "porcentaje",
        valorMora: 5,
        estado: "Activo",
        fechaRegistro: new Date().toISOString().slice(0, 10),
        fechaPrimerPago: new Date().toISOString().slice(0, 10),
        caja: "Caja Principal",
        ruta: "Ruta Centro",
        notas: "",
        logoUrl: empresa?.logo_url || null,
        empresaNombre: empresa?.nombre || "Mi Empresa",
      };
      const mockPagos = [
        {
          created_at: new Date().toISOString(),
          monto_recibido: 50,
          aplicado_mora: 5,
          aplicado_interes: 15,
          aplicado_capital: 30,
          metodo_pago: "Efectivo",
          cajaNombre: "Caja Principal",
        },
      ];
      const doc = await generarReciboPagos(prestamoData, mockPagos);
      doc.save("recibo-prueba.pdf");
      toast.success("Recibo descargado");
    } catch (e: any) {
      toast.error(e.message || "Error al generar recibo");
    }
  };

  return (
    <div className="space-y-6">
      {/* Phone input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" /> Número de Prueba
          </CardTitle>
          <CardDescription>
            Ingresa el número de WhatsApp al que deseas enviar las pruebas (con código de país, ej: 503 7000 0000)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: 50370000000"
            className="max-w-xs"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ticket Preview & Send */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Simulador de Ticket
            </CardTitle>
            <CardDescription>Vista previa del recibo de pago que se envía por WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mini ticket preview */}
            <div className="mx-auto w-[280px] bg-white text-black rounded-lg shadow-lg border border-border/40 font-mono text-[10px] overflow-hidden">
              <div className="bg-[#f8f9fa] px-4 py-3 text-center border-b border-dashed border-[#ddd]">
                {empresa?.logo_url && (
                  <div className="flex justify-center mb-1">
                    <img src={empresa.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
                  </div>
                )}
                <p className="font-bold text-[12px] tracking-[2px] uppercase text-[#333]">{empresa?.nombre || "MI EMPRESA"}</p>
                <div className="mt-1">
                  <span className="inline-block bg-[#22c55e] text-white text-[8px] font-bold px-2 py-0.5 rounded uppercase">✓ PAGO RECIBIDO</span>
                </div>
              </div>
              <div className="px-4 py-2 space-y-0.5">
                <div className="flex justify-between"><span className="text-[#666]">Folio:</span><span className="font-bold">REC-0042</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Fecha:</span><span className="font-bold">{new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Cliente:</span><span className="font-bold">Juan Pérez</span></div>
              </div>
              <div className="border-t border-dashed border-[#ddd] mx-4" />
              <div className="px-4 py-2 space-y-0.5">
                <div className="flex justify-between"><span className="text-[#666]">A Mora:</span><span className="font-bold">$5.00</span></div>
                <div className="flex justify-between"><span className="text-[#666]">A Interés:</span><span className="font-bold">$15.00</span></div>
                <div className="flex justify-between"><span className="text-[#666]">A Capital:</span><span className="font-bold">$30.00</span></div>
              </div>
              <div className="mx-4 border-t-2 border-b-2 border-[#333] py-1.5 flex justify-between text-[13px] font-bold">
                <span>TOTAL</span><span>$50.00</span>
              </div>
              <div className="px-4 py-2 space-y-0.5">
                <div className="flex justify-between"><span className="text-[#666]">Cuota:</span><span className="font-bold">3 de 12</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Saldo:</span><span className="font-bold">$450.00</span></div>
              </div>
              <div className="bg-[#f8f9fa] px-4 py-2 text-center border-t border-dashed border-[#ddd]">
                <p className="text-[9px] text-[#999] italic">{config?.ticket_pie || "Gracias por su pago"}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleDownloadTicket}>
                <FileDown className="h-4 w-4 mr-1" /> Descargar PDF
              </Button>
              <Button className="flex-1" onClick={handleSendTicket} disabled={sendingTicket || !phone.trim()}>
                <Send className="h-4 w-4 mr-1" />
                {sendingTicket ? "Enviando..." : "Enviar por WhatsApp"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Contract Preview & Download */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Simulador de Contrato
            </CardTitle>
            <CardDescription>Genera un contrato de prueba con datos ficticios para ver cómo queda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mini contract preview */}
            <div className="mx-auto w-[280px] bg-white text-black rounded-lg shadow-lg border border-border/40 text-[10px] overflow-hidden">
              <div className="bg-primary px-4 py-3">
                <p className="text-primary-foreground font-bold text-[12px]">CONTRATO DE PRÉSTAMO</p>
                <p className="text-primary-foreground/70 text-[9px]">{empresa?.nombre || "Mi Empresa"}</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <div>
                  <p className="text-[8px] font-bold uppercase text-[#999] tracking-[1px]">Datos del Cliente</p>
                  <p className="font-medium">Juan Pérez (Prueba)</p>
                  <p className="text-[#666]">Doc: 00000000-0</p>
                </div>
                <div className="border-t border-[#eee] pt-2">
                  <p className="text-[8px] font-bold uppercase text-[#999] tracking-[1px]">Condiciones</p>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <div><span className="text-[#666]">Monto:</span> <span className="font-bold">$1,000.00</span></div>
                    <div><span className="text-[#666]">Total:</span> <span className="font-bold">$1,200.00</span></div>
                    <div><span className="text-[#666]">Cuotas:</span> <span className="font-bold">12</span></div>
                    <div><span className="text-[#666]">Tasa:</span> <span className="font-bold">20%</span></div>
                  </div>
                </div>
                <div className="border-t border-[#eee] pt-2">
                  <p className="text-[8px] font-bold uppercase text-[#999] tracking-[1px]">Plan de Pagos</p>
                  <div className="mt-1 space-y-0.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between text-[9px] bg-[#f9fafb] px-1 py-0.5 rounded">
                        <span>Cuota {i}</span><span className="font-bold">$100.00</span>
                      </div>
                    ))}
                    <p className="text-[8px] text-[#999] text-center">... 9 cuotas más</p>
                  </div>
                </div>
                <div className="border-t border-[#eee] pt-3 pb-1 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="border-t border-[#333] mt-4 pt-1 text-[8px] text-[#666]">Firma Cliente</div>
                  </div>
                  <div>
                    <div className="border-t border-[#333] mt-4 pt-1 text-[8px] text-[#666]">Firma Empresa</div>
                  </div>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleDownloadContract}>
              <FileDown className="h-4 w-4 mr-1" /> Descargar Contrato PDF de Prueba
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Text Test */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Prueba de Mensaje WhatsApp
          </CardTitle>
          <CardDescription>Envía un mensaje de texto libre para verificar que tu integración de WhatsApp funciona</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            rows={3}
            placeholder="Escribe un mensaje de prueba..."
          />
          <Button onClick={handleSendText} disabled={sendingText || !phone.trim()} className="w-full sm:w-auto">
            <Send className="h-4 w-4 mr-1" />
            {sendingText ? "Enviando..." : "Enviar Mensaje de Prueba"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Página Principal ──
export default function ConfiguracionEmpresaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración de la Empresa</h1>
        <p className="text-muted-foreground text-sm mt-1">Logo, datos, tickets, contratos, corte semanal, simulador y pagos con tarjeta</p>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="datos" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Datos Generales
          </TabsTrigger>
          <TabsTrigger value="ticket" className="gap-1.5">
            <Receipt className="h-4 w-4" /> Ticket de Pago
          </TabsTrigger>
          <TabsTrigger value="contrato" className="gap-1.5">
            <FileText className="h-4 w-4" /> Contrato
          </TabsTrigger>
          <TabsTrigger value="simulador" className="gap-1.5">
            <Send className="h-4 w-4" /> Simulador
          </TabsTrigger>
          <TabsTrigger value="corte" className="gap-1.5">
            <CalendarCheck className="h-4 w-4" /> Corte Semanal
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
        <TabsContent value="simulador">
          <SimuladorTab />
        </TabsContent>
        <TabsContent value="corte">
          <CorteSemanalTab />
        </TabsContent>
        <TabsContent value="stripe">
          <StripeConnectTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
