import type { Page } from "@playwright/test";

export function pdfText(page: Page, pdf: Buffer): Promise<string> {
  return page.evaluate(async base64 => {
    const modulePath = "/src/pdfSource.ts";
    const { loadPdfSource, extractPdfText } = await import(modulePath);
    const task = await loadPdfSource("data:application/pdf;base64," + base64);
    try {
      const document = await task.promise;
      const text = await extractPdfText(document);
      if (!text.pages.some((page: { text: string }) => page.text)) {
        throw new Error("The printed PDF contains no extractable text");
      }
      return text.pages.map((page: { text: string }) => page.text).join("\n");
    } finally {
      await task.destroy();
    }
  }, pdf.toString("base64"));
}
