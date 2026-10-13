import type { AnalysisDocument, PlanAnalysisResult } from "../shared/analysis";
import { normalizeSpecification } from "../shared/componentIdentity";
import { evidenceScope } from "../shared/componentIdentity";
import { drawingMeasurements } from "../shared/constructionMeasurements";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Exact written input arithmetic only. Results are proposals, never verification. */
export function derivePurchaseQuantities(
  result: PlanAnalysisResult,
  documents: AnalysisDocument[],
) {
  const next = structuredClone(result);
  for (const t of next.suggestions) {
    if (
      t.destination !== "Materials" ||
      evidenceScope(t) !== "New work" ||
      !t.location?.trim() ||
      !t.specification?.trim() ||
      !!t.assumptions?.length ||
      /conflict|unreadable|uncertain|alternative|unknown/i.test(
        [t.specification, t.notes, ...(t.warnings ?? [])].join(" "),
      )
    )
      continue;
    if (t.quantity !== null && !/^(?:beam )?runs?$/i.test(t.unit)) continue;
    const document = documents.find((d) => d.id === t.documentId);
    const linkedPages = new Set<number>(t.page ? [t.page] : []);
    // Consolidated observations retain explicit page provenance. Read inputs
    // across those pages only, never from unrelated locations elsewhere in a PDF.
    for (const fact of t.sourceFacts ?? []) {
      const reference = fact.match(
        /^(?:Source|Submitted source): ([^,]+), page (\d+)/,
      );
      if (reference?.[1] === t.documentId)
        linkedPages.add(Number(reference[2]));
    }
    const pages =
      document?.pdfText?.pages.filter(
        (p) => p.status === "Available" && linkedPages.has(p.page),
      ) ?? [];
    if (!pages.length) continue;
    const facts = (t.sourceFacts ?? []).filter(
      (f) =>
        pages.some((page) => norm(page.text).includes(norm(f))) &&
        norm(f).includes(norm(t.location!)) &&
        !/approx|assum|unreadable|existing|by others|unknown|conflict/i.test(f),
    );
    const text = facts.join("; ");
    if (
      /\b(?:except|unless|assumed|unverified)\b|\bnot\s+(?:uniform|continuous|unspliced|both ends|same connection)|\bnon[- ]uniform\b/i.test(
        text,
      )
    )
      continue;
    if (
      !normalizeSpecification(text).includes(
        normalizeSpecification(t.specification),
      )
    )
      continue;
    const number = (label: string) => {
      const values = [
        ...text.matchAll(
          new RegExp(
            "\\b" + label + "\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)\\b(?![./])",
            "gi",
          ),
        ),
      ].map((m) => Number(m[1]));
      return values.length && new Set(values).size === 1 ? values[0] : null;
    };
    const feet = (label: string) => {
      const inputs = facts.flatMap((f) =>
        [
          ...f.matchAll(
            new RegExp("\\b" + label + "\\s*[:=]\\s*([^;,\\n]+)", "gi"),
          ),
        ].flatMap((m) => {
          const written = m[1]
            .trim()
            .replace(/¼/g, " 1/4")
            .replace(/½/g, " 1/2")
            .replace(/¾/g, " 3/4")
            .replace(/[–−]/g, "-");
          if (!/^\d/.test(written)) return [];
          const measurements = drawingMeasurements({
            ...t,
            sourceFacts: [written],
          });
          // The entire labelled dimension must parse. A readable feet prefix
          // must not silently discard inches, fractions or ambiguous qualifiers.
          return measurements.length === 1 &&
            measurements[0].written.trim() === written
            ? [measurements[0].inches / 12]
            : [];
        }),
      );
      return inputs.length && new Set(inputs).size === 1 ? inputs[0] : null;
    };
    let quantity: number | null = null,
      formula = "",
      unit = "each";
    if (/hangers?|fasteners?|screws?|bolts?/i.test(t.description)) {
      const count = number("connection count"),
        per = number(
          /hanger/i.test(t.description)
            ? "hangers per connection"
            : "fasteners per connection",
        );
      if (
        count !== null &&
        per !== null &&
        Number.isInteger(count) &&
        Number.isInteger(per) &&
        /same connection type|uniform connections/i.test(text)
      ) {
        quantity = count * per;
        formula = `Connections ${count} × specified pieces per connection ${per} = ${quantity}. No connections inferred from joist counts.`;
      }
    } else if (/beam/i.test(t.description)) {
      const count = number("beam count"),
        plies = number("plies"),
        length = feet("beam length"),
        stock = feet("stock length");
      if (count !== null && t.quantity !== null && t.quantity !== count) {
        const warning = `Conflicting beam count: AI proposed ${t.quantity} ${t.unit}, but matching written input states ${count} beam runs. Contractor reconciliation required.`;
        // Keep the original observation instead of choosing either count.
        if (
          (t.sourceFacts?.length ?? 0) < 20 &&
          (t.warnings?.length ?? 0) < 20
        ) {
          t.sourceFacts = [...(t.sourceFacts ?? []), warning];
          t.warnings = [...(t.warnings ?? []), warning];
          t.quantity = null;
          t.quantityMethod = "Unknown";
          t.classification = "Contractor input required";
          t.confidence = "Low";
        }
        continue;
      }
      if (
        count !== null &&
        (t.quantity === null || t.quantity === count) &&
        plies !== null &&
        Number(t.specification.match(/(\d+)[ -]*(?:ply|plies)/i)?.[1]) ===
          plies &&
        length !== null &&
        stock !== null &&
        stock >= length &&
        Number.isInteger(count) &&
        Number.isInteger(plies) &&
        /continuous unspliced|unspliced continuous/i.test(text)
      ) {
        quantity = count * plies;
        unit = "boards";
        formula = `${count} separate beam runs × ${plies} plies × 1 continuous stock piece = ${quantity} boards; written beam length ${length} ft, selected stock ${stock} ft. No splice, offcut reuse or waste assumed.`;
      }
    } else if (/joists?/i.test(t.description)) {
      const layout = feet("layout length"),
        spacing = number("spacing inches"),
        member = feet("joist length"),
        stock = feet("stock length");
      if (
        layout !== null &&
        spacing !== null &&
        spacing > 0 &&
        /uniform layout/i.test(text) &&
        /both ends included/i.test(text) &&
        /no openings/i.test(text)
      ) {
        quantity = Math.ceil((layout * 12) / spacing) + 1;
        const purchasable =
          member !== null && stock !== null && stock >= member;
        unit = purchasable ? "boards" : "joist locations";
        formula =
          `ceil(${layout} ft × 12 / ${spacing} inches) + 1 = ${quantity} joist positions; both ends included, no openings. ` +
          (purchasable
            ? `Continuous member ${member} ft, suitable selected stock ${stock} ft.`
            : "Installed count only; member/stock length needs contractor verification before purchasing.") +
          " No extra trimmers, blocking or waste assumed.";
      }
    }
    if (
      quantity === null ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 1_000_000
    )
      continue;
    t.quantity = quantity;
    t.unit = unit;
    t.quantityMethod = "Calculated";
    t.classification = "Calculated quantity";
    t.confidence = "Medium";
    const inputPages = pages
      .filter((p) => facts.some((f) => norm(p.text).includes(norm(f))))
      .map((p) => p.page);
    t.calculationBasis =
      formula + " Written input page(s): " + inputPages.join(", ") + ".";
    t.warnings = [
      ...new Set([
        ...(t.warnings ?? []),
        "Proposed from exact written drawing inputs; contractor must verify assembly boundaries, stock and connections before approval. No waste allowance included.",
      ]),
    ];
  }
  return next;
}
