import { describe, expect, it } from "vitest";
import { cowanLayout, cowanQuantityScenario, deckingLinearFeet, joistStations } from "./cowanQuantityScenario";
describe("Cowan trial only: conditional quantity math, not procurement", () => {
  it("counts scenario stations from explicit run lengths and spacing", () => {
    expect(joistStations(28 + 10 / 12, 16)).toBe(23);
    expect(joistStations(24 + 3 / 12, 16)).toBe(20);
    expect(() => joistStations(0, 16)).toThrow();
  });
  it("computes rectangle scenarios, never claiming verified full footprint", () => {
    expect(cowanQuantityScenario.narrowArea).toBeCloseTo(230.6666667);
    expect(cowanQuantityScenario.wideArea).toBe(315.25);
    expect(cowanQuantityScenario.combinedArea).toBeCloseTo(545.9166667);
    expect(cowanQuantityScenario.deckingLinearFeet).toBeCloseTo(
      cowanQuantityScenario.combinedArea * 12 / cowanLayout.assumedDeckingFaceInches * 1.1
    );
    expect(deckingLinearFeet(0, 5.5, 0.1)).toBe(0);
    expect(() => deckingLinearFeet(100, 0, 0.1)).toThrow();
  });
});
