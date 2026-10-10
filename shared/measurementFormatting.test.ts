import { expect, it } from "vitest";
import { formatFeet, formatQuantity } from "./measurementFormatting";
it("formats construction dimensions without recurring decimals or changing their precision", () => {
  expect(formatFeet(7.583333333333333)).toBe("7′ 7″");
  expect(formatFeet(7 + 7.5 / 12)).toBe("7′ 7 1/2″");
  expect(formatFeet(11.999999999999)).toBe("12′ 0″");
  expect(formatFeet(7.123456789)).toMatch(/^≈ /);
  expect(formatQuantity(7.583333333333333, "linear ft")).toBe("7′ 7″");
  expect(formatFeet(NaN)).toBe("Unknown");
});
