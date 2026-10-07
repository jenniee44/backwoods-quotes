import {
  validConstructionEvidence,
  validContractorSummary,
} from "../shared/analysis";
import type {
  ConstructionEvidence,
  ContractorSummary,
} from "../shared/analysis";
export type Role = "Admin/Owner" | "Estimator";
export type Status = "Draft" | "Sent" | "Accepted" | "Completed";
export type Kind = "Labour" | "Materials" | "Other Costs";
export type Line = {
  id: string;
  kind: Kind;
  description: string;
  quantity: number;
  unit: string;
  cost: number;
  rate: number;
  markup: number;
  override: number | null;
  category: string;
  waste?: number;
  scopeGroup?: string;
  takeoffId?: string;
  pricingRequired?: boolean;
  takeoffSource?: ConstructionEvidence & {
    classification?: TakeoffItem["classification"];
    assumptions?: string[];
    warnings?: string[];
    documentName: string;
    page: number | null;
    quantity: number;
    unit: string;
    notes: string;
    confidence: TakeoffItem["confidence"];
  };
  inheritCost?: boolean;
  inheritRate?: boolean;
  inheritMarkup?: boolean;
  supplier?: string;
  sku?: string;
  materialNotes?: string;
};
export type Pricing = {
  materialMarkup: number;
  labourRate: number;
  overhead: number;
  contingency: number;
  hst: number;
  internalLabourCost?: number;
  otherMarkup?: number;
  targetMargin?: number;
  validityDays?: number;
};
export type CompanyInfo = {
  name: string;
  phone: string;
  email: string;
  address: string;
};
export const companyDefaults: CompanyInfo = {
  name: "Backwoods Building & Maintenance",
  phone: "",
  email: "",
  address: "",
};
export type CustomerScope = {
  label: string;
  description: string;
  sourceGroups: string[];
};
export type Customer = {
  mailingAddress?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};
export type Estimate = { lines: Line[]; pricing: Pricing };
export type Actual = {
  id: string;
  description: string;
  category: string;
  quantity: number;
  cost: number;
};
export type Job = {
  snapshot: Estimate;
  convertedAt: string;
  changeOrders?: ChangeOrder[];
  workflowStage?: WorkflowStage;
  actuals: Actual[];
};
export type WorkflowStage =
  | "Lead"
  | "Draft Quote"
  | "Sent"
  | "Accepted"
  | "Scheduled"
  | "In Progress"
  | "Completed"
  | "Paid";
// Future approval workflow: separate contract adjustments never rewrite the accepted snapshot.
export type ChangeOrder = {
  id: string;
  description: string;
  subtotal: number;
  hst: number;
  status: "Draft" | "Approved" | "Rejected";
  approvedAt?: string;
};
export function changeOrderTotals(order: ChangeOrder) {
  const tax = round((order.subtotal * order.hst) / 100);
  return { subtotal: order.subtotal, tax, total: round(order.subtotal + tax) };
}
export type Quote = {
  id: string;
  number: string;
  date: string;
  expiry: string;
  status: Status;
  customer: Customer;
  name: string;
  description: string;
  measurements: string;
  notes: string;
  photos: string[];
  lines: Line[];
  pricing: Pricing;
  terms: string;
  mode: "Simplified" | "Detailed";
  job?: Job;
  company?: CompanyInfo;
  customerScopes?: CustomerScope[];
  templateCategory?: string;
  appliedTemplateIds?: string[];
  snapshot?: Estimate;
  scopeGroups?: string[];
  sentAt?: string;
  details: QuoteDetails;
  documents: PlanDocument[];
  takeoff: TakeoffItem[];
  analysisReports?: {
    id: string;
    fingerprint: string;
    createdAt: string;
    summary?: ContractorSummary;
    duplicatesReduced?: number;
    sourceDocuments?: { id: string; name: string }[];
    project?: {
      projectType: string;
      drawingTitle: string;
      drawingNumbers: string[];
      revision: string;
      date: string;
      description: string;
    };
    dimensions?: import("../shared/analysis").AnalysisSuggestion[];
    assumptions: string[];
    warnings: string[];
  }[];
};
export type QuoteDetails = {
  showQuantities: boolean;
  showLabourHours: boolean;
  groupLines: boolean;
  terms: string;
  payment: string;
  assumptions: string;
  exclusions: string;
  changeOrders: string;
  timeline: string;
  permits: string;
  engineering: string;
  exposeContingency?: boolean;
};
export type PlanDocument = {
  id: string;
  name: string;
  type: string;
  data: string;
  addedAt: string;
};
export type TakeoffItem = ConstructionEvidence & {
  id: string;
  description: string;
  quantity: number | null;
  unit: string;
  documentId: string;
  page: number | null;
  notes: string;
  status: "Proposed" | "Reviewed" | "Approved" | "Rejected";
  confidence: "Unspecified" | "Low" | "Medium" | "High";
  convertedLineId?: string;
  origin?: "ai";
  category?: string;
  destination?: import("../shared/analysis").AnalysisSuggestion["destination"];
  classification?: import("../shared/analysis").AnalysisSuggestion["classification"];
  assumptions?: string[];
  warnings?: string[];
  analysisId?: string;
  analysisSourceKey?: string;
  reviewAcknowledged?: boolean;
  sourceDocumentName?: string;
};
export type QuoteTemplate = {
  id: string;
  name: string;
  category: string;
  groups: string[];
  lines: Pick<
    Line,
    "kind" | "description" | "unit" | "scopeGroup" | "category"
  >[];
  details?: Partial<QuoteDetails>;
  customerScopes?: CustomerScope[];
};
export type Store = {
  version: 2;
  pricingRevision?: 3;
  company?: CompanyInfo;
  settings: Pricing;
  quoteDefaults: QuoteDetails;
  quotes: Quote[];
  // Independent job records retained when their originating quote is deleted.
  jobs?: Quote[];
  lastQuoteNumber?: number;
};
export const detailDefaults: QuoteDetails = {
  showQuantities: false,
  showLabourHours: false,
  groupLines: true,
  terms:
    "Quote subject to written acceptance. Changes to the agreed scope require a revised quote.",
  payment: "",
  assumptions: "",
  exclusions: "",
  changeOrders:
    "Changes to the agreed scope require a written change order, including any price and timeline adjustments, approved before additional work begins.",
  timeline: "",
  permits: "",
  engineering: "",
};
export const detailLabels: Record<
  Exclude<
    keyof QuoteDetails,
    "showQuantities" | "showLabourHours" | "groupLines" | "exposeContingency"
  >,
  string
> = {
  terms: "Terms & Conditions",
  payment: "Payment / deposit schedule",
  assumptions: "Assumptions",
  exclusions: "Exclusions",
  changeOrders: "Change-order language",
  timeline: "Estimated project timeline",
  permits: "Permit responsibility",
  engineering: "Engineering responsibility",
};
export const units = [
  "each",
  "allowance",
  "sq. ft.",
  "linear ft.",
  "board",
  "sheet",
  "bag",
  "bundle",
  "box",
  "roll",
  "cubic yard",
  "hour",
  "day",
];
export const scopeGroups = [
  "Demolition & Site Preparation",
  "Footings & Structure",
  "Decking",
  "Railings & Stairs",
  "Finishing & Cleanup",
  "Project Costs",
];
export const deckTemplate: QuoteTemplate = {
  id: "deck",
  name: "Deck",
  category: "Deck",
  groups: scopeGroups,
  lines: [
    {
      kind: "Labour",
      description: "Demolition and site preparation",
      unit: "hour",
      scopeGroup: scopeGroups[0],
      category: "Miscellaneous",
    },
    {
      kind: "Materials",
      description: "Footings and structural lumber",
      unit: "each",
      scopeGroup: scopeGroups[1],
      category: "Miscellaneous",
    },
    {
      kind: "Labour",
      description: "Footings and framing labour",
      unit: "hour",
      scopeGroup: scopeGroups[1],
      category: "Miscellaneous",
    },
    {
      kind: "Materials",
      description: "Deck boards",
      unit: "board",
      scopeGroup: scopeGroups[2],
      category: "Miscellaneous",
    },
    {
      kind: "Materials",
      description: "Railings and stair materials",
      unit: "each",
      scopeGroup: scopeGroups[3],
      category: "Miscellaneous",
    },
    {
      kind: "Labour",
      description: "Decking, railings and stair installation",
      unit: "hour",
      scopeGroup: scopeGroups[3],
      category: "Miscellaneous",
    },
    {
      kind: "Labour",
      description: "Finishing and site cleanup",
      unit: "hour",
      scopeGroup: scopeGroups[4],
      category: "Miscellaneous",
    },
    {
      kind: "Other Costs",
      description: "Disposal allowance",
      unit: "allowance",
      scopeGroup: scopeGroups[5],
      category: "Dump / Disposal Fees",
    },
  ],
};
export function templateApplied(q: Quote, template: QuoteTemplate): boolean {
  if (q.appliedTemplateIds?.includes(template.id)) return true;
  // Older V2 quotes have no application history. Recognize a complete matching
  // catalog by stable descriptions/groups, even when quantities were edited.
  return (
    template.lines.length > 0 &&
    template.lines.every((suggestion) =>
      q.lines.some(
        (line) =>
          line.kind === suggestion.kind &&
          line.description === suggestion.description &&
          line.scopeGroup === suggestion.scopeGroup,
      ),
    )
  );
}
export function applyTemplate(q: Quote, template: QuoteTemplate): Quote {
  if (q.status !== "Draft") throw new Error("Only drafts can use templates.");
  if (templateApplied(q, template)) return q;
  return {
    ...q,
    appliedTemplateIds: [...(q.appliedTemplateIds ?? []), template.id],
    templateCategory: template.category,
    customerScopes: [
      ...(q.customerScopes ?? []),
      ...structuredClone(template.customerScopes ?? []).filter(
        (scope) =>
          !q.customerScopes?.some((existing) => existing.label === scope.label),
      ),
    ],
    scopeGroups: [...new Set([...(q.scopeGroups ?? []), ...template.groups])],
    terms: template.details?.terms ?? q.terms,
    details: { ...q.details, ...template.details },
    lines: [
      ...q.lines,
      ...template.lines.map((l) => ({
        ...newLine(l.kind, q.pricing),
        ...l,
        quantity: 0,
        cost: 0,
        rate: 0,
        markup: 0,
      })),
    ],
  };
}
export const categories = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Drywall",
  "Painting",
  "Tiling",
  "Roofing",
  "Excavation",
  "Concrete / Masonry",
  "Other Subcontractor",
  "Equipment Rental",
  "Dump / Disposal Fees",
  "Delivery",
  "Permit",
  "Engineering",
  "Travel",
  "Miscellaneous",
];
export function normalizeCategory(
  category: string,
  description = "",
  scopeGroup = "",
): string {
  const aliases: Record<string, string> = {
    Subcontractor: "Other Subcontractor",
    Subcontractors: "Other Subcontractor",
    Equipment: "Equipment Rental",
    "Equipment rentals": "Equipment Rental",
    Disposal: "Dump / Disposal Fees",
    "Dump/disposal fees": "Dump / Disposal Fees",
    Permits: "Permit",
    Plumber: "Plumbing",
    Electrician: "Electrical",
  };
  const mapped = aliases[category] ?? category;
  if (mapped !== "Other Subcontractor") return mapped;
  const text = `${scopeGroup} ${description}`;
  const trades: [string, RegExp][] = [
    ["Plumbing", /\b(plumbing|plumber)\b/i],
    ["Electrical", /\b(electrical|electrician)\b/i],
    ["HVAC", /\b(hvac|heating|ventilation)\b/i],
    ["Drywall", /\bdrywall\b/i],
    ["Painting", /\b(painting|painter)\b/i],
    ["Tiling", /\b(tiling|tile)\b/i],
    ["Roofing", /\b(roofing|roofer)\b/i],
    ["Excavation", /\b(excavation|excavator)\b/i],
    ["Concrete / Masonry", /\b(concrete|masonry|mason)\b/i],
  ];
  const matches = trades.filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : mapped;
}
function normalizeStoreCategories(store: Store): Store {
  for (const q of [...store.quotes, ...(store.jobs ?? [])]) {
    for (const estimate of [q, q.snapshot, q.job?.snapshot]) {
      estimate?.lines.forEach((line) => {
        if (line.kind === "Other Costs")
          line.category = normalizeCategory(
            line.category,
            line.description,
            line.scopeGroup,
          );
      });
    }
    q.job?.actuals.forEach((actual) => {
      actual.category = normalizeCategory(actual.category, actual.description);
    });
  }
  store.lastQuoteNumber = quoteNumberHighWater(store);
  return store;
}
export const templates = [
  "Deck",
  "Fence",
  "Framing",
  "Flooring",
  "Drywall",
  "Renovation",
  "Service/maintenance",
  "Garages",
  "Additions",
  "Sheds",
  "Interior finishing",
  "Cottage repairs",
];
export const defaults: Pricing = {
  materialMarkup: 0,
  labourRate: 0,
  overhead: 0,
  contingency: 0,
  hst: 13,
  internalLabourCost: 0,
  otherMarkup: 0,
  targetMargin: 0,
  validityDays: 0,
};
export const id = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  // LAN HTTP previews on iPhone lack randomUUID's secure-context requirement.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    n,
  );
export const round = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export function purchaseQuantity(l: Line) {
  return l.kind === "Materials"
    ? l.quantity * (1 + (l.waste ?? 0) / 100)
    : l.quantity;
}
export function effectiveLine(l: Line, p?: Pricing): Line {
  if (!p) return l;
  return {
    ...l,
    cost:
      l.kind === "Labour" && l.inheritCost
        ? (p.internalLabourCost ?? 0)
        : l.cost,
    rate: l.inheritRate ? p.labourRate : l.rate,
    markup: l.inheritMarkup
      ? l.kind === "Other Costs"
        ? (p.otherMarkup ?? 0)
        : p.materialMarkup
      : l.markup,
  };
}
export function lineCost(l: Line, p?: Pricing) {
  return round(purchaseQuantity(l) * effectiveLine(l, p).cost);
}
export function linePrice(l: Line, p?: Pricing) {
  l = effectiveLine(l, p);
  return round(
    l.override ??
      (l.kind === "Labour"
        ? l.quantity * l.rate
        : lineCost(l) * (1 + l.markup / 100)),
  );
}
export function calculate(e: Estimate) {
  const cost = round(e.lines.reduce((s, l) => s + lineCost(l, e.pricing), 0));
  const base = round(e.lines.reduce((s, l) => s + linePrice(l, e.pricing), 0));
  const overhead = round((base * e.pricing.overhead) / 100),
    contingency = round((base * e.pricing.contingency) / 100);
  const subtotal = round(base + overhead + contingency),
    tax = round((subtotal * e.pricing.hst) / 100),
    profit = round(subtotal - cost);
  const byKind = (kind: Kind, fn: (l: Line) => number) =>
    round(
      e.lines.filter((l) => l.kind === kind).reduce((sum, l) => sum + fn(l), 0),
    );
  // Target margin is profit / revenue, not cost markup. Round UP to avoid missing target by a cent.
  const target = e.pricing.targetMargin ?? 0;
  return {
    labourCost: byKind("Labour", (l) => lineCost(l, e.pricing)),
    materialCost: byKind("Materials", (l) => lineCost(l, e.pricing)),
    otherCost: byKind("Other Costs", (l) => lineCost(l, e.pricing)),
    labourPrice: byKind("Labour", (l) => linePrice(l, e.pricing)),
    materialPrice: byKind("Materials", (l) => linePrice(l, e.pricing)),
    otherPrice: byKind("Other Costs", (l) => linePrice(l, e.pricing)),
    breakEven: cost,
    targetMargin: target,
    targetPrice:
      target >= 100
        ? null
        : Math.ceil((cost / (1 - target / 100)) * 100 - 1e-8) / 100,
    belowTarget: (subtotal ? (profit / subtotal) * 100 : 0) < target,
    cost,
    base,
    overhead,
    contingency,
    subtotal,
    tax,
    total: round(subtotal + tax),
    profit,
    margin: subtotal ? (profit / subtotal) * 100 : 0,
  };
}
export function jobTotals(q: Quote) {
  const e = calculate(estimateFor(q));
  const actual = round(
    q.job?.actuals.reduce((s, a) => s + round(a.quantity * a.cost), 0) ?? 0,
  );
  return {
    ...e,
    actual,
    actualProfit: round(e.subtotal - actual),
    actualMargin: e.subtotal ? ((e.subtotal - actual) / e.subtotal) * 100 : 0,
    variance: round(actual - e.cost),
  };
}
export function newLine(kind: Kind, p: Pricing): Line {
  return {
    id: id(),
    kind,
    description: "",
    quantity: 1,
    unit:
      kind === "Labour"
        ? "hours"
        : kind === "Other Costs"
          ? "allowance"
          : "each",
    cost: kind === "Labour" ? (p.internalLabourCost ?? 0) : 0,
    rate: p.labourRate,
    markup: kind === "Other Costs" ? (p.otherMarkup ?? 0) : p.materialMarkup,
    waste: 0,
    scopeGroup: "",
    override: null,
    category: kind === "Other Costs" ? "Other Subcontractor" : "Miscellaneous",
    inheritCost: kind === "Labour",
    inheritRate: kind === "Labour",
    inheritMarkup: kind !== "Labour",
  };
}
export function newQuote(
  settings: Pricing,
  quotes: Quote[],
  options: QuoteDetails = detailDefaults,
  company: CompanyInfo = companyDefaults,
  lastQuoteNumber = 1000,
): Quote {
  const date = new Date().toLocaleDateString("en-CA");

  return {
    id: id(),
    number: `BW-${String(Math.max(1000, lastQuoteNumber, ...quotes.map((q) => Number(q.number.split("-")[1]) || 1000)) + 1)}`,
    date,
    expiry: expiryFor(date, settings.validityDays ?? 0),
    scopeGroups: [],
    company: structuredClone(company),
    details: structuredClone(options),
    documents: [],
    takeoff: [],
    status: "Draft",
    customer: { name: "", phone: "", email: "", address: "" },
    name: "",
    description: "",
    measurements: "",
    notes: "",
    photos: [],
    lines: [],
    pricing: { ...settings },
    terms: options.terms,
    mode: "Simplified",
  };
}
export function validate(q: Quote): string | null {
  const paymentProblem = paymentError(q.details.payment);
  if (paymentProblem) return paymentProblem;
  if (q.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.customer.email))
    return "Enter a valid email address.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) return "Enter a quote date.";
  if (q.expiry && q.expiry < q.date)
    return "Expiry must be on or after the quote date.";
  if (
    q.lines.some((l) =>
      [
        l.quantity,
        l.cost,
        l.rate,
        l.markup,
        l.waste ?? 0,
        l.override ?? 0,
      ].some((n) => !Number.isFinite(n) || n < 0),
    )
  )
    return "Every line needs non-negative numeric values.";
  if (Object.values(q.pricing).some((n) => !Number.isFinite(n) || n < 0))
    return "Pricing percentages and rates must be non-negative.";
  if (!Number.isInteger(q.pricing.validityDays ?? 0))
    return "Quote validity days must be a whole number.";
  if ((q.pricing.targetMargin ?? 0) >= 100)
    return "Target margin must be less than 100%.";
  if (
    q.takeoff.some(
      (t) =>
        (t.quantity !== null &&
          (!Number.isFinite(t.quantity) || t.quantity < 0)) ||
        (t.page !== null && (!Number.isInteger(t.page) || t.page < 1)),
    )
  )
    return "Takeoff quantities must be non-negative and page numbers must be positive whole numbers.";
  return null;
}
export function convert(q: Quote): Quote {
  if (q.status !== "Accepted" || q.job)
    throw new Error("Only accepted quotes can be converted once.");
  return {
    ...q,
    job: {
      snapshot: structuredClone(estimateFor(q)),
      convertedAt: new Date().toISOString(),
      actuals: [],
    },
  };
}
export function duplicate(
  q: Quote,
  quotes: Quote[],
  lastQuoteNumber = 1000,
): Quote {
  return {
    ...structuredClone(q),
    ...newQuote(q.pricing, quotes, q.details, q.company, lastQuoteNumber),
    customer: structuredClone(q.customer),
    name: `${q.name} (copy)`,
    description: q.description,
    measurements: q.measurements,
    lines: structuredClone(q.lines).map((l) => ({ ...l, id: id() })),
    terms: q.terms,
    templateCategory: q.templateCategory,
    customerScopes: structuredClone(q.customerScopes ?? []),
    company: structuredClone(q.company ?? companyDefaults),
    job: undefined,
    sentAt: undefined,
    scopeGroups: [...(q.scopeGroups ?? [])],
    appliedTemplateIds: [...(q.appliedTemplateIds ?? [])],
    snapshot: undefined,
  };
}
export function seed(): Store {
  const quotes: Quote[] = [];
  const examples = [
    ["Morgan Ellis", "Cedar deck rebuild", "Draft"],
    ["Jamie Chen", "Backyard privacy fence", "Sent"],
    ["Alex Rivera", "Basement framing", "Accepted"],
  ] as const;
  examples.forEach(([name, job, status], i) => {
    const q = newQuote(defaults, quotes);
    q.customer = {
      name,
      phone: "555-010" + i,
      email: `customer${i + 1}@example.com`,
      address: `${20 + i * 12} Cedar Lane, Ontario`,
    };
    q.name = job;
    q.status = status;
    q.description = [
      "Remove existing decking and install new cedar boards, rails and steps.",
      "Supply and install a wood privacy fence with one gate.",
      "Frame basement partitions and prepare openings for doors.",
    ][i];
    q.pricing = {
      ...defaults,
      materialMarkup: 15,
      labourRate: 75,
      overhead: 5,
      contingency: 3,
      hst: 13,
    };
    q.lines = [
      {
        ...newLine("Labour", q.pricing),
        description: "Construction labour",
        quantity: 40 + i * 8,
        cost: 35,
      },
      {
        ...newLine("Materials", q.pricing),
        description: "Lumber and fasteners",
        quantity: 40 + i * 10,
        cost: 18,
      },
    ];
    q.lines = q.lines.map((l) => ({
      ...l,
      inheritCost: false,
      inheritRate: false,
      inheritMarkup: false,
    }));
    if (q.status !== "Draft")
      q.snapshot = structuredClone({ lines: q.lines, pricing: q.pricing });
    quotes.push(q);
  });
  return {
    version: 2,
    pricingRevision: 3,
    settings: { ...defaults },
    quoteDefaults: { ...detailDefaults },
    quotes,
  };
}

function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function strings(v: Record<string, unknown>, keys: string[]) {
  return keys.every((k) => typeof v[k] === "string");
}
function numbers(v: Record<string, unknown>, keys: string[]) {
  return keys.every(
    (k) =>
      typeof v[k] === "number" &&
      Number.isFinite(v[k]) &&
      (v[k] as number) >= 0,
  );
}
function pricing(v: unknown) {
  return (
    record(v) &&
    numbers(v, [
      "materialMarkup",
      "labourRate",
      "overhead",
      "contingency",
      "hst",
    ]) &&
    numbers(
      v,
      [
        "internalLabourCost",
        "otherMarkup",
        "targetMargin",
        "validityDays",
      ].filter((k) => k in v),
    ) &&
    (typeof v.targetMargin !== "number" || v.targetMargin < 100) &&
    (typeof v.validityDays !== "number" || Number.isInteger(v.validityDays))
  );
}
function validPrivateEvidence(v: Record<string, unknown>) {
  return (
    (v.classification === undefined ||
      [
        "Plan fact",
        "Calculated quantity",
        "Estimating suggestion",
        "Contractor input required",
      ].includes(String(v.classification))) &&
    ["assumptions", "warnings"].every(
      (key) =>
        v[key] === undefined ||
        (Array.isArray(v[key]) &&
          (v[key] as unknown[]).every((text) => typeof text === "string")),
    )
  );
}
function line(v: unknown) {
  return (
    record(v) &&
    strings(v, ["id", "description", "unit", "category"]) &&
    ["Labour", "Materials", "Other Costs"].includes(String(v.kind)) &&
    numbers(v, [
      "quantity",
      "cost",
      "rate",
      "markup",
      ...("waste" in v ? ["waste"] : []),
    ]) &&
    ["inheritCost", "inheritRate", "inheritMarkup"].every(
      (k) => v[k] === undefined || typeof v[k] === "boolean",
    ) &&
    (v.takeoffSource === undefined ||
      (record(v.takeoffSource) &&
        strings(v.takeoffSource, ["documentName", "unit", "notes"]) &&
        validConstructionEvidence(v.takeoffSource) &&
        validPrivateEvidence(v.takeoffSource) &&
        numbers(v.takeoffSource, ["quantity"]) &&
        (v.takeoffSource.page === null ||
          (typeof v.takeoffSource.page === "number" &&
            Number.isInteger(v.takeoffSource.page) &&
            v.takeoffSource.page > 0)) &&
        ["Unspecified", "Low", "Medium", "High"].includes(
          String(v.takeoffSource.confidence),
        ))) &&
    ["scopeGroup", "supplier", "sku", "materialNotes"].every(
      (k) => v[k] === undefined || typeof v[k] === "string",
    ) &&
    (v.override === null ||
      (typeof v.override === "number" &&
        Number.isFinite(v.override) &&
        v.override >= 0))
  );
}
function estimate(v: unknown) {
  return (
    record(v) &&
    Array.isArray(v.lines) &&
    v.lines.every(line) &&
    pricing(v.pricing)
  );
}
function quote(v: unknown) {
  if (
    !record(v) ||
    !strings(v, [
      "id",
      "number",
      "date",
      "expiry",
      "name",
      "description",
      "measurements",
      "notes",
      "terms",
    ]) ||
    !["Draft", "Sent", "Accepted", "Completed"].includes(String(v.status)) ||
    !["Simplified", "Detailed"].includes(String(v.mode)) ||
    !record(v.customer) ||
    !strings(v.customer, ["name", "phone", "email", "address"]) ||
    (v.customer.mailingAddress !== undefined &&
      typeof v.customer.mailingAddress !== "string") ||
    !Array.isArray(v.photos) ||
    !v.photos.every(
      (p) =>
        typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(p),
    ) ||
    !estimate(v) ||
    (v.scopeGroups !== undefined &&
      (!Array.isArray(v.scopeGroups) ||
        !v.scopeGroups.every((g) => typeof g === "string"))) ||
    (v.appliedTemplateIds !== undefined &&
      (!Array.isArray(v.appliedTemplateIds) ||
        !v.appliedTemplateIds.every((id) => typeof id === "string"))) ||
    (v.company !== undefined &&
      (!record(v.company) ||
        !strings(v.company, ["name", "phone", "email", "address"]))) ||
    (v.customerScopes !== undefined &&
      (!Array.isArray(v.customerScopes) ||
        !v.customerScopes.every(
          (scope) =>
            record(scope) &&
            strings(scope, ["label", "description"]) &&
            Array.isArray(scope.sourceGroups) &&
            scope.sourceGroups.every((g) => typeof g === "string"),
        ))) ||
    (v.sentAt !== undefined && typeof v.sentAt !== "string")
  )
    return false;
  if (v.job !== undefined) {
    if (
      !record(v.job) ||
      typeof v.job.convertedAt !== "string" ||
      !estimate(v.job.snapshot) ||
      !Array.isArray(v.job.actuals) ||
      !v.job.actuals.every(
        (a) =>
          record(a) &&
          strings(a, ["id", "description", "category"]) &&
          numbers(a, ["quantity", "cost"]),
      )
    )
      return false;
  }
  return true;
}
export function estimateFor(q: Quote): Estimate {
  return q.job?.snapshot ?? q.snapshot ?? q;
}
export function markSent(q: Quote): Quote {
  if (q.status !== "Draft") throw new Error("Only draft quotes can be sent.");
  return {
    ...q,
    status: "Sent",
    sentAt: new Date().toISOString(),
    snapshot: structuredClone({ lines: q.lines, pricing: q.pricing }),
  };
}
export function reviewWarnings(q: Quote): string[] {
  const warnings: string[] = [];
  if (!q.customer.name.trim()) warnings.push("Missing customer name");
  if (!q.name.trim()) warnings.push("Missing job name");
  if (!q.description.trim()) warnings.push("Missing scope of work");
  if (!q.lines.some((l) => l.kind === "Labour"))
    warnings.push("No labour lines");
  if (!q.lines.some((l) => l.kind === "Materials"))
    warnings.push("No materials lines");
  if (!q.lines.length || q.lines.some((l) => linePrice(l, q.pricing) === 0))
    warnings.push("Zero selling-price lines or no estimate lines");
  if (q.lines.some((l) => !l.description.trim()))
    warnings.push("Estimate lines missing descriptions");
  if (calculate(q).belowTarget)
    warnings.push("Expected gross margin is below target");
  if (!q.details.payment.trim())
    warnings.push("Missing payment / deposit schedule");
  if (!q.expiry) warnings.push("Missing quote expiry");
  return warnings;
}
export function takeoffToLine(q: Quote, item: TakeoffItem, kind: Kind): Quote {
  if (
    q.status !== "Draft" ||
    !(
      item.status === "Approved" ||
      (item.status === "Reviewed" && item.origin !== "ai")
    ) ||
    item.convertedLineId
  )
    throw new Error(
      "Review the takeoff item before converting it once into a draft estimate.",
    );
  if (
    item.origin === "ai" &&
    kind !==
      (item.destination === "Subcontractor" ? "Other Costs" : item.destination)
  )
    throw new Error(
      "Convert to the reviewed destination, or edit and reapprove the item.",
    );
  const stored = q.takeoff.find((t) => t.id === item.id);
  if (
    !stored ||
    stored.convertedLineId ||
    JSON.stringify(stored) !== JSON.stringify(item)
  )
    throw new Error(
      "This takeoff has changed or was already converted. Review the current item.",
    );
  if (
    item.quantity === null ||
    !Number.isFinite(item.quantity) ||
    item.quantity < 0
  )
    throw new Error(
      "Enter and verify the quantity before approval/conversion.",
    );
  if (
    item.origin === "ai" &&
    (!item.reviewAcknowledged || item.destination === "Informational")
  )
    throw new Error(
      "Verify the proposed item and its destination before conversion.",
    );
  if (!item.description.trim()) throw new Error("Add a takeoff description.");
  const l = {
    ...newLine(kind, q.pricing),
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    takeoffId: item.id,
    pricingRequired:
      kind !== "Labour" ||
      !q.pricing.labourRate ||
      !q.pricing.internalLabourCost,
    ...(kind === "Other Costs"
      ? {
          category: normalizeCategory(
            item.category ?? "Other Subcontractor",
            item.description,
          ),
        }
      : {}),
    takeoffSource: {
      documentName:
        q.documents.find((d) => d.id === item.documentId)?.name ??
        item.sourceDocumentName ??
        "Source drawing unavailable",
      page: item.page,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes,
      confidence: item.confidence,
      scopeGroup: item.scopeGroup,
      specification: item.specification,
      location: item.location,
      sourceFacts: structuredClone(item.sourceFacts ?? []),
      calculationBasis: item.calculationBasis,
      quantityMethod: item.quantityMethod,
      itemRole: item.itemRole,
      subcontractorBasis: item.subcontractorBasis,
      classification: item.classification,
      assumptions: structuredClone(item.assumptions ?? []),
      warnings: structuredClone(item.warnings ?? []),
    },
  };
  return {
    ...q,
    lines: [...q.lines, l],
    takeoff: q.takeoff.map((t) =>
      t.id === item.id ? { ...t, convertedLineId: l.id } : t,
    ),
  };
}
function upgradePricing(p: Pricing): Pricing {
  return { ...defaults, ...p };
}
function upgradeLine(l: Line): Line {
  return {
    ...l,
    inheritCost: false,
    inheritRate: false,
    inheritMarkup: false,
    waste: l.waste ?? 0,
    scopeGroup: l.scopeGroup ?? "",
    markup: l.kind === "Other Costs" ? 0 : l.markup,
  };
}
function upgradeEstimate(e: Estimate): Estimate {
  return {
    lines: e.lines.map(upgradeLine),
    pricing: upgradePricing(e.pricing),
  };
}
function validDetails(v: unknown) {
  return (
    record(v) &&
    (v.exposeContingency === undefined ||
      typeof v.exposeContingency === "boolean") &&
    strings(v, Object.keys(detailLabels)) &&
    ["showQuantities", "showLabourHours", "groupLines"].every(
      (k) => typeof v[k] === "boolean",
    )
  );
}
function validExtensions(v: unknown) {
  if (
    !record(v) ||
    !validDetails(v.details) ||
    !Array.isArray(v.documents) ||
    !Array.isArray(v.takeoff)
  )
    return false;
  if (v.snapshot !== undefined && !estimate(v.snapshot)) return false;
  if (
    !v.documents.every(
      (d) =>
        record(d) &&
        strings(d, ["id", "name", "type", "data", "addedAt"]) &&
        ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
          String(d.type),
        ) &&
        String(d.data).startsWith(`data:${d.type};base64,`),
    )
  )
    return false;
  if (
    !v.takeoff.every(
      (t) =>
        record(t) &&
        strings(t, ["id", "description", "unit", "documentId", "notes"]) &&
        validConstructionEvidence(t) &&
        (t.quantity === null || numbers(t, ["quantity"])) &&
        (t.page === null ||
          (typeof t.page === "number" &&
            Number.isInteger(t.page) &&
            t.page >= 1)) &&
        ["Proposed", "Reviewed", "Approved", "Rejected"].includes(
          String(t.status),
        ) &&
        ["Unspecified", "Low", "Medium", "High"].includes(
          String(t.confidence),
        ) &&
        (t.origin === undefined || t.origin === "ai") &&
        (t.reviewAcknowledged === undefined ||
          typeof t.reviewAcknowledged === "boolean") &&
        [
          "category",
          "analysisId",
          "analysisSourceKey",
          "sourceDocumentName",
        ].every((key) => t[key] === undefined || typeof t[key] === "string") &&
        ["assumptions", "warnings"].every(
          (key) =>
            t[key] === undefined ||
            (Array.isArray(t[key]) &&
              (t[key] as unknown[]).every((text) => typeof text === "string")),
        ) &&
        (t.destination === undefined ||
          [
            "Labour",
            "Materials",
            "Subcontractor",
            "Other Costs",
            "Informational",
          ].includes(String(t.destination))) &&
        (t.classification === undefined ||
          [
            "Plan fact",
            "Calculated quantity",
            "Estimating suggestion",
            "Contractor input required",
          ].includes(String(t.classification))) &&
        (t.convertedLineId === undefined ||
          typeof t.convertedLineId === "string"),
    )
  )
    return false;
  if (
    v.analysisReports !== undefined &&
    (!Array.isArray(v.analysisReports) ||
      !v.analysisReports.every(
        (report) =>
          record(report) &&
          strings(report, ["id", "fingerprint", "createdAt"]) &&
          (report.summary === undefined ||
            validContractorSummary(report.summary)) &&
          (report.duplicatesReduced === undefined ||
            (Number.isInteger(report.duplicatesReduced) &&
              Number(report.duplicatesReduced) >= 0)) &&
          (report.sourceDocuments === undefined ||
            (Array.isArray(report.sourceDocuments) &&
              report.sourceDocuments.every(
                (d) => record(d) && strings(d, ["id", "name"]),
              ))) &&
          ["assumptions", "warnings"].every(
            (key) =>
              Array.isArray(report[key]) &&
              (report[key] as unknown[]).every(
                (text) => typeof text === "string",
              ),
          ) &&
          (report.project === undefined ||
            (record(report.project) &&
              strings(report.project, [
                "projectType",
                "drawingTitle",
                "revision",
                "date",
                "description",
              ]) &&
              Array.isArray(report.project.drawingNumbers) &&
              report.project.drawingNumbers.every(
                (text) => typeof text === "string",
              ))) &&
          (report.dimensions === undefined ||
            (Array.isArray(report.dimensions) &&
              report.dimensions.every(
                (d) =>
                  record(d) &&
                  strings(d, ["description", "documentId", "unit", "notes"]) &&
                  validConstructionEvidence(d) &&
                  ["Unspecified", "Low", "Medium", "High"].includes(
                    String(d.confidence),
                  ) &&
                  (d.quantity === null || numbers(d, ["quantity"])) &&
                  (d.page === null ||
                    (typeof d.page === "number" &&
                      Number.isInteger(d.page) &&
                      d.page > 0)),
              ))),
      ))
  )
    return false;
  return true;
}
export function migrate(input: unknown): Store {
  if (
    !record(input) ||
    ![1, 2].includes(input.version as number) ||
    !Array.isArray(input.quotes) ||
    !input.quotes.every(quote) ||
    !pricing(input.settings)
  )
    throw new Error("Saved data is not a supported Backwoods file.");
  if (
    input.company !== undefined &&
    (!record(input.company) ||
      !strings(input.company, ["name", "phone", "email", "address"]))
  )
    throw new Error("Company information is invalid.");
  if (
    input.lastQuoteNumber !== undefined &&
    (!Number.isSafeInteger(input.lastQuoteNumber) ||
      Number(input.lastQuoteNumber) < 1000)
  )
    throw new Error("Saved quote numbering is invalid.");
  if (
    input.jobs !== undefined &&
    (!Array.isArray(input.jobs) ||
      !input.jobs.every(
        (job) => quote(job) && validExtensions(job) && !!job.job,
      ))
  )
    throw new Error("Saved job records are invalid.");
  if (input.version === 2) {
    if (
      !validDetails(input.quoteDefaults) ||
      !input.quotes.every(validExtensions)
    )
      throw new Error("Saved V2 data is invalid.");
    const result = structuredClone(input) as Store;
    if (!result.pricingRevision) {
      result.pricingRevision = 3;
      result.quoteDefaults = {
        ...result.quoteDefaults,
        showQuantities: false,
        showLabourHours: false,
        groupLines: true,
      };
    }
    return normalizeStoreCategories(result);
  }
  const old = structuredClone(input) as unknown as {
    settings: Pricing;
    quotes: Quote[];
  };
  return normalizeStoreCategories({
    version: 2,
    pricingRevision: 3,
    settings: upgradePricing(old.settings),
    quoteDefaults: { ...detailDefaults },
    quotes: old.quotes.map((q) => {
      const e = upgradeEstimate(q);
      const result = {
        ...q,
        ...e,
        details: {
          ...detailDefaults,
          showQuantities: true,
          groupLines: false,
          terms: q.terms,
          changeOrders: "",
        },
        documents: [],
        takeoff: [],
      };
      if (q.job)
        result.job = { ...q.job, snapshot: upgradeEstimate(q.job.snapshot) };
      if (q.status !== "Draft")
        result.snapshot = structuredClone(result.job?.snapshot ?? e);
      return result;
    }),
  });
}
export function quoteNumberHighWater(store: Store): number {
  return Math.max(
    1000,
    store.lastQuoteNumber ?? 1000,
    ...[...store.quotes, ...(store.jobs ?? [])].map((q) => {
      const match = /^BW-(\d+)$/.exec(q.number);
      const value = match ? Number(match[1]) : 1000;
      return Number.isSafeInteger(value) ? value : 1000;
    }),
  );
}
export function deleteQuote(store: Store, quoteId: string): Store {
  const target = store.quotes.find((q) => q.id === quoteId);
  if (!target) throw new Error("This quote no longer exists.");
  const jobs = [...(store.jobs ?? [])];
  if (target.job && !jobs.some((job) => job.id === target.id)) {
    // Explicit job projection: preserve contract context and financial figures,
    // never carry uploaded plans, photos, takeoff, reports or quote-only notes.
    const cleanEstimate = (estimate: Estimate): Estimate => ({
      pricing: structuredClone(estimate.pricing),
      lines: estimate.lines.map((line) => {
        const clean = structuredClone(line);
        delete clean.takeoffSource;
        delete clean.takeoffId;
        return clean;
      }),
    });
    jobs.push({
      id: target.id,
      number: target.number,
      date: target.date,
      expiry: target.expiry,
      status: target.status,
      customer: structuredClone(target.customer),
      name: target.name,
      description: target.description,
      measurements: "",
      notes: "",
      photos: [],
      ...cleanEstimate(target.job.snapshot),
      snapshot: cleanEstimate(target.job.snapshot),
      job: {
        ...structuredClone(target.job),
        snapshot: cleanEstimate(target.job.snapshot),
      },
      terms: target.terms,
      mode: target.mode,
      company: structuredClone(target.company),
      details: structuredClone(target.details),
      customerScopes: structuredClone(target.customerScopes ?? []),
      scopeGroups: [...(target.scopeGroups ?? [])],
      documents: [],
      takeoff: [],
    });
  }
  return {
    ...store,
    lastQuoteNumber: quoteNumberHighWater(store),
    quotes: store.quotes.filter((q) => q.id !== quoteId),
    ...(jobs.length || store.jobs ? { jobs } : {}),
  };
}
// The legacy migration backup can also contain the deleted quote. Redact only
// that record, keeping unrelated backup records. Prepare before any write.
export function persistQuoteDeletion(store: Store, quoteId: string) {
  const oldBackup = localStorage.getItem(backupKey);
  let nextBackup = oldBackup;
  if (oldBackup) {
    const backup = JSON.parse(oldBackup);
    if (!record(backup) || !Array.isArray(backup.quotes))
      throw new Error("The migration backup needs recovery before deletion.");
    if (backup.quotes.some((q) => record(q) && q.id === quoteId))
      nextBackup = JSON.stringify({
        ...backup,
        quotes: backup.quotes.filter((q) => !record(q) || q.id !== quoteId),
      });
  }
  if (nextBackup !== oldBackup && nextBackup !== null)
    localStorage.setItem(backupKey, nextBackup);
  try {
    localStorage.setItem(storageKey, JSON.stringify(store));
  } catch (error) {
    if (nextBackup !== oldBackup && oldBackup !== null)
      localStorage.setItem(backupKey, oldBackup);
    throw error;
  }
}

export const storageKey = "backwoods-quotes-v1"; // Keep original key so deployed V1 browser records are found.
export const backupKey = "backwoods-quotes-v1-backup";
export function load(): Store {
  const raw = localStorage.getItem(storageKey);
  return raw ? migrate(JSON.parse(raw)) : seed();
}
export function persist(store: Store) {
  const old = localStorage.getItem(storageKey);
  if (old && JSON.parse(old).version === 1 && !localStorage.getItem(backupKey))
    localStorage.setItem(backupKey, old);
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function expiryFor(date: string, days: number): string {
  if (!days) return "";
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-CA") : "";
}
export function groupsFor(q: Quote): string[] {
  return [
    ...new Set(
      [
        ...(q.scopeGroups ?? []),
        ...q.lines.map((l) => l.scopeGroup?.trim() ?? ""),
      ].filter(Boolean),
    ),
  ];
}
type SuggestedMaterial = [string, string, string];
function constructionTemplate(
  id: string,
  name: string,
  materials: SuggestedMaterial[],
  trades: string[] = [],
): QuoteTemplate {
  const groups = [
    ...new Set(materials.map(([, , group]) => group)),
    ...trades,
    "Project Costs",
  ];
  return {
    id,
    name,
    category: name,
    groups,
    lines: [
      ...[...new Set(materials.map(([, , group]) => group))].map((group) => ({
        kind: "Labour" as const,
        description: `${group} labour`,
        unit: "hour",
        scopeGroup: group,
        category: "Miscellaneous",
      })),
      ...materials.map(([description, unit, scopeGroup]) => ({
        kind: "Materials" as const,
        description,
        unit,
        scopeGroup,
        category: "Miscellaneous",
      })),
      ...trades.map((group) => ({
        kind: "Other Costs" as const,
        description: `${group} subcontractor allowance`,
        unit: "allowance",
        scopeGroup: group,
        category: normalizeCategory("Other Subcontractor", group),
      })),
      {
        kind: "Other Costs",
        description: "Waste / disposal allowance",
        unit: "allowance",
        scopeGroup: "Project Costs",
        category: "Dump / Disposal Fees",
      },
      {
        kind: "Other Costs",
        description: "Project coordination allowance",
        unit: "allowance",
        scopeGroup: "Project Costs",
        category: "Miscellaneous",
      },
    ],
  };
}
const interiorMaterials: SuggestedMaterial[] = [
  ["Demolition consumables", "allowance", "Site Preparation"],
  ["Wall framing lumber", "linear ft.", "Framing"],
  ["Insulation", "sq. ft.", "Insulation"],
  ["Vapour barrier", "sq. ft.", "Insulation"],
  ["Drywall", "sheets", "Drywall"],
  ["Flooring", "sq. ft.", "Flooring"],
  ["Interior doors", "each", "Finish Carpentry"],
  ["Baseboard / trim", "linear ft.", "Finish Carpentry"],
  ["Paint", "gallon", "Painting"],
  [
    "Fasteners / adhesives / miscellaneous materials",
    "allowance",
    "Finish Carpentry",
  ],
];
export const bathroomCustomerScopes: CustomerScope[] = [
  {
    label: "Demolition & Preparation",
    description:
      "Protect work area, complete specified demolition and prepare the space for construction.",
    sourceGroups: ["Bathroom Preparation"],
  },
  {
    label: "Framing & Wall Preparation",
    description:
      "Complete specified framing/blocking, floor preparation, wall-board installation and surface preparation.",
    sourceGroups: [
      "Framing & Blocking",
      "Floor Preparation",
      "Drywall & Wall Preparation",
    ],
  },
  {
    label: "Waterproofing & Tile",
    description:
      "Prepare specified wet areas and install waterproofing, tile, grout and related finishes.",
    sourceGroups: ["Waterproofing", "Tiling"],
  },
  {
    label: "Fixtures & Finishes",
    description:
      "Install specified fixtures and trim, paint and complete sealing and finishing work.",
    sourceGroups: [
      "Fixtures",
      "Trim & Finishing",
      "Painting",
      "Sealing & Caulking",
    ],
  },
  {
    label: "Mechanical Trades",
    description:
      "Electrical, plumbing and HVAC work as specified in the project scope.",
    sourceGroups: ["Electrical", "Plumbing", "HVAC"],
  },
  {
    label: "Cleanup & Completion",
    description:
      "Construction cleanup, disposal and final project checks as specified.",
    sourceGroups: ["Final Cleanup & Checks", "Project Costs"],
  },
];

function bathroomTemplate(): QuoteTemplate {
  const template = constructionTemplate(
    "bathroom",
    "Bathroom Renovation",
    [
      [
        "Bathroom demolition / protection consumables",
        "allowance",
        "Bathroom Preparation",
      ],
      ["Framing / blocking lumber", "linear ft.", "Framing & Blocking"],
      [
        "Subfloor / floor preparation materials",
        "sq. ft.",
        "Floor Preparation",
      ],
      ["Drywall / suitable wall board", "sheets", "Drywall & Wall Preparation"],
      [
        "Joint compound / tape / wall preparation supplies",
        "allowance",
        "Drywall & Wall Preparation",
      ],
      ["Waterproofing membrane", "sq. ft.", "Waterproofing"],
      ["Tile", "sq. ft.", "Tiling"],
      ["Tile adhesive / grout", "allowance", "Tiling"],
      ["Vanity and fixtures", "each", "Fixtures"],
      ["Shower / tub enclosure and accessories", "each", "Fixtures"],
      ["Baseboard / trim", "linear ft.", "Trim & Finishing"],
      ["Bathroom primer / paint", "gallon", "Painting"],
      ["Sealants / caulking", "allowance", "Sealing & Caulking"],
      ["Cleanup consumables", "allowance", "Final Cleanup & Checks"],
    ],
    ["Electrical", "Plumbing", "HVAC"],
  );
  const descriptions: Record<string, string> = {
    "Bathroom Preparation": "Site protection / bathroom demolition labour",
    "Drywall & Wall Preparation": "Drywall / board installation labour",
    "Final Cleanup & Checks":
      "Final cleanup / fixture checks / deficiency review labour",
  };
  template.lines = template.lines.map((line) =>
    line.kind === "Labour"
      ? {
          ...line,
          description: descriptions[line.scopeGroup ?? ""] ?? line.description,
        }
      : line,
  );
  template.lines.push({
    kind: "Labour",
    description: "Drywall taping / sanding / wall preparation labour",
    unit: "hour",
    scopeGroup: "Drywall & Wall Preparation",
    category: "Miscellaneous",
  });
  template.customerScopes = structuredClone(bathroomCustomerScopes);
  return template;
}
export const constructionTemplates: QuoteTemplate[] = [
  deckTemplate,
  constructionTemplate("renovation", "Basement Renovation", interiorMaterials, [
    "Electrical",
    "Plumbing",
  ]),
  bathroomTemplate(),
  constructionTemplate(
    "kitchen",
    "Kitchen Renovation",
    [
      ["Kitchen demolition consumables", "allowance", "Kitchen Preparation"],
      ["Cabinets", "linear ft.", "Cabinetry"],
      ["Countertops", "sq. ft.", "Countertops"],
      ["Backsplash tile", "sq. ft.", "Backsplash"],
      ["Kitchen flooring", "sq. ft.", "Flooring"],
    ],
    ["Electrical", "Plumbing"],
  ),
  constructionTemplate("framing", "Framing / Carpentry", [
    ["Structural framing lumber", "linear ft.", "Framing"],
    ["Sheathing", "sheets", "Sheathing"],
    ["Connectors / fasteners", "allowance", "Framing"],
  ]),
  constructionTemplate(
    "addition",
    "Addition",
    [
      ["Foundation materials", "allowance", "Foundation"],
      ["Addition framing lumber", "linear ft.", "Framing"],
      ["Roofing", "sq. ft.", "Roofing"],
      ["Exterior cladding", "sq. ft.", "Exterior"],
      ["Interior drywall", "sheets", "Interior"],
    ],
    ["Excavation", "Electrical", "Plumbing", "HVAC"],
  ),
  constructionTemplate(
    "interior",
    "Interior Renovation",
    interiorMaterials.filter(([, , group]) => group !== "Insulation"),
    ["Electrical"],
  ),
  constructionTemplate("exterior", "Exterior / Siding", [
    ["Siding", "sq. ft.", "Siding"],
    ["House wrap", "sq. ft.", "Weather Protection"],
    ["Exterior trim", "linear ft.", "Exterior Trim"],
    ["Flashing", "linear ft.", "Weather Protection"],
  ]),
  constructionTemplate("repairs", "Repairs & Maintenance", [
    ["Repair materials", "allowance", "Repairs"],
    ["Maintenance consumables", "allowance", "Maintenance"],
  ]),
  constructionTemplate("fence", "Fence", [
    ["Fence posts", "each", "Posts & Footings"],
    ["Fence boards", "each", "Fence Panels"],
    ["Gate hardware", "each", "Gates"],
  ]),
  constructionTemplate("garage", "Garage / Shed", [
    ["Garage foundation materials", "allowance", "Foundation"],
    ["Garage framing lumber", "linear ft.", "Framing"],
    ["Garage roofing", "sq. ft.", "Roofing"],
    ["Garage doors", "each", "Doors & Exterior"],
  ]),
  {
    id: "blank",
    name: "Custom / Blank Quote",
    category: "Custom",
    groups: [],
    lines: [],
  },
];
export function responsibilityText(
  kind: "permits" | "engineering",
  value: string,
): string {
  const v = value.trim();
  if (!v) return "";
  if (v.length < 60 && !/[.!?]/.test(v)) {
    const subject =
      kind === "permits"
        ? "required permits and associated fees"
        : "required engineering services and associated fees";
    return `Unless specifically included in the scope above, ${subject} are the responsibility of ${/^(the |a |an )/i.test(v) ? v : `the ${v}`}.`;
  }
  return v;
}

export function paymentError(text: string): string | null {
  const percentages = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)].map(
    (match) => Number(match[1]),
  );
  if (!percentages.length) return null;
  if (percentages.some((n) => n < 0 || n > 100))
    return "Payment percentages must be between 0% and 100%.";
  const total = percentages.reduce((sum, n) => sum + n, 0);
  return Math.abs(total - 100) < 0.01
    ? null
    : `Payment percentages must total 100% (currently ${round(total)}%).`;
}
