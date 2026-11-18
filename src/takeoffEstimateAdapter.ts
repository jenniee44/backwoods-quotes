import type { Quote, TakeoffItem } from "./model";
import { readyForEstimate } from "./takeoffReview";
import { calculateEvidenceEstimate, type EstimateInput, type EstimateResult } from "./evidenceEstimate";

/** Convert only eligible, explicitly reviewed takeoff items into pricing drafts.
 * Unknown prices and productivity rates remain null, never zero-cost estimates.
 * This is a read-only adapter: no quote lines are created or sent.
 */
export function draftEstimateFromTakeoff(
  quote: Quote,
  item: TakeoffItem,
  settings: Partial<Pick<EstimateInput,
    "materialUnitCost" | "labourHoursPerUnit" | "labourCostPerHour" |
    "labourSellRatePerHour" | "materialMarkupPercent" | "wastePercent">> = {},
): { input: EstimateInput; result: EstimateResult; takeoffReady: boolean } {
  const takeoffReady = readyForEstimate(quote, item);
  const evidence = [
    item.sourceDocumentName || quote.documents.find(d => d.id === item.documentId)?.name,
    item.page == null ? "" : `page ${item.page}`,
    ...(item.sourceFacts ?? []),
  ].filter(Boolean).join(" · ");
  const input: EstimateInput = {
    id: item.id,
    description: item.description,
    quantity: takeoffReady ? item.quantity : null,
    unit: item.unit,
    source: "drawing",
    evidence,
    materialUnitCost: settings.materialUnitCost ?? null,
    labourHoursPerUnit: settings.labourHoursPerUnit ?? null,
    labourCostPerHour: settings.labourCostPerHour ?? quote.pricing.internalLabourCost ?? null,
    labourSellRatePerHour: settings.labourSellRatePerHour ?? quote.pricing.labourRate ?? null,
    materialMarkupPercent: settings.materialMarkupPercent ?? quote.pricing.materialMarkup,
    wastePercent: settings.wastePercent ?? quote.takeoffPreferences?.waste ?? null,
  };
  const result = calculateEvidenceEstimate(input);
  if (!takeoffReady) {
    result.reviewReasons.unshift("Drawing quantity or scope has not passed takeoff review");
    result.readyForQuote = false;
  }
  return { input, result, takeoffReady };
}
