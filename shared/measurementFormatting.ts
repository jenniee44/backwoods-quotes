const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
// Display rounding only. Calculations retain full precision and original transcriptions.
export function formatFeet(feet: number) {
  if (!Number.isFinite(feet)) return "Unknown";
  const units = Math.round(Math.abs(feet) * 12 * 64);
  const wholeFeet = Math.floor(units / 768),
    inchUnits = units % 768;
  const inches = Math.floor(inchUnits / 64),
    numerator = inchUnits % 64;
  const divisor = numerator ? gcd(numerator, 64) : 1;
  const fraction = numerator ? ` ${numerator / divisor}/${64 / divisor}` : "";
  const approximate = Math.abs(units / 64 - Math.abs(feet) * 12) > 1e-6;
  return `${approximate ? "≈ " : ""}${feet < 0 ? "−" : ""}${wholeFeet}′ ${inches}${fraction}″`;
}
export function formatQuantity(quantity: number, unit: string) {
  return /^(?:ft|feet|linear ft|linear feet)$/i.test(unit.trim())
    ? formatFeet(quantity)
    : `${Number(quantity.toPrecision(8))} ${unit}`;
}
