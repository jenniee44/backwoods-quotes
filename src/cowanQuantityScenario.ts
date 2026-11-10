/**
 * Scenario math for the Cowan Park original-plan trial.
 * The dimensioned rectangles are SCENARIOS, not verified disjoint deck polygons.
 * No scenario value is suitable for ordering materials or pricing directly.
 */
export const cowanLayout = {
  narrowRunFeet: 28 + 10 / 12,
  narrowDepthFeet: 6 + 10.25 / 12,
  wideRunFeet: 24 + 3 / 12,
  wideDepthFeet: 13,
  joistSpacingInches: 16,
  assumedDeckingFaceInches: 5.5,
  assumedDeckingWasteFraction: 0.1,
} as const;

export function joistStations(runFeet: number, spacingInches: number): number {
  if (!(runFeet > 0) || !(spacingInches > 0))
    throw new Error("Run and spacing must be positive.");
  // Counting stations at both ends is illustrative: placement/edge details unknown.
  return Math.ceil(runFeet * 12 / spacingInches) + 1;
}

export function deckingLinearFeet(areaSquareFeet: number, exposedFaceInches: number, wasteFraction: number): number {
  if (!(areaSquareFeet >= 0) || !(exposedFaceInches > 0)
      || !(wasteFraction >= 0 && wasteFraction <= 1))
    throw new Error("Invalid decking scenario assumptions.");
  return areaSquareFeet * 12 / exposedFaceInches * (1 + wasteFraction);
}

export const cowanQuantityScenario = (() => {
  const narrowArea = cowanLayout.narrowRunFeet * cowanLayout.narrowDepthFeet;
  const wideArea = cowanLayout.wideRunFeet * cowanLayout.wideDepthFeet;
  // Pure rectangular scenario; NOT an approved footprint: the drawing shows an L-shaped joint.\n  const combinedArea = narrowArea + wideArea;
  return {
    narrowStations: joistStations(cowanLayout.narrowRunFeet, cowanLayout.joistSpacingInches),
    wideStations: joistStations(cowanLayout.wideRunFeet, cowanLayout.joistSpacingInches),
    // Only a trial layout where narrow stations use one member and wide stations use two spans.
    // Does NOT include double joists, rim, cuts, or allowance for shared junctions.
    conditionalJoistPieces: joistStations(cowanLayout.narrowRunFeet, cowanLayout.joistSpacingInches) + 2 * joistStations(cowanLayout.wideRunFeet, cowanLayout.joistSpacingInches),
    narrowArea,
    wideArea,
    combinedArea,
    deckingLinearFeet: deckingLinearFeet(combinedArea, cowanLayout.assumedDeckingFaceInches, cowanLayout.assumedDeckingWasteFraction),
  };
})();
