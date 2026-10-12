import { toast } from "sonner";
import type { AnularPagoModal } from "@/components/AnularPagoModal";
import type { EditPagoModal } from "@/components/EditPagoModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Check, Ban, XCircle, Eye, Send, Download } from "lucide-react";
import { cn, $$, fmtDate } from "@/lib/utils";
import { generarReciboPagos } from "@/lib/pdfDocuments";
import type { ComponentProps } from "react";
import { dash, type PagoRow, type DocType, type PdfPrestamo, type PdfPagos } from "./utils";
import { MetodoDot } from "./ui";

interface TabPagosProps {
  pagosRaw: PagoRow[];
  isCancelado: boolean;
  handleSendReceiptWA: (pg: PagoRow, i: number) => void;
  pdfPrestamo: PdfPrestamo;
  pdfPagos: PdfPagos;
  shortId: string;
  setDocPreview: (preview: { open: boolean; type: DocType | null }) => void;
  setEditPagoData: (pago: ComponentProps<typeof EditPagoModal>["pago"]) => void;
  setEditPagoOpen: (open: boolean) => void;
  setSelectedPago: (pago: ComponentProps<typeof AnularPagoModal>["pago"]) => void;
  setAnularPagoOpen: (open: boolean) => void;
  totalPagosMonto: number;
  totalPagosMora: number;
  totalPagosInteres: number;
  totalPagosCapital: number;
}

export function TabPagos({
  pagosRaw, isCancelado, handleSendReceiptWA, pdfPrestamo, pdfPagos, shortId, setDocPreview,
  setEditPagoData, setEditPagoOpen, setSelectedPago, setAnularPagoOpen, totalPagosMonto,
  totalPagosMora, totalPagosInteres, totalPagosCapital,
}: TabPagosProps) {
  return (
    <>
      {/* Mobile: Cards */}
      <div className="md:hidden space-y-2 p-3">
        {pagosRaw.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-[13px]">Sin pagos registrados</p>
        ) : (
          <>
            {pagosRaw.map((pg, i) => {
              const cajaName = (pg.cajas as any)?.nombre || "—";
              const isAnulado = (pg as any).anulado === true;
              return (
                <div key={pg.id} className={cn("border rounded-lg p-3 bg-card", isAnulado && "opacity-50")}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-muted-foreground">#{i + 1}</span>
                      <span className="text-[12px] text-muted-foreground">{fmtDate(pg.created_at)}</span>
                    </div>
                    <span className="text-[14px] font-bold">{$$(Number(pg.monto_recibido))}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Capital</span><span>{dash(pg.aplicado_capital) || $$(pg.aplicado_capital)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Interés</span><span>{dash(pg.aplicado_interes) || $$(pg.aplicado_interes)}</span></div>
                    {(pg.aplicado_mora || 0) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Mora</span><span className="text-destructive">{$$(pg.aplicado_mora)}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">Método</span><span>{pg.metodo_pago || "Efectivo"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Caja</span><span>{cajaName}</span></div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    {isAnulado ? (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-destructive text-destructive">
                        <XCircle className="h-3 w-3 mr-0.5" />Anulado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-[hsl(142,72%,37%)] text-[hsl(142,72%,37%)]">
                        <Check className="h-3 w-3 mr-0.5" />Válido
                      </span>
                    )}
                    {!isAnulado && (
                      <div className="flex items-center gap-1">
                        <button title="Ver" onClick={() => setDocPreview({ open: true, type: "pagos" })} className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10"><Eye className="h-3.5 w-3.5" /></button>
                        <button title="Descargar" onClick={async () => { try { const doc = await generarReciboPagos(pdfPrestamo, [pdfPagos[i]]); doc.save(`recibo-pago-${i + 1}-${shortId}.pdf`); } catch (err: any) { toast.error("Error: " + err.message); } }} className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /></button>
                        {!isCancelado && (
                          <button title="Anular" onClick={() => { setSelectedPago({ id: pg.id, prestamo_id: pg.prestamo_id, cuota_id: pg.cuota_id, monto_recibido: Number(pg.monto_recibido), aplicado_mora: Number(pg.aplicado_mora || 0), aplicado_interes: Number(pg.aplicado_interes || 0), aplicado_capital: Number(pg.aplicado_capital || 0), caja_id: pg.caja_id, cobrador_id: (pg as any).cobrador_id }); setAnularPagoOpen(true); }} className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Ban className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="border rounded-lg p-3 bg-muted/30">
              <div className="flex justify-between text-[12px] font-semibold">
                <span>Totales</span>
                <span>{$$(totalPagosMonto)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-1 text-[11px] text-muted-foreground">
                <span>Cap: {$$(totalPagosCapital)}</span>
                <span>Int: {$$(totalPagosInteres)}</span>
                <span>Mora: {$$(totalPagosMora)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop: Table */}
      <div className="overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-[hsl(210,20%,98%)] hover:bg-[hsl(210,20%,98%)]">
              {["Fecha", "Recibo", "Monto", "→ Mora", "→ Interés", "→ Capital", "Caja", "Método", "Estado", ""].map((h) => (
                <TableHead key={h} className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(220,9%,42%)] px-3 py-2 whitespace-nowrap border-b border-[hsl(220,14%,91%)]">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagosRaw.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-[13px]">Sin pagos registrados</TableCell></TableRow>
            ) : (
              <>
                {pagosRaw.map((pg, i) => {
                  const cajaName = (pg.cajas as any)?.nombre || "—";
                  const isAnulado = (pg as any).anulado === true;
                  return (
                    <TableRow key={pg.id} className={cn(
                      "border-b border-[hsl(220,14%,96%)] hover:bg-[hsl(210,20%,98%)]",
                      isAnulado && "opacity-50 line-through"
                    )}>
                      <TableCell className="px-3 text-[12px]">{fmtDate(pg.created_at)}</TableCell>
                      <TableCell className="px-3 text-[12px] text-muted-foreground">#{i + 1}</TableCell>
                      <TableCell className="px-3 text-[13px] font-medium">{$$(Number(pg.monto_recibido))}</TableCell>
                      <TableCell className={cn("px-3 text-[12px]", (pg.aplicado_mora || 0) > 0 ? "text-destructive" : "text-[hsl(220,14%,83%)]")}>{(pg.aplicado_mora || 0) > 0 ? $$(pg.aplicado_mora) : "—"}</TableCell>
                      <TableCell className="px-3 text-[12px]">{dash(pg.aplicado_interes) || $$(pg.aplicado_interes)}</TableCell>
                      <TableCell className="px-3 text-[12px]">{dash(pg.aplicado_capital) || $$(pg.aplicado_capital)}</TableCell>
                      <TableCell className="px-3 text-[12px] text-muted-foreground">{cajaName}</TableCell>
                      <TableCell className="px-3"><MetodoDot metodo={pg.metodo_pago || "Efectivo"} /></TableCell>
                      <TableCell className="px-3">
                        {isAnulado ? (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-destructive text-destructive" title={(pg as any).motivo_anulacion || ""}>
                            <XCircle className="h-3 w-3 mr-0.5" />Anulado
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-[hsl(142,72%,37%)] text-[hsl(142,72%,37%)]">
                            <Check className="h-3 w-3 mr-0.5" />Válido
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3">
                        {!isAnulado && (
                          <div className="flex items-center gap-0.5">
                            {!isCancelado && (
                              <button title="Editar pago" onClick={() => { setEditPagoData({ id: pg.id, prestamo_id: pg.prestamo_id, cuota_id: pg.cuota_id, monto_recibido: Number(pg.monto_recibido), aplicado_mora: Number(pg.aplicado_mora || 0), aplicado_interes: Number(pg.aplicado_interes || 0), aplicado_capital: Number(pg.aplicado_capital || 0), metodo_pago: pg.metodo_pago || "Efectivo", caja_id: pg.caja_id, cobrador_id: (pg as any).cobrador_id, fecha_pago: (pg as any).fecha_pago }); setEditPagoOpen(true); }} className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button title="Ver comprobante" onClick={() => setDocPreview({ open: true, type: "pagos" })} className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Enviar recibo por WhatsApp"
                              onClick={() => handleSendReceiptWA(pg, i)}
                              className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-[hsl(142,72%,37%)] hover:bg-[hsl(142,72%,37%)]/10 transition-colors"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                            <button title="Descargar" onClick={async () => { try { const doc = await generarReciboPagos(pdfPrestamo, [pdfPagos[i]]); doc.save(`recibo-pago-${i + 1}-${shortId}.pdf`); } catch (err: any) { toast.error("Error: " + err.message); } }} className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            {!isCancelado && (
                              <button title="Anular pago" onClick={() => { setSelectedPago({ id: pg.id, prestamo_id: pg.prestamo_id, cuota_id: pg.cuota_id, monto_recibido: Number(pg.monto_recibido), aplicado_mora: Number(pg.aplicado_mora || 0), aplicado_interes: Number(pg.aplicado_interes || 0), aplicado_capital: Number(pg.aplicado_capital || 0), caja_id: pg.caja_id, cobrador_id: (pg as any).cobrador_id }); setAnularPagoOpen(true); }} className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-[hsl(210,20%,98%)] hover:bg-[hsl(210,20%,98%)] font-semibold border-t border-[hsl(220,14%,91%)]">
                  <TableCell className="px-3 text-[12px]">Totales</TableCell>
                  <TableCell className="px-3" />
                  <TableCell className="px-3 text-[13px]">{$$(totalPagosMonto)}</TableCell>
                  <TableCell className="px-3 text-[12px]">{$$(totalPagosMora)}</TableCell>
                  <TableCell className="px-3 text-[12px]">{$$(totalPagosInteres)}</TableCell>
                  <TableCell className="px-3 text-[12px]">{$$(totalPagosCapital)}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
