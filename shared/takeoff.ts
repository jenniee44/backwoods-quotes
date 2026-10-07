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
  if (/post|beam/.test(description)) return "Posts & Beams";
  if (
    /hanger|connector|fastener|ledger fastening|post base|post cap/.test(
      description,
    )
  )
    return "Hardware & Connectors";
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
    words(item.unit),
  ]);
}
const metadataDescription =
  /^(?:\d+\s+)?(?:drawing (?:sheet(?: (?:identifier|number))?|number|identifier)|sheet (?:identifier|number)|(?:number of )?elevation views?|(?:presence of (?:a |the )?)?framing plan(?: present)?|(?:visible )?(?:support|post|footing)(?:\s*\/\s*\w+)* locations?)$/i;
const trade =
  /^(Plumbing|Electrical|HVAC|Drywall|Painting|Tiling|Roofing|Excavation|Concrete \/ Masonry)$/i;
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
  const retained: AnalysisSuggestion[] = [];
  let reduced = result.duplicatesReduced ?? 0;
  for (const item of result.suggestions) {
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
        item.subcontractorBasis !== "Not established" &&
        /\bby[- ]others\b|\bsubcontract(?:ed|or)\b/i.test(evidence) &&
        !/\b(?:no|not|without)\b[^.;\n]{0,45}\b(?:by[- ]others|subcontract(?:ed|or|ing)?)\b/i.test(
          evidence,
        );
      const separateTrade = trade.test(item.category ?? "");
      if (!byOthers && !separateTrade) {
        item.destination = /labour|labor|assembly|installation|install\b/i.test(
          item.description,
        )
          ? "Labour"
          : "Materials";
        item.category = "Miscellaneous";
        item.subcontractorBasis = "Not established";
        item.warnings.push(
          "Subcontracting is not established by the plan. Confirm who performs this scope.",
        );
      } else if (!byOthers) {
        item.subcontractorBasis = "Separate trade suggestion";
        item.warnings.push(
          "Separate trade is an estimating suggestion; contractor must confirm subcontracting.",
        );
      }
    }
    // Drawing metadata belongs in summary, not the conversion queue. Keep its
    // source and count as an observation, never reinterpret a count as material.
    if (
      item.itemRole === "Document observation" ||
      item.itemRole === "Supporting evidence" ||
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
    if (item.destination !== "Informational")
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
  result.suggestions = retained;
  result.summary = summary;
  result.duplicatesReduced = reduced;
  return result;
}
