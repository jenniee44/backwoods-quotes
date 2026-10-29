import { expect, it } from "vitest";
import {
  structuredTakeoffFixture,
  dimensionFixture,
} from "./structuredTakeoff.fixture";
import { validateAnalysis } from "../shared/analysis";
import { analysisFixture } from "../shared/analysis.fixture";
import { validDrawingDimensions } from "../shared/drawingDimensions";
import { seed, migrate, takeoffToLine } from "./model";
import { addAnalysisSuggestions } from "./planAnalysis";
import { materialTakeoffProposal, prepareDeckTakeoff } from "./deckTakeoff";
import { prepareMaterialsSummary } from "./materialsSummary";
import { purchasingGroups } from "./purchasingGroups";
import { takeoffAnalysisExport } from "./takeoffAnalysisExport";
import { preserveDetectedDimensions } from "./detectedDimensions";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
const quote = () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [];
  q.analysisReports = [];
  q.documents = [
    {
      id: "synthetic",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQK",
      addedAt: "2026-01-01",
    },
  ];
  return q;
};
it("validates oriented dimension evidence, calculates 13 joists and 13 hangers, and archives repeated H1 once", () => {
  const result = validateAnalysis(structuredTakeoffFixture(), ["synthetic"]);
  const q = addAnalysisSuggestions(quote(), result);
  q.takeoff = prepareMaterialsSummary(q.takeoff, true);
  const j = q.takeoff.find((t) => t.assemblyReference === "J1")!,
    h = q.takeoff.find(
      (t) => t.assemblyReference === "H1" && t.status !== "Rejected",
    )!;
  expect(materialTakeoffProposal(j)).toMatchObject({
    quantity: 13,
    unit: "joists",
    purchase: null,
  });
  expect(materialTakeoffProposal(h)).toMatchObject({
    quantity: 13,
    purchase: null,
  });
  expect(
    q.takeoff.filter(
      (t) => t.assemblyReference === "H1" && t.status !== "Rejected",
    ),
  ).toHaveLength(1);
  expect(q.takeoff.filter((t) => t.assemblyReference === "H1")).toHaveLength(1);
  expect(purchasingGroups(q, q.takeoff)).toHaveLength(2);
  expect(h.sourceFacts!.join(" ")).toContain("H1");
  expect(() => takeoffToLine(q, j, "Materials")).toThrow();
  const exp = takeoffAnalysisExport(q);
  expect(
    exp.reports[0].dimensionDecisions!.filter((d) => d.status === "Assigned")
      .length,
  ).toBeGreaterThan(0);
  expect(exp.reports[0].dimensions![0].drawingDimensions![0].orientation).toBe(
    270,
  );
  const store = seed();
  store.quotes = [q];
  expect(migrate(store).quotes[0].takeoff).toEqual(q.takeoff);
});
it.each([
  "overall",
  "wrong-axis",
  "wrong-id",
  "wrong-page",
  "wrong-value",
  "unreadable",
  "ambiguous",
])("rejects %s dimensions without fabricated counts", (kind) => {
  const r = structuredTakeoffFixture(),
    d = r.dimensions![0].drawingDimensions![0];
  if (kind === "overall") d.role = "Overall";
  if (kind === "wrong-axis") d.evidence = "Written overall deck depth";
  if (kind === "wrong-id") d.assemblyRef = "J9";
  if (kind === "wrong-page") r.dimensions![0].page = 2;
  if (kind === "wrong-value") d.value = 24.25;
  if (kind === "unreadable") d.readable = false;
  if (kind === "ambiguous")
    r.suggestions.push({
      ...r.suggestions[0],
      location: "Different assembly with conflicting identifier",
    });
  const q = addAnalysisSuggestions(quote(), validateAnalysis(r, ["synthetic"]));
  expect(
    materialTakeoffProposal(
      q.takeoff.find((t) => t.assemblyReference === "J1")!,
    ).quantity,
  ).toBeNull();
  expect(
    q.analysisReports![0].dimensionDecisions!.some(
      (d) => d.written === "16 ft" && d.status !== "Assigned",
    ),
  ).toBe(true);
});
it("requires actual connection evidence, not joist count, to calculate hangers", () => {
  const r = structuredTakeoffFixture();
  r.dimensions![0].drawingDimensions =
    r.dimensions![0].drawingDimensions!.slice(0, 1);
  const q = addAnalysisSuggestions(quote(), validateAnalysis(r, ["synthetic"]));
  expect(
    materialTakeoffProposal(
      q.takeoff.find((t) => t.assemblyReference === "H1")!,
    ).quantity,
  ).toBeNull();
});
it("maps a full beam dimension only with labelled endpoints, never overall/support span or stock boards", () => {
  const r = structuredTakeoffFixture(),
    beam = syntheticDeckBeams()[0];
  beam.drawingLabel = "B1";
  const endpoints = fullDimension(beam, "14 ft");
  r.suggestions = [
    {
      ...r.suggestions[0],
      description: "Beam B1",
      specification: "3PLY 2X10 PT",
      location: "Beam B1",
      assemblyReference: "B1",
      materialInputs: [],
      beamAssemblies: [beam],
    },
  ];
  r.dimensions![0].drawingDimensions = [
    dimensionFixture({
      written: "14 ft",
      value: 14,
      assemblyRef: "B1",
      beamLabel: "B1",
      role: "Full beam length",
      field: "memberLength",
      start: endpoints.start,
      end: endpoints.end,
      evidence: endpoints.evidence,
    }),
  ];
  const q = prepareDeckTakeoff(
    addAnalysisSuggestions(quote(), validateAnalysis(r, ["synthetic"])),
  );
  expect(q.takeoff[0].calculation?.inputs).toMatchObject({
    runs: 1,
    plies1: 3,
    length1: 14,
  });
  expect(materialTakeoffProposal(q.takeoff[0]).purchase).toBeNull();
  r.dimensions![0].drawingDimensions![0].role = "Overall";
  expect(
    addAnalysisSuggestions(quote(), validateAnalysis(r, ["synthetic"]))
      .takeoff[0].calculation?.inputs.length1,
  ).toBeUndefined();
});
it("recovers readable selectable dimensions when AI returned [], but never assigns them by proximity", () => {
  const r = analysisFixture("synthetic");
  r.dimensions = [];
  const next = preserveDetectedDimensions(r, [
    {
      id: "synthetic",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "",
      pdfText: {
        pageCount: 1,
        truncated: false,
        pages: [
          {
            page: 1,
            width: 2592,
            height: 1728,
            status: "Available",
            text: "24'-3\" overall; DO NOT SCALE",
            positions: [
              {
                text: "24'-3\"",
                x: 0.2,
                y: 0.1,
                width: 0.1,
                height: 0.03,
                angle: 270,
              },
            ],
          },
        ],
      },
    },
  ]);
  expect(next.dimensions).toHaveLength(1);
  expect(next.dimensions![0].drawingDimensions![0]).toMatchObject({
    value: 24.25,
    unit: "ft",
    association: "Uncertain",
    orientation: 270,
  });
  expect(
    validateAnalysis(next, ["synthetic"]).dimensionDecisions![0].status,
  ).toBe("Unassigned");
  expect(
    validDrawingDimensions([
      {
        ...dimensionFixture(),
        region: { x: 2, y: 0, width: 0.1, height: 0.1 },
      },
    ]),
  ).toBe(false);
});
it("does not merge genuinely distinct hanger assemblies or preserve conflicting counts as a combined purchase", () => {
  for (const change of ["id", "scope", "quantity"]) {
    const r = structuredTakeoffFixture();
    if (change === "id") r.suggestions[2].assemblyReference = "H2";
    if (change === "scope") r.suggestions[2].notes = "By others";
    if (change === "quantity") {
      r.suggestions[2].quantity = 14;
      r.suggestions[2].quantityMethod = "Counted";
    }
    const q = addAnalysisSuggestions(
      quote(),
      validateAnalysis(r, ["synthetic"]),
    );
    const next = prepareMaterialsSummary(q.takeoff, true);
    expect(
      next.filter(
        (t) => /hanger/i.test(t.description) && t.status !== "Rejected",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      purchasingGroups({ ...q, takeoff: next }, next).find((g) =>
        /hanger/i.test(g.name),
      )?.quantity,
    ).not.toBe(26);
  }
});
it("archives an explicitly matching saved H1 observation without deleting its source or adding quantities", async () => {
  const { mergeAssemblyObservations } =
    await import("./mergeAssemblyObservations");
  const q = addAnalysisSuggestions(
    quote(),
    validateAnalysis(structuredTakeoffFixture(), ["synthetic"]),
  );
  const h = q.takeoff.find((t) => t.assemblyReference === "H1")!;
  const next = mergeAssemblyObservations([
    h,
    {
      ...structuredClone(h),
      id: "second",
      page: 2,
      sourceFacts: ["H1 same physical joints in another view"],
    },
  ]);
  expect(next).toHaveLength(2);
  expect(next.filter((t) => t.status === "Proposed")).toHaveLength(1);
  expect(materialTakeoffProposal(next[0]).quantity).toBe(13);
  expect(next[0].sourceFacts!.join(" ")).toContain("another view");
  const distinct = mergeAssemblyObservations([
    h,
    { ...structuredClone(h), id: "other", assemblyReference: "H2" },
  ]);
  expect(distinct.every((t) => t.status === "Proposed")).toBe(true);
  const conflicting = mergeAssemblyObservations([
    { ...h, notes: "Original proposed observation: 13 each" },
    { ...h, id: "conflict", notes: "Original proposed observation: 14 each" },
  ]);
  expect(conflicting.every((t) => t.status === "Proposed")).toBe(true);
});
it("keeps same-value dimensions at separate original-page regions and joins selectable text fragments without scaling", () => {
  const r = analysisFixture("synthetic");
  r.dimensions = [];
  const result = preserveDetectedDimensions(r, [
    {
      id: "synthetic",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "",
      pdfText: {
        pageCount: 1,
        truncated: false,
        pages: [
          {
            page: 1,
            width: 1000,
            height: 1000,
            status: "Available",
            text: "12 ft at two locations; 24'-3\"",
            positions: [
              {
                text: "12 ft",
                x: 0.1,
                y: 0.1,
                width: 0.1,
                height: 0.02,
                angle: 90,
              },
              {
                text: "12 ft",
                x: 0.6,
                y: 0.5,
                width: 0.1,
                height: 0.02,
                angle: 270,
              },
              {
                text: "24'",
                x: 0.3,
                y: 0.7,
                width: 0.1,
                height: 0.02,
                angle: 0,
              },
              {
                text: '3"',
                x: 0.41,
                y: 0.7,
                width: 0.1,
                height: 0.02,
                angle: 0,
              },
            ],
          },
        ],
      },
    },
  ]);
  expect(
    result.dimensions!.filter(
      (d) => d.drawingDimensions![0].written === "12 ft",
    ),
  ).toHaveLength(2);
  expect(
    result.dimensions!.some(
      (d) => d.drawingDimensions![0].written === "24'-3\"",
    ),
  ).toBe(true);
  expect(
    result.dimensions!.every(
      (d) => d.drawingDimensions![0].association === "Uncertain",
    ),
  ).toBe(true);
});
it("does not bypass count conflicts through legacy duplicate consolidation", () => {
  const q = addAnalysisSuggestions(
    quote(),
    validateAnalysis(structuredTakeoffFixture(), ["synthetic"]),
  );
  const h = q.takeoff.find((t) => t.assemblyReference === "H1")!;
  const items = [
    {
      ...h,
      sourceFacts: ["Same physical assembly H1"],
      notes: "Original proposed observation: 13 each",
    },
    {
      ...structuredClone(h),
      id: "conflicting-observation",
      sourceFacts: ["Same physical assembly H1"],
      notes: "Original proposed observation: 14 each",
    },
  ];
  expect(
    prepareMaterialsSummary(items, true).every((t) => t.status === "Proposed"),
  ).toBe(true);
  const manual = [
    { ...h, scopeOverride: "Included" as const, scopeVerified: true },
    { ...h, id: "source-again" },
  ];
  expect(
    prepareMaterialsSummary(manual).filter((t) => t.status === "Proposed"),
  ).toHaveLength(2);
});
it("does not turn support-symbol counts into hanger connections and accepts explicit 3PLY notation", async () => {
  const { dimensionValueProblem } = await import("../shared/drawingDimensions");
  expect(
    dimensionValueProblem(
      dimensionFixture({
        written: "13 supports",
        value: 13,
        unit: "each",
        role: "Connection count",
        field: "connections",
      }),
    ),
  ).toContain("component type");
  expect(
    dimensionValueProblem(
      dimensionFixture({
        written: "3PLY",
        value: 3,
        unit: "each",
        role: "Other",
        field: "plies",
      }),
    ),
  ).toBe("");
  const r = structuredTakeoffFixture();
  r.dimensions![0].drawingDimensions![1].written = "13 supports";
  const q = addAnalysisSuggestions(quote(), validateAnalysis(r, ["synthetic"]));
  expect(
    materialTakeoffProposal(
      q.takeoff.find((t) => t.assemblyReference === "H1")!,
    ).quantity,
  ).toBeNull();
});
