import type { Quote } from "./model";
import { loadPdfSource } from "./pdfSource";
import { proposePdfTextMaterials } from "./localPdfMaterialScan";

// Tesseract.js runs in the browser. The pinned engine and language assets are
// downloaded from a public CDN, but the drawing image is NOT uploaded there.
// This is an opt-in fallback, not an AI or an approved materials takeoff.
type OcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};
type OcrApi = {
  createWorker: (language: string, mode?: number, options?: {
    logger?: (status: { status?: string; progress?: number }) => void;
  }) => Promise<OcrWorker>;
};
const OCR_LIBRARY_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let scriptPromise: Promise<OcrApi> | undefined;
function loadOcrLibrary(): Promise<OcrApi> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<OcrApi>((resolve, reject) => {
    const installed = (window as Window & { Tesseract?: OcrApi }).Tesseract;
    if (installed) { resolve(installed); return; }
    const script = document.createElement("script");
    script.src = OCR_LIBRARY_URL;
    script.async = true;
    script.onload = () => {
      const api = (window as Window & { Tesseract?: OcrApi }).Tesseract;
      if (api?.createWorker) resolve(api);
      else reject(new Error("On-device OCR library did not initialize."));
    };
    script.onerror = () => reject(new Error(
      "Could not download the OCR engine. Check internet access or browser content-blocking settings."
    ));
    document.head.appendChild(script);
  }).catch(error => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}

export type VisualPdfScanReport = {
  quote: Quote;
  pagesScanned: number;
  labelsAdded: number;
  textCharacters: number;
  diagnostics: string;
};

export async function scanImagePdfMaterials(
  quote: Quote,
  onProgress: (status: string) => void,
): Promise<VisualPdfScanReport> {
  if (quote.status !== "Draft" || quote.job)
    throw new Error("Only editable drafts can add proposed material observations.");
  const documents = quote.documents.filter(d => d.type === "application/pdf");
  if (!documents.length) throw new Error("There is no attached PDF to inspect.");
  const tesseract = await loadOcrLibrary();
  onProgress("Loading on-device OCR language data…");
  const worker = await tesseract.createWorker("eng", 1, {
    logger: value => {
      if (value.status === "recognizing text")
        onProgress("Reading drawing labels: " + Math.round((value.progress ?? 0) * 100) + "%");
    },
  });
  let pagesScanned = 0;
  let textCharacters = 0;
  const source: {documentId:string;name:string;page:number;text:string}[] = [];
  try {
    // Limit work on large drawings to reduce browser memory and CPU use.
    for (const doc of documents.slice(0, 3)) {
      const task = await loadPdfSource(doc.data);
      try {
        const pdf = await task.promise;
        for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const raw = page.getViewport({scale:1});
          // 2200px max long edge: higher than a screen preview, but bounded.
          const viewport = page.getViewport({scale:Math.min(3, 2200/Math.max(raw.width,raw.height))});
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1,Math.round(viewport.width));
          canvas.height = Math.max(1,Math.round(viewport.height));
          try {
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Browser could not create a drawing canvas.");
            onProgress(`Rendering ${doc.name}, page ${pageNumber}…`);
            await page.render({canvas,canvasContext:context,viewport}).promise;
            onProgress(`Reading image labels on page ${pageNumber}…`);
            const result = await worker.recognize(canvas);
            const text = result.data.text || "";
            textCharacters += text.length;
            pagesScanned++;
            source.push({documentId:doc.id,name:doc.name,page:pageNumber,text});
          } finally {
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
          }
        }
      } finally {
        await task.destroy();
      }
    }
  } finally {
    await worker.terminate();
  }
  const updated = proposePdfTextMaterials(quote, source);
  const labelsAdded = updated.takeoff.length - quote.takeoff.length;
  return {
    quote:updated,pagesScanned,labelsAdded,textCharacters,
    diagnostics: `${pagesScanned} page(s) visually scanned, ${textCharacters} characters recognized, ${labelsAdded} new proposed material label(s).`,
  };
}
