/** Numeric serialization allowance only, never a construction tolerance. */
export function measurementRounding(value: number, inchesPerUnit: number) {
  const decimals = String(value).split(".")[1]?.length ?? 0;
  return decimals
    ? Math.max(
        1e-5,
        Math.min(1 / 64, 0.5 * 10 ** -decimals * inchesPerUnit) + 1e-9,
      )
    : 1e-5;
}
