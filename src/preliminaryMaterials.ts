import { isGeneralSpecification } from "./materialReferences";
import { explicitBeamIdentity } from "../shared/componentSubject";
import { unresolvedOverlaps } from "./takeoffOverlap";
import type { Quote, TakeoffItem } from "./model";
import { readyForEstimate } from "./takeoffReview";
import { summaryApprovalProblem } from "./materialsSummary";
import { includedScope, workScope } from "./takeoffScope";
export function friendlyMaterialName(t: TakeoffItem) {
  const text = t.description;
  // Presentation only: never rewrite original evidence or use these names to merge.
  const names: [RegExp, string][] = [
    [/joist hangers?|LUS26/i, "Joist hangers"],
    [/ledger.*flash|flash.*ledger/i, "Ledger flashing"],
    [/post (?:bases?|caps?)/i, "Post connectors"],
    [
      /ledger.*(?:screws?|bolts?)|(?:screws?|bolts?).*ledger/i,
      "Ledger fasteners",
    ],
    [/helical|screw piles?/i, "Helical piles"],
    [
      /concrete.*(?:footings?|piers?)|(?:footings?|piers?).*concrete/i,
      "Concrete footings / piers",
    ],
    [/deck(?:ing)? boards?|decking/i, "Deck boards"],
    [/rim|band joists?/i, "Rim joists"],
    [/joists?/i, "Deck joists"],
    [/beams?/i, "Beams"],
    [/posts?/i, "Posts"],
    [/guards?|railings?/i, "Guards / railings"],
    [/blocking/i, "Framing blocking"],
    [/flash/i, "Flashing"],
  ];
  const matched = explicitBeamIdentity(t)
    ? ([/beam/i, "Beams"] as [RegExp, string])
    : names.find(([pattern]) => pattern.test(text));
  if (!matched)
    return (
      text
        .replace(
          /^(?:supply\s*(?:and|&)\s*install|provide|proposed material\s*:)\s*/i,
          "",
        )
        .trim() || text
    );
  let name = matched[1];
  if (
    name === "Deck joists" &&
    !/deck/i.test([text, t.location, t.scopeGroup].join(" "))
  )
    name = "Joists";
  // Keep clear assembly distinctions visible, even though the original name is retained.
  const assembly = text.match(
    /\b(?:inner|outer|interior|exterior|main|secondary|upper|lower)\b|\b(?:beam|post|footing|joist|guard|railing)\s+(?:(?:run|line|section|assembly)\s+)?\d+\b|\b[BPFJG]-?\d+\b/gi,
  );
  return (
    name + (assembly?.length ? " — " + [...new Set(assembly)].join(", ") : "")
  );
}
export function quantityLabel(q: Quote, t: TakeoffItem) {
  if (t.quantity === null || !Number.isFinite(t.quantity))
    return "Quantity needed";
  if (
    (t.calculation && !t.calculation.verified) ||
    (summaryApprovalProblem(q, t) &&
      t.status !== "Approved" &&
      !t.convertedLineId)
  )
    return "Needs verification";
  if (
    readyForEstimate(q, t) ||
    t.convertedLineId ||
    (t.status === "Reviewed" && t.reviewAcknowledged)
  )
    return "Verified quantity";
  return "Needs verification";
}
export function unresolvedMaterials(q: Quote, items: TakeoffItem[]) {
  return items.filter(
    (t) =>
      !t.convertedLineId &&
      t.status !== "Approved" &&
      t.status !== "Rejected" &&
      (includedScope(t) || workScope(t) === "Requires scope confirmation") &&
      !!summaryApprovalProblem(q, t),
  );
}

export function preliminaryDisposition(
  t: TakeoffItem,
  q?: Quote,
): "material" | "attention" | "information" {
  const scope = workScope(t);
  if (
    isGeneralSpecification(t) ||
    (t.destination ?? "Materials") !== "Materials" ||
    (t.itemRole && t.itemRole !== "Construction item") ||
    t.status === "Rejected" ||
    (t.included === false && scope !== "Requires scope confirmation") ||
    scope === "Existing work to remain" ||
    (scope === "Existing work to remove or modify" && !t.scopeVerified) ||
    ((scope === "By others" || scope === "By others / excluded") &&
      (!t.scopeVerified || !includedScope(t))) ||
    /^(?:general (?:construction )?notes?|construction notes?|(?:material )?specifications?|design criteria|do not scale)\b/i.test(
      t.description,
    ) ||
    /^existing (?:house|building|structure|deck)(?:\s+(?:structure|to remain|to retain))?[ .]*$/i.test(
      t.description,
    )
  )
    return "information";
  if (
    (q && unresolvedOverlaps(q, t).length > 0) ||
    t.quantity === null ||
    !t.specification?.trim() ||
    /unreadable|unknown|conflict|alternative/i.test(
      [t.specification, ...(t.warnings ?? [])].join(" "),
    ) ||
    scope === "Requires scope confirmation" ||
    /^(?:beam )?runs?|locations|symbols$/i.test(t.unit)
  )
    return "attention";
  return "material";
}
