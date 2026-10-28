import { materialSpecificationKey } from "../shared/materialGrouping";
import { sameSpatialBeam, uniqueSpatialBeams } from "../shared/spatialBeams";
import { unresolvedFoundationAlternative } from "./takeoffScope";
import { calculateMaterial } from "../shared/materialCalculators";
import type { Quote, TakeoffItem } from "./model";
import {
  repeatedMaterialKey,
  repeatEvidenceEligible,
} from "../shared/componentIdentity";
import { materialCategoryFor } from "../shared/takeoff";
import {
  friendlyMaterialName,
  preliminaryDisposition,
} from "./preliminaryMaterials";
import { readyForEstimate } from "./takeoffReview";
import {
  supportedMaterialInputs,
  materialTakeoffProposal,
} from "./deckTakeoff";
import { includedScope, workScope } from "./takeoffScope";
import { unresolvedOverlaps } from "./takeoffOverlap";
export function quantityReason(q: Quote, t: TakeoffItem) {
  if (unresolvedFoundationAlternative(q, t))
    return "Confirm the foundation method: concrete footings or helical piles.";
  const proposal = materialTakeoffProposal(t);
  if (proposal.missing.length) return proposal.missing.join("; ");
  if (t.calculation) {
    const missing = calculateMaterial(t.calculation, false).missing;
    if (missing.length)
      return "Missing calculator inputs: " + missing.join(", ") + ".";
    if (!t.calculation.verified)
      return "Verify the calculator dimensions and assembly inputs in Review details.";
  }
  if (
    unresolvedOverlaps(q, t).length ||
    /conflict/i.test((t.warnings ?? []).join(" "))
  )
    return "Confirm which observations describe the same assembly and resolve conflicting counts.";
  if (preliminaryDisposition(t, q) === "information")
    return "Reference or excluded work; not a purchase material.";
  if (!t.specification?.trim() || /unreadable|unknown/i.test(t.specification))
    return "Confirm the readable material specification.";
  if (/beam/i.test(t.description))
    return "Confirm beam lengths, ply counts, suitable stock lengths and cut/splice layout; beam runs are not boards.";
  if (/hanger|fastener|screw|bolt|connector/i.test(t.description))
    return "Confirm connection counts and the specified hardware pieces per connection.";
  if (/joist/i.test(t.description))
    return "Confirm deck layout dimensions, spacing, openings, joist lengths and suitable stock lengths.";
  if (/decking|deck boards/i.test(t.description))
    return "Confirm deck dimensions, board width, layout direction, gaps and stock lengths.";
  if (/footing|pier|pile/i.test(t.description))
    return "Confirm new support counts, foundation method and footing/pier specifications.";
  return "Confirm quantity, purchase unit and included scope in Review details.";
}
/** Presentation only. Never merge records, sum counts or change approvals. */
export function purchasingGroups(q: Quote, items: TakeoffItem[]) {
  const groups = new Map<string, { name: string; items: TakeoffItem[] }>();
  for (const t of items) {
    if (preliminaryDisposition(t, q) === "information") continue;
    const name = friendlyMaterialName(t).split(" — ")[0];
    const category = materialCategoryFor(t);
    const spec = materialSpecificationKey(t.specification ?? "", category);
    // Joist wording is not an assembly identity. Keep distinct assemblies below
    // the same purchasing category without summing their observations.
    const key = JSON.stringify([category ?? name.toLowerCase(), spec]);
    const group = groups.get(key);
    if (group) group.items.push(t);
    else groups.set(key, { name, items: [t] });
  }
  return [...groups.values()].map((g) => {
    const t = g.items[0];
    const proposal = materialTakeoffProposal(t);
    const key = repeatedMaterialKey(t, materialCategoryFor(t));
    const proposals = g.items.map(materialTakeoffProposal);
    const samePhysicalBeams = (peer: TakeoffItem) => {
      if (
        peer.documentId !== t.documentId ||
        !t.beamAssemblies?.length ||
        !peer.beamAssemblies?.length
      )
        return false;
      const a = uniqueSpatialBeams(t.beamAssemblies),
        b = uniqueSpatialBeams(peer.beamAssemblies);
      return (
        a.length === b.length &&
        a.every((group) =>
          b.some((other) => sameSpatialBeam(group[0], other[0])),
        )
      );
    };
    const confirmedRepeat =
      g.items.length > 1 &&
      !!key &&
      g.items.every(
        (item, i) =>
          repeatEvidenceEligible(item) &&
          repeatedMaterialKey(item, materialCategoryFor(item)) === key &&
          JSON.stringify([
            proposals[i].quantity,
            proposals[i].unit,
            proposals[i].purchase,
            proposals[i].purchaseUnit,
          ]) ===
            JSON.stringify([
              proposal.quantity,
              proposal.unit,
              proposal.purchase,
              proposal.purchaseUnit,
            ]) &&
          JSON.stringify(item.calculation?.inputs) ===
            JSON.stringify(t.calculation?.inputs) &&
          JSON.stringify(supportedMaterialInputs(item).values) ===
            JSON.stringify(supportedMaterialInputs(t).values) &&
          includedScope(item) &&
          item.alternativeGroup === t.alternativeGroup &&
          item.alternativeOption === t.alternativeOption &&
          (samePhysicalBeams(item) ||
            (item.sourceFacts ?? []).some((f) =>
              /repeated view of (?:the )?same (?:physical )?(?:assembly|component)|same physical assembly/i.test(
                f,
              ),
            )),
      );
    const safe =
      (g.items.length === 1 || confirmedRepeat) &&
      (includedScope(t) || workScope(t) === "Requires scope confirmation") &&
      t.status !== "Rejected" &&
      !unresolvedFoundationAlternative(q, t) &&
      !/conflict|unreadable|uncertain (?:quantity|count)|(?:quantity|count)[^.;]*uncertain/i.test(
        (t.warnings ?? []).join(" "),
      );
    // Display proposals before approval. Never write them into the approved
    // quantity field or bypass the separate conversion checks.
    const approved = readyForEstimate(q, t);
    const quantity = safe
      ? approved
        ? t.quantity
        : (proposal.purchase ?? proposal.quantity)
      : null;
    const unit = approved
      ? t.unit
      : proposal.purchase !== null
        ? proposal.purchaseUnit
        : proposal.unit;
    return {
      ...g,
      quantity,
      unit,
      observations: g.items.map((item, i) => ({
        id: item.id,
        page: item.page,
        location: item.location,
        quantity: proposals[i].quantity,
        unit: proposals[i].unit,
        missing: proposals[i].missing,
      })),
      basis:
        !approved && proposal.purchase === null
          ? "Material quantity; purchasing requirements still require verification."
          : "Purchase quantity; contractor approval required before conversion.",
      reason:
        quantity !== null
          ? (confirmedRepeat
              ? "Repeated observations of the same assembly; quantity shown once, never added. "
              : "") +
            (proposal.purchase === null && proposal.missing.length
              ? proposal.missing.join("; ")
              : "Verify calculated inputs before approval.")
          : g.items.length > 1
            ? "Multiple source observations: confirm separate assemblies or repeated views. Counts are not added. " +
              quantityReason({ ...q, takeoff: [] }, t)
            : quantityReason(q, t),
    };
  });
}
