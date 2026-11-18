import { newLine, type Quote } from "./model";
import { readyForEstimate } from "./takeoffReview";
import { calculateEvidenceEstimate, type EstimateInput } from "./evidenceEstimate";

/**
 * Apply a contractor-reviewed item atomically to an editable draft.
 * Preserve the original takeoff and provenance. Never silently overwrite
 * existing customer lines or create duplicate conversions.
 */
export function approveEvidenceEstimate(quote: Quote, input: EstimateInput): Quote {
  if (quote.status !== "Draft" || quote.job)
    throw new Error("Only editable draft quotes can receive estimate lines.");
  const item = quote.takeoff.find(t => t.id === input.id);
  if (!item) throw new Error("Drawing item no longer exists.");
  if (item.convertedLineId || quote.lines.some(l => l.takeoffId === item.id))
    throw new Error("This drawing item has already been converted.");
  if (!readyForEstimate(quote, item))
    throw new Error("Resolve the drawing takeoff, scope and conflicts before approving.");
  if (input.source !== "drawing" || input.quantity !== item.quantity)
    throw new Error("Drawing quantity differs from approved takeoff. Review the takeoff first.");
  const result = calculateEvidenceEstimate(input);
  if (!result.readyForQuote || result.labourHours === null ||
      result.materialCost === null || result.customerSubtotal === null)
    throw new Error("Complete all prices, production rates and evidence before approving.");
  if (input.quantity === null || input.materialUnitCost == null ||
      input.labourCostPerHour == null || input.labourSellRatePerHour == null ||
      input.materialMarkupPercent == null || input.wastePercent == null)
    throw new Error("Required estimate inputs are missing.");
  const material = {
    ...newLine("Materials", quote.pricing),
    description: item.description,
    quantity: input.quantity,
    unit: input.unit,
    cost: input.materialUnitCost,
    waste: input.wastePercent,
    markup: input.materialMarkupPercent,
    inheritMarkup: false,
    inheritCost: false,
    category: item.category || "Miscellaneous",
    scopeGroup: item.scopeGroup || "",
    takeoffId: item.id,
    pricingRequired: false,
    materialNotes: `Reviewed drawing takeoff: ${input.evidence || "reference missing"}`,
  };
  const labour = {
    ...newLine("Labour", quote.pricing),
    description: `Install: ${item.description}`,
    quantity: result.labourHours,
    unit: "hours",
    cost: input.labourCostPerHour,
    rate: input.labourSellRatePerHour,
    inheritCost: false,
    inheritRate: false,
    category: "Miscellaneous",
    scopeGroup: item.scopeGroup || "",
    // Do not assign takeoffId to labour: the material line owns conversion identity.
    materialNotes: `Labour estimate: ${input.labourHoursPerUnit} hours per ${input.unit} × ${input.quantity} ${input.unit}. Crew: ${input.crewSize ?? 1} person(s), ${input.workHoursPerDay ?? 8} hours/day, ${input.crewEfficiencyPercent ?? 100}% efficiency. Review site conditions.`,
  };
  return {
    ...quote,
    lines: [...quote.lines, material, labour],
    estimateCrew: {
      size: input.crewSize ?? 1,
      hoursPerDay: input.workHoursPerDay ?? 8,
      efficiencyPercent: input.crewEfficiencyPercent ?? 100,
    },
    takeoff: quote.takeoff.map(t => t.id === item.id
      ? { ...t, convertedLineId: material.id }
      : t),
  };
}
