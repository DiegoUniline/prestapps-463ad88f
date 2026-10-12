import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Upload, Save, Image as ImageIcon, Pencil, Coins } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUploadLogo } from "@/hooks/useEmpresaConfig";
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
export function DatosGeneralesTab() {
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
        .select("id, nombre, ruc, telefono, direccion, logo_url, activa, dias_gracia, dias_por_vencer, lada_pais, moneda_simbolo, moneda_codigo")
        .eq("id", empresaId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ nombre: "", ruc: "", telefono: "", direccion: "", dias_gracia: 0, dias_por_vencer: 7, lada_pais: "52", moneda_codigo: "USD", moneda_simbolo: "$" });

  useEffect(() => {
    if (empresa) {
      setForm({
        nombre: empresa.nombre || "",
        ruc: empresa.ruc || "",
        telefono: empresa.telefono || "",
        direccion: empresa.direccion || "",
        dias_gracia: empresa.dias_gracia ?? 0,
        dias_por_vencer: empresa.dias_por_vencer ?? 7,
        lada_pais: empresa.lada_pais || "52",
        moneda_codigo: empresa.moneda_codigo || "USD",
        moneda_simbolo: empresa.moneda_simbolo || "$",
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
          dias_gracia: form.dias_gracia,
          dias_por_vencer: form.dias_por_vencer,
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
    onError: (e) => toast.error(e.message),
  });

  const handleCancel = () => {
    if (empresa) {
      setForm({
        nombre: empresa.nombre || "",
        ruc: empresa.ruc || "",
        telefono: empresa.telefono || "",
        direccion: empresa.direccion || "",
        dias_gracia: empresa.dias_gracia ?? 0,
        dias_por_vencer: empresa.dias_por_vencer ?? 7,
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
          <div className="space-y-2">
            <Label>Días para "Por Vencer"</Label>
            <p className="text-xs text-muted-foreground">Préstamos con cuotas que vencen dentro de estos días aparecerán en la vista "Por Vencer"</p>
            {editing ? (
              <Input type="number" min={1} max={90} value={form.dias_por_vencer} onChange={(e) => setForm({ ...form, dias_por_vencer: parseInt(e.target.value) || 7 })} />
            ) : (
              <p className="text-sm font-medium py-2 px-3 rounded-md bg-muted/50 min-h-[36px]">{form.dias_por_vencer} día{form.dias_por_vencer !== 1 ? "s" : ""}</p>
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
