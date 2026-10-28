import { initializeBeamCalculator } from "./initializeBeamCalculator";
import { sameBeamCalculator } from "./beamRecipeIdentity";
import type { Quote, TakeoffItem } from "./model";
import { isBeamMaterial } from "./beamMaterial";
import { spatialBeamRecipe } from "./spatialBeamPrefill";
import { sameSpatialBeam } from "../shared/spatialBeams";
import { materialSpecificationKey } from "../shared/materialGrouping";
/** Repair only the identifiable old support-filter omission in the latest analysis.
 * No stale provider request, scale inference, scope approval or source deletion.
 */
export function recoverBeamEvidence(q: Quote): Quote {
  if (q.status !== "Draft") return q;
  const report = q.analysisReports?.at(-1);
  if (
    !report ||
    report.beamSupportRecoveryVersion === 1 ||
    !q.takeoff.some((t) => t.analysisId === report.id)
  )
    return q;
  const takeoff = [...q.takeoff];
  for (const [index, source] of (report.sourceObservations ?? []).entries()) {
    if (
      source.itemRole !== "Construction item" ||
      source.supportBasis !== "Total visible locations" ||
      !source.beamAssemblies?.length
    )
      continue;
    const document = q.documents.find((d) => d.id === source.documentId);
    if (!document) continue; // Removing an attachment is not a request to restore its candidates.
    const candidate: TakeoffItem = {
      ...structuredClone(source),
      id: `${report.id}:recovered-beam:${index}`,
      analysisId: report.id,
      sourceDocumentName: document.name,
      status: "Proposed",
      origin: "ai",
      destination: "Materials",
      quantity: null,
      unit: "runs",
      quantityMethod: "Unknown",
      included: false,
      workScope: "Requires scope confirmation",
      reviewAcknowledged: false,
      scopeVerified: false,
    };
    if (!isBeamMaterial(candidate)) continue;
    const specification = materialSpecificationKey(
      candidate.specification ?? "",
      "Beams",
    );
    const peers = takeoff.filter(
      (t) =>
        t.documentId === candidate.documentId &&
        materialSpecificationKey(t.specification ?? "", "Beams") ===
          specification,
    );
    if (
      peers.some(
        (t) =>
          t.id === candidate.id ||
          (t.page === candidate.page &&
            t.description === candidate.description) ||
          (t.beamAssemblies ?? []).some((beam) =>
            candidate.beamAssemblies!.some((other) =>
              sameSpatialBeam(beam, other),
            ),
          ) ||
          t.status !== "Proposed" ||
          t.reviewAcknowledged ||
          t.scopeVerified ||
          t.purchaseVerified ||
          t.conflictsVerified ||
          t.calculation?.verified ||
          t.overlapReviews?.length ||
          /^Manual /i.test(t.calculationBasis ?? "") ||
          t.quantity !== null ||
          (t.workScope && t.workScope !== "Requires scope confirmation") ||
          (t.calculation &&
            !sameBeamCalculator(t, {
              ...t,
              calculation: initializeBeamCalculator({
                ...t,
                calculation: undefined,
              }),
            })),
      )
    )
      continue;
    const calculation = spatialBeamRecipe(candidate);
    if (!calculation) continue;
    candidate.calculation = calculation;
    // Preserve the full original note/evidence in the report; add only audit metadata here.
    candidate.notes = `${candidate.notes}\nRecovered physical beam evidence previously omitted by the visible-support filter. Support symbols are not new footing counts; lengths, scope and purchasing remain unverified.`;
    takeoff.push(candidate);
  }
  return takeoff.length === q.takeoff.length
    ? q
    : {
        ...q,
        takeoff,
        analysisReports: q.analysisReports!.map((r) =>
          r.id === report.id ? { ...r, beamSupportRecoveryVersion: 1 } : r,
        ),
      };
}
