import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const CSV_COLUMNS = [
  { key: "nombre_completo", label: "nombre_completo", required: true },
  { key: "telefono", label: "telefono", required: false },
  { key: "correo", label: "correo", required: false },
  { key: "dni", label: "dni", required: false },
  { key: "documento_identidad", label: "documento_identidad", required: false },
  { key: "direccion", label: "direccion", required: false },
  { key: "sexo", label: "sexo", required: false },
  { key: "fecha_nacimiento", label: "fecha_nacimiento", required: false },
  { key: "estado_civil", label: "estado_civil", required: false },
  { key: "situacion_laboral", label: "situacion_laboral", required: false },
  { key: "ingresos", label: "ingresos", required: false },
  { key: "gastos_mensuales", label: "gastos_mensuales", required: false },
  { key: "dependientes", label: "dependientes", required: false },
  { key: "trabajo_empresa", label: "trabajo_empresa", required: false },
  { key: "trabajo_cargo", label: "trabajo_cargo", required: false },
  { key: "trabajo_telefono", label: "trabajo_telefono", required: false },
  { key: "trabajo_antiguedad", label: "trabajo_antiguedad", required: false },
  { key: "direccion_trabajo", label: "direccion_trabajo", required: false },
  { key: "tipo_vivienda", label: "tipo_vivienda", required: false },
  { key: "notas", label: "notas", required: false },
  { key: "ref1_nombre", label: "ref1_nombre", required: false },
  { key: "ref1_telefono", label: "ref1_telefono", required: false },
  { key: "ref1_parentesco", label: "ref1_parentesco", required: false },
  { key: "ref2_nombre", label: "ref2_nombre", required: false },
  { key: "ref2_telefono", label: "ref2_telefono", required: false },
  { key: "ref2_parentesco", label: "ref2_parentesco", required: false },
  { key: "aval_nombre", label: "aval_nombre", required: false },
  { key: "aval_telefono", label: "aval_telefono", required: false },
  { key: "aval_dni", label: "aval_dni", required: false },
  { key: "aval_direccion", label: "aval_direccion", required: false },
  { key: "aval_parentesco", label: "aval_parentesco", required: false },
];

function escapeCSV(val: string | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current.length > 0 || lines.length > 0) lines.push(current);
      current = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);

  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim().toLowerCase()] = (vals[i] || "").trim();
    });
    return obj;
  });
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

interface RowPreview {
  nombre_completo: string;
  telefono: string;
  dni: string;
  error?: string;
}

export default function ClientesBulkImportExport() {
  const { empresaId } = useEmpresa();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [previews, setPreviews] = useState<RowPreview[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; errors: number } | null>(null);

  const downloadTemplate = () => {
    const header = CSV_COLUMNS.map((c) => c.label).join(",");
    const example = [
      "Juan Pérez", "5551234567", "juan@email.com", "12345678", "INE",
      "Calle 1 #100", "Masculino", "1990-01-15", "Soltero", "Empleado",
      "15000", "5000", "0", "Empresa SA", "Vendedor", "5559876543",
      "2 años", "Av Central 50", "Propia", "Cliente nuevo",
      "María López", "5551112233", "Hermana",
      "Pedro Gómez", "5554445566", "Amigo",
      "Ana Ruiz", "5557778899", "87654321", "Calle 2 #200", "Madre",
    ].map(escapeCSV).join(",");
    const csv = header + "\n" + example + "\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Plantilla descargada");
  };

  const exportClientes = async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from("clientes")
      .select(CSV_COLUMNS.map((c) => c.key).join(","))
      .eq("empresa_id", empresaId)
      .order("nombre_completo");
    if (error) { toast.error("Error exportando"); return; }
    if (!data || data.length === 0) { toast.info("No hay clientes para exportar"); return; }

    const header = CSV_COLUMNS.map((c) => c.label).join(",");
    const rows = data.map((row: any) =>
      CSV_COLUMNS.map((c) => escapeCSV(row[c.key])).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${data.length} clientes exportados`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("El archivo está vacío o no tiene el formato correcto");
        return;
      }
      setParsedRows(rows);
      const previews: RowPreview[] = rows.map((r) => ({
        nombre_completo: r.nombre_completo || "",
        telefono: r.telefono || "",
        dni: r.dni || "",
        error: !r.nombre_completo ? "Falta nombre_completo" : undefined,
      }));
      setPreviews(previews);
      setResult(null);
      setShowPreview(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const doImport = async () => {
    if (!empresaId) return;
    setImporting(true);
    let ok = 0, errors = 0;

    const validRows = parsedRows.filter((r) => r.nombre_completo?.trim());

    // batch insert in chunks of 50
    for (let i = 0; i < validRows.length; i += 50) {
      const chunk = validRows.slice(i, i + 50).map((r) => ({
        nombre_completo: r.nombre_completo.trim(),
        telefono: r.telefono || null,
        correo: r.correo || null,
        dni: r.dni || null,
        documento_identidad: (["DUI", "Pasaporte", "NIT", "Otro", "INE"].includes(r.documento_identidad) ? r.documento_identidad : null) as any,
        direccion: r.direccion || null,
        sexo: (["Masculino", "Femenino", "Otro"].includes(r.sexo) ? r.sexo : null) as any,
        fecha_nacimiento: r.fecha_nacimiento || null,
        estado_civil: (["Soltero", "Casado", "Unión libre", "Divorciado", "Viudo"].includes(r.estado_civil) ? r.estado_civil : null) as any,
        situacion_laboral: (["Empleado", "Independiente", "Desempleado", "Pensionado", "Otro"].includes(r.situacion_laboral) ? r.situacion_laboral : null) as any,
        ingresos: r.ingresos ? Number(r.ingresos) : null,
        gastos_mensuales: r.gastos_mensuales ? Number(r.gastos_mensuales) : null,
        dependientes: r.dependientes ? Number(r.dependientes) : null,
        trabajo_empresa: r.trabajo_empresa || null,
        trabajo_cargo: r.trabajo_cargo || null,
        trabajo_telefono: r.trabajo_telefono || null,
        trabajo_antiguedad: r.trabajo_antiguedad || null,
        direccion_trabajo: r.direccion_trabajo || null,
        tipo_vivienda: r.tipo_vivienda || null,
        notas: r.notas || null,
        ref1_nombre: r.ref1_nombre || null,
        ref1_telefono: r.ref1_telefono || null,
        ref1_parentesco: r.ref1_parentesco || null,
        ref2_nombre: r.ref2_nombre || null,
        ref2_telefono: r.ref2_telefono || null,
        ref2_parentesco: r.ref2_parentesco || null,
        aval_nombre: r.aval_nombre || null,
        aval_telefono: r.aval_telefono || null,
        aval_dni: r.aval_dni || null,
        aval_direccion: r.aval_direccion || null,
        aval_parentesco: r.aval_parentesco || null,
        empresa_id: empresaId,
        activo: true,
        estado: "Activo" as const,
      }));

      const { error } = await supabase.from("clientes").insert(chunk);
      if (error) {
        errors += chunk.length;
        console.error("Import chunk error:", error);
      } else {
        ok += chunk.length;
      }
    }

    errors += parsedRows.length - validRows.length;
    setResult({ ok, errors });
    setImporting(false);
    if (ok > 0) {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast.success(`${ok} clientes importados correctamente`);
    }
    if (errors > 0) {
      toast.error(`${errors} registros con errores`);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-[13px]">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Importar / Exportar</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Descargar plantilla CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportClientes}>
            <Download className="h-4 w-4 mr-2" />
            Exportar clientes actuales
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Importar desde CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa de importación</DialogTitle>
            <DialogDescription>
              {parsedRows.length} registros encontrados. Revisa antes de importar.
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[11px] px-3">#</TableHead>
                  <TableHead className="text-[11px] px-3">Nombre</TableHead>
                  <TableHead className="text-[11px] px-3">Teléfono</TableHead>
                  <TableHead className="text-[11px] px-3">Documento</TableHead>
                  <TableHead className="text-[11px] px-3">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previews.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-[12px] px-3">{i + 1}</TableCell>
                    <TableCell className="text-[13px] px-3 font-medium">{p.nombre_completo || "—"}</TableCell>
                    <TableCell className="text-[13px] px-3">{p.telefono || "—"}</TableCell>
                    <TableCell className="text-[13px] px-3">{p.dni || "—"}</TableCell>
                    <TableCell className="px-3">
                      {p.error ? (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {p.error}
                        </Badge>
                      ) : (
                        <Badge className="bg-success text-success-foreground text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {result && (
            <div className="bg-muted/50 border rounded-lg p-3 text-[13px] space-y-1">
              <p className="font-semibold">Resultado:</p>
              <p className="text-success">✓ {result.ok} importados correctamente</p>
              {result.errors > 0 && <p className="text-destructive">✗ {result.errors} con errores</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>
              <X className="h-4 w-4 mr-1" />
              Cerrar
            </Button>
            {!result && (
              <Button size="sm" onClick={doImport} disabled={importing || previews.every((p) => !!p.error)}>
                {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                Importar {previews.filter((p) => !p.error).length} clientes
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
