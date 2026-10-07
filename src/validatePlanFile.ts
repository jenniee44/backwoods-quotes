import type { PlanDocument } from "./model";
import { validateDocuments } from "../shared/analysis";
import { loadPdfSource } from "./pdfSource";
export async function validatePlanFile(document: PlanDocument): Promise<void> {
  validateDocuments([document]);
  if (document.type === "application/pdf") {
    const task = await loadPdfSource(document.data);
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
