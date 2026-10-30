import type { PlanAnalysisResult } from "./analysis";
import {
  drawingDimensionsSchema,
  validDrawingDimensions,
  type DrawingDimension,
} from "./drawingDimensions";
export type DimensionInventoryEntry = DrawingDimension & {
  documentId: string;
  page: number;
};
// Dedicated records avoid repeating a full material/price-destination schema for
// every dimension. No new AI call, altered input document or guessed association.
export const dimensionInventorySchema = {
  type: "array",
  maxItems: 150,
  description:
    "Primary compact written-dimension inventory across all physical pages. Preserve readable unassociated dimensions; no prices, approvals, pixel measurements or customer identifiers.",
  items: {
    ...drawingDimensionsSchema.items,
    properties: {
      ...drawingDimensionsSchema.items.properties,
      documentId: { type: "string", maxLength: 100 },
      page: { type: "integer", minimum: 1, maximum: 50 },
    },
    required: [...drawingDimensionsSchema.items.required, "documentId", "page"],
  },
};
export function validDimensionInventory(
  value: unknown,
  documentIds: string[],
): value is DimensionInventoryEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= 150 &&
    value.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return false;
      const { documentId, page, ...dimension } = item;
      return (
        typeof documentId === "string" &&
        documentIds.includes(documentId) &&
        Number.isInteger(page) &&
        page >= 1 &&
        page <= 50 &&
        validDrawingDimensions([dimension])
      );
    })
  );
}
/** Expand only into existing private evidence records, never material candidates. */
export function materializeDimensionInventory(result: PlanAnalysisResult) {
  const entries = result.dimensionInventory;
  if (!entries?.length) {
    delete result.dimensionInventory;
    return;
  }
  const groups = new Map<
    string,
    { documentId: string; page: number; dimensions: DrawingDimension[] }
  >();
  for (const { documentId, page, ...dimension } of entries) {
    const key = JSON.stringify([documentId, page]);
    const group = groups.get(key) ?? { documentId, page, dimensions: [] };
    if (
      !group.dimensions.some(
        (d) => JSON.stringify(d) === JSON.stringify(dimension),
      )
    )
      group.dimensions.push(dimension);
    groups.set(key, group);
  }
  result.dimensions ??= [];
  for (const group of groups.values())
    for (let offset = 0; offset < group.dimensions.length; offset += 40) {
      if (result.dimensions.length >= 100)
        throw new Error(
          "Dimension inventory exceeds the safe evidence record limit; original results were not replaced.",
        );
      result.dimensions.push({
        documentId: group.documentId,
        page: group.page,
        description: "Written dimension inventory",
        destination: "Informational",
        itemRole: "Document observation",
        quantity: null,
        unit: "",
        notes:
          "Transcribed dimensions; associations proposed, no contract inclusion or purchasing decisions inferred.",
        confidence: "Medium",
        classification: "Plan fact",
        category: "Miscellaneous",
        assumptions: [],
        warnings: [],
        drawingDimensions: group.dimensions.slice(offset, offset + 40),
      });
    }
  delete result.dimensionInventory;
}
