import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Upload, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { $$ } from "@/lib/utils";

interface BuroConsulta {
  id: string;
  rfc: string;
  razon_social: string | null;
  estatus: "pendiente" | "exitosa" | "sin_hit" | "error";
  folio_consulta: string | null;
  score: number | null;
  resumen: { num_creditos?: number; saldo_total?: number; saldo_vencido?: number; atraso_mayor?: number; peor_calificacion?: string | null; claves_prevencion?: number } | null;
  error: string | null;
  autorizacion_fecha: string;
  autorizacion_path: string | null;
  created_at: string;
}

const estatusColors: Record<string, string> = {
  exitosa: "bg-success text-success-foreground",
  sin_hit: "bg-muted text-muted-foreground",
  error: "bg-destructive text-destructive-foreground",
  pendiente: "bg-warning text-warning-foreground",
};
const estatusLabel: Record<string, string> = { exitosa: "Exitosa", sin_hit: "Sin historial", error: "Error", pendiente: "Pendiente" };

async function invokeError(error: { message?: string; context?: { json?: () => Promise<{ error?: string }> } }): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch { /* noop */ }
  return error?.message || "Error desconocido";
}

export default function BuroCreditoSection({ clienteId, tipoPersona }: { clienteId: string; tipoPersona: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fecha, setFecha] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: consultas, isLoading } = useQuery({
    queryKey: ["buro-consultas", clienteId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabla aún no está en types.ts generado
      const { data, error } = await (supabase.from as any)("buro_consultas")
        .select("id, rfc, razon_social, estatus, folio_consulta, score, resumen, error, autorizacion_fecha, autorizacion_path, created_at")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BuroConsulta[];
    },
  });

  const { data: plan } = useQuery({
    queryKey: ["buro-plan"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabla aún no está en types.ts generado
      const { data } = await (supabase.from as any)("buro_empresa_config").select("habilitado, creditos").maybeSingle();
      return (data as { habilitado: boolean; creditos: number } | null) ?? { habilitado: false, creditos: 0 };
    },
  });

  const consultar = async (forzar = false) => {
    if (!fecha) { toast.error("Captura la fecha de la autorización firmada"); return; }
    if (!archivo) { toast.error("Adjunta la autorización firmada por el representante legal"); return; }
    if (!acepto) { toast.error("Confirma que cuentas con la autorización"); return; }
    setLoading(true);
    try {
      const { data: empresaId, error: empErr } = await supabase.rpc("get_user_empresa_id");
      if (empErr || !empresaId) throw new Error("Sin empresa asociada");
      const ext = archivo.name.split(".").pop() || "pdf";
      const path = `${empresaId}/${clienteId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("buro-autorizaciones").upload(path, archivo);
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("buro-consulta-pm", {
        body: { cliente_id: clienteId, autorizacion_fecha: fecha, autorizacion_path: path, forzar },
      });
      if (error) throw new Error(await invokeError(error));

      const c = data?.consulta as BuroConsulta | undefined;
      if (data?.reutilizada) {
        if (confirm(`Ya existe una consulta del ${new Date(c!.created_at).toLocaleDateString()}. ¿Hacer una nueva consulta (con costo)?`)) {
          setLoading(false);
          return consultar(true);
        }
        toast.info("Se muestra la consulta vigente");
      } else if (c?.estatus === "error") {
        toast.error("Buró respondió con error: " + (c.error || ""));
      } else {
        toast.success(c?.estatus === "sin_hit" ? "Sin historial en Buró" : "Consulta realizada");
        setFecha(""); setArchivo(null); setAcepto(false);
      }
      qc.invalidateQueries({ queryKey: ["buro-consultas", clienteId] });
      qc.invalidateQueries({ queryKey: ["buro-plan"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const verAutorizacion = async (path: string) => {
    const { data, error } = await supabase.storage.from("buro-autorizaciones").createSignedUrl(path, 120);
    if (error || !data) { toast.error("No se pudo abrir el archivo"); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (tipoPersona !== "moral") {
    return (
      <Card><CardContent className="py-8 text-center text-[13px] text-muted-foreground">
        La consulta a Buró está disponible para clientes Persona Moral. Cambia el tipo de persona en la pestaña Personal.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Nueva consulta Círculo de Crédito (PM)</CardTitle>
          <Badge variant={plan?.creditos ? "default" : "secondary"}>{plan?.creditos ?? 0} créditos</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">Fecha de autorización firmada</Label>
            <Input type="date" value={fecha} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Autorización (PDF / imagen)</Label>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            <Button type="button" variant="outline" className="w-full justify-start truncate" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">{archivo?.name || "Seleccionar archivo"}</span>
            </Button>
          </div>
          <Button onClick={() => consultar(false)} disabled={loading || !plan?.habilitado || !plan?.creditos}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}Consultar
          </Button>
          {plan && (!plan.habilitado || !plan.creditos) && (
            <p className="sm:col-span-3 text-xs text-destructive">
              {!plan.habilitado ? "Servicio no contratado. Contacta a soporte para activarlo." : "Sin créditos. Contacta a soporte para recargar."}
            </p>
          )}
          <label className="sm:col-span-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox checked={acepto} onCheckedChange={(v) => setAcepto(!!v)} className="mt-0.5" />
            Confirmo que el representante legal firmó la autorización para consultar el historial crediticio de la empresa.
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Historial de consultas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !consultas?.length ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">Sin consultas</p>
          ) : consultas.map((c) => (
            <div key={c.id} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-muted-foreground">{new Date(c.created_at).toLocaleString()} · {c.rfc}</span>
                <Badge className={estatusColors[c.estatus]}>{estatusLabel[c.estatus]}</Badge>
              </div>
              {c.estatus === "error" ? (
                <p className="text-xs text-destructive break-words">{c.error}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                  <div><span className="text-xs text-muted-foreground block">Calificación</span><b>{c.resumen?.peor_calificacion ?? "—"}</b></div>
                  <div><span className="text-xs text-muted-foreground block">Atraso mayor</span><b className={Number(c.resumen?.atraso_mayor) > 0 ? "text-destructive" : ""}>{c.resumen?.atraso_mayor ?? 0} días</b></div>
                  <div><span className="text-xs text-muted-foreground block">Créditos</span><b>{c.resumen?.num_creditos ?? 0}</b></div>
                  <div><span className="text-xs text-muted-foreground block">Saldo total</span><b>{$$(Number(c.resumen?.saldo_total || 0))}</b></div>
                  <div><span className="text-xs text-muted-foreground block">Saldo vencido</span>
                    <b className={Number(c.resumen?.saldo_vencido) > 0 ? "text-destructive" : ""}>{$$(Number(c.resumen?.saldo_vencido || 0))}</b></div>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Folio: {c.folio_consulta || "—"} · Autorización: {c.autorizacion_fecha}</span>
                {c.autorizacion_path && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => verAutorizacion(c.autorizacion_path!)}>
                    <FileText className="h-3.5 w-3.5 mr-1" />Ver
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
