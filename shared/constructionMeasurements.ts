// Transcribed drawing facts only. Never measure pixels, infer labels or verify AI output.
export type DrawingMeasurement = {
  written: string;
  inches: number;
  fact: string;
  documentId: string;
  page: number | null;
  detail: number | null;
  confidence: string;
};
const number = (s: string) => {
  const parts = s.trim().split(/[ -]+/);
  return parts.reduce((sum, part) => {
    if (!part.includes("/")) return sum + Number(part);
    const [a, b] = part.split("/").map(Number);
    return sum + (b > 0 ? a / b : NaN);
  }, 0);
};
export function drawingMeasurements(source: {
  sourceFacts?: string[];
  documentId: string;
  page: number | null;
  sourceDetailView?: number | null;
  confidence: string;
}): DrawingMeasurement[] {
  const result: DrawingMeasurement[] = [];
  // Explicit units are mandatory; bare 2x10 member sizes and scale ratios aren't dimensions.
  const numeric = String.raw`\d+(?:\.\d+|(?:[ -]\d+)?\/\d+)?`;
  const pattern = new RegExp(
    String.raw`(?<![\d.\/])(${numeric})\s*(ft\b|feet\b|['′])(?:\s*-?\s*(${numeric})\s*(?:in\b|inches\b|["″]))?|(?<![\d.\/])(${numeric})\s*(in\b|inches\b|["″]|mm\b|cm\b|m\b)`,
    "gi",
  );
  for (const fact of source.sourceFacts ?? []) {
    if (
      /unreadable|illegible|uncertain|approx(?:imate)?|not legible|conflict/i.test(
        fact,
      )
    )
      continue;
    for (const match of fact.matchAll(pattern)) {
      const inches = match[1]
        ? number(match[1]) * 12 + (match[3] ? number(match[3]) : 0)
        : number(match[4]) *
          ({ mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54 }[
            match[5].toLowerCase()
          ] ?? 1);
      if (!(inches > 0 && Number.isFinite(inches))) continue;
      result.push({
        written: match[0],
        inches,
        fact,
        documentId: source.documentId,
        page: source.page,
        detail: source.sourceDetailView ?? null,
        confidence: source.confidence,
      });
    }
  }
  return result;
}
