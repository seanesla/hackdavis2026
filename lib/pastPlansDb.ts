"use client";
import type { SitePlan } from "./types";

export type PastPlan = {
  id: string;
  prompt: string;
  sitePlan: SitePlan;
  createdAt: string;
  notes?: string;
};

const DB_NAME = "parcel";
const STORE = "plans";
const VERSION = 1;
const MAX_PLANS = 5;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPlans(): Promise<PastPlan[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const all = await reqResult(tx.objectStore(STORE).getAll());
    await txDone(tx);
    const sorted = ((all as PastPlan[]) ?? []).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    return sorted.slice(0, MAX_PLANS);
  } catch {
    return [];
  }
}

export async function savePlan(
  prompt: string,
  sitePlan: SitePlan,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    const entry: PastPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      sitePlan,
      createdAt: new Date().toISOString(),
    };

    const writeTx = db.transaction(STORE, "readwrite");
    writeTx.objectStore(STORE).add(entry);
    await txDone(writeTx);

    const trimReadTx = db.transaction(STORE, "readonly");
    const all = (await reqResult(
      trimReadTx.objectStore(STORE).getAll(),
    )) as PastPlan[];
    await txDone(trimReadTx);

    if (all.length > MAX_PLANS) {
      const sorted = all.sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      );
      const toDelete = sorted.slice(MAX_PLANS);
      const delTx = db.transaction(STORE, "readwrite");
      const store = delTx.objectStore(STORE);
      for (const old of toDelete) store.delete(old.id);
      await txDone(delTx);
    }
  } catch {
    // best-effort: past plans not critical
  }
}

export async function updatePlanNotes(
  id: string,
  notes: string,
): Promise<PastPlan | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const readTx = db.transaction(STORE, "readonly");
    const existing = (await reqResult(
      readTx.objectStore(STORE).get(id),
    )) as PastPlan | undefined;
    await txDone(readTx);
    if (!existing) return null;
    const updated: PastPlan = { ...existing, notes };
    const writeTx = db.transaction(STORE, "readwrite");
    writeTx.objectStore(STORE).put(updated);
    await txDone(writeTx);
    return updated;
  } catch {
    return null;
  }
}

export async function clearPlans(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await txDone(tx);
  } catch {
    // ignore
  }
}
