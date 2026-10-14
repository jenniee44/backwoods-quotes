import type { MaterialCalculation } from "./materialCalculators";
export const boardSpecification = (text: string) =>
  text
    .replace(/\b\d+\s*[- ]?ply\b/gi, "")
    .replace(/^[\s,–—-]+/, "")
    .trim();
/** Separate contractor-defined runs only. Never group drawing observations or infer offcut reuse. */
export function beamStockGroups(recipe: MaterialCalculation, fallback = "") {
  const groups = new Map<
    string,
    {
      specification: string;
      stock: number;
      base: number;
      quantity: number;
      waste: number;
    }
  >();
  for (let n = 1; n <= (recipe.inputs.runs ?? 0) && n <= 20; n++) {
    const specification = boardSpecification(
        recipe.specifications?.[String(n)] ?? fallback,
      ),
      stock = recipe.inputs["stock" + n]!,
      base = recipe.inputs["plies" + n]! * recipe.inputs["pieces" + n]!;
    const key = JSON.stringify([
      specification.toLowerCase().replace(/[×✕]/g, "x").replace(/\s+/g, " "),
      stock,
    ]);
    const existing = groups.get(key);
    if (existing) existing.base += base;
    else
      groups.set(key, {
        specification,
        stock,
        base,
        quantity: 0,
        waste: recipe.inputs.waste!,
      });
  }
  return [...groups.values()].map((g) => ({
    ...g,
    quantity: Math.ceil(g.base * (1 + g.waste / 100)),
  }));
}
