import type { Store } from "./model";

// IndexedDB stores the complete JSON snapshot outside the small localStorage quota.
// Never delete or overwrite the legacy localStorage copy during migration.
const DB = "backwoods-quotes-durable-v1";
const OBJECT_STORE = "snapshots";
const KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("Another tab is blocking database access"));
  });
}

export async function readDurableStore(): Promise<Store | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, "readonly");
      const request = tx.objectStore(OBJECT_STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as Store | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read stored quotes"));
    });
  } finally {
    db.close();
  }
}

export async function writeDurableStore(store: Store): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, "readwrite");
      tx.objectStore(OBJECT_STORE).put(store, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save quotes"));
      tx.onabort = () => reject(tx.error ?? new Error("Quote save was aborted"));
    });
  } finally {
    db.close();
  }
}
