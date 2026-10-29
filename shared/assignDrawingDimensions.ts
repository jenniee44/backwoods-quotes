import type { PlanAnalysisResult, AnalysisSuggestion } from "./analysis";
import {
  dimensionValueProblem,
  dimensionInput,
  type DimensionDecision,
} from "./drawingDimensions";
import { materialCategoryFor } from "./takeoff";
import { materialSpecificationKey } from "./materialGrouping";
import { mergeMaterialInputs, materialInputProblem } from "./materialInputs";
import { fullBeamDimension } from "./spatialBeams";
import { evidenceScope } from "./componentIdentity";
/** Mutates only the caller's cloned analysis. Records each attempted assignment. */
export function assignDrawingDimensions(result: PlanAnalysisResult) {
  const decisions: DimensionDecision[] = [];
  for (const source of [
    ...(result.dimensions ?? []),
    ...result.suggestions,
    ...(result.sourceObservations ?? []),
  ])
    for (const d of source.drawingDimensions ?? []) {
      const decision: DimensionDecision = {
        documentId: source.documentId,
        page: source.page,
        written: d.written,
        assemblyRef: d.assemblyRef,
        field: d.field,
        status: "Unassigned",
        reason: "",
      };
      const reject = (reason: string) => {
        decision.status = "Rejected";
        decision.reason = reason;
        decisions.push(decision);
      };
      const problem = dimensionValueProblem(d);
      if (problem) {
        reject(problem);
        continue;
      }
      if (
        d.role === "Overall" ||
        d.association !== "Explicit" ||
        !d.assemblyRef.trim() ||
        source.page === null
      ) {
        decision.reason =
          d.role === "Overall"
            ? "Overall dimension retained as reference; no framing-axis or beam cut-length association"
            : "Physical assembly association is not explicit";
        decisions.push(decision);
        continue;
      }
      if (!d.region.width || !d.region.height) {
        reject("Source drawing region is unresolved");
        continue;
      }
      const targets = result.suggestions.filter(
        (t) =>
          t.documentId === source.documentId &&
          t.page === source.page &&
          t.assemblyReference === d.assemblyRef &&
          t.itemRole !== "Document observation" &&
          t.itemRole !== "Supporting evidence" &&
          (d.role !== "Joist layout width" ||
            materialCategoryFor(t) === "Joists") &&
          (d.role !== "Full beam length" ||
            materialCategoryFor(t) === "Beams") &&
          (d.role !== "Connection count" ||
            ["Hangers / connectors", "Structural fasteners"].includes(
              materialCategoryFor(t) ?? "",
            )),
      );
      const key = (t: AnalysisSuggestion) =>
        JSON.stringify([
          materialCategoryFor(t),
          materialSpecificationKey(
            t.specification ?? "",
            materialCategoryFor(t),
          ),
          t.location,
          evidenceScope(t),
        ]);
      if (!targets.length || new Set(targets.map(key)).size !== 1) {
        reject(
          "No unique compatible physical assembly matches this source/page/reference",
        );
        continue;
      }
      if (
        [
          "Existing work to remain",
          "By others / excluded",
          "Existing work to remove or modify",
        ].includes(evidenceScope(source)) &&
        targets.some((t) => evidenceScope(t) !== evidenceScope(source))
      ) {
        reject("Drawing scope differs between the measurement and assembly");
        continue;
      }
      if (d.role === "Full beam length") {
        if (!d.start || !d.end || !d.beamLabel) {
          reject(
            "Full beam length requires labelled beam and both dimension endpoints",
          );
          continue;
        }
        const dimension = {
          written: d.written,
          role: "Full beam length" as const,
          association: "Explicit endpoints" as const,
          start: d.start,
          end: d.end,
          evidence: d.evidence,
        };
        const beams = targets.flatMap((t) =>
          (t.beamAssemblies ?? []).filter(
            (b) => b.drawingLabel === d.beamLabel && b.page === source.page,
          ),
        );
        if (
          !beams.length ||
          beams.some((b) => !fullBeamDimension(b, dimension))
        ) {
          reject(
            "Dimension endpoints do not establish the complete labelled beam length",
          );
          continue;
        }
        if (
          beams.some(
            (b) =>
              b.dimensions.length >= 8 &&
              !b.dimensions.some(
                (old) => JSON.stringify(old) === JSON.stringify(dimension),
              ),
          )
        ) {
          reject(
            "Beam dimension evidence limit reached; no original evidence discarded",
          );
          continue;
        }
        for (const b of beams)
          if (
            !b.dimensions.some(
              (old) => JSON.stringify(old) === JSON.stringify(dimension),
            ) &&
            b.dimensions.length < 8
          )
            b.dimensions.push(dimension);
      } else {
        if (d.role === "Support spacing") {
          decision.reason =
            "Support spacing is retained as a span reference, not a complete beam length";
          decisions.push(decision);
          continue;
        }
        if (
          d.field === "layoutLength" &&
          (d.role !== "Joist layout width" ||
            !/perpendicular|spacing axis|across (?:the )?joists/i.test(
              d.evidence,
            ))
        ) {
          reject("Perpendicular joist spacing-axis association is missing");
          continue;
        }
        if (
          (d.field === "connections" && d.role !== "Connection count") ||
          !d.field
        ) {
          reject(
            "Measurement role does not establish the requested calculator input",
          );
          continue;
        }
        const fact = dimensionInput(d, source.page);
        if (!fact) {
          reject("Measurement cannot supply a supported input");
          continue;
        }
        if (
          targets.some(
            (t) => mergeMaterialInputs(t.materialInputs, [fact]).length > 40,
          )
        ) {
          reject("Input evidence limit reached; no source facts discarded");
          continue;
        }
        for (const t of targets)
          t.materialInputs = mergeMaterialInputs(t.materialInputs, [fact]);
        if (targets.some((t) => materialInputProblem(t.materialInputs))) {
          reject(
            "Conflicting or unreadable values retained; calculation requires reconciliation",
          );
          continue;
        }
      }
      decision.status = "Assigned";
      decision.reason =
        "Explicit source/page/assembly association; proposed until contractor verification";
      decisions.push(decision);
    }
  result.dimensionDecisions = [
    ...new Map(decisions.map((d) => [JSON.stringify(d), d])).values(),
  ].slice(0, 500);
}
