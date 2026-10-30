import { expect, it } from "vitest";
import { sectionTakeoffFixture } from "./sectionTakeoff.fixture";
import { addAnalysisSuggestions } from "./planAnalysis";
import { validateAnalysis } from "../shared/analysis";
import { seed, migrate, takeoffToLine } from "./model";
import { materialTakeoffProposal } from "./deckTakeoff";
import { writtenAssemblyInputs } from "../shared/writtenAssemblyInputs";
import { resolveMaterialInputs } from "../shared/materialInputs";
import { purchasingGroups } from "./purchasingGroups";
import { addContractorScope } from "./contractorScopeDecisions";
import { takeoffAnalysisExport } from "./takeoffAnalysisExport";
import { mergeAssemblyObservations } from "./mergeAssemblyObservations";
const quote = () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.lines = [];
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
it("calculates independent section quantities without stock defaults, approval or double counting", () => {
  const result = sectionTakeoffFixture();
  result.suggestions.push({
    ...structuredClone(result.suggestions[4]),
    description: "Repeated LUS26 hanger observation",
  });
  const q = addAnalysisSuggestions(
    quote(),
    validateAnalysis(result, ["synthetic"]),
  );
  const proposals = Object.fromEntries(
    q.takeoff.map((t) => [t.assemblyReference, materialTakeoffProposal(t)]),
  );
  expect(proposals["SECTION-J"]).toMatchObject({
    quantity: 13,
    unit: "joists",
    purchase: null,
  });
  expect(proposals["SECTION-B"]).toMatchObject({
    quantity: 3,
    unit: "runs",
    purchase: null,
  });
  expect(proposals["SECTION-D"]).toMatchObject({
    quantity: 26,
    unit: "cut pieces",
    purchase: null,
  });
  expect(proposals["SECTION-P"].quantity).toBe(4);
  expect(proposals["SECTION-H"].quantity).toBe(13);
  expect(proposals["SECTION-F"].quantity).toBe(26);
  expect(proposals["SECTION-R"]).toMatchObject({
    quantity: 32,
    unit: "linear ft",
  });
  expect(proposals["SECTION-T"]).toMatchObject({
    quantity: 16,
    unit: "cut pieces",
  });
  expect(proposals["SECTION-LF"]).toMatchObject({
    quantity: 20,
    unit: "linear ft",
  });
  expect(proposals["SECTION-L"]).toMatchObject({
    quantity: 20,
    unit: "linear ft",
  });
  expect(proposals["SECTION-C"].quantity).toBeCloseTo((4 * Math.PI) / 27);
  expect(proposals["SECTION-J"].sources.join(" ")).toContain("page 1");
  expect(proposals["SECTION-C"].formula).toContain("12 in");
  expect(
    q.takeoff.filter(
      (t) => t.assemblyReference === "SECTION-H" && t.status !== "Rejected",
    ),
  ).toHaveLength(1);
  expect(
    purchasingGroups(q, q.takeoff).find((g) =>
      g.items.some((t) => t.assemblyReference === "SECTION-J"),
    )?.quantity,
  ).toBe(13);
  for (const t of q.takeoff)
    expect(() => takeoffToLine(q, t, "Materials")).toThrow();
  expect(q.lines).toEqual(quote().lines);
  const store = seed();
  store.quotes = [q];
  expect(migrate(store).quotes[0].takeoff).toEqual(q.takeoff);
  expect(
    takeoffAnalysisExport(q).materials.find(
      (t) => t.assemblyReference === "SECTION-J",
    )!.proposal.quantity,
  ).toBe(13);
});
it.each([
  "overall",
  "parallel",
  "tolerance",
  "openings",
  "missing edges",
  "wrong units",
])("does not fabricate joists from %s evidence", (kind) => {
  const r = sectionTakeoffFixture(),
    t = r.suggestions[0];
  if (kind === "overall") t.sourceFacts![0] = "Overall deck dimension: 24'-3\"";
  if (kind === "parallel")
    t.sourceFacts![0] = "Layout width parallel to joists: 16 ft";
  if (kind === "tolerance") t.sourceFacts![0] += " +/- 2 in";
  if (kind === "openings")
    t.sourceFacts![2] = "Joist layout: uniform, openings unknown";
  if (kind === "missing edges")
    t.sourceFacts = t.sourceFacts!.filter((f) => !f.includes("both edge"));
  if (kind === "wrong units")
    t.sourceFacts![0] = "Joist layout width perpendicular to joists: 16";
  const q = addAnalysisSuggestions(quote(), validateAnalysis(r, ["synthetic"]));
  expect(
    materialTakeoffProposal(
      q.takeoff.find((t) => t.assemblyReference === "SECTION-J")!,
    ).quantity,
  ).toBeNull();
});
it("recovers role-labelled saved evidence while preserving manual values and intentional blanks", () => {
  const q = addAnalysisSuggestions(
    quote(),
    validateAnalysis(sectionTakeoffFixture(), ["synthetic"]),
  );
  const t = q.takeoff.find((t) => t.assemblyReference === "SECTION-J")!;
  delete t.materialInputs;
  delete t.calculation;
  expect(materialTakeoffProposal(t).quantity).toBe(13);
  t.calculation = {
    kind: "joists",
    inputs: { length: null, spacing: 12 },
    verified: false,
  };
  expect(materialTakeoffProposal(t).quantity).toBeNull();
  expect(t.calculation.inputs).toEqual({ length: null, spacing: 12 });
  t.calculation = {
    kind: "joists",
    inputs: { length: 20, spacing: 12 },
    geometryConfirmed: true,
    verified: true,
  };
  expect(materialTakeoffProposal(t).quantity).toBe(21);
});
it("retains conflicting written inputs instead of choosing a convenient quantity", () => {
  const t = sectionTakeoffFixture().suggestions[0];
  t.sourceFacts!.push("Joist layout width perpendicular to joists: 20 ft");
  expect(resolveMaterialInputs(writtenAssemblyInputs(t)).conflicts).toContain(
    "layoutLength",
  );
});
it("reads written dimensions on DO NOT SCALE drawings without measuring pixels", () => {
  const t = sectionTakeoffFixture().suggestions[0];
  t.sourceFacts = [
    "DO NOT SCALE DRAWINGS; Joist layout width perpendicular to joists: 16 ft",
    "Joist layout: uniform, no openings",
    "Joist layout: both edge members included",
  ];
  expect(
    resolveMaterialInputs(writtenAssemblyInputs(t)).values.layoutLength,
  ).toBe(16);
});
it("does not borrow a different material's dimensions, edge conditions or counts from copied notes", () => {
  const t = sectionTakeoffFixture().suggestions[0];
  t.sourceFacts = [
    "Unique new included post count: 4",
    "Ledger member length: 20 ft",
    "Deck layout: uniform rectangular, no openings",
    "Connection count: 13",
  ];
  expect(writtenAssemblyInputs(t)).toEqual([]);
  const hardware = sectionTakeoffFixture().suggestions[4];
  hardware.sourceFacts = [
    "Joist layout width perpendicular to joists: 16 ft",
    "Joist layout: both edge members included",
    "Unique new included post count: 4",
  ];
  expect(writtenAssemblyInputs(hardware)).toEqual([]);
});
it("combines complementary same-assembly geometry without hiding conflicts or contractor blanks", () => {
  const q = addAnalysisSuggestions(
    quote(),
    validateAnalysis(sectionTakeoffFixture(), ["synthetic"]),
  );
  const a = q.takeoff.find((t) => t.assemblyReference === "SECTION-J")!;
  const b = structuredClone(a);
  b.id = "repeated-section";
  a.materialInputs = a.materialInputs!.filter(
    (f) => f.field !== "layoutLength",
  );
  a.sourceFacts = a.sourceFacts!.filter(
    (f) => !f.startsWith("Joist layout width"),
  );
  a.calculation = {
    kind: "joists",
    inputs: { spacing: 16 },
    inputSources: { spacing: "Synthetic.pdf · page 1: written spacing" },
    verified: false,
  };
  b.sourceFacts = ["Same physical section shown in elevation"];
  const merged = mergeAssemblyObservations([a, b]);
  expect(merged[1].status).toBe("Rejected");
  expect(materialTakeoffProposal(merged[0]).quantity).toBe(13);
  expect(merged[0].sourceFacts).toContain(
    "Same physical section shown in elevation",
  );
  a.calculation.inputs.length = null;
  expect(mergeAssemblyObservations([a, b])[1].status).toBe("Proposed");
  delete a.calculation.inputs.length;
  b.materialInputs = b.materialInputs!.map((f) =>
    f.field === "spacing" ? { ...f, value: 12 } : f,
  );
  expect(mergeAssemblyObservations([a, b])[1].status).toBe("Proposed");
});
it("adds demolition, disposal and subcontracted piles as separate unapproved scope, without invented rates", () => {
  let q = quote();
  for (const [choice, name, count, unit] of [
    ["Demolition", "Remove included decking", null, "scope"],
    ["Dump / disposal", "Disposal fees", null, "loads"],
    ["Helical piles — subcontractor", "Subcontracted foundations", 12, "piles"],
  ] as const) {
    q = addContractorScope(
      q,
      choice,
      name,
      "Contractor scope only",
      count,
      unit,
      [],
      true,
    );
  }
  expect(q.takeoff.map((t) => t.destination)).toEqual([
    "Other Costs",
    "Other Costs",
    "Subcontractor",
  ]);
  expect(q.takeoff[1].category).toBe("Dump / Disposal Fees");
  expect(q.takeoff.every((t) => t.status === "Proposed")).toBe(true);
  expect(q.lines).toEqual(quote().lines);
});
