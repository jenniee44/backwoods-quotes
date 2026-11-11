import { analysisTransport, markAnalysisTransport } from "./analysisTransport";
import type { PlanAnalysisResult } from "../shared/analysis";

/** Private, browser-only cache of successfully returned provider batches.
 * Never stores PDFs, submitted images, or authentication information.
 * A request still running when the tab closes cannot be recovered from here.
 */
const DATABASE = "backwoods-analysis-checkpoints-v1";
const STORE = "batches";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
type Entry = {
  key: string;
  saved: number;
  result: PlanAnalysisResult;
  global?: boolean;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser checkpoint storage is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Browser checkpoint storage is blocked."));
  });
}

export async function readAnalysisCheckpoint(
  key: string,
): Promise<PlanAnalysisResult | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      let entry: Entry | undefined;
      request.onsuccess = () => {
        entry = request.result as Entry | undefined;
      };
      tx.oncomplete = () =>
        resolve(
          entry && Date.now() - entry.saved < MAX_AGE
            ? markAnalysisTransport(entry.result, {
                global: entry.global === true,
                persistence: "browser",
              })
            : null,
        );
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveAnalysisCheckpoint(
  key: string,
  result: PlanAnalysisResult,
): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        key,
        saved: Date.now(),
        result,
        global: analysisTransport(result).global,
      } satisfies Entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
