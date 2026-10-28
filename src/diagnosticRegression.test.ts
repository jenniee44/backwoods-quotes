import { expect, it } from "vitest";
import { diagnosticRegressionQuote } from "./diagnosticRegression.fixture";
import { prepareDeckTakeoff, materialTakeoffProposal } from "./deckTakeoff";
import { purchasingGroups } from "./purchasingGroups";
import { prepareConstructionAnalysis } from "../shared/takeoff";
import { analysisFixture } from "../shared/analysis.fixture";
import { customerDocument } from "./customerDocument";
import { takeoffAnalysisExport } from "./takeoffAnalysisExport";
import { calculate, seed, migrate } from "./model";
import { fullDimension } from "../shared/spatialBeam.fixture";
import { addAnalysisSuggestions } from "./planAnalysis";
import { approvedPurchasingGroups } from "./materialShoppingList";

it("retains the beam candidate while keeping total visible support locations non-purchasable", () => {
  const q = diagnosticRegressionQuote(),
    result = analysisFixture("synthetic-plan");
  result.suggestions = [q.analysisReports![0].sourceObservations![0]];
  result.sourceObservations = [];
  const next = prepareConstructionAnalysis(result);
  expect(
    next.suggestions.some(
      (s) => s.description === "Primary 3-ply beam observation",
    ),
  ).toBe(true);
  const adopted = addAnalysisSuggestions(
    { ...q, takeoff: [], analysisReports: [] },
    result,
  );
  expect(materialTakeoffProposal(adopted.takeoff[0])).toMatchObject({
    quantity: 1,
    unit: "runs",
    purchase: null,
  });
  expect(adopted.takeoff[0].calculation?.inputs.length1).toBeUndefined();
  result.suggestions = [
    {
      ...result.suggestions[0],
      description: "Visible footing locations",
      specification: "Concrete footings",
      category: "Footings / concrete",
      beamAssemblies: [],
    },
  ];
  expect(prepareConstructionAnalysis(result).suggestions).toHaveLength(0);
});
it("repairs saved support-filter omissions once, groups joist names and preserves unknowns", () => {
  const original = diagnosticRegressionQuote(),
    before = structuredClone(original);
  const q = prepareDeckTakeoff(original),
    recovered = q.takeoff.find((t) => t.id.includes(":recovered-beam:"))!;
  expect(recovered).toBeDefined();
  expect(materialTakeoffProposal(recovered)).toMatchObject({
    quantity: 1,
    unit: "runs",
    purchase: null,
  });
  expect(recovered.calculation?.inputs.plies1).toBe(3);
  expect(recovered.calculation?.inputs.length1).toBeUndefined();
  expect(
    q.takeoff.filter((t) => t.id.includes(":recovered-beam:")),
  ).toHaveLength(1);
  const groups = purchasingGroups(q, q.takeoff);
  expect(groups.filter((g) => /joist/i.test(g.name))).toHaveLength(1);
  expect(
    groups.filter((g) =>
      g.items.some((t) => t.specification === "3PLY 2X10 PT"),
    ),
  ).toHaveLength(1);
  expect(
    groups
      .find((g) => /joist/i.test(g.name))!
      .observations.every((o) => o.quantity === null),
  ).toBe(true);
  expect(prepareDeckTakeoff(q)).toEqual(q);
  expect(original).toEqual(before);
  expect(approvedPurchasingGroups(q)).toEqual([]);
  const store = seed();
  store.quotes = [q];
  expect(migrate(structuredClone(store)).quotes[0].takeoff).toEqual(q.takeoff);
});
it.each([
  "Rejected",
  "Approved",
  "manual",
  "blank",
  "included",
  "manual-inputs",
  "conflicts",
])("does not restore over a contractor's %s decision", (decision) => {
  const q = diagnosticRegressionQuote(),
    peer = q.takeoff.find((t) => t.id === "beam-ref")!;
  if (decision === "Rejected" || decision === "Approved")
    peer.status = decision;
  if (decision === "manual")
    peer.calculationBasis = "Manual material correction";
  if (decision === "blank")
    peer.calculation = {
      kind: "beam-runs",
      verified: false,
      inputs: { runs: null },
    };
  if (decision === "manual-inputs")
    peer.calculation = {
      kind: "beam-runs",
      verified: false,
      inputs: { runs: 3, length1: 12 },
    };
  if (decision === "conflicts") peer.conflictsVerified = true;
  if (decision === "included") {
    peer.workScope = "New work";
    peer.included = true;
  }
  expect(
    prepareDeckTakeoff(q).takeoff.some((t) =>
      t.id.includes(":recovered-beam:"),
    ),
  ).toBe(false);
});
it("preserves unrelated contractor scope, pricing and customer documents during repair", () => {
  const q = diagnosticRegressionQuote(),
    base = q.takeoff[0];
  for (const description of [
    "Existing steel beam to remain",
    "Helical piles",
    "Demolition",
    "Decking",
    "Railings",
    "Stairs",
  ])
    q.takeoff.push({
      ...base,
      id: description,
      description,
      calculation: undefined,
      origin: undefined,
      calculationBasis: "Manual scope",
      included: description !== "Existing steel beam to remain",
      workScope:
        description === "Existing steel beam to remain"
          ? "Existing work to remain"
          : "New work",
      quantity: description === "Helical piles" ? 12 : null,
    });
  q.lines = structuredClone(seed().quotes[0].lines);
  expect(q.lines.length).toBeGreaterThan(0);
  const untouched = structuredClone(q.takeoff.slice(5)),
    doc = customerDocument(q),
    pricing = calculate(q);
  const next = prepareDeckTakeoff(q);
  expect(next.takeoff.slice(5, 5 + untouched.length)).toEqual(untouched);
  expect(next.lines).toEqual(q.lines);
  expect(calculate(next)).toEqual(pricing);
  expect(customerDocument(next)).toEqual(doc);
  expect(JSON.stringify(customerDocument(next))).not.toContain(
    "recovered-beam",
  );
  expect(
    takeoffAnalysisExport(next).materials.some((t) =>
      t.id.includes(":recovered-beam:"),
    ),
  ).toBe(true);
});
it("only fills a full beam length when its role and endpoints identify that beam", () => {
  const q = diagnosticRegressionQuote();
  const observation = q.analysisReports![0].sourceObservations![0],
    beam = observation.beamAssemblies![0];
  beam.dimensions.push(fullDimension(beam, "14'-6\""));
  const next = prepareDeckTakeoff(q),
    recovered = next.takeoff.at(-1)!;
  expect(recovered.calculation?.inputs.length1).toBe(14.5);
  expect(materialTakeoffProposal(recovered).purchase).toBeNull();
});
it("keeps different ply specifications and physical beam lines separate within the purchasing categories", () => {
  const q = prepareDeckTakeoff(diagnosticRegressionQuote());
  const groups = purchasingGroups(q, q.takeoff);
  const beams = groups.filter((g) =>
    g.items.some((t) => /beam/i.test(t.description)),
  );
  expect(beams).toHaveLength(2);
  expect(
    beams
      .find((g) => g.items.some((t) => t.specification === "3PLY 2X10 PT"))!
      .observations.map((ob) => ob.quantity),
  ).toEqual([null, 1]);
  expect(
    q.takeoff.find((t) => t.id === "two-ply")!.calculation?.inputs.runs,
  ).toBeUndefined();
});
it("deduplicates exact repeated physical beam observations without summing runs, but retains separate lines", () => {
  const q = diagnosticRegressionQuote();
  const source = q.analysisReports![0].sourceObservations![0];
  q.analysisReports![0].sourceObservations!.push({
    ...structuredClone(source),
    description: "Same beam in overlapping detail",
  });
  const repaired = prepareDeckTakeoff(q);
  expect(
    repaired.takeoff.filter((t) => t.id.includes(":recovered-beam:")),
  ).toHaveLength(1);
  const other = structuredClone(source);
  other.description = "Different physical beam";
  other.beamAssemblies![0].start.y += 0.15;
  other.beamAssemblies![0].end.y += 0.15;
  other.beamAssemblies![0].labels.forEach((l) => (l.point.y += 0.15));
  other.beamAssemblies![0].supports.forEach((s) => (s.point.y += 0.15));
  q.analysisReports![0].sourceObservations!.push(other);
  expect(
    prepareDeckTakeoff(q).takeoff.filter((t) =>
      t.id.includes(":recovered-beam:"),
    ),
  ).toHaveLength(2);
});
it("does not resurrect a recovered material after the contractor removes it", () => {
  const recovered = prepareDeckTakeoff(diagnosticRegressionQuote());
  expect(recovered.analysisReports![0].beamSupportRecoveryVersion).toBe(1);
  recovered.takeoff = recovered.takeoff.filter(
    (t) => !t.id.includes(":recovered-beam:"),
  );
  expect(
    prepareDeckTakeoff(recovered).takeoff.some((t) =>
      t.id.includes(":recovered-beam:"),
    ),
  ).toBe(false);
});
it("never promotes a visible-support count into beam runs when no independent beam geometry exists", () => {
  const q = diagnosticRegressionQuote(),
    result = analysisFixture("synthetic-plan");
  result.suggestions = [
    {
      ...q.analysisReports![0].sourceObservations![0],
      quantity: 7,
      unit: "runs",
      beamAssemblies: [],
      sourceFacts: ["Visible support positions along beam"],
    },
  ];
  const next = addAnalysisSuggestions(
    { ...q, takeoff: [], analysisReports: [] },
    result,
  );
  expect(next.takeoff[0].quantity).toBeNull();
  expect(materialTakeoffProposal(next.takeoff[0]).quantity).toBeNull();
});
