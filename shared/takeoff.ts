import type {
  AnalysisSuggestion,
  PlanAnalysisResult,
  ContractorSummary,
} from "./analysis";

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function scopeFor(item: AnalysisSuggestion): string {
  if (item.scopeGroup?.trim()) return item.scopeGroup.trim();
  if (item.destination === "Informational")
    return "Informational / Verification";
  const description = item.description.toLowerCase();
  if (/footing|pier|foundation|concrete/.test(description))
    return "Footings & Foundations";
  if (
    /hanger|connector|fastener|ledger fastening|post base|post cap/.test(
      description,
    )
  )
    return "Hardware & Connectors";
  if (/post|beam/.test(description)) return "Posts & Beams";
  if (/stair|stringer|tread|riser|landing/.test(description)) return "Stairs";
  if (/railing|guard/.test(description)) return "Railings / Guards";
  if (/decking/.test(description)) return "Decking";
  if (/joist|framing|ledger|blocking/.test(description)) return "Framing";
  if (/demolition|excavat|site prep/.test(description))
    return "Site / Demolition";
  if (item.destination === "Labour") return "Labour";
  if (item.destination === "Subcontractor") return "Subcontracted / By Others";
  return "Finishing";
}
// Narrow synonyms only. Preserve different specifications, locations, units, pages,
// quantities and destinations. Never use fuzzy matching to combine priced rows.
export function semanticItemKey(item: AnalysisSuggestion): string {
  const component = words(item.description)
    .replace(
      /\b(?:concrete )?(?:footings?|piers?)(?: (?:footings?|piers?))?\b/g,
      "footing",
    )
    .replace(/\bjoists\b/g, "joist")
    .replace(/\brailings\b/g, "railing");
  return JSON.stringify([
    item.documentId,
    item.page,
    item.destination,
    component,
    words(scopeFor(item)),
    words(item.specification ?? ""),
    words(item.location ?? ""),
    item.quantity,
    item.supportBasis ?? "Not established",
    words(item.unit),
  ]);
}
const metadataDescription =
  /^(?:\d+\s+)?(?:drawing (?:sheet(?: (?:identifier|number))?|number|identifier)|sheet (?:identifier|number)|(?:number of )?elevation views?|(?:presence of (?:a |the )?)?framing plan(?: present)?|(?:visible )?(?:support|post|footing)(?:\s*\/\s*\w+)* locations?)$/i;
const materialPatterns: [string, RegExp][] = [
  [
    "Hangers / connectors",
    /\b(hangers?|connectors?|post bases?|post caps?|simpson)\b/i,
  ],
  ["Structural fasteners", /\b(fasteners?|bolts?|screws?|ledger fastening)\b/i],
  ["Footings / concrete", /\b(footings?|piers?|foundations?|concrete)\b/i],
  ["Stairs / stringers", /\b(stairs?|stringers?|treads?|risers?)\b/i],
  ["Guards / railings", /\b(guards?|railings?)\b/i],
  ["Fascia / trim", /\b(fascia|trim)\b/i],
  ["Decking", /\bdecking\b/i],
  ["Blocking", /\bblocking\b/i],
  ["Ledger", /\bledger\b/i],
  ["Joists", /\bjoists?\b/i],
  ["Posts", /\bposts?\b/i],
  ["Beams", /\bbeams?\b/i],
];
export function materialCategoryFor(
  item: AnalysisSuggestion,
): string | undefined {
  const label = item.description;
  // Hardware must be classified before its attached framing member.
  const special = materialPatterns
    .slice(0, 8)
    .find(([, pattern]) => pattern.test(label));
  if (special) return special[0];
  const matches = materialPatterns
    .slice(8)
    .filter(([, pattern]) => pattern.test(label));
  if (matches.length === 1) return matches[0][0];
  if (
    matches.length === 0 &&
    materialPatterns.some(([category]) => category === item.category)
  )
    return item.category;
  return undefined; // Combined posts/beams rows are not guessed or split by regex.
}
export function requiresScopeVerification(item: AnalysisSuggestion): boolean {
  if (item.subcontractorBasis === "Explicit by others") return true;
  return item.supportBasis !== undefined &&
    item.supportBasis !== "Not established"
    ? true
    : item.category === "Footings / concrete";
}
function supportBasisFor(
  item: AnalysisSuggestion,
): AnalysisSuggestion["supportBasis"] {
  if (item.supportBasis && item.supportBasis !== "Not established")
    return item.supportBasis;
  const label = item.description + " " + (item.location ?? "");
  if (
    /total visible|visible .*support|visible .*footing|visible .*pier/i.test(
      label,
    )
  )
    return "Total visible locations";
  if (/\bnew\b/i.test(label)) return "Apparent new work";
  if (/\bexisting\b/i.test(label)) return "Existing work";
  if (/\bby[- ]others\b/i.test(label)) return "By others";
  return "Not established";
}
const readable = (spec: string) =>
  !!spec.trim() &&
  !/^(?:unknown|unreadable|not specified|requires contractor input)|specification unreadable/i.test(
    spec.trim(),
  );
function promoteObservation(
  item: AnalysisSuggestion,
): AnalysisSuggestion | null {
  const category = materialCategoryFor(item);
  if (
    item.itemRole === "Document observation" ||
    !category ||
    !readable(item.specification ?? "") ||
    !item.sourceFacts?.length ||
    metadataDescription.test(item.description.trim()) ||
    supportBasisFor(item) === "Total visible locations"
  )
    return null;
  const candidate: AnalysisSuggestion = {
    ...structuredClone(item),
    destination: "Materials",
    category,
    scopeGroup:
      item.scopeGroup === "Informational / Verification" ? "" : item.scopeGroup,
    itemRole: "Construction item",
    ...(category === "Footings / concrete"
      ? { supportBasis: supportBasisFor(item) }
      : {}),
  };
  if (
    item.quantityMethod === "Unknown" ||
    item.quantityMethod === "Scaled" ||
    ((item.quantityMethod === "Calculated" ||
      item.classification === "Calculated quantity") &&
      !item.calculationBasis?.trim())
  )
    candidate.quantity = null;
  return candidate;
}
export function prepareConstructionAnalysis(
  input: PlanAnalysisResult,
): PlanAnalysisResult {
  const result = structuredClone(input);
  const summary: ContractorSummary = result.summary ?? {
    majorScope: [],
    readableSpecifications: [],
    majorUnknowns: [],
    siteVerification: [],
    observations: [],
  };
  const observations = [
    ...(result.sourceObservations ?? []),
    // A readable component specification on a dimension record is useful, but
    // its dimension value/spacing is never promoted into a purchase quantity.
    ...(result.dimensions ?? [])
      .filter(
        (item) =>
          item.itemRole !== "Document observation" &&
          materialCategoryFor(item) &&
          readable(item.specification ?? "") &&
          item.sourceFacts?.length,
      )
      .map((item) => ({
        ...item,
        quantity: null,
        unit: "",
        quantityMethod: "Unknown" as const,
        itemRole: "Supporting evidence" as const,
      })),
    ...result.suggestions.filter(
      (item) =>
        item.itemRole === "Document observation" ||
        item.itemRole === "Supporting evidence" ||
        item.destination === "Informational" ||
        supportBasisFor(item) === "Total visible locations",
    ),
  ];
  const observationSeen = new Set<string>();
  result.sourceObservations = observations
    .map((item) => {
      const observation = structuredClone(item);
      const unsupported =
        item.quantityMethod === "Scaled" ||
        /visually scaled|pixel scaling|scaled from (?:the )?(?:drawing|image)|pixel ratio/i.test(
          item.calculationBasis ?? "",
        ) ||
        (item.quantityMethod === "Counted" && !item.sourceFacts?.length) ||
        ((item.quantityMethod === "Calculated" ||
          item.classification === "Calculated quantity") &&
          (!item.calculationBasis?.trim() || !item.sourceFacts?.length));
      if (
        unsupported ||
        (item.quantityMethod === "Unknown" && item.quantity !== null) ||
        /^(?:labour|labor) hours$/i.test(item.description) ||
        item.destination === "Labour"
      ) {
        observation.quantity = null;
        observation.quantityMethod = "Unknown";
        observation.warnings = unique([
          ...(item.warnings ?? []),
          "Quantity not established; no scaling or inferred labour hours permitted.",
        ]);
      }
      return observation;
    })
    .filter((item) => {
      const key = JSON.stringify(item);
      if (observationSeen.has(key)) return false;
      observationSeen.add(key);
      return true;
    })
    .slice(0, 100);
  if (observations.length > 100)
    result.warnings = unique([
      ...result.warnings,
      "Source observation limit reached. Analyze fewer pages to review all evidence.",
    ]);
  const promoted = result.sourceObservations
    .map(promoteObservation)
    .filter((item): item is AnalysisSuggestion => item !== null)
    .filter(
      (item) =>
        !result.suggestions.some(
          (candidate) =>
            candidate.itemRole !== "Supporting evidence" &&
            candidate.itemRole !== "Document observation" &&
            semanticItemKey({
              ...candidate,
              supportBasis: supportBasisFor(candidate),
            }) ===
              semanticItemKey({ ...item, supportBasis: supportBasisFor(item) }),
        ),
    );
  const retained: AnalysisSuggestion[] = [];
  let reduced = result.duplicatesReduced ?? 0;
  for (const item of [...result.suggestions, ...promoted]) {
    item.warnings = [...(item.warnings ?? [])];
    const evidence = [
      ...(item.sourceFacts ?? []),
      item.notes,
      item.subcontractorBasis === "Explicit by others"
        ? (item.specification ?? "")
        : "",
    ].join(" ");
    if (item.destination === "Subcontractor") {
      const byOthers =
        (item.subcontractorBasis === "Explicit by others" ||
          item.subcontractorBasis === undefined) &&
        /\bby[- ]others\b|\bsubcontracted\b/i.test(evidence) &&
        !/\b(?:no|not|without)\b[^.;\n]{0,45}\b(?:by[- ]others|subcontract(?:ed|or|ing)?)\b/i.test(
          evidence,
        );
      if (byOthers) item.subcontractorBasis = "Explicit by others";
      if (!byOthers) {
        item.destination =
          /labour|labor|assembly|installation|install\b|rough[- ]?in|demolition|prep|painting|excavation/i.test(
            item.description,
          )
            ? "Labour"
            : "Materials";
        if (item.category === "Other Subcontractor")
          item.category = "Miscellaneous";
        item.subcontractorBasis = "Not established";
        item.warnings.push(
          "Subcontracting is not established by the plan. Confirm who performs this scope.",
        );
      }
    }
    // Drawing metadata belongs in summary, not the conversion queue. Keep its
    // source and count as an observation, never reinterpret a count as material.
    if (
      item.itemRole === "Document observation" ||
      item.itemRole === "Supporting evidence" ||
      item.destination === "Informational" ||
      metadataDescription.test(item.description.trim()) ||
      (item.destination === "Labour" &&
        /^(?:construction )?(?:labour|labor)(?: hours)?$/i.test(
          item.description.trim(),
        ))
    ) {
      const observation = `${item.description}: ${item.quantity ?? "Requires contractor input"} ${item.unit} (${item.documentId}${item.page ? `, page ${item.page}` : ""}). ${item.notes}`;
      summary.observations.push(observation.slice(0, 1000));
      // Attach support-location evidence to the corresponding footing item only
      // when the source, page and count agree. Different counts remain visible.
      const related = result.suggestions.find(
        (candidate) =>
          candidate !== item &&
          /footing|pier/i.test(candidate.description) &&
          /support|footing|pier/i.test(item.description) &&
          candidate.quantity !== null &&
          candidate.quantity === item.quantity &&
          candidate.documentId === item.documentId &&
          candidate.page === item.page &&
          words(candidate.location ?? "") === words(item.location ?? "") &&
          candidate.itemRole !== "Supporting evidence" &&
          candidate.itemRole !== "Document observation",
      );
      if (related)
        related.sourceFacts = unique([
          ...(related.sourceFacts ?? []),
          observation.slice(0, 1000),
        ]).slice(0, 20);
      continue;
    }
    // Hours come from the contractor, never from a model's productivity guess.
    if (item.destination === "Labour") {
      if (item.quantity !== null)
        item.warnings.push(
          "Drawing analysis does not establish labour hours; enter contractor-verified hours.",
        );
      item.quantity = null;
      item.unit = "hours";
      item.quantityMethod = "Unknown";
    }
    const scaled =
      item.quantityMethod === "Scaled" ||
      /(?:visually scaled|pixel scaling|scaled from (?:the )?(?:drawing|image)|pixel ratio)/i.test(
        item.calculationBasis ?? "",
      );
    const unsupportedCalculation =
      (item.classification === "Calculated quantity" ||
        item.quantityMethod === "Calculated") &&
      (!item.calculationBasis?.trim() || !item.sourceFacts?.length);
    const unsupportedCount =
      item.quantityMethod === "Counted" && !item.sourceFacts?.length;
    if (scaled || unsupportedCalculation || unsupportedCount) {
      item.quantity = null;
      item.warnings.push(
        scaled
          ? "Visual scaling is not a supported measurement. Requires contractor input; respect DO NOT SCALE."
          : "Requires contractor input: supported source facts and calculation basis are missing.",
      );
    }
    if (item.quantityMethod === "Unknown") item.quantity = null;
    if (item.quantity === null) {
      item.confidence = "Low";
      item.classification = "Contractor input required";
    }
    if (item.destination === "Materials")
      item.category = materialCategoryFor(item) ?? item.category;
    if (
      item.category === "Footings / concrete" ||
      (item.supportBasis && item.supportBasis !== "Not established")
    ) {
      item.supportBasis = supportBasisFor(item);
      item.warnings.push(
        `Support basis: ${item.supportBasis}. Verify existing/new/by-others status and contract inclusion; a visible count is not a purchase quantity.`,
      );
      // Total visible locations are information, not automatically new material.
      if (item.supportBasis === "Total visible locations") {
        summary.observations.push(
          `${item.description}: ${item.quantity ?? "Requires contractor input"} ${item.unit} (${item.documentId}, page ${item.page ?? "unknown"}). Total visible locations, not new work.`,
        );
        continue;
      }
    }
    item.scopeGroup = scopeFor(item);
    item.warnings = unique(item.warnings).slice(0, 20);
    if (item.specification) {
      const unknownSpecification =
        /not readable|unreadable|requires contractor input|not specified|unknown/i.test(
          item.specification,
        ) && !/\d/.test(item.specification);
      const target = unknownSpecification
        ? summary.majorUnknowns
        : summary.readableSpecifications;
      target.push(`${item.description}: ${item.specification}`.slice(0, 1000));
    }
    summary.majorScope.push(item.scopeGroup);
    if (item.quantity === null)
      summary.majorUnknowns.push(
        `${item.description}: ${item.destination === "Labour" ? "labour hours" : "quantity/specification"} requires contractor input`.slice(
          0,
          1000,
        ),
      );
    summary.siteVerification.push(...item.warnings);
    const existing = retained.find(
      (candidate) => semanticItemKey(candidate) === semanticItemKey(item),
    );
    if (existing) {
      reduced++;
      existing.sourceFacts = unique([
        ...(item.sourceDetailView !== existing.sourceDetailView
          ? [
              `Additional source: ${item.documentId}, page ${item.page ?? "unknown"}, detail ${item.sourceDetailView ?? "original PDF"}`,
            ]
          : []),
        ...(existing.sourceFacts ?? []),
        ...(item.sourceFacts ?? []),
        item.notes.slice(0, 1000),
      ]).slice(0, 20);
      existing.assumptions = unique([
        ...(existing.assumptions ?? []),
        ...(item.assumptions ?? []),
      ]).slice(0, 20);
      existing.warnings = unique([
        ...(existing.warnings ?? []),
        ...item.warnings,
      ]).slice(0, 20);
      existing.confidence = [existing.confidence, item.confidence].includes(
        "Low",
      )
        ? "Low"
        : [existing.confidence, item.confidence].includes("Medium")
          ? "Medium"
          : "High";
      // Preserve differing calculation evidence for the same quantity.
      if (
        item.calculationBasis &&
        item.calculationBasis !== existing.calculationBasis
      )
        existing.sourceFacts = unique([
          ...(existing.sourceFacts ?? []),
          `Additional basis: ${item.calculationBasis}`.slice(0, 1000),
        ]).slice(0, 20);
    } else retained.push(item);
  }
  // Keep conflicting quantities/specifications visible; do not silently select one.
  for (let i = 0; i < retained.length; i++) {
    for (let j = i + 1; j < retained.length; j++) {
      const a = retained[i],
        b = retained[j];
      const identity = (item: AnalysisSuggestion) =>
        semanticItemKey({ ...item, quantity: null, specification: "" });
      if (
        identity(a) === identity(b) &&
        (a.quantity !== b.quantity ||
          words(a.specification ?? "") !== words(b.specification ?? ""))
      ) {
        const warning =
          "Conflicting quantities or specifications for the same component/location. Reconcile the source before approving either item.";
        for (const item of [a, b]) {
          item.warnings = unique([...(item.warnings ?? []), warning]).slice(
            0,
            20,
          );
          item.confidence = "Low";
        }
        summary.siteVerification.push(warning);
      }
    }
  }
  // Informational dimensions stay in the summary. They never become material rows.
  for (const dimension of result.dimensions ?? []) {
    if (
      dimension.quantityMethod === "Unknown" ||
      ((dimension.classification === "Calculated quantity" ||
        dimension.quantityMethod === "Calculated") &&
        (!dimension.calculationBasis?.trim() ||
          !dimension.sourceFacts?.length)) ||
      dimension.quantityMethod === "Scaled" ||
      /pixel scaling|visually scaled|scaled from (?:the )?(?:drawing|image)/i.test(
        dimension.calculationBasis ?? "",
      )
    ) {
      dimension.quantity = null;
      dimension.confidence = "Low";
      dimension.classification = "Contractor input required";
      dimension.warnings = unique([
        ...(dimension.warnings ?? []),
        "Requires contractor input: verify readable inputs and calculation basis; do not visually scale drawings.",
      ]).slice(0, 20);
    }
    if (dimension.quantity === null)
      summary.majorUnknowns.push(
        `${dimension.description}: Requires contractor input`.slice(0, 1000),
      );
  }
  for (const key of Object.keys(summary) as (keyof ContractorSummary)[])
    summary[key] = unique(summary[key]).slice(0, 40);
  if (retained.length > 150)
    result.warnings = unique([
      ...result.warnings,
      "Candidate limit reached; review source observations or analyze fewer pages for remaining components.",
    ]);
  // Avoid a generic posts/beams placeholder when both distinct supported
  // candidates are available for the same source/page. Keep ambiguous scopes otherwise.
  result.suggestions = retained
    .filter(
      (item) =>
        !(
          item.quantity === null &&
          /posts?\s*\/\s*beams?/i.test(item.description) &&
          ["Posts", "Beams"].every((category) =>
            retained.some(
              (candidate) =>
                candidate !== item &&
                candidate.category === category &&
                candidate.documentId === item.documentId &&
                candidate.page === item.page &&
                words(candidate.location ?? "") === words(item.location ?? ""),
            ),
          )
        ),
    )
    .slice(0, 150);
  result.summary = summary;
  result.duplicatesReduced = reduced;
  return result;
}
