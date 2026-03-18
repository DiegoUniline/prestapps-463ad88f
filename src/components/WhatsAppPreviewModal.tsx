import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageSquare } from "lucide-react";

interface WhatsAppPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  message: string;
  onSend: (message: string) => Promise<void>;
  clienteName?: string;
}

export function WhatsAppPreviewModal({
  open, onOpenChange, phone, message, onSend, clienteName,
}: WhatsAppPreviewModalProps) {
  const [editedMessage, setEditedMessage] = useState(message);
  const [sending, setSending] = useState(false);

  // Reset message when modal opens with new content
  const handleOpenChange = (v: boolean) => {
    if (v) setEditedMessage(message);
    onOpenChange(v);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(editedMessage);
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[hsl(142,72%,37%)]" />
            Vista previa WhatsApp
          </DialogTitle>
          {clienteName && (
            <p className="text-sm text-muted-foreground">
              Para: {clienteName} ({phone})
            </p>
          )}
        </DialogHeader>

        {/* Chat bubble preview */}
        <div className="bg-[hsl(140,30%,94%)] dark:bg-[hsl(140,10%,20%)] rounded-lg p-4 space-y-2">
          <div className="bg-card rounded-lg p-3 shadow-sm max-w-[90%] ml-auto">
            <Textarea
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              rows={4}
              className="border-0 bg-transparent p-0 text-[13px] resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-0"
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right">Puedes editar el mensaje antes de enviar</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSend}
            disabled={sending || !editedMessage.trim()}
            className="bg-[hsl(142,72%,37%)] hover:bg-[hsl(142,72%,32%)] text-white"
          >
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
