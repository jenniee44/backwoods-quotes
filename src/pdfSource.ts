import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { detailDpi, detailRenderSize, maxPdfTextChars } from "../shared/pdf";
import type { PdfDetailRegion, PdfTextLayer } from "../shared/pdf";
export async function loadPdfSource(data: string) {
  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = workerURL;
  const bytes = Uint8Array.from(atob(data.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  // PDF.js receives a separate decoded buffer, never rewrites the stored data URL.
  return pdf.getDocument({ data: bytes });
}
export async function extractPdfText(
  document: PDFDocumentProxy,
  budget = maxPdfTextChars,
  signal?: AbortSignal,
): Promise<PdfTextLayer> {
  const result: PdfTextLayer = {
    pageCount: document.numPages,
    pages: [],
    truncated: false,
  };
  let remaining = Math.min(maxPdfTextChars, Math.max(0, budget));
  for (let page = 1; page <= document.numPages; page++) {
    signal?.throwIfAborted();
    if (remaining === 0) {
      result.truncated = true;
      break;
    }
    const p = await document.getPage(page);
    const viewport = p.getViewport({ scale: 1 });
    try {
      // Embedded/selectable text only. No OCR, inferred labels or raster fallback.
      const content = await p.getTextContent();
      const readable = content.items
        .flatMap((item) =>
          "str" in item ? [item.str + (item.hasEOL ? "\n" : " ")] : [],
        )
        .join("")
        .trim();
      const limit = Math.min(8000, remaining);
      const text = readable.slice(0, limit);
      const truncated = readable.length > limit;
      result.pages.push({
        page,
        width: viewport.width,
        height: viewport.height,
        text,
        status: truncated
          ? "Truncated"
          : text
            ? "Available"
            : "No selectable text",
      });
      remaining -= text.length;
      result.truncated ||= truncated;
    } catch {
      signal?.throwIfAborted();
      result.pages.push({
        page,
        width: viewport.width,
        height: viewport.height,
        text: "",
        status: "Unavailable",
      });
    } finally {
      p.cleanup();
    }
  }
  return result;
}
export async function renderPdfDetail(
  page: PDFPageProxy,
  region: Pick<PdfDetailRegion, "x" | "y" | "width" | "height">,
): Promise<PdfDetailRegion> {
  const original = page.getViewport({ scale: 1 });
  if (
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.width > original.width + 0.01 ||
    region.y + region.height > original.height + 0.01
  )
    throw new Error("Select a detail region inside the drawing.");
  const size = detailRenderSize(region.width, region.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.pixelWidth;
  canvas.height = size.pixelHeight;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "Unable to render this detail. The original PDF remains available.",
    );
  try {
    const scale = detailDpi / 72;
    await page.render({
      canvas,
      canvasContext: context,
      viewport: page.getViewport({ scale }),
      transform: [1, 0, 0, 1, -region.x * scale, -region.y * scale],
    }).promise;
    const data = canvas.toDataURL("image/png"); // Lossless; never JPEG/recompress original.
    if (data.length > 2_700_000 || atob(data.split(",")[1]).length > 2_000_000)
      throw new Error(
        "This lossless detail exceeds 2 MB. Zoom into a smaller region; it will not be compressed or reduced.",
      );
    return {
      ...region,
      page: page.pageNumber,
      pageWidth: original.width,
      pageHeight: original.height,
      dpi: detailDpi,
      ...size,
      data,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
