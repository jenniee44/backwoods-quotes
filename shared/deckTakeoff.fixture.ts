// Synthetic regression observations; not extracted from a customer document.
import { analysisFixture } from "./analysis.fixture";
import type { AnalysisSuggestion, PlanAnalysisResult } from "./analysis";
export function deckTakeoffFixture(documentId = "plan"): PlanAnalysisResult {
  const fact = (changes: Partial<AnalysisSuggestion>): AnalysisSuggestion => ({
    ...analysisFixture(documentId).suggestions[1],
    destination: "Informational",
    itemRole: "Supporting evidence",
    classification: "Plan fact",
    quantity: null,
    unit: "each",
    quantityMethod: "Unknown",
    confidence: "High",
    scopeGroup: "",
    specification: "",
    location: "Main deck",
    sourceDetailView: null,
    supportBasis: "Not established",
    subcontractorBasis: "Not established",
    calculationBasis: "",
    sourceFacts: [],
    assumptions: [],
    warnings: [],
    ...changes,
  });
  return {
    ...analysisFixture(documentId),
    dimensions: [],
    suggestions: [
      fact({
        description: "Posts / beams framing",
        destination: "Materials",
        itemRole: "Construction item",
        confidence: "Low",
      }),
    ],
    sourceObservations: [
      fact({
        description: "6x6 PT posts",
        specification: "6x6 PT posts",
        quantity: 3,
        quantityMethod: "Counted",
        sourceFacts: [
          "Three distinct posts identified once on framing plan, physical page 1",
        ],
      }),
      fact({
        description: "3-ply 2x10 PT beam runs",
        specification: "3-ply 2x10 PT beams",
        quantity: 4,
        unit: "runs",
        quantityMethod: "Counted",
        sourceFacts: [
          "Four distinct beam runs identified, physical page 1; purchase lengths not established",
        ],
      }),
      fact({
        description: "2x6 PT deck joists",
        specification: "2x6 PT deck joists @ 16 in. O.C.",
        sourceFacts: [
          "Written joist size/spacing on physical page 1; joist count and framing width not established",
        ],
      }),
      fact({
        description: "Simpson LUS26 joist hangers",
        specification: "Simpson LUS26",
        sourceFacts: [
          "Readable LUS26 callout, physical page 1; required connection locations uncertain",
        ],
      }),
      fact({
        description: "Visible support locations on plan",
        quantity: 12,
        quantityMethod: "Counted",
        supportBasis: "Total visible locations",
        sourceFacts: [
          "Twelve visible support symbols counted once on plan; existing/new status uncertain",
        ],
      }),
      fact({
        description: "Apparent new footing/pier assemblies",
        specification:
          "Concrete footing/pier assembly per readable detail; verify depth",
        quantity: 7,
        quantityMethod: "Counted",
        supportBasis: "Apparent new work",
        confidence: "Medium",
        sourceFacts: [
          "Seven distinct apparent new footing/pier assemblies; contractor must verify existing/new/by-others status",
        ],
      }),
      fact({
        description: "Drawing sheet identifier",
        specification: "A1",
        quantity: 1,
        quantityMethod: "Written",
        itemRole: "Document observation",
        sourceFacts: ["Drawing identifier A1"],
      }),
    ],
  };
}
