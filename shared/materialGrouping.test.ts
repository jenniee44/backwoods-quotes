import { expect, it } from "vitest";
import { materialSpecificationKey } from "./materialGrouping";
it("groups conservative lumber and spacing notation aliases without mixing ply counts or sizes", () => {
  expect(
    materialSpecificationKey('2x6 PT deck joists @ 16" O.C.', "Joists"),
  ).toBe(materialSpecificationKey("2×6 P.T. at 16 inches on center", "Joists"));
  expect(
    materialSpecificationKey("3-ply 2x10 pressure-treated beam", "Beams"),
  ).toBe(materialSpecificationKey("3PLY 2X10 PT", "Beams"));
  expect(materialSpecificationKey("2-ply 2x10 PT", "Beams")).not.toBe(
    materialSpecificationKey("3PLY 2X10 PT", "Beams"),
  );
});
