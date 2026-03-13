import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, MessageCircle, Loader2 } from "lucide-react";
import jsPDF from "jspdf";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fileName: string;
  generateDoc: () => Promise<jsPDF>;
  onSendWhatsApp?: (blobUrl: string) => void;
}

export function DocumentPreviewModal({
  open, onOpenChange, title, fileName, generateDoc, onSendWhatsApp,
}: DocumentPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [docRef, setDocRef] = useState<jsPDF | null>(null);

  useEffect(() => {
    if (!open) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
      setDocRef(null);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
            <div className="flex items-center gap-2">
              {onSendWhatsApp && blobUrl && (
                <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => onSendWhatsApp(blobUrl)}>
                  <MessageCircle className="h-3.5 w-3.5 mr-1.5" />WhatsApp
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
  );
}
