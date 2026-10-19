import { expect, it } from "vitest";
import { drawingAnnotation } from "./drawingAnnotations";
it("generic title-block words never establish construction evidence or image anchors", () => {
  for (const text of [
    "FOUNDATION & DECK FRAMING PLAN",
    "STRUCTURAL FRAMING PLAN",
    "POSTAL CODE",
    "PROJECT NAME: DECK RENOVATION",
    "GENERAL NOTES",
    "STRUCTURAL NOTES",
    "SPECIFICATION",
    "MATERIAL SCHEDULE",
    "ACME CONSTRUCTION LTD",
  ]) {
    expect(drawingAnnotation(text).anchor, text).toBe(false);
    expect(drawingAnnotation(text).weight, text).toBe(0);
  }
});
it("specific materials, written dimensions, spacing and connections remain useful regardless of sheet position", () => {
  for (const text of [
    "3PLY 2X10 PT",
    "BEAM B1",
    "JOISTS 2X6 PT AT 16 IN O/C",
    "FOOTING 12 IN DIAMETER",
    "STAIR RISER 7 IN",
    "LUS26 HANGERS",
    "ALL FASTENERS HOT DIP GALVANIZED",
    "24'-3\" OVERALL",
  ]) {
    expect(drawingAnnotation(text).anchor, text).toBe(true);
  }
});
