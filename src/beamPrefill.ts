import type { TakeoffItem } from "./model";
import type { MaterialCalculation } from "../shared/materialCalculators";
import { drawingMeasurements } from "../shared/constructionMeasurements";
import { hasReadableSpecification } from "./takeoffRequirements";
import { workScope, includedScope } from "./takeoffScope";
import { requiresScopeVerification } from "../shared/takeoff";
export function beamLengthSuggestions(item: TakeoffItem) {
  const found = new Map<
    string,
    ReturnType<typeof drawingMeasurements>[number] & {
      label: string;
      references: string[];
    }
  >();
  if (
    item.confidence !== "High" ||
    item.warnings?.some((w) => /conflict|unreadable|uncertain/i.test(w))
  )
    return [];
  for (const fact of item.sourceFacts ?? []) {
    const label = fact.match(
      /\b(?:beam\s*(?:run\s*)?([A-Za-z]?\d+)|B-?(\d+))\b/i,
    )?.[0];
    if (!label || !/\bbeam\b/i.test(fact) || !/\blength\b/i.test(fact))
      continue;
    const labelsInFact = new Set(
      [
        ...fact.matchAll(/\b(?:beam\s*(?:run\s*)?([A-Za-z]?\d+)|B-?(\d+))\b/gi),
      ].map((m) => labelKey(m[0])),
    );
    if (labelsInFact.size !== 1) continue;
    const measures = drawingMeasurements({ ...item, sourceFacts: [fact] });
    if (measures.length !== 1) continue;
    const m = measures[0],
      key = labelKey(label) + ":" + m.inches,
      ref = `${item.sourceDocumentName || item.documentId} · page ${item.page ?? "to confirm"}`;
    const prior = found.get(key);
    if (prior) prior.references.push(ref);
    else found.set(key, { ...m, label, references: [ref] });
  }
  const values = [...found.values()];
  return values.filter(
    (m) =>
      new Set(
        values
          .filter((peer) => labelKey(peer.label) === labelKey(m.label))
          .map((peer) => peer.inches),
      ).size === 1,
  );
}
const labelKey = (s: string) =>
  s
    .toUpperCase()
    .replace(/^BEAM\s*(?:RUN\s*)?/, "")
    .replace(/[\s-]+/g, "");
export function proposedBeamRecipe(
  item: TakeoffItem,
): MaterialCalculation | null {
  if (
    item.origin !== "ai" ||
    item.destination !== "Materials" ||
    !(/beam/i.test(item.description) || item.category === "Beams") ||
    item.confidence !== "High" ||
    item.classification === "Estimating suggestion" ||
    !hasReadableSpecification(item) ||
    !includedScope(item) ||
    workScope(item) === "Existing work to remain" ||
    (requiresScopeVerification(item) && !item.scopeVerified) ||
    item.assumptions?.length ||
    item.warnings?.some((w) =>
      /conflict|uncertain|unreadable|alternative/i.test(w),
    )
  )
    return null;
  const labels = new Map<string, string>();
  for (const fact of item.sourceFacts ?? []) {
    if (
      !/\bbeam\b/i.test(fact) ||
      /existing|by others|excluded|alternative/i.test(fact)
    )
      continue;
    for (const m of fact.matchAll(
      /\b(?:beam\s*(?:run\s*)?([A-Za-z]?\d+)|B-?(\d+))\b/gi,
    )) {
      const key = labelKey(m[0]);
      labels.set(key, m[0]);
    }
  }
  if (!labels.size || labels.size > 20) return null;
  const suggestions = beamLengthSuggestions(item),
    plies =
      Number(item.specification!.match(/\b(\d+)\s*[- ]?ply\b/i)?.[1]) || null;
  const recipe: MaterialCalculation = {
    kind: "beam-runs",
    verified: false,
    inputs: { runs: labels.size },
    specifications: {},
    lengthSources: {},
    specificationSources: {},
    runLabels: {},
    arrangements: {},
  };
  let n = 0;
  for (const [key, label] of labels) {
    n++;
    recipe.runLabels![String(n)] = label;
    recipe.specifications![String(n)] = item.specification!;
    recipe.specificationSources![String(n)] =
      `${item.specification} · ${item.sourceDocumentName || item.documentId} · page ${item.page ?? "to confirm"}`.slice(
        0,
        2000,
      );
    if (plies) recipe.inputs["plies" + n] = plies;
    const m = suggestions.find((m) => labelKey(m.label) === key);
    if (m) {
      recipe.inputs["length" + n] = m.inches / 12;
      recipe.lengthSources![String(n)] =
        `${m.label}: ${m.written} · ${m.references.join("; ")}`.slice(0, 2000);
    }
    const arrangement = (item.sourceFacts ?? []).find(
      (f) =>
        /continuous|unspliced/i.test(f) &&
        /\b(?:boards?|plies|lumber)\b/i.test(f) &&
        !/\bnot\b|joist|decking|ledger|railing|\bsplices?\b/i.test(f) &&
        f.toUpperCase().includes(label.toUpperCase()) &&
        !/uncertain|assum|unreadable|existing|by others/i.test(f),
    );
    if (arrangement) {
      recipe.inputs["pieces" + n] = 1;
      recipe.arrangements![String(n)] = arrangement.slice(0, 2000);
    }
  }
  return recipe;
}
export function suggestedStock(recipe: MaterialCalculation, n: number) {
  const length = recipe.inputs["length" + n];
  if (length == null) return null;
  return (
    [...(recipe.availableStock ?? [])]
      .sort((a, b) => a - b)
      .find((size) => size >= length) ?? null
  );
}
export function beamNextStep(recipe: MaterialCalculation, n: number) {
  if (recipe.inputs["length" + n] == null)
    return `Beam ${n}: The lumber specification is available, but the beam length could not be confirmed. Enter the length to continue.`;
  if (!recipe.inputs["plies" + n])
    return `Beam ${n}: Confirm the number of plies.`;
  if (!recipe.specifications?.[String(n)]?.trim())
    return `Beam ${n}: Confirm the lumber specification.`;
  if (!recipe.inputs["stock" + n])
    return `Beam ${n}: Select an available stock length; a suggestion is not a cutting plan.`;
  if (!recipe.inputs["pieces" + n] || !recipe.arrangements?.[String(n)]?.trim())
    return `Beam ${n}: Confirm the boards per ply and cutting arrangement in Advanced Details.`;
  if (
    recipe.inputs["pieces" + n]! * recipe.inputs["stock" + n]! <
    recipe.inputs["length" + n]!
  )
    return `Beam ${n}: The selected cutting arrangement does not cover the beam length.`;
  if (recipe.inputs["layout" + n] !== 1)
    return `Beam ${n}: Verify the cutting arrangement and supports in Advanced Details.`;
  return recipe.verified
    ? "Contractor-confirmed inputs; approval is still required."
    : "Proposed inputs — verify before approval.";
}
