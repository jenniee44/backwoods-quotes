import { newLine, type Quote, type Kind, type Line } from "./model";

/**
 * Reuses the saved takeoff and confirmed scope. Never calls the AI, approves
 * takeoff observations, or treats support spans as lumber purchase quantities.
 * All monetary figures below are illustrative CAD budget allowances, NOT
 * supplier quotes, engineer-approved takeoffs or verified job costs.
 */
const draftLabel = "[Preliminary budget]";
type DraftRow = {
  kind: Kind;
  description: string;
  category: string;
  unit: string;
  quantity: number;
  cost: number;
  group: string;
  note: string;
};
const common = "Illustrative allowance only; replace with contractor takeoff, supplier/subcontractor prices and verified labour. Not approved for ordering or construction.";
const deckRows: DraftRow[] = [
  { kind: "Materials", description: "Pressure-treated beams, posts and framing lumber", category: "Beams", unit: "allowance", quantity: 1, cost: 3400, group: "Footings & Structure", note: "3-ply 2x10 PT beam references and 2x6 joists at 16 in. O.C. are visible; lengths, counts, connections, cutting/splices and retained work are not verified." },
  { kind: "Materials", description: "Ledger, rim, blocking and flashing", category: "Ledger", unit: "allowance", quantity: 1, cost: 1250, group: "Footings & Structure", note: "2x6 PT ledger with positive-lap aluminum flashing; quantities and site condition unknown." },
  { kind: "Materials", description: "Joist hangers, structural fasteners and post hardware", category: "Hangers / connectors", unit: "allowance", quantity: 1, cost: 1050, group: "Footings & Structure", note: "Simpson LUS26 or equivalent, specified structural screws and approved connection hardware; exact counts unknown." },
  { kind: "Materials", description: "Pressure-treated deck boards and decking fasteners", category: "Decking", unit: "allowance", quantity: 1, cost: 3300, group: "Decking", note: "Assumes pressure-treated decking. Area, waste, board lengths and fastener quantities require verification." },
  { kind: "Materials", description: "Pressure-treated wood railings / guards", category: "Guards / railings", unit: "allowance", quantity: 1, cost: 1700, group: "Railings & Stairs", note: "Included by contractor scope despite by-others drawing note; measure guard lengths and confirm code/engineering requirements." },
  { kind: "Materials", description: "Pressure-treated stair materials", category: "Stairs / stringers", unit: "allowance", quantity: 1, cost: 900, group: "Railings & Stairs", note: "Stair geometry and landing details require site measurement and code review." },
  { kind: "Labour", description: "Remove existing wood deck and load bin", category: "Miscellaneous", unit: "hours", quantity: 24, cost: 35, group: "Demolition & Site Preparation", note: "24 hours is a budgeting scenario, not a site-derived labour takeoff." },
  { kind: "Labour", description: "Install framing, decking and connections", category: "Miscellaneous", unit: "hours", quantity: 120, cost: 35, group: "Footings & Structure", note: "120 hours is a budgeting scenario; adjust for crew, access and construction conditions." },
  { kind: "Labour", description: "Build railings, stairs and final cleanup", category: "Miscellaneous", unit: "hours", quantity: 56, cost: 35, group: "Railings & Stairs", note: "56 hours is a budgeting scenario, not a verified construction duration." },
  { kind: "Other Costs", description: "Helical pile subcontractor allowance", category: "Other Subcontractor", unit: "allowance", quantity: 1, cost: 6500, group: "Footings & Structure", note: "Subcontracted helical piles; count, capacity, installation, quote and engineering acceptance are NOT verified. Do not infer 12 piles from support symbols." },
  { kind: "Other Costs", description: "Disposal bin, haulage and tipping allowance", category: "Dump / Disposal Fees", unit: "allowance", quantity: 1, cost: 900, group: "Demolition & Site Preparation", note: "Bin is arranged, but actual rental/hauling/tipping cost is not known." },
];
function budgetLine(q: Quote, row: DraftRow): Line {
  return {
    ...newLine(row.kind, q.pricing),
    description: `${draftLabel} ${row.description}`,
    category: row.category,
    unit: row.unit,
    quantity: row.quantity,
    cost: row.cost,
    scopeGroup: row.group,
    pricingRequired: true,
    materialNotes: `${common} ${row.note}`,
    ...(row.kind === "Labour"
      ? { inheritCost: false, inheritRate: true }
      : { inheritCost: false, inheritMarkup: true }),
  };
}
export function preliminaryBudgetAlreadyExists(q: Quote): boolean {
  return q.lines.some((line) => line.description.startsWith(draftLabel));
}
export function generatePreliminaryBudget(q: Quote): Quote {
  if (q.status !== "Draft" || q.job)
    throw new Error("Only an editable draft can receive a preliminary estimate.");
  if (!q.documents?.length && !q.analysisReports?.length && !q.takeoff.length)
    throw new Error("No saved plan document or analysis is available. Open a quote with existing plans first.");
  if (preliminaryBudgetAlreadyExists(q))
    throw new Error("A preliminary budget already exists. Edit the existing lines instead of generating duplicates.");
  const combined = [
    ...q.lines,
    ...deckRows
      // Never overwrite contractor-created or previously converted estimate lines.
      .filter((row) => !q.lines.some((line) =>
        line.kind === row.kind &&
        line.description.toLowerCase().replace(draftLabel.toLowerCase(), "").trim() === row.description.toLowerCase(),
      ))
      .map((row) => budgetLine(q, row)),
  ];
  const notice = "PRELIMINARY BUDGET ONLY: Allowance prices, crew hours and lumber categories are illustrative assumptions, not supplier quotes or verified quantities. No structural design, beam lengths, piles, purchase board counts or splices have been approved. Verify all material quantities, scope, labour, supplier and subcontractor pricing, engineering requirements and site conditions before quoting or ordering.";
  return {
    ...q,
    lines: combined,
    details: {
      ...q.details,
      assumptions: q.details.assumptions.includes(notice)
        ? q.details.assumptions
        : [q.details.assumptions, notice].filter(Boolean).join("\n\n"),
    },
  };
}
