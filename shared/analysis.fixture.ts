import type { PlanAnalysisResult, AnalysisSuggestion } from "./analysis";
// Test fixture only; never imported by the production app/provider.
export function analysisFixture(documentId = "plan"): PlanAnalysisResult {
  const item: AnalysisSuggestion = {
    description: "Joist installation",
    quantity: null,
    unit: "hours",
    documentId,
    page: 1,
    notes: "Verify quantities on site",
    confidence: "Low",
    category: "Miscellaneous",
    destination: "Labour",
    classification: "Estimating suggestion",
    assumptions: ["Hours are not specified"],
    warnings: ["VERIFY ON SITE"],
  };
  return {
    project: {
      projectType: "Deck",
      drawingTitle: "Test plan",
      drawingNumbers: ["A1"],
      revision: "",
      date: "",
      description: "Test residential deck",
    },
    dimensions: [
      {
        ...item,
        description: "Deck area",
        quantity: 24,
        unit: "sq. ft.",
        destination: "Informational",
        classification: "Plan fact",
        confidence: "High",
      },
    ],
    suggestions: [
      item,
      {
        ...item,
        description: "Joists",
        quantity: 6,
        unit: "each",
        destination: "Materials",
        classification: "Plan fact",
        confidence: "High",
        assumptions: [],
        warnings: [],
      },
    ],
    assumptions: ["Field verification required"],
    warnings: ["DO NOT SCALE DRAWINGS"],
  };
}
