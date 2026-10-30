import type { TakeoffItem } from "./model";
import { materialCategoryFor } from "../shared/takeoff";
import { materialSpecificationKey } from "../shared/materialGrouping";
import {
  materialInputIdentity,
  mergeMaterialInputs,
  materialInputProblem,
} from "../shared/materialInputs";
import type { MaterialCalculation } from "../shared/materialCalculators";
import { workScope } from "./takeoffScope";
// Partial cross-view evidence may complement the same explicit physical ID.
// Only generated inputs with provenance may merge; explicit blanks/manual edits
// and different calculator methods remain separate, even when product names match.
function complementaryRecipe(
  a?: MaterialCalculation,
  b?: MaterialCalculation,
): MaterialCalculation | undefined | false {
  const generated = (r?: MaterialCalculation) =>
    !r ||
    (!r.verified &&
      Object.entries(r.inputs).every(
        ([key, value]) => value !== null && !!r.inputSources?.[key],
      ) &&
      !r.arrangements &&
      !r.availableStock);
  if (!generated(a) || !generated(b) || (a && b && a.kind !== b.kind))
    return false;
  if (!a) return b;
  if (!b) return a;
  if (
    Object.keys(a.inputs).some(
      (key) => Object.hasOwn(b.inputs, key) && a.inputs[key] !== b.inputs[key],
    )
  )
    return false;
  return {
    ...a,
    inputs: { ...b.inputs, ...a.inputs },
    inputSources: { ...b.inputSources, ...a.inputSources },
    geometryConfirmed:
      a.geometryConfirmed === false || b.geometryConfirmed === false
        ? false
        : a.geometryConfirmed,
  };
}
/** Explicit physical ID only; equal names/products alone never establish identity. */
export function mergeAssemblyObservations(items: TakeoffItem[]) {
  const next = structuredClone(items);
  const eligible = (t: TakeoffItem) =>
    t.origin === "ai" &&
    t.status === "Proposed" &&
    !!t.assemblyReference?.trim() &&
    !t.convertedLineId &&
    !t.reviewAcknowledged &&
    !t.scopeVerified &&
    !t.purchaseVerified &&
    !t.conflictsVerified &&
    !t.scopeOverride &&
    !t.overlapReviews?.length &&
    !t.calculation?.verified &&
    !t.beamAssemblies?.length &&
    !/^Manual /i.test(t.calculationBasis ?? "");
  const recipe = (t: TakeoffItem) =>
    JSON.stringify(
      t.calculation
        ? {
            kind: t.calculation.kind,
            inputs: t.calculation.inputs,
            geometryConfirmed: t.calculation.geometryConfirmed,
            arrangements: t.calculation.arrangements,
            availableStock: t.calculation.availableStock,
          }
        : null,
    );
  for (let i = 0; i < next.length; i++) {
    const a = next[i];
    if (!eligible(a)) continue;
    for (let j = i + 1; j < next.length; j++) {
      const b = next[j];
      const sameInputs =
        materialInputIdentity(a.materialInputs) ===
          materialInputIdentity(b.materialInputs) && recipe(a) === recipe(b);
      const combinedInputs = mergeMaterialInputs(
        a.materialInputs,
        b.materialInputs,
      );
      const combinedRecipe = sameInputs
        ? a.calculation
        : complementaryRecipe(a.calculation, b.calculation);
      if (
        !eligible(b) ||
        a.documentId !== b.documentId ||
        a.assemblyReference !== b.assemblyReference ||
        !materialCategoryFor(a) ||
        materialCategoryFor(a) !== materialCategoryFor(b) ||
        materialSpecificationKey(
          a.specification ?? "",
          materialCategoryFor(a),
        ) !==
          materialSpecificationKey(
            b.specification ?? "",
            materialCategoryFor(b),
          ) ||
        a.quantity !== b.quantity ||
        (a.notes.match(/Original proposed observation: ([^\n;]+)/i)?.[1] ??
          "") !==
          (b.notes.match(/Original proposed observation: ([^\n;]+)/i)?.[1] ??
            "") ||
        a.unit !== b.unit ||
        a.destination !== b.destination ||
        workScope(a) !== workScope(b) ||
        a.included !== b.included ||
        a.alternativeGroup !== b.alternativeGroup ||
        a.alternativeOption !== b.alternativeOption ||
        a.supportBasis !== b.supportBasis ||
        a.subcontractorBasis !== b.subcontractorBasis ||
        a.stockLength !== b.stockLength ||
        (!sameInputs &&
          (combinedRecipe === false ||
            !!materialInputProblem(combinedInputs))) ||
        /conflict|unreadable|alternative/i.test(
          [...(a.warnings ?? []), ...(b.warnings ?? [])].join(" "),
        )
      )
        continue;
      const facts = [
          ...new Set([
            ...(a.sourceFacts ?? []),
            ...(b.sourceFacts ?? []),
            `Repeated physical assembly ${a.assemblyReference}: ${b.description}; source ${b.documentId}, page ${b.page}, detail ${b.sourceDetailView ?? "original"}; ${b.notes}`,
          ]),
        ],
        inputs = mergeMaterialInputs(a.materialInputs, b.materialInputs),
        warnings = [...new Set([...(a.warnings ?? []), ...(b.warnings ?? [])])],
        assumptions = [
          ...new Set([...(a.assumptions ?? []), ...(b.assumptions ?? [])]),
        ];
      if (
        facts.length > 20 ||
        facts.some((f) => f.length > 1000) ||
        inputs.length > 40 ||
        warnings.length > 20 ||
        assumptions.length > 20
      )
        continue;
      a.sourceFacts = facts;
      a.materialInputs = inputs;
      if (!sameInputs && combinedRecipe) a.calculation = combinedRecipe;
      a.warnings = warnings;
      a.assumptions = assumptions;
      // Original record stays intact as non-billable evidence; quantities never sum.
      b.status = "Rejected";
      b.included = false;
      b.notes += `\nRepeated source observation consolidated into material ${a.id}; quantity was not added.`;
    }
  }
  return next;
}
