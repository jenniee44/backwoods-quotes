import { describe, expect, it } from "vitest";
import { dimensionValueProblem, type DrawingDimension } from "./drawingDimensions";

function dimension(written: string, value: number): DrawingDimension {
  return {
    written, value, unit: "ft", role: "Support spacing", field: "spacing",
    assemblyRef: "A1", beamLabel: "", association: "Explicit", readable: true,
    evidence: "Written support spacing on the drawing", orientation: 270,
    region: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
    start: null, end: null,
  };
}

describe("drawing dimension tolerance notation", () => {
  it("accepts matching feet-and-inches values followed by ±", () => {
    expect(dimensionValueProblem(dimension("7'-7\"±", 7 + 7 / 12))).toBe("");
    expect(dimensionValueProblem(dimension("6'-6\" ±", 6.5))).toBe("");
    expect(dimensionValueProblem(dimension("6'-10 1/4\"±", 6 + 10.25 / 12))).toBe("");
  });
  it("still rejects mismatched numerical measurements", () => {
    expect(dimensionValueProblem(dimension("7'-7\"±", 8))).not.toBe("");
  });
});
