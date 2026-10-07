import { it, expect, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractPdfText } from "./pdfSource";
function document(text: string[], failurePage?: number) {
  const cleanups = text.map(() => vi.fn());
  return {
    pdf: {
      numPages: text.length,
      getPage: vi.fn(async (page: number) => ({
        getViewport: () => ({ width: 2592, height: 1728 }),
        cleanup: cleanups[page - 1],
        getTextContent: async () => {
          if (page === failurePage) throw new Error("Unreadable text mapping");
          return { items: [{ str: text[page - 1], hasEOL: true }] };
        },
      })),
    } as unknown as PDFDocumentProxy,
    cleanups,
  };
}
it("extracts embedded construction text with physical page provenance and no OCR", async () => {
  const source = document(['JOISTS 2x8 PT @ 16" O/C', "BEAM 3-PLY 2x10 PT"]);
  const result = await extractPdfText(source.pdf);
  expect(result.pages.map((page) => page.text)).toEqual([
    'JOISTS 2x8 PT @ 16" O/C',
    "BEAM 3-PLY 2x10 PT",
  ]);
  expect(result.pages[1]).toMatchObject({
    page: 2,
    width: 2592,
    height: 1728,
    status: "Available",
  });
  expect(
    source.cleanups.every((cleanup) => cleanup.mock.calls.length === 1),
  ).toBe(true);
});
it("marks missing/broken text layers honestly instead of inventing notes", async () => {
  const source = document(["", "not available"], 2);
  const result = await extractPdfText(source.pdf);
  expect(result.pages).toMatchObject([
    { text: "", status: "No selectable text" },
    { text: "", status: "Unavailable" },
  ]);
});
it("reports truncation and omitted pages explicitly while respecting the request budget", async () => {
  const source = document(["A".repeat(9000), "another page"]);
  const result = await extractPdfText(source.pdf, 100);
  expect(result.truncated).toBe(true);
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toHaveLength(100);
  expect(result.pages[0].status).toBe("Truncated");
  expect(source.pdf.getPage).toHaveBeenCalledTimes(1);
});
it("cancels text extraction without creating AI suggestions", async () => {
  const signal = AbortSignal.abort();
  await expect(
    extractPdfText(document(["text"]).pdf, 60000, signal),
  ).rejects.toThrow();
});
