import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, MessageCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { sendDocumentViaWhatsApp } from "@/lib/whatsappDocument";
import { WhatsAppPreviewModal } from "@/components/WhatsAppPreviewModal";
import jsPDF from "jspdf";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fileName: string;
  generateDoc: () => Promise<jsPDF>;
  empresaId?: string;
  clientePhone?: string;
  clienteName?: string;
  /** Optional custom WhatsApp handler — when provided, bypasses the default PDF-send logic */
  onWhatsApp?: (phone: string) => Promise<void>;
}

/** Build a friendly WhatsApp message based on document type */
function buildDocMessage(title: string, fileName: string, clienteName?: string): string {
  const name = clienteName || "estimado cliente";
  
  if (title.toLowerCase().includes("estado de cuenta")) {
    return `Hola ${name} 👋\n\nTe compartimos tu *Estado de Cuenta* actualizado con el detalle de tu préstamo, pagos realizados y saldo pendiente.\n\n📄 Archivo: ${fileName}\n\nSi tienes alguna duda, no dudes en escribirnos. ¡Estamos para ayudarte! 🙏`;
  }
  
  if (title.toLowerCase().includes("contrato")) {
    return `Hola ${name} 👋\n\nTe enviamos una copia de tu *Contrato de Préstamo* para tu referencia y respaldo.\n\n📄 Archivo: ${fileName}\n\nConsérvalo en un lugar seguro. Si tienes preguntas, con gusto te atendemos. 🤝`;
  }
  
  if (title.toLowerCase().includes("recibo") || title.toLowerCase().includes("pago")) {
    return `Hola ${name} 👋\n\nTe compartimos tu *Recibo de Pagos* con el historial de todos los abonos registrados.\n\n📄 Archivo: ${fileName}\n\n¡Gracias por tu puntualidad! Tu compromiso es muy valioso para nosotros. 💪`;
  }

  return `Hola ${name} 👋\n\nTe enviamos el documento *${title}* adjunto para tu revisión.\n\n📄 Archivo: ${fileName}\n\nQuedamos atentos a cualquier duda. 🙏`;
}

export function DocumentPreviewModal({
  open, onOpenChange, title, fileName, generateDoc, empresaId, clientePhone, clienteName, onWhatsApp,
}: DocumentPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [docRef, setDocRef] = useState<jsPDF | null>(null);
  const [sending, setSending] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phone, setPhone] = useState(clientePhone || "");
  const [waPreview, setWaPreview] = useState(false);

  useEffect(() => {
    if (clientePhone) setPhone(clientePhone);
  }, [clientePhone]);

  useEffect(() => {
    if (!open) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
      setDocRef(null);
      setShowPhoneInput(false);
      setWaPreview(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    generateDoc().then((doc) => {
      if (cancelled) return;
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setDocRef(doc);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  const handleDownload = () => {
    if (!docRef) return;
    docRef.save(fileName);
  };

  const handleWhatsAppClick = () => {
    if (!phone.trim()) {
      setShowPhoneInput(true);
      return;
    }
    // Open preview modal with nice copy
    setWaPreview(true);
  };

  const doSendWhatsApp = async (message: string) => {
    setSending(true);
    try {
      if (onWhatsApp) {
        await onWhatsApp(phone.trim());
      } else {
        if (!docRef || !empresaId) return;
        const blob = docRef.output("blob");
        const result = await sendDocumentViaWhatsApp(
          empresaId,
          phone.trim(),
          blob,
          fileName,
          message,
        );
        if (result.success) {
          toast.success("Documento enviado por WhatsApp");
        } else {
          toast.error(result.error || "Error al enviar");
        }
      }
      setShowPhoneInput(false);
    } catch (e: any) {
      toast.error(e.message || "Error al enviar");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
              <div className="flex items-center gap-2">
                {showPhoneInput && (
                  <Input
                    placeholder="Número WhatsApp"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-8 w-40 text-[12px]"
                  />
                )}
                {empresaId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[12px]"
                    onClick={handleWhatsAppClick}
                    disabled={sending}
                  >
                    {sending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    WhatsApp
                  </Button>
                )}
                <Button variant="default" size="sm" className="h-8 text-[12px]" onClick={handleDownload} disabled={!docRef}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />Descargar PDF
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : blobUrl ? (
              <iframe src={blobUrl} className="w-full h-full border-0" title={title} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Error al generar el documento
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <WhatsAppPreviewModal
        open={waPreview}
        onOpenChange={setWaPreview}
        phone={phone}
        message={buildDocMessage(title, fileName, clienteName)}
        onSend={doSendWhatsApp}
        clienteName={clienteName}
      />
    </>
  );
}
