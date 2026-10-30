import { expect, it } from "vitest";
import { validateAnalysis } from "../shared/analysis";
import { materializeDimensionInventory } from "../shared/dimensionInventory";
import { prepareConstructionAnalysis } from "../shared/takeoff";
import {
  structuredTakeoffFixture,
  dimensionFixture,
} from "./structuredTakeoff.fixture";
import { sectionTakeoffFixture } from "./sectionTakeoff.fixture";
import { addAnalysisSuggestions } from "./planAnalysis";
import { seed } from "./model";
import { materialTakeoffProposal } from "./deckTakeoff";
it.each([0, 90, 180, 270])(
  "retains compact dimensions from an image-only page at %s degrees and calculates supported joists/hangers",
  (orientation) => {
    const r = structuredTakeoffFixture();
    r.dimensionInventory = r.dimensions![0].drawingDimensions!.map((d) => ({
      ...d,
      orientation,
      documentId: "synthetic",
      page: 1,
    }));
    r.dimensions = [];
    const result = validateAnalysis(
      r,
      ["synthetic"],
      [
        {
          id: "synthetic",
          name: "Synthetic.pdf",
          type: "application/pdf",
          data: "data:application/pdf;base64,JVBERi0xLjQK",
          pdfText: {
            pageCount: 1,
            truncated: false,
            pages: [
              {
                page: 1,
                width: 1728,
                height: 2592,
                status: "No selectable text",
                text: "",
              },
            ],
          },
        },
      ],
    );
    expect(result.dimensions![0].drawingDimensions).toHaveLength(2);
    expect(result.dimensions![0].drawingDimensions![0].orientation).toBe(
      orientation,
    );
    expect(result).not.toHaveProperty("dimensionInventory");
    expect(prepareConstructionAnalysis(result)).toEqual(result);
    const q = seed().quotes[0];
    q.status = "Draft";
    q.takeoff = [];
    q.documents = [
      {
        id: "synthetic",
        name: "Synthetic.pdf",
        type: "application/pdf",
        data: "data:application/pdf;base64,JVBERi0xLjQK",
        addedAt: "2026-01-01",
      },
    ];
    const next = addAnalysisSuggestions(q, result);
    expect(
      materialTakeoffProposal(
        next.takeoff.find((t) => t.assemblyReference === "J1")!,
      ).quantity,
    ).toBe(13);
    expect(
      materialTakeoffProposal(
        next.takeoff.find((t) => t.assemblyReference === "H1")!,
      ).quantity,
    ).toBe(13);
    expect(next.takeoff.every((t) => t.status !== "Approved")).toBe(true);
  },
);
it.each(["source", "page", "unknown field", "region", "limit"])(
  "rejects malformed compact dimension %s",
  (kind) => {
    const r = structuredTakeoffFixture();
    const entry = { ...dimensionFixture(), documentId: "synthetic", page: 1 };
    if (kind === "source") entry.documentId = "other";
    if (kind === "page") entry.page = 51;
    if (kind === "unknown field") Object.assign(entry, { approved: true });
    if (kind === "region")
      entry.region = { x: 0.9, y: 0, width: 0.8, height: 0.1 };
    r.dimensionInventory =
      kind === "limit" ? Array.from({ length: 151 }, () => entry) : [entry];
    expect(() => validateAnalysis(r, ["synthetic"])).toThrow();
  },
);
it("preserves unassociated overall dimensions and does not manufacture joist geometry or beam lengths", () => {
  const r = structuredTakeoffFixture();
  r.dimensions = [];
  r.dimensionInventory = [
    {
      ...dimensionFixture({
        written: "24'-3\"",
        value: 24.25,
        role: "Overall",
        association: "Uncertain",
      }),
      documentId: "synthetic",
      page: 1,
    },
  ];
  const result = validateAnalysis(r, ["synthetic"]);
  expect(result.dimensionDecisions![0]).toMatchObject({ status: "Unassigned" });
  expect(
    result.suggestions[0].materialInputs!.some(
      (f) => f.field === "layoutLength",
    ),
  ).toBe(false);
});
it("expands bounded private evidence in chunks without creating billable dimensions", () => {
  const r = structuredTakeoffFixture();
  r.dimensions = [];
  r.dimensionInventory = Array.from({ length: 90 }, (_, i) => ({
    ...dimensionFixture({ assemblyRef: "S" + i }),
    documentId: "synthetic",
    page: 1,
  }));
  const before = structuredClone(r.suggestions);
  materializeDimensionInventory(r);
  expect(r.dimensions!.map((d) => d.drawingDimensions!.length)).toEqual([
    40, 40, 10,
  ]);
  expect(
    r.dimensions!.every(
      (d) => d.destination === "Informational" && d.quantity === null,
    ),
  ).toBe(true);
  expect(r.suggestions).toEqual(before);
});
it("assigns explicit decking axes and actual coverage without borrowing overall dimensions", () => {
  const r = sectionTakeoffFixture();
  const decking = r.suggestions.find(
    (s) => s.assemblyReference === "SECTION-D",
  )!;
  decking.sourceFacts = [
    "Deck layout: uniform rectangular, no openings",
    "Decking direction: along layout length",
    "Pieces per row: 1",
  ];
  r.suggestions = [decking];
  r.dimensionInventory = [
    dimensionFixture({
      written: "16 ft",
      value: 16,
      role: "Deck layout length",
      field: "layoutLength",
    }),
    dimensionFixture({
      written: "12 ft",
      value: 12,
      role: "Deck layout width",
      field: "layoutWidth",
    }),
    dimensionFixture({
      written: "5.5 in",
      value: 5.5,
      unit: "in",
      role: "Material coverage",
      field: "boardWidth",
    }),
    dimensionFixture({
      written: "1/8 in",
      value: 0.125,
      unit: "in",
      role: "Material coverage",
      field: "gap",
    }),
  ].map((d) => ({
    ...d,
    assemblyRef: "SECTION-D",
    documentId: "synthetic",
    page: 1,
  }));
  const prepared = validateAnalysis(r, ["synthetic"]);
  expect(
    prepared.dimensionDecisions!.every((d) => d.status === "Assigned"),
  ).toBe(true);
  expect(
    prepared.suggestions[0].materialInputs!.find(
      (f) => f.field === "boardWidth",
    )!.value,
  ).toBe(5.5);
});
