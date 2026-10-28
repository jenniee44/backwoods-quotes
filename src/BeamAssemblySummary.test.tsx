import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BeamAssemblySummary from "./BeamAssemblySummary";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
import type { TakeoffItem } from "./model";
const base = {
  description: "Deck beams",
  quantity: null,
  unit: "runs",
  page: 1,
  notes: "New work",
  status: "Proposed" as const,
  confidence: "High" as const,
};
it("shows compact drawing associations with advanced evidence collapsed and no inferred cut lengths", () => {
  const item: TakeoffItem = {
    ...base,
    id: "synthetic",
    documentId: "synthetic",
    beamAssemblies: syntheticDeckBeams(),
  };
  const html = renderToStaticMarkup(<BeamAssemblySummary item={item} />);
  expect(html).toContain("3 proposed beam lines");
  expect(html).toContain("Length: To confirm");
  expect(html).toContain("3 plies");
  expect(html).toContain("Overall: 24&#x27;-3&quot;");
  expect(html).not.toContain("<details open");
});
it("maps manually reordered run labels to the correct summary and respects deliberately blank measurements and plies", () => {
  const beams = syntheticDeckBeams();
  beams.forEach((b, i) => (b.drawingLabel = `B${i + 1}`));
  const item: TakeoffItem = {
    ...base,
    id: "synthetic",
    documentId: "synthetic",
    beamAssemblies: beams,
    calculation: {
      kind: "beam-runs",
      inputs: {
        runs: 3,
        length1: 20,
        length2: null,
        length3: 12,
        plies1: 3,
        plies2: null,
        plies3: 3,
      },
      runLabels: { "1": "B3", "2": "B2", "3": "B1" },
      verified: false,
    },
  };
  const html = renderToStaticMarkup(<BeamAssemblySummary item={item} />);
  const rows = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g)].map(
    (m) => m[1].replace(/<[^>]+>/g, ""),
  );
  expect(rows[0]).toContain("Length: 12′");
  expect(rows[1]).toContain("Length: To confirm");
  expect(rows[1]).toContain("Plies to confirm");
  expect(rows[2]).toContain("Length: 20′");
});
it("reports physical lines separately from uncertain construction scope instead of a misleading zero count", () => {
  const beams = syntheticDeckBeams();
  beams.forEach((b) => (b.scope = "Requires scope confirmation"));
  const html = renderToStaticMarkup(
    <BeamAssemblySummary
      item={{
        ...base,
        id: "synthetic",
        documentId: "synthetic",
        beamAssemblies: beams,
      }}
    />,
  );
  expect(html).toContain("3 proposed beam lines");
  expect(html).toContain("Uncertain scope is not a purchasing quantity");
  expect(html).not.toContain("0 proposed");
});

it("keeps known existing and by-others reference lines outside the proposed work count", () => {
  const beams = syntheticDeckBeams();
  const existing = structuredClone(beams[0]);
  existing.scope = "Existing work to remain";
  existing.start.y = 0.8;
  existing.end.y = 0.8;
  const others = structuredClone(beams[0]);
  others.scope = "By others / excluded";
  others.start.y = 0.9;
  others.end.y = 0.9;
  const html = renderToStaticMarkup(
    <BeamAssemblySummary
      item={{
        ...base,
        id: "synthetic",
        documentId: "synthetic",
        beamAssemblies: [...beams, existing, others],
      }}
    />,
  );
  expect(html).toContain("3 proposed beam lines");
  expect(html).toContain("Reference only; excluded");
});
it("does not repeat an already completed contractor scope confirmation as missing information", () => {
  const beams = syntheticDeckBeams();
  beams.forEach((b) => (b.scope = "Requires scope confirmation"));
  const html = renderToStaticMarkup(
    <BeamAssemblySummary
      item={{
        ...base,
        id: "synthetic",
        documentId: "synthetic",
        beamAssemblies: beams,
        scopeVerified: true,
      }}
    />,
  );
  expect(html).toContain("Included by contractor");
  expect(html).not.toContain("Confirm which beam lines are included");
  expect(html).toContain("Confirm this beam&#x27;s full length");
});
it.each([
  "2x6 ledger board",
  "Ledger with aluminum flashing",
  "Aluminum flashing",
])(
  "never displays %s as a beam despite misplaced spatial metadata",
  (description) => {
    const item = {
      ...base,
      id: "ledger",
      documentId: "synthetic",
      description,
      category: "Beams",
      beamAssemblies: syntheticDeckBeams(),
    };
    expect(renderToStaticMarkup(<BeamAssemblySummary item={item} />)).toBe("");
  },
);
