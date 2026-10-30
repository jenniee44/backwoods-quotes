import type { Quote } from "./model";
import { materialCategoryFor } from "../shared/takeoff";
import { evidenceScope } from "../shared/componentIdentity";
import { explicitBeamIdentity } from "../shared/componentSubject";
import { mixedMaterialCallouts } from "../shared/mixedMaterialCallouts";
/** Repair only untouched proposals; contractor scope decisions and calculator
 * blanks/manual entries remain authoritative. Original reports stay unchanged. */
export function repairDrawingIdentity(q: Quote): Quote {
  if (q.status !== "Draft") return q;
  const repaired: Quote = {
    ...q,
    takeoff: q.takeoff.map((t) => {
      if (
        t.origin !== "ai" ||
        t.status !== "Proposed" ||
        t.reviewAcknowledged ||
        t.scopeVerified ||
        t.scopeOverride ||
        t.convertedLineId ||
        t.calculation?.verified
      )
        return t;
      const next = { ...t };
      if (
        t.quantity === null &&
        t.warnings?.includes(
          "Conflicting quantities in repeated beam observations: confirm the physical assembly count; quantities were not added.",
        )
      ) {
        const originals = q.analysisReports
          ?.find((r) => r.id === t.analysisId)
          ?.sourceObservations?.filter(
            (s) =>
              s.documentId === t.documentId &&
              s.page === t.page &&
              s.assemblyReference &&
              s.assemblyReference === t.assemblyReference &&
              explicitBeamIdentity(s),
          );
        if (
          originals &&
          originals.length >= 2 &&
          originals.every((s) => s.quantity === null)
        )
          next.warnings = t.warnings.filter(
            (w) =>
              w !==
              "Conflicting quantities in repeated beam observations: confirm the physical assembly count; quantities were not added.",
          );
      }
      if (explicitBeamIdentity(t)) {
        if (t.category === "Joists") next.category = "Beams";
        if (
          t.calculation?.kind === "joists" &&
          Object.entries(t.calculation.inputs).every(
            ([key, value]) =>
              value !== null && !!t.calculation?.inputSources?.[key],
          )
        )
          delete next.calculation;
      }
      const inferred = evidenceScope(t);
      const hasScopeQualifier =
        /\bby[- ]others\b|\bexisting\b[^;\n]{0,100}\b(?:remain|retain|retained)\b/i.test(
          [t.description, ...(t.sourceFacts ?? []), t.notes].join("; "),
        );
      if (
        hasScopeQualifier &&
        [
          "By others",
          "By others / excluded",
          "Existing work to remain",
        ].includes(t.workScope ?? "") &&
        !["By others / excluded", "Existing work to remain"].includes(
          inferred,
        ) &&
        materialCategoryFor(t)
      ) {
        next.originalScope ??= {
          workScope: t.workScope,
          included: t.included,
          destination: t.destination,
          itemRole: t.itemRole,
        };
        next.workScope = "Requires scope confirmation";
        next.included = false;
        next.destination = "Materials";
        next.itemRole = "Construction item";
      }
      return next;
    }),
  };
  for (const source of repaired.takeoff.slice()) {
    if (
      source.origin !== "ai" ||
      source.status !== "Proposed" ||
      source.reviewAcknowledged ||
      source.scopeVerified ||
      source.scopeOverride ||
      source.convertedLineId ||
      source.calculation?.verified ||
      !repaired.documents.some((d) => d.id === source.documentId)
    )
      continue;
    for (const item of mixedMaterialCallouts(source))
      if (
        !repaired.takeoff.some(
          (t) =>
            t.documentId === item.documentId &&
            t.page === item.page &&
            t.location === item.location &&
            materialCategoryFor(t) === item.category &&
            t.specification === item.specification,
        )
      )
        repaired.takeoff.push({
          ...item,
          id: `${source.id}:component:${item.category}`,
          analysisId: source.analysisId,
          origin: "ai",
          status: "Proposed",
          included: false,
          workScope: "Requires scope confirmation",
          reviewAcknowledged: false,
          scopeVerified: false,
        });
  }
  return repaired;
}
