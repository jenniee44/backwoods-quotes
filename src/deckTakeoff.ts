import { isBeamMaterial } from "./beamMaterial";
import type { Quote, TakeoffItem } from "./model";
import {
  materialInputUnits,
  resolveMaterialInputs,
  type MaterialInput,
} from "../shared/materialInputs";
import { normalizeSpecification } from "../shared/componentIdentity";
import { drawingMeasurements } from "../shared/constructionMeasurements";
import {
  calculators,
  calculateMaterial,
  type MaterialCalculation,
} from "../shared/materialCalculators";
import { includedScope, workScope } from "./takeoffScope";
import { relevantCalculators } from "./calculatorSelection";
import { repairBeamReview } from "./repairBeamReview";
import { hasReadableSpecification } from "./takeoffRequirements";

const uncertain =
  /unreadable|illegible|uncertain|approx(?:imate)?|assum|conflict|not confirmed|to confirm|unknown|scaled|pixel/i;
// Legacy facts must explicitly label the dimension and its role. Nearby drawing
// dimensions, image scale, nominal lumber sizes and general notes are not inputs.
const legacyLabels: Record<string, MaterialInput["field"]> = {
  "layout length": "layoutLength",
  "layout width": "layoutWidth",
  "member length": "memberLength",
  "joist length": "memberLength",
  "joist spacing": "spacing",
  "spacing inches": "spacing",
  "component count": "count",
  "actual board width": "boardWidth",
  "board gap": "gap",
  "stock length": "stock",
  "pieces per row": "pieces",
  "waste allowance": "waste",
  "saw kerf": "kerf",
  "footing diameter": "diameter",
  "concrete depth": "depth",
  "pad length": "padLength",
  "pad width": "padWidth",
  "connection count": "connections",
  "connectors per connection": "piecesPerConnection",
  "hangers per connection": "piecesPerConnection",
  "fasteners per connection": "piecesPerConnection",
  "railing length": "linearLength",
  "guard length": "linearLength",
  "flashing length": "linearLength",
};
export function materialDrawingInputs(t: TakeoffItem): MaterialInput[] {
  const result = [...(t.materialInputs ?? [])];
  // Older analyses stored role-labelled measurements as semicolon-separated
  // evidence, before materialInputs existed. Parse only explicit labels on this
  // material's evidence, never unrelated dimensions from the whole PDF.
  const legacyFacts = (t.sourceFacts ?? []).flatMap((fact) => {
    if (uncertain.test(fact)) return [];
    const location = t.location?.trim();
    const clean =
      location && fact.toLowerCase().startsWith(location.toLowerCase() + ":")
        ? fact.slice(location.length + 1).trim()
        : fact;
    return clean.split(/[;\n]/).map((part) => {
      const label = part.match(
        /\b(layout length|layout width|member length|joist length|connection count|component count)\s*[:=]/i,
      );
      // A prefixed label is usable only when this same segment identifies the
      // exact material specification and location. Do not borrow house dimensions.
      if (
        label?.index &&
        location &&
        part.toLowerCase().includes(location.toLowerCase()) &&
        t.specification &&
        normalizeSpecification(part).includes(
          normalizeSpecification(t.specification),
        )
      )
        return part.slice(label.index).trim();
      return part.trim();
    });
  });
  for (const fact of legacyFacts) {
    if (uncertain.test(fact)) continue;
    const m = fact.match(/^\s*(?:verified |written )?([a-z ]+)\s*:\s*(.+)$/i);
    const field = m && legacyLabels[m[1].trim().toLowerCase()];
    if (!field) continue;
    const unit = materialInputUnits[field];
    const measurements = drawingMeasurements({ ...t, sourceFacts: [fact] });
    let value: number | undefined;
    if (["ft", "in"].includes(unit) && measurements.length === 1)
      value = measurements[0].inches / (unit === "ft" ? 12 : 1);
    else if (
      field === "spacing" &&
      m![1].trim().toLowerCase() === "spacing inches" &&
      /^\d+(?:\.\d+)?$/.test(m![2].trim())
    )
      value = Number(m![2]);
    else if (
      unit === "each" &&
      /^\d+\s*(?:each|pieces?|connections?|connectors?)?\.?$/i.test(
        m![2].trim(),
      )
    )
      value = Number.parseInt(m![2]);
    else if (unit === "%" && /^\d+(?:\.\d+)?\s*%\.?$/.test(m![2].trim()))
      value = Number.parseFloat(m![2]);
    if (value !== undefined)
      result.push({
        field,
        value,
        unit,
        page: t.page,
        evidence: fact,
        readable: true,
      });
  }
  for (const fact of t.sourceFacts ?? []) {
    if (
      uncertain.test(fact) ||
      !t.location ||
      !t.specification ||
      !fact.toLowerCase().includes(t.location.toLowerCase()) ||
      !normalizeSpecification(fact).includes(
        normalizeSpecification(t.specification),
      ) ||
      /\bnot\b|\bnon[- ]?uniform\b|except|unless/i.test(fact)
    )
      continue;
    const flags: MaterialInput["field"][] = [];
    if (/uniform layout/i.test(fact) && /no openings/i.test(fact))
      flags.push("layoutClear");
    if (/both ends included/i.test(fact)) flags.push("edgeIncluded");
    for (const field of flags)
      result.push({
        field,
        value: 1,
        unit: "option",
        page: t.page,
        evidence: fact,
        readable: true,
      });
  }
  // Retain an explicitly counted support observation before calculator
  // initialization clears the final/approved quantity field. This is a proposed
  // component count, never a purchase length or a concrete volume.
  if (
    (result.length > 0 || /joist|deck(?:ing)? board/i.test(t.description)) &&
    t.origin === "ai" &&
    t.quantity !== null &&
    Number.isInteger(t.quantity) &&
    t.quantity > 0 &&
    /post|footing|pier|joist|deck(?:ing)? board/i.test(t.description) &&
    !/hanger|connector|fastener|screw|bolt|beam|girder/i.test(t.description) &&
    !/concrete (?:volume|supply)/i.test(t.description) &&
    /^(?:each|pieces?|joists?|boards?|posts?|footings?|piers?|assemblies)$/i.test(
      t.unit,
    ) &&
    ["Written", "Counted"].includes(t.quantityMethod ?? "") &&
    !!t.sourceFacts?.length &&
    !t.assumptions?.length &&
    !uncertain.test([t.notes, ...(t.warnings ?? [])].join(" "))
  )
    result.push({
      field: "count",
      value: t.quantity,
      unit: "each",
      page: t.page,
      evidence:
        `Original ${t.quantityMethod} component observation: ${t.quantity} ${t.unit}; ${t.sourceFacts!.join("; ")}`.slice(
          0,
          1000,
        ),
      readable: true,
    });
  // Spacing is a specification, not proof of the layout boundary or openings.
  const spacing = [
    ...(t.specification ?? "").matchAll(
      /(?:@|at)\s*(\d+(?:\.\d+)?)\s*(?:["″]|in(?:ches)?)\s*(?:o[. ]*c\.?|on cent(?:re|er))/gi,
    ),
  ];
  for (const m of spacing)
    result.push({
      field: "spacing",
      value: Number(m[1]),
      unit: "in",
      page: t.page,
      evidence: `Material specification: ${t.specification}`,
      readable: true,
    });
  if (
    relevantCalculators(t).includes("joists") &&
    !result.some((f) => f.field === "layoutLength")
  ) {
    // Older analyses sometimes used layoutWidth for the spacing axis. Only an
    // explicit directional association permits this alias, never proximity or pixels.
    result.push(
      ...result
        .filter(
          (f) =>
            f.field === "layoutWidth" &&
            f.readable &&
            /perpendicular to (?:the )?joists|across (?:the )?joists|joist spacing axis/i.test(
              f.evidence,
            ) &&
            !uncertain.test(f.evidence),
        )
        .map((f) => ({ ...f, field: "layoutLength" as const })),
    );
  }
  return result;
}
/** Retain source counts before the separate purchase field is cleared. */
export function preservedDrawingInputs(t: TakeoffItem) {
  const inputs = [
    ...(t.materialInputs ?? []),
    ...materialDrawingInputs(t).filter(
      (f) =>
        f.field === "count" &&
        !(t.materialInputs ?? []).some(
          (old) => JSON.stringify(old) === JSON.stringify(f),
        ),
    ),
  ];
  return inputs.length <= 40 ? inputs : t.materialInputs;
}
export function supportedMaterialInputs(t: TakeoffItem) {
  const facts = materialDrawingInputs(t),
    resolved = resolveMaterialInputs(facts);
  const sources: Record<string, string> = {};
  for (const field of Object.keys(resolved.values))
    sources[field] = [
      ...new Set(
        facts
          .filter((f) => f.field === field)
          .map(
            (f) =>
              `${t.sourceDocumentName || t.documentId} · page ${f.page}: ${f.evidence}`,
          ),
      ),
    ]
      .join("; ")
      .slice(0, 2000);
  return {
    values: resolved.values as Record<string, number>,
    sources,
    conflicts: resolved.conflicts,
  };
}
function recipeKind(t: TakeoffItem, v: Record<string, number>) {
  if (t.calculation) return t.calculation.kind;
  const options = relevantCalculators(t);
  if (options.includes("beam-runs")) return "beam-runs";
  if (options.includes("concrete")) {
    if (
      v.diameter !== undefined &&
      (v.padLength !== undefined || v.padWidth !== undefined)
    )
      return undefined;
    if (/concrete (?:volume|supply)|ready.?mix/i.test(t.description))
      return v.padLength !== undefined || v.padWidth !== undefined
        ? "rectangular-concrete"
        : "concrete";
    return "posts"; // Assembly counts are not concrete volumes.
  }
  return options[0];
}
const shapeKinds = ["joists", "stringers", "decking-layout", "decking", "area"];
export function proposedMaterialRecipe(
  t: TakeoffItem,
): MaterialCalculation | undefined {
  if (/^Manual /i.test(t.calculationBasis ?? "") || t.calculation?.verified)
    return t.calculation;
  if (
    t.origin !== "ai" ||
    (t.destination ?? "Materials") !== "Materials" ||
    (t.itemRole && t.itemRole !== "Construction item") ||
    (!includedScope(t) && workScope(t) !== "Requires scope confirmation") ||
    t.status === "Rejected" ||
    (workScope(t) === "Existing work to remove or modify" &&
      !t.scopeVerified) ||
    !hasReadableSpecification(t)
  )
    return t.calculation;
  if (
    preservedDrawingInputs(t) === t.materialInputs &&
    materialDrawingInputs(t).some(
      (f) =>
        f.field === "count" &&
        !(t.materialInputs ?? []).some(
          (old) => JSON.stringify(old) === JSON.stringify(f),
        ),
    )
  )
    return t.calculation;
  const { values: v, sources } = supportedMaterialInputs(t);
  if (!Object.keys(v).length) return t.calculation;
  const kind = recipeKind(t, v);
  if (!kind || kind === "beam-runs") return t.calculation;
  const definition = calculators.find((c) => c.kind === kind);
  if (!definition) return t.calculation;
  const map: Record<string, string> = {
    layoutLength: "length",
    layoutWidth: "width",
    memberLength: "member",
    spacing: "spacing",
    count: "count",
    boardWidth: "boardWidth",
    gap: "gap",
    stock: "stock",
    pieces: "pieces",
    waste: "waste",
    kerf: "kerf",
    diameter: "diameter",
    depth: "depth",
    padLength: "padLength",
    padWidth: "padWidth",
  };
  if (kind === "hardware") {
    delete map.count;
    map.connections = "count";
    map.piecesPerConnection = "pieces";
  }
  if (kind === "railing") {
    delete map.layoutLength;
    map.linearLength = "length";
  }
  if (kind === "decking-layout") map.direction = "direction";
  const inputs = { ...t.calculation?.inputs },
    inputSources = { ...t.calculation?.inputSources };
  if (
    kind === "hardware" &&
    v.connections === undefined &&
    inputs.count !== null &&
    inputs.count === v.count &&
    inputSources.count &&
    inputSources.count === sources.count
  ) {
    // Repair only a demonstrably generated legacy mapping. User-entered/blank
    // and verified connection counts remain untouched.
    delete inputs.count;
    delete inputSources.count;
  }
  for (const [field, key] of Object.entries(map))
    if (
      v[field] !== undefined &&
      inputs[key] === undefined &&
      definition.fields.some((f) => f.key === key)
    ) {
      inputs[key] = v[field];
      inputSources[key] = sources[field];
    }
  if (!Object.keys(inputs).length) return t.calculation;
  return {
    ...t.calculation,
    kind,
    inputs,
    inputSources,
    verified: false,
    ...(shapeKinds.includes(kind) &&
    (v.layoutClear !== 1 ||
      (["joists", "stringers"].includes(kind) && v.edgeIncluded !== 1))
      ? { geometryConfirmed: t.calculation?.geometryConfirmed ?? false }
      : {}),
  };
}
export function prepareDeckTakeoff(q: Quote): Quote {
  const repaired = repairBeamReview(q);
  if (q.status !== "Draft") return repaired;
  return {
    ...repaired,
    takeoff: repaired.takeoff.map((t) => {
      if (
        t.status !== "Proposed" ||
        t.convertedLineId ||
        t.reviewAcknowledged ||
        t.calculation?.verified
      )
        return t;
      const calculation = proposedMaterialRecipe(t);
      if (
        !calculation ||
        JSON.stringify(calculation) === JSON.stringify(t.calculation)
      )
        return t;
      return {
        ...t,
        materialInputs: preservedDrawingInputs(t),
        calculation,
        quantity: null,
        unit: calculators.find((c) => c.kind === calculation.kind)!.unit,
        quantityMethod: "Unknown" as const,
        classification: "Contractor input required" as const,
        notes:
          !t.calculation && t.quantity !== null
            ? `${t.notes}\nOriginal proposed observation: ${t.quantity} ${t.unit}; not a verified purchase quantity.`
            : t.notes,
      };
    }),
  };
}
export function applyTakeoffPreferences(
  q: Quote,
  availableStock: number[],
  waste: number | null,
): Quote {
  if (q.status !== "Draft")
    throw new Error("Only draft quotes can change purchasing preferences.");
  if (
    availableStock.length > 20 ||
    availableStock.some((n) => !Number.isFinite(n) || n <= 0 || n > 1000) ||
    (waste !== null && (!Number.isFinite(waste) || waste < 0 || waste > 100))
  )
    throw new Error(
      "Enter up to 20 positive stock lengths and waste from 0 to 100%, or leave waste blank.",
    );
  const prepared = prepareDeckTakeoff(q),
    stock = [...new Set(availableStock)].sort((a, b) => a - b);
  return {
    ...prepared,
    takeoffPreferences: { availableStock: stock, waste },
    takeoff: prepared.takeoff.map((t) => {
      if (
        t.status !== "Proposed" ||
        t.reviewAcknowledged ||
        t.convertedLineId ||
        !t.calculation ||
        t.calculation.verified ||
        !includedScope(t)
      )
        return t;
      const recipe = t.calculation,
        inputs = { ...recipe.inputs },
        inputSources = { ...recipe.inputSources };
      const definition = calculators.find((c) => c.kind === recipe.kind)!;
      if (
        waste !== null &&
        inputs.waste === undefined &&
        definition.fields.some((f) => f.key === "waste")
      ) {
        inputs.waste = waste;
        inputSources.waste =
          "Contractor-configured quote waste allowance; verify purchasing requirements";
      }
      if (
        inputs.stock === undefined &&
        inputs.member != null &&
        definition.fields.some((f) => f.key === "stock")
      ) {
        const candidate = stock.find((n) => n >= inputs.member!);
        if (candidate !== undefined) {
          inputs.stock = candidate;
          inputSources.stock =
            "Proposed continuous length from contractor-configured available stock; verify availability";
        }
      }
      return {
        ...t,
        quantity: null,
        calculation: {
          ...recipe,
          verified: false,
          inputs,
          inputSources,
          availableStock: recipe.availableStock ?? stock,
        },
      };
    }),
  };
}
export type TakeoffProposal = {
  quantity: number | null;
  unit: string;
  formula: string;
  purchase: number | null;
  purchaseUnit: string;
  missing: string[];
  sources: string[];
  stockSuggestion: number | null;
};
export function materialTakeoffProposal(t: TakeoffItem): TakeoffProposal {
  const { values: v, sources, conflicts } = supportedMaterialInputs(t);
  const recipe = proposedMaterialRecipe(t) ?? t.calculation,
    kind = recipe?.kind ?? recipeKind(t, v);
  const missing = conflicts.map(
    (f) =>
      `Confirm conflicting or unreadable ${f.replace(/([A-Z])/g, " $1").toLowerCase()}`,
  );
  const empty = (reason: string): TakeoffProposal => ({
    quantity: null,
    unit: t.unit,
    formula: "",
    purchase: null,
    purchaseUnit: "",
    missing: [reason],
    sources: Object.values(sources),
    stockSuggestion: null,
  });
  if (kind === "beam-runs" && !isBeamMaterial(t))
    return empty(
      "Verify this ledger/flashing material using its own measured length; saved beam observations are not its quantity",
    );
  const scopePending =
    workScope(t) === "Requires scope confirmation" && t.status !== "Rejected";
  if (
    (!includedScope(t) && !scopePending) ||
    t.status === "Rejected" ||
    workScope(t) === "Existing work to remain" ||
    (workScope(t) === "Existing work to remove or modify" && !t.scopeVerified)
  )
    return empty("Confirm included material scope");
  if (/^Manual /i.test(t.calculationBasis ?? "") && !t.calculation) {
    return {
      quantity: t.quantity,
      unit: t.unit,
      formula:
        "Contractor-entered estimate quantity; original drawing evidence is retained separately",
      purchase: null,
      purchaseUnit: t.unit,
      missing: [
        t.quantity === null
          ? "Enter the contractor-confirmed purchasing quantity"
          : "Verify the corrected quantity, specification and purchasing basis before approval",
        ...(scopePending
          ? ["Confirm whether this work is included in your job scope"]
          : []),
      ],
      sources: ["Contractor edit, not a drawing measurement"],
      stockSuggestion: null,
    };
  }
  if (
    ["posts", "post-stock", "concrete", "rectangular-concrete"].includes(
      kind ?? "",
    ) &&
    ["Total visible locations", "Existing work", "By others"].includes(
      t.supportBasis ?? "",
    ) &&
    !(recipe?.verified && t.scopeVerified)
  ) {
    return empty(
      "Identify the new included support locations; visible symbols and existing/by-others supports are not a new footing or post count",
    );
  }
  // Contractor-confirmed calculator values may correct the proposed drawing facts.
  // Original facts stay unchanged and available in expandable evidence.
  if (recipe) {
    const map: Record<string, string> = {
      length: kind === "railing" ? "linearLength" : "layoutLength",
      width: "layoutWidth",
      member: "memberLength",
      spacing: "spacing",
      stock: "stock",
      waste: "waste",
      kerf: "kerf",
      boardWidth: "boardWidth",
      gap: "gap",
      direction: "direction",
      diameter: "diameter",
      depth: "depth",
      padLength: "padLength",
      padWidth: "padWidth",
      count: kind === "hardware" ? "connections" : "count",
      pieces: kind === "hardware" ? "piecesPerConnection" : "pieces",
    };
    for (const [key, field] of Object.entries(map))
      if (Object.hasOwn(recipe.inputs, key)) {
        // Explicit blanks are contractor decisions, including in older saved analyses.
        // Project populated proposed inputs without promoting them to verification.
        if (recipe.inputs[key] === null) delete v[field];
        else {
          v[field] = recipe.inputs[key]!;
          if (recipe.inputSources?.[key])
            sources[field] = recipe.inputSources[key];
        }
      }
    if (recipe.geometryConfirmed === true) {
      v.layoutClear = 1;
      v.edgeIncluded = 1;
    }
  }
  const has = (...keys: string[]) =>
    keys.every((k) => v[k] !== undefined && v[k] > 0);
  let quantity: number | null = null,
    unit = recipe
      ? calculators.find((c) => c.kind === kind)!.unit
      : t.unit || "each",
    formula = "";
  if (kind === "beam-runs" && recipe?.inputs.runs) {
    quantity = recipe.inputs.runs;
    unit = "runs";
    formula = "Distinct physical runs; not purchasing boards";
  } else if (
    kind === "joists" &&
    has("layoutLength", "spacing") &&
    v.edgeIncluded === 1 &&
    v.layoutClear === 1
  ) {
    quantity = Math.ceil((v.layoutLength * 12) / v.spacing) + 1;
    unit = "joists";
    formula = `ceil(${v.layoutLength} ft × 12 / ${v.spacing} in) + 1; both edges, clear layout`;
  } else if (kind === "hardware" && has("connections", "piecesPerConnection")) {
    quantity = v.connections * v.piecesPerConnection;
    formula = `${v.connections} connections × ${v.piecesPerConnection} specified pieces`;
  } else if (
    ["decking-layout", "decking", "area"].includes(kind ?? "") &&
    has("layoutLength", "layoutWidth") &&
    v.layoutClear === 1
  ) {
    quantity = v.layoutLength * v.layoutWidth;
    unit = "sq ft";
    formula = `${v.layoutLength} ft × ${v.layoutWidth} ft`;
    if (
      kind === "decking-layout" &&
      has("boardWidth", "pieces") &&
      v.gap !== undefined &&
      v.gap >= 0 &&
      v.gap <= v.boardWidth &&
      [0, 1].includes(v.direction)
    ) {
      const cross = v.direction === 0 ? v.layoutWidth : v.layoutLength;
      quantity =
        Math.ceil((cross * 12 + v.gap) / (v.boardWidth + v.gap)) * v.pieces;
      unit = "cut pieces";
      formula = `ceil((${cross} ft × 12 + ${v.gap} in gap) / (${v.boardWidth} in actual width + gap)) × ${v.pieces} specified pieces per row; stock/waste separate`;
    }
  } else if (
    kind === "stringers" &&
    has("layoutWidth", "spacing") &&
    v.layoutClear === 1 &&
    v.edgeIncluded === 1
  ) {
    quantity = Math.ceil((v.layoutWidth * 12) / v.spacing) + 1;
    unit = "stringers";
    formula = `ceil(${v.layoutWidth} ft × 12 / ${v.spacing} in) + 1; specified end members`;
  } else if (kind === "treads" && has("count", "pieces")) {
    quantity = v.count * v.pieces;
    unit = "cut pieces";
    formula = `${v.count} treads × ${v.pieces} specified boards per tread`;
  } else if (kind === "railing" && has("linearLength")) {
    quantity = v.linearLength;
    unit = "linear ft";
    formula =
      "Explicitly dimensioned included linear length; no perimeter subtraction inferred";
  } else if (
    ["concrete", "rectangular-concrete"].includes(kind ?? "") &&
    has("count", "depth")
  ) {
    if (kind === "concrete" && has("diameter")) {
      quantity =
        (v.count * Math.PI * (v.diameter / 24) ** 2 * (v.depth / 12)) / 27;
      unit = "cu yd";
      formula = "count × π × (diameter / 24)² × (depth / 12) / 27";
    } else if (
      kind === "rectangular-concrete" &&
      has("padLength", "padWidth")
    ) {
      quantity = (v.count * v.padLength * v.padWidth * v.depth) / 46656;
      unit = "cu yd";
      formula = "count × pad length × pad width × depth / 46656";
    }
  } else if (
    kind &&
    !["hardware", "beam-runs", "treads"].includes(kind) &&
    has("count")
  ) {
    quantity = v.count;
    unit = /post/.test(kind)
      ? /post/i.test(t.description)
        ? "posts"
        : "assemblies"
      : kind === "joists"
        ? "joists"
        : "pieces";
    formula = "Explicit unique component count; repeated views are not added";
  }
  if (
    quantity === null &&
    !recipe &&
    !t.beamAssemblies?.length &&
    t.quantity !== null &&
    ["Written", "Counted", "Calculated"].includes(t.quantityMethod ?? "") &&
    !conflicts.length &&
    !uncertain.test([t.notes, ...(t.warnings ?? [])].join(" "))
  ) {
    quantity = t.quantity;
    unit = t.unit;
    formula =
      t.calculationBasis ||
      "Proposed drawing quantity; verify purchasing basis";
  }
  if (
    kind === "joists" &&
    quantity !== null &&
    v.count !== undefined &&
    quantity !== v.count &&
    !recipe?.verified
  ) {
    missing.push(
      `Counted observation (${v.count} joists) conflicts with the layout calculation (${quantity} joists); verify the assembly and edge conditions`,
    );
    conflicts.push("count");
  }
  // A conflicting source must not produce a seemingly usable proposal. The
  // original observations remain available for contractor reconciliation.
  if (conflicts.length && !recipe?.verified) quantity = null;
  const purchase = recipe ? calculateMaterial(recipe, false) : undefined;
  if (quantity === null) {
    const required: Record<string, [string, string][]> = {
      joists: [
        ["layoutLength", "framing layout width perpendicular to joists"],
        ["spacing", "joist spacing"],
        ["layoutClear", "layout boundary and openings"],
        ["edgeIncluded", "required edge members"],
      ],
      hardware: [
        ["connections", "identified connection count"],
        ["piecesPerConnection", "specified hardware pieces per connection"],
      ],
      railing: [["linearLength", "included measured linear length"]],
      "decking-layout": [
        ["layoutLength", "deck layout length"],
        ["layoutWidth", "deck layout width"],
        ["layoutClear", "deck boundary and openings"],
      ],
      decking: [
        ["layoutLength", "deck layout length"],
        ["layoutWidth", "deck layout width"],
        ["layoutClear", "deck boundary and openings"],
      ],
      posts: [["count", "unique new included support count"]],
      concrete: [
        ["count", "unique new footing count"],
        ["diameter", "footing diameter"],
        ["depth", "concrete depth"],
      ],
    };
    const absent = (required[kind ?? ""] ?? [])
      .filter(([key]) => v[key] === undefined || v[key] <= 0)
      .map(([, label]) => label);
    missing.push(
      absent.length
        ? "Confirm " + absent.join(", ")
        : kind === "beam-runs"
          ? "Confirm distinct physical beam runs; beam lengths and stock/cutting inputs are separate"
          : "Confirm this assembly's measured dimensions or unique component count",
    );
  }
  if (scopePending)
    missing.push(
      "Confirm whether this drawing requirement is included in your job scope; this proposal is not approved for purchase",
    );
  if (purchase?.missing.length) missing.push(...purchase.missing);
  else if (!recipe)
    missing.push("Confirm purchasing unit and specification before approval");
  const member = recipe?.inputs.member;
  const stockSuggestion =
    member && recipe?.availableStock?.length
      ? (recipe.availableStock
          .filter((n) => n >= member)
          .sort((a, b) => a - b)[0] ?? null)
      : null;
  return {
    quantity,
    unit,
    formula,
    purchase:
      scopePending || (conflicts.length && !recipe?.verified)
        ? null
        : (purchase?.quantity ?? null),
    purchaseUnit: purchase?.unit || t.unit,
    missing: [...new Set(missing)],
    sources: [
      ...new Set([
        ...Object.values(sources),
        ...Object.values(recipe?.lengthSources ?? {}),
        ...Object.values(recipe?.specificationSources ?? {}),
        ...(recipe?.runCountSource ? [recipe.runCountSource] : []),
      ]),
    ],
    stockSuggestion,
  };
}
