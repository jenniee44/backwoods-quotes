import type { PlanDocument } from "./model";
import { validateDocuments } from "../shared/analysis";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export async function validatePlanFile(document: PlanDocument): Promise<void> {
  validateDocuments([document]);
  if (document.type === "application/pdf") {
    const pdf = await import("pdfjs-dist");
    pdf.GlobalWorkerOptions.workerSrc = workerURL;
    const data = Uint8Array.from(atob(document.data.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    const task = pdf.getDocument({ data });
    try {
      const parsed = await task.promise;
      if (parsed.numPages > 50)
        throw new Error("Split drawings into files of 50 pages or fewer.");
    } catch (error) {
      throw new Error(
        (error as Error).message.includes("50 pages")
          ? (error as Error).message
          : "This PDF is damaged, encrypted or unreadable. Export a readable PDF and attach it again.",
      );
    } finally {
      await task.destroy();
    }
  }
}
