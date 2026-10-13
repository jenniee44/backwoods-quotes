import { it, expect } from "vitest";
import { analysisFixture } from "../shared/analysis.fixture";
import type { AnalysisDocument } from "../shared/analysis";
import { derivePurchaseQuantities } from "./drawingPurchaseQuantities";
function run(
  description: string,
  fact: string,
  unit = "each",
  quantity: number | null = null,
) {
  const r = analysisFixture();
  r.suggestions = [
    {
      ...r.suggestions[1],
      description,
      specification: description.includes("Beam")
        ? "3 ply 2x10 PT"
        : description.includes("hanger")
          ? "Simpson LUS26"
          : description.includes("screws")
            ? "SDWS screws"
            : "2x6 PT",
      location: "Deck A",
      notes: "New work",
      quantity,
      unit,
      sourceFacts: [fact],
    },
  ];
  const docs: AnalysisDocument[] = [
    {
      id: "plan",
      name: "synthetic.pdf",
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
            text: fact,
          },
        ],
      },
    },
  ];
  return derivePurchaseQuantities(r, docs).suggestions[0];
}
it("continuous beam purchase pieces need explicit count, plies, length, adequate stock and unspliced assembly", () => {
  const f =
    "New work Deck A 3 ply 2x10 PT beam count: 3; plies: 3; beam length: 12 ft; stock length: 16 ft; continuous unspliced";
  expect(run("Beam B-1", f, "runs", 3)).toMatchObject({
    quantity: 9,
    unit: "boards",
    quantityMethod: "Calculated",
  });
  for (const bad of [
    f.replace("stock length: 16 ft", "stock length: 8 ft"),
    f.replace("continuous unspliced", "splice unspecified"),
    f.replace("plies: 3", "plies unknown"),
  ])
    expect(run("Beam B-1", bad).quantity).toBeNull();
});
it("joists require uniform defined layout, ends, no openings and continuous suitable stock", () => {
  const f =
    "New work Deck A 2x6 PT layout length: 16 ft; spacing inches: 16; joist length: 12 ft; stock length: 12 ft; uniform layout; both ends included; no openings";
  expect(run("Deck joists", f)).toMatchObject({ quantity: 13, unit: "boards" });
  for (const bad of [
    f.replace("both ends included", "ends unknown"),
    f.replace("no openings", "stair opening"),
  ])
    expect(run("Deck joists", bad).quantity).toBeNull();
  expect(
    run("Deck joists", f.replace("stock length: 12 ft", "stock length: 8 ft")),
  ).toMatchObject({ quantity: 13, unit: "joist locations" });
});
it("hangers and fasteners use explicit connection counts, never infer from joist counts", () => {
  expect(
    run(
      "LUS26 joist hangers",
      "New work Deck A Simpson LUS26 connection count: 13; hangers per connection: 1; same connection type",
    ).quantity,
  ).toBe(13);
  expect(
    run(
      "Ledger screws",
      "New work Deck A SDWS screws connection count: 8; fasteners per connection: 3; uniform connections",
    ).quantity,
  ).toBe(24);
  expect(
    run("LUS26 joist hangers", "New work Deck A joist count: 13").quantity,
  ).toBeNull();
});
it("conflicting and missing inputs are never substituted", () => {
  expect(
    run(
      "Beam",
      "New work Deck A 3 ply 2x10 PT beam count: 3; beam count: 4; plies: 3; beam length: 12 ft; stock length: 16 ft; continuous unspliced",
    ).quantity,
  ).toBeNull();
});
it("negated layouts and exception notes do not establish purchase quantities", () => {
  const f =
    "New work Deck A 2x6 PT layout length: 16 ft; spacing inches: 16; joist length: 12 ft; stock length: 12 ft; uniform layout; both ends included; no openings";
  for (const bad of [
    f.replace("uniform layout", "not uniform layout"),
    f + " except stair opening",
  ])
    expect(run("Deck joists", bad).quantity).toBeNull();
});
it("AI run counts and ply specifications must agree with the explicit written inputs", () => {
  const f =
    "New work Deck A 3 ply 2x10 PT beam count: 3; plies: 3; beam length: 12 ft; stock length: 16 ft; continuous unspliced";
  expect(run("Beam", f, "runs", 4)).toMatchObject({
    quantity: null,
    unit: "runs",
    classification: "Contractor input required",
  });
  expect(run("Beam", f, "runs", 4).sourceFacts?.join()).toContain(
    "AI proposed 4 runs",
  );
  expect(run("Beam", f.replace("plies: 3", "plies: 4")).quantity).toBeNull();
});
it("joist layout counts can be shown without inventing purchase stock", () => {
  const t = run(
    "Deck joists",
    "New work Deck A 2x6 PT layout length: 16 ft; spacing inches: 16; uniform layout; both ends included; no openings",
  );
  expect(t).toMatchObject({ quantity: 13, unit: "joist locations" });
  expect(t.calculationBasis).toContain("before purchasing");
});
it("fractional/decimal inches are preserved when deciding whether stock covers a beam", () => {
  const f =
    "New work Deck A 3 ply 2x10 PT beam count: 3; plies: 3; beam length: 12 ft 7.5 in; stock length: 12 ft 7.4 in; continuous unspliced";
  expect(run("Beam", f).quantity).toBeNull();
  expect(
    run(
      "Beam",
      f.replace("stock length: 12 ft 7.4 in", "stock length: 12 ft 7.5 in"),
    ).quantity,
  ).toBe(9);
});
it("combined assembly inputs can use explicitly referenced original PDF pages, never unrelated pages", () => {
  const first =
    "New work Deck A 3 ply 2x10 PT beam count: 3; plies: 3; beam length: 12 ft; continuous unspliced";
  const stock = "New work Deck A stock length: 16 ft";
  const r = analysisFixture();
  r.suggestions = [
    {
      ...r.suggestions[1],
      description: "Beam B-1",
      specification: "3 ply 2x10 PT",
      quantity: null,
      unit: "runs",
      location: "Deck A",
      notes: "New work",
      sourceFacts: [
        first,
        stock,
        "Source: plan, page 2, detail original; same assembly",
      ],
    },
  ];
  const docs: AnalysisDocument[] = [
    {
      id: "plan",
      name: "synthetic.pdf",
      type: "application/pdf",
      data: "",
      pdfText: {
        pageCount: 2,
        truncated: false,
        pages: [
          {
            page: 1,
            width: 2592,
            height: 1728,
            status: "Available",
            text: first,
          },
          {
            page: 2,
            width: 2592,
            height: 1728,
            status: "Available",
            text: stock,
          },
        ],
      },
    },
  ];
  expect(derivePurchaseQuantities(r, docs).suggestions[0]).toMatchObject({
    quantity: 9,
    unit: "boards",
  });
  expect(
    derivePurchaseQuantities(r, docs).suggestions[0].calculationBasis,
  ).toContain("page(s): 1, 2");
  r.suggestions[0].sourceFacts = [first, stock];
  expect(derivePurchaseQuantities(r, docs).suggestions[0].quantity).toBeNull();
});
it("explicit quarter fractions retain precision and partially parsed dimensions stay unknown", () => {
  const f =
    "New work Deck A 3 ply 2x10 PT beam count: 3; plies: 3; beam length: 12 ft 7½ in; stock length: 12 ft 7½ in; continuous unspliced";
  expect(run("Beam", f).quantity).toBe(9);
  expect(
    run("Beam", f.replace("stock length: 12 ft 7½ in", "stock length: 12 ft"))
      .quantity,
  ).toBeNull();
  expect(
    run(
      "Beam",
      f.replace(
        "beam length: 12 ft 7½ in",
        "beam length: 12 ft plus unread digit",
      ),
    ).quantity,
  ).toBeNull();
});
