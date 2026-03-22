import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "groupBy";

function getStoredValue(userId: string | undefined, pageKey: string): string | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}:${pageKey}`);
    return raw;
  } catch {
    return null;
  }
}

export function usePersistedGroupBy(pageKey: string) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [groupBy, setGroupByState] = useState<string | null>(() =>
    getStoredValue(userId, pageKey)
  );

  const setGroupBy = useCallback(
    (key: string | null) => {
      setGroupByState(key);
      if (userId) {
        try {
          if (key) {
            localStorage.setItem(`${STORAGE_KEY}:${userId}:${pageKey}`, key);
          } else {
            localStorage.removeItem(`${STORAGE_KEY}:${userId}:${pageKey}`);
          }
        } catch {}
      }
    },
    [userId, pageKey]
  );

  return [groupBy, setGroupBy] as const;
}
