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
};
export type Pricing = {
  materialMarkup: number;
  labourRate: number;
  overhead: number;
  contingency: number;
  hst: number;
};
export type Customer = {
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
  actuals: Actual[];
};
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
  templateCategory?: string;
};
// Reusable estimate payload for future template management; no UI or storage yet.
export type QuoteTemplate = Estimate & {
  id: string;
  name: string;
  category: string;
  description: string;
  terms: string;
};
export type Store = { version: 1; settings: Pricing; quotes: Quote[] };
export const categories = [
  "Subcontractors",
  "Equipment rentals",
  "Dump/disposal fees",
  "Delivery",
  "Permits",
  "Travel",
  "Miscellaneous",
];
export const templates = [
  "Deck",
  "Fence",
  "Framing",
  "Flooring",
  "Drywall",
  "Renovation",
  "Service/maintenance",
];
export const defaults: Pricing = {
  materialMarkup: 0,
  labourRate: 0,
  overhead: 0,
  contingency: 0,
  hst: 13,
};
export const id = () => crypto.randomUUID();
export const money = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    n,
  );
export const round = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export function lineCost(l: Line) {
  return round(l.quantity * l.cost);
}
export function linePrice(l: Line) {
  return round(
    l.override ??
      (l.kind === "Labour"
        ? l.quantity * l.rate
        : l.kind === "Materials"
          ? lineCost(l) * (1 + l.markup / 100)
          : lineCost(l)),
  );
}
export function calculate(e: Estimate) {
  const cost = round(e.lines.reduce((s, l) => s + lineCost(l), 0));
  const base = round(e.lines.reduce((s, l) => s + linePrice(l), 0));
  const overhead = round((base * e.pricing.overhead) / 100),
    contingency = round((base * e.pricing.contingency) / 100);
  const subtotal = round(base + overhead + contingency),
    tax = round((subtotal * e.pricing.hst) / 100),
    profit = round(subtotal - cost);
  return {
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
  const e = calculate(q.job?.snapshot ?? q);
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
    unit: kind === "Labour" ? "hours" : "each",
    cost: 0,
    rate: p.labourRate,
    markup: p.materialMarkup,
    override: null,
    category: categories[0],
  };
}
export function newQuote(settings: Pricing, quotes: Quote[]): Quote {
  return {
    id: id(),
    number: `BW-${String(Math.max(1000, ...quotes.map((q) => Number(q.number.split("-")[1]) || 1000)) + 1)}`,
    date: new Date().toISOString().slice(0, 10),
    expiry: "",
    status: "Draft",
    customer: { name: "", phone: "", email: "", address: "" },
    name: "",
    description: "",
    measurements: "",
    notes: "",
    photos: [],
    lines: [],
    pricing: { ...settings },
    terms:
      "Quote subject to written acceptance. Changes to the agreed scope require a revised quote. Payment terms to be agreed before work begins.",
    mode: "Simplified",
  };
}
export function validate(q: Quote): string | null {
  if (!q.customer.name.trim() || !q.name.trim())
    return "Add a customer name and job name before saving.";
  if (q.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.customer.email))
    return "Enter a valid email address.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) return "Enter a quote date.";
  if (q.expiry && q.expiry < q.date)
    return "Expiry must be on or after the quote date.";
  if (
    q.lines.some(
      (l) =>
        !l.description.trim() ||
        [l.quantity, l.cost, l.rate, l.markup, l.override ?? 0].some(
          (n) => !Number.isFinite(n) || n < 0,
        ),
    )
  )
    return "Every line needs a description and non-negative numeric values.";
  if (Object.values(q.pricing).some((n) => !Number.isFinite(n) || n < 0))
    return "Pricing percentages and rates must be non-negative.";
  return null;
}
export function convert(q: Quote): Quote {
  if (q.status !== "Accepted" || q.job)
    throw new Error("Only accepted quotes can be converted once.");
  return {
    ...q,
    job: {
      snapshot: structuredClone({ lines: q.lines, pricing: q.pricing }),
      convertedAt: new Date().toISOString(),
      actuals: [],
    },
  };
}
export function duplicate(q: Quote, quotes: Quote[]): Quote {
  return {
    ...structuredClone(q),
    ...newQuote(q.pricing, quotes),
    customer: structuredClone(q.customer),
    name: `${q.name} (copy)`,
    description: q.description,
    measurements: q.measurements,
    lines: structuredClone(q.lines).map((l) => ({ ...l, id: id() })),
    terms: q.terms,
    templateCategory: q.templateCategory,
    job: undefined,
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
    quotes.push(q);
  });
  return { version: 1, settings: { ...defaults }, quotes };
}
const key = "backwoods-quotes-v1";
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
    ])
  );
}
function line(v: unknown) {
  return (
    record(v) &&
    strings(v, ["id", "description", "unit", "category"]) &&
    ["Labour", "Materials", "Other Costs"].includes(String(v.kind)) &&
    numbers(v, ["quantity", "cost", "rate", "markup"]) &&
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
    !Array.isArray(v.photos) ||
    !v.photos.every(
      (p) =>
        typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(p),
    ) ||
    !estimate(v)
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
export function load(): Store {
  const raw = localStorage.getItem(key);
  if (!raw) return seed();
  const parsed: unknown = JSON.parse(raw);
  if (
    !record(parsed) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.quotes) ||
    !parsed.quotes.every(quote) ||
    !pricing(parsed.settings)
  )
    throw new Error("Saved data is not a supported Backwoods file.");
  return parsed as Store;
}
export function persist(store: Store) {
  localStorage.setItem(key, JSON.stringify(store));
}
