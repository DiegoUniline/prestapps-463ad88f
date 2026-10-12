/**
 * Offline Queue — stores Supabase mutations in IndexedDB when offline.
 * When back online the user can hit "Sincronizar" to replay them.
 */
import { get, set, del, keys, createStore } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/utils";

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

type MutationResult = PromiseLike<{ error: { message: string } | null }>;

/** Tabla elegida en tiempo de ejecución: fuera de los tipos generados de Database. */
interface UntypedTable {
  insert(values: Record<string, unknown>): MutationResult;
  upsert(values: Record<string, unknown>): MutationResult;
  update(values: Record<string, unknown>): { eq(column: string, value: string): MutationResult };
}

function buildMutation(m: Pick<QueuedMutation, "table" | "operation" | "payload" | "matchColumn" | "matchValue">): MutationResult | null {
  const table = (supabase as unknown as { from(table: string): UntypedTable }).from(m.table);
  if (m.operation === "insert") return table.insert(m.payload);
  if (m.operation === "update" && m.matchColumn && m.matchValue) return table.update(m.payload).eq(m.matchColumn, m.matchValue);
  if (m.operation === "upsert") return table.upsert(m.payload);
  return null;
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
      const query = buildMutation(item);
      if (!query) throw new Error("Operación no soportada");

      const { error } = await query;
      if (error) throw error;

      // Success — remove from queue
      await del(item.id, store);
      synced++;
    } catch (err) {
      item.status = "error";
      item.error = errorMessage(err) || "Error desconocido";
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
      const query = buildMutation(opts);
      if (!query) throw new TypeError("Operación no soportada");
      const { error } = await query;
      if (error) throw error;
      return { queued: false };
    } catch (err) {
      // If network error, queue it
      if (!navigator.onLine || errorMessage(err)?.includes("fetch")) {
        await enqueue(opts);
        return { queued: true };
      }
      return { queued: false, error: errorMessage(err) };
    }
  } else {
    await enqueue(opts);
    return { queued: true };
  }
}
