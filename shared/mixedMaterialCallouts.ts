import type { AnalysisSuggestion } from "./analysis";
import { explicitBeamIdentity } from "./componentSubject";
/** Transcribe separate, explicitly named components from a mixed AI record.
 * Never borrow its beam geometry, overall dimensions, contract scope or counts. */
export function mixedMaterialCallouts(
  source: AnalysisSuggestion,
): AnalysisSuggestion[] {
  if ((source.warnings ?? []).some((w) => /(?:specification|member size|hanger model).*unreadable|unreadable.*(?:specification|member size|hanger model)/i.test(w))) return [];
  const text = [
    source.description,
    ...(source.sourceFacts ?? []),
    ...(source.materialInputs ?? []).map((f) => f.evidence),
  ].filter((fact) => !/unreadable|illegible|uncertain|possibly|maybe|guessed|assumed|cannot read|not legible|\?/i.test(fact)).join("; ");
  const result: AnalysisSuggestion[] = [];
  const add = (
    description: string,
    specification: string,
    category: string,
    facts: string[],
  ) =>
    result.push({
      description,
      specification,
      category,
      documentId: source.documentId,
      page: source.page,
      location: source.location,
      quantity: null,
      unit: "each",
      quantityMethod: "Unknown",
      confidence: "Medium",
      classification: "Plan fact",
      itemRole: "Construction item",
      destination: "Materials",
      notes:
        "Separate readable component recovered from a mixed AI observation. Quantity, geometry and scope require contractor verification; no measurement was borrowed from the other component.",
      sourceFacts: facts,
      supportBasis: "Not established",
      materialInputs: [],
      beamAssemblies: [],
      drawingDimensions: [],
      assemblyReference: "",
      assumptions: [],
      warnings: [],
    });
  if (explicitBeamIdentity(source)) {
    const joist = text.match(
      /\b\d+\s*[x×]\s*\d+\s*(?:P\.?T\.?\s*)?(?:deck\s*)?joists?\s*(?:@|at)\s*\d+(?:\.\d+)?\s*(?:["″]|in(?:ches)?)\s*(?:O[. /]*C\.?|on cent(?:re|er))/i,
    )?.[0];
    if (joist) add("Deck joists", joist, "Joists", [joist]);
  }
  if (!/hanger|LUS\d+/i.test(source.description)) {
    const hardware = text.match(
      /\b(?:Simpson\s+)?LUS\d+[A-Z0-9-]*(?:\s+(?:joist\s*)?hang(?:er|ers))?(?:\s+or equivalent)?/i,
    )?.[0];
    if (hardware)
      add("Joist hangers", hardware, "Hangers / connectors", [hardware]);
  }
  return result;
}
