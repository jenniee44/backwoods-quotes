import { loadPdfSource, extractPdfText } from "./pdfSource";
import { id, type Quote, type TakeoffItem } from "./model";

type Rule = { category: string; description: string; regex: RegExp };
const rules: Rule[] = [
  { category: "Joists", description: "Pressure-treated joists", regex: /\b2\s*[x×]\s*6\s*(?:PT|PRESSURE[ -]?TREATED)?\s*(?:DECK\s*)?JOISTS?\b/i },
  { category: "Beams", description: "Built-up pressure-treated beam (verify assembly)", regex: /\b3\s*PLY\s*2\s*[x×]\s*10\s*PT\b/i },
  { category: "Ledger", description: "Pressure-treated ledger", regex: /\b2\s*[x×]\s*6\s*(?:PT|PF)?\s*LEDGER\b/i },
  { category: "Hangers / connectors", description: "Simpson LUS26 joist hanger or equivalent", regex: /\bLUS\s*26\b/i },
  { category: "Posts", description: "Pressure-treated 6x6 post", regex: /\b6\s*[x×]\s*6\s*PT\s*POST\b/i },
  { category: "Structural fasteners", description: "GRK RSS ledger structural screws", regex: /\bGRK\s*RSS\b/i },
  { category: "Footings / concrete", description: "Helical pile foundation option", regex: /\bHELICAL\s*PILE\b/i },
  { category: "Blocking", description: "Railing connection blocking", regex: /\bBLOCKING\s+TO\s+SUIT\s+RAILING\b/i },
  { category: "Guards / railings", description: "Exterior deck guard (scope to confirm)", regex: /\b(?:DECK|EXTERIOR)\s*GUARD\b/i },
  { category: "Stairs / stringers", description: "Stair specification (geometry missing)", regex: /\b(?:ALL\s+STAIRS|STAIR\s+STRINGER|STAIR\s+TREADS?)\b/i },
];

// OCR often separates construction callouts and replaces × with X, spaces or punctuation.
// Only use a material-specific word alongside a size/specification, never a
// bare number or generic word like "beam" as a purchasing fact.
export function normalizedMaterialLabelText(text: string): string {
  return text.toUpperCase()
    .replace(/[×*]/g, "X")
    .replace(/(\d)\s*[X]\s*(\d)/g, "$1X$2")
    .replace(/[_|:;,]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function proposePdfTextMaterials(
  q: Quote, sources: {documentId: string; name: string; page: number; text: string}[]
): Quote {
  const existing = new Set(q.takeoff.filter(i => i.analysisSourceKey?.startsWith("local-pdf-text:"))
    .map(i => [i.documentId, i.page, i.category].join("|")));
  const proposed: TakeoffItem[] = [];
  for (const source of sources) {
    const normalized = normalizedMaterialLabelText(source.text);
    for (const rule of rules) {
      const match = normalized.match(rule.regex);
      if (!match) continue;
      const key = [source.documentId, source.page, rule.category].join("|");
      if (existing.has(key)) continue;
      existing.add(key);
      proposed.push({
        id: id(),
        description: rule.description,
        category: rule.category,
        quantity: null,
        unit: "unverified",
        documentId: source.documentId,
        page: source.page,
        notes: "Found written specification in attached PDF text. Not a purchasing quantity. Drawing context, scope and count require manual review.",
        status: "Proposed",
        confidence: "Low",
        destination: "Materials",
        classification: "Contractor input required",
        assumptions: ["Local selectable-text recognition, not AI, geometry takeoff or OCR"],
        warnings: ["Counts and purchase lengths not extracted", "Verify whether the item is new work, existing or by others"],
        sourceDocumentName: source.name,
        sourceFacts: [normalized.slice(Math.max(0, (match.index ?? 0)-55), (match.index ?? 0)+match[0].length+55)],
        scopeVerified: false,
        purchaseVerified: false,
        conflictsVerified: false,
        included: false,
        analysisSourceKey: "local-pdf-text:" + key,
      });
    }
  }
  return proposed.length ? {...q, takeoff:[...q.takeoff,...proposed]} : q;
}

export type PdfMaterialScanResult = {
  quote: Quote;
  pdfCount: number;
  pagesRead: number;
  pagesWithText: number;
  textCharacters: number;
  matchesAdded: number;
};
export async function scanAttachedPdfTextWithReport(q: Quote): Promise<PdfMaterialScanResult> {
  if (q.status !== "Draft" || q.job) throw new Error("Only draft quotes can add proposed material observations.");
  const docs=q.documents.filter(d => d.type==="application/pdf");
  if(!docs.length) throw new Error("Attach a PDF drawing to scan for selectable material labels.");
  const sources: {documentId:string;name:string;page:number;text:string}[]=[];
  for (const doc of docs) {
    const task=await loadPdfSource(doc.data);
    try {
      const pdf=await task.promise;
      if(pdf.numPages>50) throw new Error("Use PDFs of 50 pages or fewer.");
      const layer=await extractPdfText(pdf);
      for (const page of layer.pages) {
        sources.push({documentId:doc.id,name:doc.name,page:page.page,text:page.text});
      }
    } finally {await task.destroy();}
  }
  const next=proposePdfTextMaterials(q,sources);
  return {
    quote: next,
    pdfCount: docs.length,
    pagesRead: sources.length,
    pagesWithText: sources.filter(p => p.text.trim().length > 0).length,
    textCharacters: sources.reduce((n,p) => n+p.text.length,0),
    matchesAdded: next.takeoff.length-q.takeoff.length,
  };
}
export async function scanAttachedPdfText(q: Quote): Promise<Quote> {
  return (await scanAttachedPdfTextWithReport(q)).quote;
}
