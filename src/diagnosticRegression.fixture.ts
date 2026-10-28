// Privacy-minimized reproduction of diagnostic failure shapes. Synthetic source
// IDs, locations, line coordinates and references; no private PDF/text/metadata.
import { newQuote, defaults, type TakeoffItem } from "./model";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
import type { AnalysisSuggestion } from "../shared/analysis";
export function diagnosticRegressionQuote() {
  const q = newQuote(defaults, []);
  q.name = "Synthetic diagnostic deck";
  q.documents = [
    {
      id: "synthetic-plan",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQK",
      addedAt: "2026-01-01T00:00:00Z",
    },
  ];
  const base: TakeoffItem = {
    id: "joist-primary",
    analysisId: "synthetic-report",
    documentId: "synthetic-plan",
    page: 1,
    description: "Deck joist specification",
    specification: '2x6 PT deck joists @ 16" O.C.',
    location: "Synthetic framing zone",
    quantity: null,
    unit: "boards",
    quantityMethod: "Unknown",
    classification: "Contractor input required",
    itemRole: "Construction item",
    confidence: "Low",
    origin: "ai",
    status: "Proposed",
    included: false,
    workScope: "Requires scope confirmation",
    destination: "Materials",
    notes: "Spacing readable; layout boundaries not established",
    sourceFacts: ['2x6 PT deck joists @ 16" O.C.'],
    assumptions: [],
    warnings: [],
    materialInputs: [
      {
        field: "spacing",
        value: 16,
        unit: "in",
        page: 1,
        readable: true,
        evidence: 'Joists @ 16" O.C.',
      },
    ],
    calculation: {
      kind: "joists",
      verified: false,
      inputs: { spacing: 16 },
      geometryConfirmed: false,
    },
  };
  const beam = syntheticDeckBeams()[0];
  beam.scope = "Requires scope confirmation";
  beam.supports.forEach((s) => (s.scope = "Requires scope confirmation"));
  const missingBeam: AnalysisSuggestion = {
    documentId: base.documentId,
    page: 1,
    description: "Primary 3-ply beam observation",
    specification: "3PLY 2X10 PT",
    location: "Synthetic primary beam",
    quantity: null,
    unit: "each",
    confidence: "Medium",
    destination: "Materials",
    itemRole: "Construction item",
    quantityMethod: "Counted",
    supportBasis: "Total visible locations",
    notes: "Support status and exact beam lengths require scope confirmation",
    sourceFacts: [
      "3PLY 2X10 PT",
      "Visible support symbols are not new footing counts",
    ],
    assumptions: [],
    warnings: [
      "Association of overall dimension 24'-3\" to this beam is uncertain",
    ],
    beamAssemblies: [beam],
  };
  const beamRef: TakeoffItem = {
    ...base,
    id: "beam-ref",
    description: "Repeated 3-ply beam specification reference",
    specification: "3PLY 2X10 PT",
    location: "Various beam annotations",
    unit: "each",
    calculation: undefined,
    materialInputs: [
      {
        field: "plies",
        value: 3,
        unit: "each",
        page: 1,
        readable: true,
        evidence: "3PLY 2X10 PT",
      },
    ],
    notes: "Repeat observation retained as corroboration only",
    sourceFacts: ["Repeated 3PLY 2X10 PT labels, not distinct assemblies"],
  };
  q.takeoff = [
    base,
    {
      ...base,
      id: "joist-ref",
      description: "Repeated joist spacing reference",
      location: "Various framing annotations",
      notes: "Repeated specification, not an additive count",
    },
    {
      ...beamRef,
      id: "two-ply",
      description: "Secondary 2-ply beam callout",
      specification: "2-ply 2x10 PT",
      materialInputs: [
        {
          field: "plies",
          value: 2,
          unit: "each",
          page: 1,
          readable: true,
          evidence: "2-ply 2x10 PT",
        },
      ],
      notes: "Physical extent unresolved",
    },
    beamRef,
    {
      ...base,
      id: "ledger",
      description: "Ledger board with aluminum flashing",
      specification: "2x6 PT ledger with aluminum flashing",
      unit: "each",
      calculation: undefined,
      materialInputs: [],
      beamAssemblies: [
        { ...beam, specification: "2x6 PT ledger with aluminum flashing" },
      ],
    },
  ];
  q.analysisReports = [
    {
      id: "synthetic-report",
      fingerprint: "synthetic-only",
      createdAt: "2026-01-01T00:00:00Z",
      assumptions: [],
      warnings: [
        "Selectable text unavailable; visual observations only",
        "DO NOT SCALE",
      ],
      sourceObservations: [missingBeam],
      dimensions: [
        {
          ...missingBeam,
          description: "Overall dimension",
          specification: "24'-3\"",
          location: "Unassociated dimension string",
          quantity: 24.25,
          unit: "ft",
          itemRole: "Document observation",
          quantityMethod: "Written",
          beamAssemblies: [],
          materialInputs: [
            {
              field: "layoutLength",
              value: 24.25,
              unit: "ft",
              page: 1,
              readable: true,
              evidence: "Overall 24'-3\" above framing",
            },
          ],
          notes: "Exact assembly association uncertain",
          calculationBasis: "Written overall dimension; not a beam cut length",
        },
      ],
    },
  ];
  return q;
}
