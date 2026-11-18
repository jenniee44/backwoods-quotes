/**
 * Evidence-based estimating primitives.
 * No invented takeoff quantities, prices, or labour production rates.
 * This module deliberately does not modify existing quotes.
 */
export type EvidenceStatus = "drawing" | "contractor" | "assumption";
export interface EstimateInput {
  id: string;
  description: string;
  quantity: number | null;
  unit: string;
  source: EvidenceStatus;
  evidence?: string;
  materialUnitCost?: number | null;
  labourHoursPerUnit?: number | null;
  labourCostPerHour?: number | null;
  labourSellRatePerHour?: number | null;
  materialMarkupPercent?: number;
  wastePercent?: number;
  crewSize?: number;
  workHoursPerDay?: number;
  crewEfficiencyPercent?: number;
}
export interface EstimateResult {
  id: string;
  purchaseQuantity: number | null;
  materialCost: number | null;
  labourHours: number | null;
  estimatedWorkDays: number | null;
  labourCost: number | null;
  customerSubtotal: number | null;
  reviewReasons: string[];
  readyForQuote: boolean;
}
const valid = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function calculateEvidenceEstimate(input: EstimateInput): EstimateResult {
  const reviewReasons: string[] = [];
  if (!valid(input.quantity)) reviewReasons.push("Quantity missing or invalid");
  if (input.source === "assumption") reviewReasons.push("Quantity is an assumption");
  if (input.source === "drawing" && !input.evidence?.trim())
    reviewReasons.push("Drawing reference missing");
  if (!valid(input.materialUnitCost) || input.materialUnitCost === 0) reviewReasons.push("Material unit price missing or zero; confirm pricing");
  if (!valid(input.labourHoursPerUnit) || input.labourHoursPerUnit === 0) reviewReasons.push("Labour production rate missing or zero; confirm hours");
  if (!valid(input.labourCostPerHour) || input.labourCostPerHour === 0) reviewReasons.push("Internal labour rate missing or zero");
  if (!valid(input.labourSellRatePerHour) || input.labourSellRatePerHour === 0) reviewReasons.push("Customer labour rate missing or zero");
  if (!valid(input.wastePercent) || input.wastePercent! > 100)
    reviewReasons.push("Waste percentage missing or invalid");
  if (!valid(input.materialMarkupPercent) || input.materialMarkupPercent! > 1000)
    reviewReasons.push("Material markup missing or invalid");
  const purchaseQuantity = valid(input.quantity) && valid(input.wastePercent) && input.wastePercent! <= 100
    ? input.quantity * (1 + input.wastePercent! / 100) : null;
  const materialCost = purchaseQuantity !== null && valid(input.materialUnitCost)
    ? money(purchaseQuantity * input.materialUnitCost) : null;
  const labourHours = valid(input.quantity) && valid(input.labourHoursPerUnit)
    ? input.quantity * input.labourHoursPerUnit : null;
  const crewSize = input.crewSize ?? 1;
  const workHoursPerDay = input.workHoursPerDay ?? 8;
  const crewEfficiencyPercent = input.crewEfficiencyPercent ?? 100;
  if (!Number.isInteger(crewSize) || crewSize < 1 || crewSize > 100)
    reviewReasons.push("Crew size must be a whole number between 1 and 100");
  if (!Number.isFinite(workHoursPerDay) || workHoursPerDay <= 0 || workHoursPerDay > 24)
    reviewReasons.push("Working hours per day must be between 0 and 24");
  if (!Number.isFinite(crewEfficiencyPercent) || crewEfficiencyPercent <= 0 || crewEfficiencyPercent > 100)
    reviewReasons.push("Crew efficiency must be greater than 0 and no more than 100%");
  const estimatedWorkDays = labourHours !== null &&
    Number.isInteger(crewSize) && crewSize >= 1 && crewSize <= 100 &&
    workHoursPerDay > 0 && workHoursPerDay <= 24 &&
    crewEfficiencyPercent > 0 && crewEfficiencyPercent <= 100
    ? Math.round((labourHours / (crewSize * workHoursPerDay * crewEfficiencyPercent / 100)) * 100) / 100
    : null;
  const labourCost = labourHours !== null && valid(input.labourCostPerHour)
    ? money(labourHours * input.labourCostPerHour) : null;
  const customerSubtotal = materialCost !== null && labourHours !== null &&
    valid(input.materialMarkupPercent) && valid(input.labourSellRatePerHour)
    ? money(materialCost * (1 + input.materialMarkupPercent / 100) +
        labourHours * input.labourSellRatePerHour) : null;
  return { id: input.id, purchaseQuantity, materialCost, labourHours, estimatedWorkDays, labourCost,
    customerSubtotal, reviewReasons, readyForQuote: reviewReasons.length === 0 };
}
