import { useRef, useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const THRESHOLD = 80;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPullDistance(0);
    setPulling(false);
    await queryClient.invalidateQueries({ refetchType: "all" });
    toast.success("Datos sincronizados");
    setRefreshing(false);
  }, [queryClient]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        setPulling(true);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && el.scrollTop <= 0) {
        setPullDistance(Math.min(delta * 0.5, 120));
        if (delta > 10) e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!pulling) return;
      if (pullDistance >= THRESHOLD) {
        handleRefresh();
      } else {
        setPullDistance(0);
        setPulling(false);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [pulling, pullDistance, refreshing, handleRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div ref={containerRef} className="flex-1 overflow-auto relative">
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height: refreshing ? 48 : pullDistance > 0 ? pullDistance : 0 }}
      >
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          style={{ opacity: refreshing ? 1 : progress }}
        >
          <Loader2
            className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 360}deg)` }}
          />
          <span>{refreshing ? "Sincronizando…" : progress >= 1 ? "Suelta para sincronizar" : "Arrastra para sincronizar"}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
