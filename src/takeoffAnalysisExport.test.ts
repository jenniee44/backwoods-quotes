import { expect, it } from "vitest";
import { seed } from "./model";
import { takeoffAnalysisExport } from "./takeoffAnalysisExport";
it("exports saved evidence and calculations without source bytes, contacts, pricing or unrelated quote data", () => {
  const q = seed().quotes[0];
  q.customer.name = "PRIVATE CONTACT SENTINEL";
  q.notes = "PRIVATE QUOTE NOTES SENTINEL";
  q.documents = [
    {
      id: "source",
      name: "PRIVATE FILE NAME",
      type: "application/pdf",
      data: "PRIVATE PDF BYTES",
    },
  ] as typeof q.documents;
  q.takeoff = [
    {
      id: "material",
      documentId: "source",
      description: "Deck joists",
      specification: '2x6 PT at 16" OC',
      page: 1,
      quantity: null,
      unit: "joists",
      confidence: "High",
      status: "Proposed",
      origin: "ai",
      destination: "Materials",
      included: true,
      workScope: "New work",
      notes: "",
      assumptions: ["Verify openings"],
      sourceFacts: ["Explicit layout 16 ft"],
      materialInputs: [
        {
          field: "layoutLength",
          value: 16,
          unit: "ft",
          page: 1,
          readable: true,
          evidence: "Explicit layout",
        },
      ],
    },
  ];
  const before = structuredClone(q);
  const data = takeoffAnalysisExport(q),
    json = JSON.stringify(data);
  expect(data.materials[0].materialInputs?.[0].value).toBe(16);
  expect(data.materials[0].proposal.missing.length).toBeGreaterThan(0);
  expect(data.materials[0].confidence).toBe("High");
  for (const privateValue of [
    "PRIVATE CONTACT SENTINEL",
    "PRIVATE QUOTE NOTES SENTINEL",
    "PRIVATE FILE NAME",
    "PRIVATE PDF BYTES",
  ])
    expect(json).not.toContain(privateValue);
  expect(data).not.toHaveProperty("pricing");
  expect(q).toEqual(before);
});
