import type { PreparedDetail } from "./detailReadability";
export type SubmittedImage = {
  documentId: string;
  documentName: string;
  sourceHash: string;
  sourceDetailView?: number;
  region: PreparedDetail;
  flagged?: boolean;
};
export type ImageArchive = {
  key: string;
  quoteId: string;
  images: SubmittedImage[];
};
const memory = new Map<string, ImageArchive>();
const maximumBytes = 20_000_000;
export const archiveKey = (quoteId: string, reportId: string) =>
  `${quoteId}:${reportId}`;
export async function sourceHash(data: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("backwoods-private-analysis-images", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("archives", { keyPath: "key" });
    request.onerror = () =>
      reject(new Error("Private image storage unavailable"));
    request.onblocked = () =>
      reject(new Error("Private image storage blocked"));
    request.onsuccess = () => resolve(request.result);
  });
}
export async function retainImages(archive: ImageArchive) {
  // A session fallback keeps exact submitted bytes inspectable without bloating
  // the quote/localStorage record or risking existing quote persistence.
  memory.set(archive.key, archive);
  while (
    [...memory.values()].reduce((n, a) => n + JSON.stringify(a).length, 0) >
      maximumBytes &&
    memory.size > 1
  )
    memory.delete(memory.keys().next().value!);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction("archives", "readwrite"),
        store = tx.objectStore("archives");
      const request = store.getAll();
      request.onsuccess = () => {
        const size =
          (request.result as ImageArchive[])
            .filter((a) => a.key !== archive.key)
            .reduce((n, a) => n + JSON.stringify(a).length, 0) +
          JSON.stringify(archive).length;
        if (size > maximumBytes) {
          tx.abort();
          return;
        }
        store.put(archive);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(new Error("Private image storage full or unavailable"));
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
export async function readImages(
  key: string,
): Promise<ImageArchive | undefined> {
  if (memory.has(key)) return memory.get(key);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db!.transaction("archives", "readonly"),
        request = tx.objectStore("archives").get(key);
      request.onsuccess = () =>
        resolve(request.result as ImageArchive | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}
export async function removeQuoteImages(quoteId: string) {
  for (const [key, a] of memory) if (a.quoteId === quoteId) memory.delete(key);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction("archives", "readwrite"),
        request = tx.objectStore("archives").openCursor();
      request.onsuccess = () => {
        const c = request.result;
        if (c) {
          if ((c.value as ImageArchive).quoteId === quoteId) c.delete();
          c.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
export async function discardImageArchive(key: string) {
  memory.delete(key);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction("archives", "readwrite");
      tx.objectStore("archives").delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* Image storage failures must not replace existing quote data. */
  } finally {
    db?.close();
  }
}
