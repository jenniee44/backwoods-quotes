import { id, type Quote, type TakeoffItem } from "./model";
import { materialCategoryFor } from "../shared/takeoff";
import { applyScopeOverride, scopeReviewItems } from "./scopeOverride";
import { prepareDeckTakeoff } from "./deckTakeoff";
import { evidenceScope } from "../shared/componentIdentity";
import { componentSubject } from "../shared/componentSubject";
const marker = "Contractor-confirmed deck replacement scope";
const requirements = [
  ["Deck joists", "Joists", "Materials", "each"],
  ["Built-up beams", "Beams", "Materials", "runs"],
  [
    "New timber posts — confirm included locations",
    "Posts",
    "Materials",
    "each",
  ],
  ["Ledger boards", "Ledger", "Materials", "linear ft"],
  ["Rim joists", "Joists", "Materials", "linear ft"],
  ["Framing blocking", "Blocking", "Materials", "each"],
  ["Deck boards", "Decking", "Materials", "boards"],
  [
    "Joist hangers / structural connectors",
    "Hangers / connectors",
    "Materials",
    "each",
  ],
  [
    "Specified structural fasteners",
    "Structural fasteners",
    "Materials",
    "each",
  ],
  ["Ledger flashing", "Ledger", "Materials", "linear ft"],
  ["Wood railings / guards", "Guards / railings", "Materials", "linear ft"],
  ["Wood stairs", "Stairs / stringers", "Materials", "each"],
  [
    "Helical piles — subcontracted",
    "Other Subcontractor",
    "Subcontractor",
    "piles",
  ],
  ["Wood deck demolition labour", "Miscellaneous", "Labour", "hours"],
  ["Disposal bin", "Dump / Disposal Fees", "Other Costs", "bins"],
] as const;
function matches(t: TakeoffItem, name: string, category: string) {
  if (
    t.workScope === "Existing work to remain" ||
    t.destination === "Informational" ||
    t.included === false
  )
    return false;
  if (name === "Helical piles — subcontracted")
    return /helical|screw pile/i.test(t.description);
  if (name === "Wood deck demolition labour")
    return t.destination === "Labour" && /demoli|remov/i.test(t.description);
  if (name === "Disposal bin")
    return /disposal|dump|bin rental/i.test(t.description);
  if (t.destination !== "Materials" && !materialCategoryFor(t)) return false;
  if (name === "Rim joists") return /rim|band joist/i.test(t.description);
  if (name === "Deck joists" && /rim|band/i.test(t.description)) return false;
  if (name === "Ledger flashing") return /flashing/i.test(t.description);
  if (name === "Ledger boards" && /flashing/i.test(t.description)) return false;
  return materialCategoryFor(t) === category;
}
export function applyDeckReplacementScope(q: Quote, confirmed: boolean): Quote {
  if (q.status !== "Draft" || q.job || !confirmed)
    throw new Error(
      "Confirm the deck replacement scope on an editable draft first.",
    );
  let next = prepareDeckTakeoff(structuredClone(q));
  for (const t of scopeReviewItems(next)) {
    if (
      t.status === "Approved" ||
      t.status === "Reviewed" ||
      t.status === "Rejected" ||
      t.convertedLineId ||
      t.scopeOverride ||
      t.scopeVerified ||
      t.reviewAcknowledged ||
      t.calculation?.verified
    )
      continue;
    const supportingExistingSteel =
      /posts? (?:supporting|under).*existing steel/i.test(t.description);
    const steel =
      ["beams", "posts"].includes(componentSubject(t) ?? "") &&
      (supportingExistingSteel ||
        (/\b(?:steel|W\d+)\b/i.test(
          [t.description, t.specification].join(" "),
        ) &&
          (/existing/i.test(t.description) ||
            evidenceScope(t) === "Existing work to remain")));
    if (steel) next = applyScopeOverride(next, t.id, "Existing to Remain");
    else if (/helical|screw pile/i.test(t.description))
      next = applyScopeOverride(next, t.id, "Subcontracted");
    else if (
      /concrete.*(?:footing|pier)|(?:footing|pier).*concrete/i.test(
        t.description,
      )
    ) {
      // A quote-scope foundation choice, never a change to engineering evidence.
      if (evidenceScope(t) !== "Existing work to remain")
        next = applyScopeOverride(next, t.id, "Excluded");
    } else if (
      materialCategoryFor(t) &&
      evidenceScope(t) !== "Existing work to remain" &&
      t.itemRole !== "Document observation"
    )
      next = applyScopeOverride(next, t.id, "Included");
    else if (/railing|guard|stairs?/i.test(t.description))
      next = applyScopeOverride(next, t.id, "Included");
  }
  for (const [description, category, destination, unit] of requirements) {
    const placeholder = next.takeoff.find(
      (t) =>
        t.description === description &&
        t.notes.startsWith(marker) &&
        t.quantity === null &&
        !t.specification &&
        t.status === "Proposed" &&
        !t.reviewAcknowledged &&
        !t.convertedLineId,
    );
    if (
      placeholder &&
      next.takeoff.some(
        (t) =>
          t.id !== placeholder.id &&
          t.status !== "Rejected" &&
          !t.notes.startsWith(marker) &&
          matches(t, description, category),
      )
    ) {
      placeholder.status = "Rejected";
      placeholder.included = false;
      placeholder.notes +=
        " Required category is now covered by a source-backed review item; checklist placeholder retained as non-billable history.";
    }
    if (
      next.takeoff.some(
        (t) =>
          (t.status !== "Rejected" || t.scopeOverride === "Excluded") &&
          (t.description === description || matches(t, description, category)),
      )
    )
      continue;
    next.takeoff.push({
      id: id(),
      documentId: "",
      page: null,
      description,
      specification: "",
      quantity: null,
      unit,
      destination,
      category,
      status: "Proposed",
      confidence: "Unspecified",
      workScope:
        description === "Wood deck demolition labour"
          ? "Existing work to remove or modify"
          : "New work",
      included: true,
      scopeVerified: true,
      itemRole: "Construction item",
      classification: "Estimating suggestion",
      quantityMethod: "Unknown",
      notes: `${marker}. Required scope checklist, not an extracted drawing fact. Confirm whether this component is required, its specification and quantity. Existing steel and its supporting posts remain. No price, hours, stock or engineering substitution inferred.`,
      warnings:
        description === "Helical piles — subcontracted"
          ? [
              "Confirm engineering acceptance, pile design, unique new locations and subcontractor scope; no count or structural equivalence assumed.",
            ]
          : [],
    });
  }
  return next;
}
