import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface PhotoLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt?: string;
}

export function PhotoLightbox({ open, onOpenChange, src, alt = "Foto" }: PhotoLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[600px] p-0 bg-transparent border-none shadow-none [&>button]:hidden">
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[80vh] max-w-full rounded-xl object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
