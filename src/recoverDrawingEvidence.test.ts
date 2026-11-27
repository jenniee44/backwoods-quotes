import { expect, it } from "vitest";
import { seed } from "./model";
import { recoverDrawingEvidence } from "./recoverDrawingEvidence";

function fixture() {
  const [target, source] = seed().quotes;
  target.status = "Draft";
  target.takeoff = [];
  source.takeoff = [
    {
      id: "observation",
      description: "Synthetic framing observation",
      quantity: 12,
      unit: "each",
      documentId: "source-drawing",
      page: 2,
      notes: "Check plan",
      status: "Approved",
      origin: "ai",
      confidence: "High",
      reviewAcknowledged: true,
      scopeVerified: true,
    },
  ];
  source.documents = [
    {
      id: "source-drawing",
      name: "source.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,c3ludGhldGlj",
      addedAt: "2026-01-01",
    },
  ];
  target.documents = [
    { ...source.documents[0], id: "target-drawing", name: "target.pdf" },
  ];
  return { target, source };
}

it("recovers exact-match observations once without transferring pricing, quantity or approval", () => {
  const { target, source } = fixture();
  const originalSource = structuredClone(source);
  const recovered = recoverDrawingEvidence(target, source);
  expect(recovered.takeoff).toHaveLength(1);
  expect(recovered.takeoff[0]).toMatchObject({
    documentId: "target-drawing",
    sourceDocumentName: "target.pdf",
    page: 2,
    quantity: null,
    status: "Proposed",
    scopeVerified: false,
    reviewAcknowledged: false,
    analysisSourceKey: "recovered:" + source.id + ":observation",
  });
  expect(recovered.lines).toEqual(target.lines);
  expect(recovered.pricing).toEqual(target.pricing);
  expect(source).toEqual(originalSource);
  expect(recoverDrawingEvidence(recovered, source)).toBe(recovered);
});

it("leaves unmatched or ambiguous attachments untouched and blocks a historical target", () => {
  const { target, source } = fixture();
  const doc = target.documents[0];
  target.documents = [
    { ...doc, data: "data:application/pdf;base64,Y2hhbmdlZA==" },
  ];
  expect(recoverDrawingEvidence(target, source)).toBe(target);
  target.documents = [doc, { ...doc, id: "second-drawing" }];
  expect(recoverDrawingEvidence(target, source)).toBe(target);
  target.documents = [doc];
  source.documents.push({
    ...source.documents[0],
    data: "data:application/pdf;base64,ZHVwbGljYXRl",
  });
  expect(recoverDrawingEvidence(target, source)).toBe(target);
  expect(() =>
    recoverDrawingEvidence({ ...target, status: "Sent" }, source),
  ).toThrow("editable draft");
});
