// Synthetic regression evidence only; never customer documents or a real plan.
import { analysisFixture } from "../shared/analysis.fixture";
import type { DrawingDimension } from "../shared/drawingDimensions";
import type { AnalysisSuggestion } from "../shared/analysis";
export function dimensionFixture(
  delta: Partial<DrawingDimension> = {},
): DrawingDimension {
  return {
    written: "16 ft",
    value: 16,
    unit: "ft",
    role: "Joist layout width",
    field: "layoutLength",
    assemblyRef: "J1",
    beamLabel: "",
    association: "Explicit",
    readable: true,
    evidence: "Written J1 width perpendicular to joists",
    orientation: 270,
    region: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
    start: null,
    end: null,
    ...delta,
  };
}
export function structuredTakeoffFixture() {
  const result = analysisFixture("synthetic");
  const base: AnalysisSuggestion = {
    ...result.suggestions[0],
    destination: "Materials",
    classification: "Plan fact",
    confidence: "High",
    notes: "New work",
    assumptions: [],
    warnings: [],
    quantity: null,
    unit: "boards",
    itemRole: "Construction item",
    page: 1,
  };
  const joists: AnalysisSuggestion = {
    ...base,
    description: "Deck joists",
    specification: '2x6 PT at 16" O/C',
    location: "Deck J1",
    assemblyReference: "J1",
    sourceFacts: ["Readable J1 joist specification"],
    materialInputs: [
      {
        field: "spacing",
        value: 16,
        unit: "in",
        page: 1,
        readable: true,
        evidence: 'Joists at 16" O/C',
      },
      {
        field: "layoutClear",
        value: 1,
        unit: "option",
        page: 1,
        readable: true,
        evidence: "J1 bounded uniform layout without openings",
      },
      {
        field: "edgeIncluded",
        value: 1,
        unit: "option",
        page: 1,
        readable: true,
        evidence: "J1 both edge members explicitly included",
      },
    ],
  };
  const hanger: AnalysisSuggestion = {
    ...base,
    description: "Simpson LUS26 joist hangers",
    specification: "Simpson LUS26",
    unit: "each",
    location: "Ledger joint set H1",
    assemblyReference: "H1",
    sourceFacts: [
      "H1 connection schedule explicitly identifies one LUS26 at each of 13 joints",
    ],
    materialInputs: [
      {
        field: "piecesPerConnection",
        value: 1,
        unit: "each",
        page: 1,
        readable: true,
        evidence: "Schedule: one specified LUS26 per connection",
      },
    ],
  };
  result.suggestions = [
    joists,
    hanger,
    {
      ...structuredClone(hanger),
      description: "Repeated LUS26 hanger observation",
      sourceDetailView: null,
      sourceFacts: ["Same identified physical joint set H1 shown in detail"],
    },
  ];
  result.dimensions = [
    {
      ...base,
      description: "Written framing dimensions",
      destination: "Informational",
      itemRole: "Document observation",
      drawingDimensions: [
        dimensionFixture(),
        dimensionFixture({
          written: "13 connections",
          value: 13,
          unit: "each",
          role: "Connection count",
          field: "connections",
          assemblyRef: "H1",
          evidence:
            "H1: thirteen explicitly counted compatible connection locations",
        }),
      ],
    },
  ];
  result.sourceObservations = [];
  return result;
}
