import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type EntityType = "cliente" | "caja" | "ruta" | "metodo_pago";

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}

const ENTITY_CONFIG: Record<EntityType, { title: string; table: string; fields: FieldDef[]; invalidateKeys: string[] }> = {
  cliente: {
    title: "Nuevo Cliente",
    table: "clientes",
    fields: [
      { key: "nombre_completo", label: "Nombre Completo", required: true, placeholder: "Nombre del cliente" },
      { key: "telefono", label: "Teléfono", placeholder: "Número de teléfono" },
      { key: "dni", label: "DNI / Documento", placeholder: "Número de documento" },
      { key: "direccion", label: "Dirección", placeholder: "Dirección del cliente" },
    ],
    invalidateKeys: ["clientes-options", "clientes"],
  },
  caja: {
    title: "Nueva Caja",
    table: "cajas",
    fields: [
      { key: "nombre", label: "Nombre", required: true, placeholder: "Nombre de la caja" },
      { key: "descripcion", label: "Descripción", placeholder: "Descripción opcional" },
    ],
    invalidateKeys: ["cajas-options", "cajas-all"],
  },
  ruta: {
    title: "Nueva Ruta",
    table: "rutas",
    fields: [
      { key: "nombre", label: "Nombre", required: true, placeholder: "Nombre de la ruta" },
      { key: "descripcion", label: "Descripción", placeholder: "Descripción opcional" },
    ],
    invalidateKeys: ["rutas-options", "rutas-all", "rutas"],
  },
  metodo_pago: {
    title: "Nuevo Método de Pago",
    table: "cat_metodos_pago",
    fields: [
      { key: "nombre", label: "Nombre", required: true, placeholder: "Ej: Transferencia, Cheque..." },
    ],
    invalidateKeys: ["metodos-pago-activos", "catalogos"],
  },
};

interface QuickCreateDialogProps {
  entityType: EntityType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string, label: string) => void;
}

export function QuickCreateDialog({ entityType, open, onOpenChange, onCreated }: QuickCreateDialogProps) {
  const config = ENTITY_CONFIG[entityType];
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) setValues({});
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    // Validate required fields
    for (const field of config.fields) {
      if (field.required && !values[field.key]?.trim()) {
        toast.error(`${field.label} es obligatorio`);
        return;
      }
    }

    setSaving(true);
    try {
      const insertData: Record<string, any> = { empresa_id: empresaId };
      for (const field of config.fields) {
        if (values[field.key]?.trim()) {
          insertData[field.key] = (values[field.key] ?? "").trim();
        }
      }

      const { data, error } = await supabase
        .from(config.table as any)
        .insert(insertData as any)
        .select("id")
        .single();

      if (error) throw error;

      // Determine label for the new item
      const label = values["nombre_completo"] || values["nombre"] || "";

      // Invalidate relevant queries
      for (const key of config.invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }

      toast.success(`${config.title.replace("Nuev", "Cread").replace("a C", "a c").replace("o M", "o m")} exitosamente`);
      onCreated((data as any).id, label);
      handleOpen(false);
    } catch (err: any) {
      toast.error("Error al crear: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            {config.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {config.fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs">
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <Input
                type={field.type || "text"}
                placeholder={field.placeholder}
                value={values[field.key] || ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateButtonProps {
  entityType: EntityType;
  onCreated: (id: string, label: string) => void;
}

export function QuickCreateButton({ entityType, onCreated }: CreateButtonProps) {
  const [open, setOpen] = useState(false);
  const config = ENTITY_CONFIG[entityType];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Crear {config.title.replace("Nuev", "nuev")}
      </button>
      <QuickCreateDialog
        entityType={entityType}
        open={open}
        onOpenChange={setOpen}
        onCreated={onCreated}
      />
    </>
  );
}
