import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/utils";
import { construirBloques, generarReporteBuroPdf, type Bloque, type ConsultaReporte } from "@/lib/buroReporte";

function Pares({ pares }: { pares: [string, string][] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
      {pares.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-border/50 py-1 text-[13px]">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-medium text-right break-all">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Seccion({ b }: { b: Bloque }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{b.titulo}</h3>
      {b.tipo === "kv" ? <Pares pares={b.pares} /> : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>{b.columnas.map((c) => <TableHead key={c} className="whitespace-nowrap text-xs">{c}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {b.filas.map((f, i) => (
                <TableRow key={i}>{f.map((v, j) => <TableCell key={j} className="whitespace-nowrap text-xs">{v}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export default function BuroReporteDialog({ consulta, onClose }: { consulta: (ConsultaReporte & { id: string }) | null; onClose: () => void }) {
  const [generando, setGenerando] = useState(false);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["buro-respuesta", consulta?.id],
    enabled: !!consulta,
    queryFn: async () => {
      const { data, error } = await supabase.from("buro_consultas").select("respuesta").eq("id", consulta!.id).single();
      if (error) throw error;
      return data.respuesta;
    },
  });

  const bloques = useMemo(() => (respuesta ? construirBloques(respuesta) : []), [respuesta]);
  const moral = consulta?.tipo_persona === "moral";

  const descargar = async () => {
    if (!consulta || !respuesta) return;
    setGenerando(true);
    try {
      const { data: empresaId } = await supabase.rpc("get_user_empresa_id");
      const { data: emp } = empresaId
        ? await supabase.from("empresas").select("nombre").eq("id", empresaId).maybeSingle()
        : { data: null };
      await generarReporteBuroPdf(consulta, respuesta, emp?.nombre);
    } catch (e) {
      toast.error("No se pudo generar el PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Dialog open={!!consulta} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pr-8">
          <DialogTitle className="text-base">Reporte de crédito · {moral ? "Persona Moral" : "Persona Física"}</DialogTitle>
          <Button size="sm" variant="outline" onClick={descargar} disabled={!respuesta || generando}>
            {generando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}PDF
          </Button>
        </DialogHeader>
        {consulta && (
          <div className="space-y-5">
            <Pares pares={[
              [moral ? "Razón social" : "Nombre", consulta.razon_social || "—"],
              ["RFC", consulta.rfc],
              ["Folio de consulta", consulta.folio_consulta || "—"],
              ["Fecha de consulta", fmtDateTime(consulta.created_at)],
              ["Fecha de autorización", consulta.autorizacion_fecha],
              ...(moral ? [] : [["FICO Score", consulta.score != null ? String(consulta.score) : "—"] as [string, string]]),
            ]} />
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !bloques.length ? (
              <p className="text-[13px] text-muted-foreground text-center py-6">Sin detalle guardado para esta consulta</p>
            ) : bloques.map((b, i) => <Seccion key={i} b={b} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
