import type { Quote } from "./model";

/**
 * Cowan Park original-plan TEST fixture; not a general-purpose takeoff engine.
 * Contractor-confirmed trial choices must never be promoted to drawing facts.
 */
export const cowanTrial = {
  pileCount: 12,
  beamRuns: 3,
  beamPlies: 3,
  beamLengthFeet: 24 + 3 / 12,
  joistSize: "2x6 PT",
  joistSpacingInches: 16,
  pileRatingULS: 6100,
} as const;

export const cowanBeamLinearFeet =
  cowanTrial.beamRuns * cowanTrial.beamPlies * cowanTrial.beamLengthFeet;

export function isCowanOriginalPlanTrial(q: Quote): boolean {
  return /cowan\s*park/i.test([q.name, q.description, ...q.documents.map(d => d.name)].join(" "));
}

const preliminaryPileLabel = "[Preliminary budget] Helical pile subcontractor allowance";

export function cowanTrialPileLine(q: Quote) {
  return q.lines.find(line =>
    line.kind === "Other Costs" && line.description === preliminaryPileLabel
  );
}

export function hasCowanTrialPiles(q: Quote): boolean {
  const line = cowanTrialPileLine(q);
  return !!line && line.quantity === cowanTrial.pileCount
    && line.unit === "pile (trial)"
    && (line.materialNotes ?? "").includes("COWAN PARK ORIGINAL-PLAN TRIAL");
}

/** Keep existing total allowance unchanged, merely expose its trial count. */
export function applyCowanTrialPiles(q: Quote): Quote {
  if (!isCowanOriginalPlanTrial(q))
    throw new Error("This trial scenario is only for the original Cowan Park project.");
  if (q.status !== "Draft" || q.job)
    throw new Error("Only an editable draft can use the trial scenario.");
  const pile = cowanTrialPileLine(q);
  if (!pile)
    throw new Error("Generate the preliminary budget first; no pile allowance exists.");
  if (hasCowanTrialPiles(q)) return q;

  const totalAllowance = pile.cost * pile.quantity;
  return {
    ...q,
    lines: q.lines.map(line => line.id !== pile.id ? line : {
      ...line,
      unit: "pile (trial)",
      quantity: cowanTrial.pileCount,
      cost: totalAllowance / cowanTrial.pileCount,
      inheritCost: false,
      pricingRequired: true,
      materialNotes: [
        "COWAN PARK ORIGINAL-PLAN TRIAL: 12 new helical piles are an explicit TEST assumption, not a verified count of new foundations from the drawing.",
        "Existing total subcontractor budget allowance is divided by 12 solely to show a scenario unit rate. This is NOT a supplier quote or validated per-pile cost.",
        "Get a 12-pile subcontractor quote with capacity, access, lengths and caps before using a customer price.",
      ].join(" "),
    }),
  };
}
