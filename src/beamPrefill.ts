import { isBeamMaterial } from "./beamMaterial";
import { spatialBeamRecipe } from "./spatialBeamPrefill";
import type { TakeoffItem } from "./model";
import type { MaterialCalculation } from "../shared/materialCalculators";
import { drawingMeasurements } from "../shared/constructionMeasurements";
import { hasReadableSpecification } from "./takeoffRequirements";
import { workScope, includedScope } from "./takeoffScope";
import { requiresScopeVerification } from "../shared/takeoff";
const beamFactRecords = (item: TakeoffItem) => [
  ...(item.sourceFacts ?? []).map((fact) => ({ fact, page: item.page })),
  ...(item.materialInputs ?? [])
    .filter((f) => f.readable && f.page !== null)
    .map((f) => ({ fact: f.evidence, page: f.page })),
];
const beamSourceFacts = (item: TakeoffItem) =>
  beamFactRecords(item).map((f) => f.fact);
export function beamLengthSuggestions(item: TakeoffItem) {
  const found = new Map<
    string,
    ReturnType<typeof drawingMeasurements>[number] & {
      label: string;
      references: string[];
    }
  >();
  if (
    !(
      item.confidence === "High" ||
      item.confidence === "Medium" ||
      (item.confidence === "Low" &&
        item.classification === "Contractor input required" &&
        (item.quantity === null || /^(?:beam )?runs?$/i.test(item.unit)))
    ) ||
    item.warnings?.some((w) => /conflict|unreadable|uncertain/i.test(w))
  )
    return [];
  for (const { fact, page } of beamFactRecords(item)) {
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
    const measures = drawingMeasurements({
      ...item,
      page,
      sourceFacts: [fact],
    });
    if (measures.length !== 1) continue;
    const m = measures[0],
      key = labelKey(label) + ":" + m.inches,
      ref = `${item.sourceDocumentName || item.documentId} · page ${page ?? "to confirm"}`;
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
    !isBeamMaterial(item) ||
    item.confidence === "Unspecified" ||
    (item.confidence === "Low" &&
      item.classification !== "Contractor input required" &&
      supportedBeamRunCount(item) === null) ||
    item.classification === "Estimating suggestion" ||
    !hasReadableSpecification(item) ||
    !includedScope(item) ||
    workScope(item) === "Existing work to remain" ||
    (requiresScopeVerification(item) && !item.scopeVerified) ||
    item.warnings?.some((w) =>
      /conflicting (?:beam )?counts|alternative (?:beam|assembly)|unreadable specification/i.test(
        w,
      ),
    )
  )
    return null;
  if (item.beamAssemblies?.length) return spatialBeamRecipe(item);
  const labels = new Map<string, string>();
  for (const fact of beamSourceFacts(item)) {
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
  const proposedCount = supportedBeamRunCount(item);
  if (labels.size > 20) return null;
  const count =
    labels.size && proposedCount !== null && proposedCount !== labels.size
      ? null
      : labels.size || proposedCount;
  if (!count) return null;
  const suggestions = beamLengthSuggestions(item),
    plies =
      Number(item.specification!.match(/\b(\d+)\s*[- ]?ply\b/i)?.[1]) || null;
  const recipe: MaterialCalculation = {
    kind: "beam-runs",
    verified: false,
    inputs: { runs: count },
    runCountSource: `${labels.size ? "Distinct drawing labels" : "AI-proposed distinct beam run count"}: ${count}; ${item.sourceDocumentName || item.documentId}, page ${item.page ?? "to confirm"}. Verify physical layout; never add repeated views.`,
    specifications: {},
    lengthSources: {},
    specificationSources: {},
    runLabels: {},
    arrangements: {},
  };
  let n = 0;
  const runs = labels.size
    ? [...labels]
    : Array.from({ length: count }, () => ["", ""]);
  for (const [key, label] of runs) {
    n++;
    if (label) recipe.runLabels![String(n)] = label;
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
    const arrangement = beamSourceFacts(item).find(
      (f) =>
        /continuous|unspliced/i.test(f) &&
        /\b(?:boards?|plies|lumber)\b/i.test(f) &&
        !/\bnot\b|joist|decking|ledger|railing|\bsplices?\b/i.test(f) &&
        !!label &&
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
export function supportedBeamRunCount(item: TakeoffItem): number | null {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const counts = new Set<number>();
  for (const fact of beamSourceFacts(item)) {
    if (
      /conflict|uncertain|possibly|may be|by others|existing|excluded/i.test(
        fact,
      )
    )
      continue;
    for (const m of fact.matchAll(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:distinct|separate|physical)\s+)?beam\s*(?:runs?|lines?)\b|\bbeam\s*(?:runs?|lines?)\s*(?:count|:|=)?\s*(\d+)\b/gi,
    )) {
      counts.add(Number(m[1] ?? m[2]) || words[(m[1] ?? "").toLowerCase()]);
    }
  }
  if (
    item.quantity !== null &&
    /^(?:beam )?runs?$/i.test(item.unit) &&
    beamSourceFacts(item).some((f) => /beam/i.test(f))
  )
    counts.add(item.quantity);
  const archived = item.notes.match(
    /Original proposed observation:\s*(\d+)\s+(?:beam )?runs?\b/i,
  );
  if (archived) counts.add(Number(archived[1]));
  const valid = [...counts].filter(
    (n) => Number.isInteger(n) && n > 0 && n <= 20,
  );
  return valid.length === 1 ? valid[0] : null;
}
/** Fill only never-entered values. Explicit nulls and contractor values stay intact. */
export function enrichBeamRecipe(
  item: TakeoffItem,
  recipe: MaterialCalculation,
): MaterialCalculation {
  if (
    recipe.kind !== "beam-runs" ||
    recipe.verified ||
    !hasReadableSpecification(item)
  )
    return recipe;
  const proposed = proposedBeamRecipe(item),
    inputs = { ...recipe.inputs };
  if (item.beamAssemblies?.length) {
    if (inputs.runs === undefined && proposed?.inputs.runs != null)
      inputs.runs = proposed.inputs.runs;
    if (!proposed || inputs.runs !== proposed.inputs.runs)
      return { ...recipe, inputs };
    const specifications = { ...recipe.specifications },
      specificationSources = { ...recipe.specificationSources },
      lengthSources = { ...recipe.lengthSources },
      runLabels = { ...recipe.runLabels };
    for (let n = 1; n <= (inputs.runs ?? 0); n++) {
      const key = String(n),
        label = runLabels[key];
      const sourceKey = label
        ? Object.keys(proposed.runLabels ?? {}).find(
            (k) => labelKey(proposed.runLabels![k]) === labelKey(label),
          )
        : key;
      // Existing labelled runs must match their own spatial assembly, never merely an array index.
      if (!sourceKey) continue;
      for (const field of ["length", "plies"]) {
        if (
          inputs[field + n] === undefined &&
          proposed.inputs[field + sourceKey] != null
        )
          inputs[field + n] = proposed.inputs[field + sourceKey];
      }
      if (specifications[key] === undefined)
        specifications[key] = proposed.specifications![sourceKey];
      if (specificationSources[key] === undefined)
        specificationSources[key] = proposed.specificationSources![sourceKey];
      if (
        lengthSources[key] === undefined &&
        proposed.lengthSources?.[sourceKey]
      )
        lengthSources[key] = proposed.lengthSources[sourceKey];
      if (runLabels[key] === undefined)
        runLabels[key] = proposed.runLabels![sourceKey];
    }
    return {
      ...recipe,
      inputs,
      specifications,
      specificationSources,
      lengthSources,
      runLabels,
      runCountSource: recipe.runCountSource ?? proposed.runCountSource,
    };
  }
  if (inputs.runs === undefined && proposed?.inputs.runs != null)
    inputs.runs = proposed.inputs.runs;
  const plies =
    Number(item.specification?.match(/\b(\d+)\s*[- ]?ply\b/i)?.[1]) || null;
  const specifications = { ...recipe.specifications },
    specificationSources = { ...recipe.specificationSources },
    lengthSources = { ...recipe.lengthSources },
    runLabels = { ...recipe.runLabels };
  for (
    let n = 1;
    n <= Math.min(20, Math.max(0, Math.floor(inputs.runs ?? 0)));
    n++
  ) {
    if (inputs["plies" + n] === undefined && plies) inputs["plies" + n] = plies;
    if (specifications[String(n)] === undefined)
      specifications[String(n)] = item.specification!;
    if (specificationSources[String(n)] === undefined)
      specificationSources[String(n)] =
        `Saved specification: ${item.specification}; verify applicability against ${item.sourceDocumentName || item.documentId}, page ${item.page ?? "to confirm"}`;
    if (proposed?.inputs.runs === inputs.runs) {
      if (runLabels[String(n)] === undefined && proposed.runLabels?.[String(n)])
        runLabels[String(n)] = proposed.runLabels[String(n)];
      if (
        inputs["length" + n] === undefined &&
        proposed.inputs["length" + n] != null
      ) {
        inputs["length" + n] = proposed.inputs["length" + n];
        lengthSources[String(n)] = proposed.lengthSources![String(n)];
      }
    }
  }
  return {
    ...recipe,
    inputs,
    specifications,
    specificationSources,
    lengthSources,
    runLabels,
    runCountSource: recipe.runCountSource ?? proposed?.runCountSource,
    verified: false,
  };
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
