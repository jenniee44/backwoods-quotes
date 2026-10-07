import { it, expect } from "vitest";
import { validateAnalysis, validateDocuments } from "./analysis";
import { analysisFixture } from "./analysis.fixture";
const plan = {
  id: "plan",
  name: "plan.pdf",
  type: "application/pdf",
  data: "data:application/pdf;base64," + btoa("%PDF-1.7\nfixture\n%%EOF"),
};
it("validates source facts and preserves missing quantities as uncertain null", () => {
  const result = validateAnalysis(analysisFixture(), ["plan"]);
  expect(result.suggestions[0].quantity).toBeNull();
  expect(result.suggestions[0].classification).toBe(
    "Contractor input required",
  );
  expect(result.suggestions[0].confidence).toBe("Low");
});
for (const change of [
  { quantity: -1 },
  { quantity: Infinity },
  { page: 0 },
  { documentId: "unknown" },
  { confidence: "Absolutely certain" },
  { destination: "Set prices" },
  { cost: 123 },
  { status: "Approved" },
  { unit: 123 },
  { warnings: "none" },
])
  it(`rejects malformed/unauthorized fields ${JSON.stringify(change)}`, () => {
    const data = analysisFixture();
    Object.assign(data.suggestions[0], change);
    expect(() => validateAnalysis(data, ["plan"])).toThrow();
  });
it("validates the full project and dimension schema", () => {
  const data = analysisFixture();
  delete data.project;
  expect(() => validateAnalysis(data, ["plan"])).toThrow();
});
it("rejects unstructured and excessively large responses", () => {
  expect(() => validateAnalysis("paragraph", ["plan"])).toThrow();
  const data = analysisFixture();
  data.suggestions = Array(151).fill(data.suggestions[0]);
  expect(() => validateAnalysis(data, ["plan"])).toThrow();
});
it("validates file signatures, sizes, counts and unique sources", () => {
  expect(validateDocuments([plan])).toHaveLength(1);
  for (const docs of [
    [],
    [plan, plan],
    [{ ...plan, type: "text/html" }],
    [{ ...plan, data: "data:application/pdf;base64," + btoa("bad PDF") }],
    [{ ...plan, data: "data:application/pdf;base64," + "A".repeat(2700001) }],
  ])
    expect(() => validateDocuments(docs)).toThrow();
});
