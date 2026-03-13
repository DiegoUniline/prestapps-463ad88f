/**
 * Offline Queue — stores Supabase mutations in IndexedDB when offline.
 * When back online the user can hit "Sincronizar" to replay them.
 */
import { get, set, del, keys, createStore } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const store = createStore("prestapp-offline", "queue");

export interface QueuedMutation {
  id: string;
  createdAt: string;
  table: string;
  operation: "insert" | "update" | "upsert";
  payload: Record<string, unknown>;
  /** For update: eq filter */
  matchColumn?: string;
  matchValue?: string;
  /** Human-readable label */
  label: string;
  status: "pending" | "syncing" | "error";
  error?: string;
}

function genId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Enqueue a mutation */
export async function enqueue(mutation: Omit<QueuedMutation, "id" | "createdAt" | "status">) {
  const item: QueuedMutation = {
    ...mutation,
    id: genId(),
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await set(item.id, item, store);
  window.dispatchEvent(new Event("offline-queue-change"));
  return item;
}

/** Get all queued items */
export async function getAll(): Promise<QueuedMutation[]> {
  const allKeys = await keys(store);
  const items: QueuedMutation[] = [];
  for (const k of allKeys) {
    const val = await get<QueuedMutation>(k, store);
    if (val) items.push(val);
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Count pending items */
export async function pendingCount(): Promise<number> {
  const all = await getAll();
  return all.filter((i) => i.status === "pending").length;
}

/** Remove a single item */
export async function remove(id: string) {
  await del(id, store);
  window.dispatchEvent(new Event("offline-queue-change"));
}

/** Clear all items */
export async function clearAll() {
  const allKeys = await keys(store);
  for (const k of allKeys) await del(k, store);
  window.dispatchEvent(new Event("offline-queue-change"));
}

/** Sync all pending items — returns { synced, failed } */
export async function syncAll(): Promise<{ synced: number; failed: number }> {
  const items = await getAll();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    if (item.status !== "pending") continue;

    // Mark syncing
    item.status = "syncing";
    await set(item.id, item, store);
    window.dispatchEvent(new Event("offline-queue-change"));

    try {
      let query: any;

      if (item.operation === "insert") {
        query = supabase.from(item.table as any).insert(item.payload as any);
      } else if (item.operation === "update" && item.matchColumn && item.matchValue) {
        query = supabase
          .from(item.table as any)
          .update(item.payload as any)
          .eq(item.matchColumn, item.matchValue);
      } else if (item.operation === "upsert") {
        query = supabase.from(item.table as any).upsert(item.payload as any);
      } else {
        throw new Error("Operación no soportada");
      }

      const { error } = await query;
      if (error) throw error;

      // Success — remove from queue
      await del(item.id, store);
      synced++;
    } catch (err: any) {
      item.status = "error";
      item.error = err?.message || "Error desconocido";
      await set(item.id, item, store);
      failed++;
    }
  }

  window.dispatchEvent(new Event("offline-queue-change"));
  return { synced, failed };
}

/** Helper: check if we're online */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Smart mutation: if online → execute directly; if offline → queue.
 * Returns { queued: boolean }
 */
export async function smartMutation(opts: {
  table: string;
  operation: "insert" | "update" | "upsert";
  payload: Record<string, unknown>;
  matchColumn?: string;
  matchValue?: string;
  label: string;
}): Promise<{ queued: boolean; error?: string }> {
  if (isOnline()) {
    // Try direct
    try {
      let query: any;
      if (opts.operation === "insert") {
        query = supabase.from(opts.table as any).insert(opts.payload as any);
      } else if (opts.operation === "update" && opts.matchColumn && opts.matchValue) {
        query = supabase
          .from(opts.table as any)
          .update(opts.payload as any)
          .eq(opts.matchColumn, opts.matchValue);
      } else if (opts.operation === "upsert") {
        query = supabase.from(opts.table as any).upsert(opts.payload as any);
      }
      const { error } = await query;
      if (error) throw error;
      return { queued: false };
    } catch (err: any) {
      // If network error, queue it
      if (!navigator.onLine || err?.message?.includes("fetch")) {
        await enqueue(opts);
        return { queued: true };
      }
      return { queued: false, error: err.message };
    }
  } else {
    await enqueue(opts);
    return { queued: true };
  }
}
