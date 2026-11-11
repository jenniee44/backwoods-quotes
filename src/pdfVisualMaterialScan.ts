import { loadPdfSource } from "./pdfSource";
import { proposePdfTextMaterials } from "./localPdfMaterialScan";
import type { Quote } from "./model";

type OcrWorker = {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};
type TesseractClient = { createWorker(language: string): Promise<OcrWorker> };
declare global {
  interface Window {
    Tesseract?: TesseractClient;
  }
}

const ocrScriptUrl = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let scriptPromise: Promise<TesseractClient> | undefined;

function loadOcrEngine(): Promise<TesseractClient> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!scriptPromise) {
    scriptPromise = new Promise<TesseractClient>((resolve, reject) => {
      const element = document.createElement("script");
      element.src = ocrScriptUrl;
      element.async = true;
      element.onload = () => window.Tesseract
        ? resolve(window.Tesseract)
        : reject(new Error("OCR script loaded without a working engine."));
      element.onerror = () => reject(new Error("OCR engine download was blocked or failed. Check the browser network and content security policy."));
      document.head.append(element);
    }).catch(error => {
      scriptPromise = undefined;
      throw error;
    });
  }
  return scriptPromise;
}

export type PdfVisualScanReport = {
  quote: Quote;
  pagesRead: number;
  pagesWithRecognizedText: number;
  recognizedCharacters: number;
  matchesAdded: number;
  recognizedTextPreview: string;
};

/**
 * Experimental, user-initiated, browser-local OCR. The OCR engine, worker and
 * language pack download from Tesseract project CDNs. The PDF and pixels are
 * not sent to the app's AI API. No detected words are accepted as quantities.
 */
export async function scanPdfImagesForMaterials(
  q: Quote,
  progress?: (message: string) => void,
): Promise<PdfVisualScanReport> {
  if (q.status !== "Draft" || q.job)
    throw new Error("Only editable draft quotes can accept provisional OCR suggestions.");
  const docs = q.documents.filter(d => d.type === "application/pdf");
  if (!docs.length) throw new Error("This quote has no attached PDF.");
  progress?.("Downloading local OCR engine and English language data…");
  const engine = await loadOcrEngine();
  const worker = await engine.createWorker("eng");
  const sources: {documentId:string;name:string;page:number;text:string}[] = [];
  let recognizedCharacters = 0;
  try {
    for (const doc of docs) {
      const task = await loadPdfSource(doc.data);
      try {
        const pdf = await task.promise;
        if (pdf.numPages > 12)
          throw new Error("Visual scan supports up to 12 pages per PDF. Split larger plans first.");
        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
          progress?.(`Reading image on ${doc.name}, page ${pageIndex}/${pdf.numPages}…`);
          const page = await pdf.getPage(pageIndex);
          const canvas = document.createElement("canvas");
          try {
            const plain = page.getViewport({ scale: 1 });
            const scale = Math.min(2, 4400 / Math.max(plain.width, plain.height));
            const viewport = page.getViewport({ scale });
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas is unavailable in this browser.");
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const result = await worker.recognize(canvas);
            const text = result.data.text || "";
            recognizedCharacters += text.length;
            sources.push({documentId:doc.id,name:doc.name,page:pageIndex,text});

            // A whole engineering sheet shrinks 6pt callouts. Read four
            // separate quadrants at a higher effective scale when the first
            // pass cannot identify any supported material specification.
            const firstPass = proposePdfTextMaterials(q, [
              {documentId:doc.id,name:doc.name,page:pageIndex,text},
            ]);
            if (firstPass.takeoff.length === q.takeoff.length) {
              const tileScale = Math.min(3, 5000 / Math.max(plain.width, plain.height));
              const tileViewport = page.getViewport({scale:tileScale});
              for (let row=0;row<2;row++) for(let col=0;col<2;col++) {
                const width=Math.ceil(tileViewport.width/2);
                const height=Math.ceil(tileViewport.height/2);
                const left=col*width, top=row*height;
                const tile=document.createElement("canvas");
                tile.width=Math.min(width,Math.ceil(tileViewport.width-left));
                tile.height=Math.min(height,Math.ceil(tileViewport.height-top));
                try {
                  const tileContext=tile.getContext("2d");
                  if (!tileContext) throw new Error("Cannot render OCR region.");
                  progress?.(`Reading drawing detail ${row*2+col+1}/4 on page ${pageIndex}…`);
                  await page.render({
                    canvas:tile, canvasContext:tileContext,
                    viewport:tileViewport, transform:[1,0,0,1,-left,-top],
                  }).promise;
                  const region=await worker.recognize(tile);
                  const regionText=region.data.text || "";
                  recognizedCharacters += regionText.length;
                  sources.push({documentId:doc.id,name:doc.name,page:pageIndex,text:regionText});
                } finally { tile.width=0; tile.height=0; }
              }
            }
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
  const next = proposePdfTextMaterials(q, sources);
  return {
    quote: next,
    pagesRead: new Set(sources.map(s => s.documentId+":"+s.page)).size,
    pagesWithRecognizedText: new Set(sources.filter(s => !!s.text.trim()).map(s=>s.documentId+":"+s.page)).size,
    recognizedCharacters,
    matchesAdded: next.takeoff.length - q.takeoff.length,
    recognizedTextPreview: sources.map(s=>s.text.trim()).filter(Boolean).sort((a,b)=>b.length-a.length)[0]?.slice(0,400) || "",
  };
}
