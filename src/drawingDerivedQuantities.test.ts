import { expect, it } from "vitest";
import { analysisFixture } from "../shared/analysis.fixture";
import type { AnalysisDocument } from "../shared/analysis";
import { deriveDrawingQuantities } from "./drawingDerivedQuantities";
const fact = "NEW DECK A RECTANGULAR DECKING LENGTH 16 ft WIDTH 12 ft";
const docs: AnalysisDocument[] = [
  {
    id: "plan",
    name: "synthetic.pdf",
    type: "application/pdf",
    data: "data:application/pdf;base64," + btoa("%PDF-test"),
    pdfText: {
      pageCount: 3,
      truncated: false,
      pages: [
        { page: 1, status: "Available", text: fact, width: 2592, height: 1728 },
      ],
    },
  },
];
function fixture() {
  const r = analysisFixture();
  r.suggestions = [
    {
      ...r.suggestions[1],
      description: "Decking area",
      location: "Deck A",
      unit: "sq ft",
      quantity: null,
      sourceFacts: [fact],
      notes: "New work",
      warnings: [],
    },
  ];
  return r;
}
it("calculates only a written rectangular area without approving or inferring boards", () => {
  const r = fixture();
  const s = deriveDrawingQuantities(r, docs).suggestions[0];
  expect(s.quantity).toBe(192);
  expect(s.classification).toBe("Calculated quantity");
  expect(s.calculationBasis).toContain("no purchase boards");
  expect(s.warnings?.join()).toContain("contractor must verify");
  expect(r.suggestions[0].quantity).toBeNull();
});
it.each(["boards", "beam runs", "hours"])(
  "does not infer %s from area",
  (unit) => {
    const r = fixture();
    r.suggestions[0].unit = unit;
    expect(deriveDrawingQuantities(r, docs).suggestions[0].quantity).toBeNull();
  },
);
it("requires exact selectable text, same source page, and unambiguous dimensions", () => {
  for (const change of ["missing", "page", "conflict", "scope"]) {
    const r = fixture();
    const t = r.suggestions[0];
    if (change === "missing") t.sourceFacts = [fact + " invented note"];
    if (change === "page") t.page = 2;
    if (change === "conflict") t.warnings = ["Conflicting observations"];
    if (change === "scope") t.notes = "Existing work to remain";
    expect(deriveDrawingQuantities(r, docs).suggestions[0].quantity).toBeNull();
  }
  const r = fixture();
  r.suggestions[0].sourceFacts = [fact + " LENGTH 18 ft"];
  const d = structuredClone(docs);
  d[0].pdfText!.pages[0].text = r.suggestions[0].sourceFacts![0];
  expect(deriveDrawingQuantities(r, d).suggestions[0].quantity).toBeNull();
});
