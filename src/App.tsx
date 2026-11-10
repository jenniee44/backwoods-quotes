import { removeQuoteImages } from "./analysisImageArchive";
import { useState, useEffect, useRef } from "react";
import CustomerScopeEditor from "./CustomerScopeEditor";
import CustomerQuote from "./CustomerQuote";
import NumberInput from "./NumberInput";
import LineEditor from "./LineEditor";
import QuoteDetailsEditor from "./QuoteDetailsEditor";
import PlansTakeoff, { type PdfOrientations } from "./PlansTakeoff";
import QuoteReview from "./QuoteReview";
import { generatePreliminaryBudget, preliminaryBudgetAlreadyExists } from "./preliminaryBudget";
import { buildMaterialEvidence } from "./materialEvidenceSummary";
import { cowanTrial, cowanBeamLinearFeet, isCowanOriginalPlanTrial, cowanTrialPileLine, hasCowanTrialPiles, applyCowanTrialPiles } from "./cowanTrial";
import { cowanLayout, cowanQuantityScenario } from "./cowanQuantityScenario";
import {
  TreePine,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  Settings,
  LayoutDashboard,
  FileText,
  BriefcaseBusiness,
  Check,
  Trash2,
  Copy,
  Printer,
  Camera,
  X,
  Menu,
} from "lucide-react";
import {
  deleteQuote,
  persistQuoteDeletion,
  quoteNumberHighWater,
  calculate,
  companyDefaults,
  paymentError,
  estimateFor,
  applyTemplate,
  templateApplied,
  constructionTemplates,
  expiryFor,
  markSent,
  categories,
  convert,
  duplicate,
  id,
  jobTotals,
  load,
  money,
  newQuote,
  persist,
  seed,
  templates,
  validate,
} from "./model";
import type { Quote, Role, Store, Pricing, Kind, Actual } from "./model";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
const priceLabels: Record<keyof Pricing, string> = {
  materialMarkup: "Material markup (%)",
  labourRate: "Customer labour rate ($/hour)",
  overhead: "General overhead & profit adjustment (%)",
  contingency: "Contingency (%)",
  hst: "HST (%)",
  internalLabourCost: "Internal labour cost ($/hour)",
  otherMarkup: "Other Costs / subcontractor markup (%)",
  targetMargin: "Target minimum gross margin (%)",
  validityDays: "Default quote validity (days)",
};
function PricingFields({
  value,
  onChange,
  disabled = false,
  company = false,
}: {
  value: Pricing;
  onChange: (p: Pricing) => void;
  company?: boolean;
  disabled?: boolean;
}) {
  const fields = (keys: (keyof Pricing)[]) => (
    <div className="fields">
      {keys.map((k) => (
        <Field key={k} label={priceLabels[k]}>
          <NumberInput
            step="1"
            value={value[k]}
            disabled={disabled}
            onChange={(n) => onChange({ ...value, [k]: n })}
          />
        </Field>
      ))}
    </div>
  );
  const normal = [
    "labourRate",
    "materialMarkup",
    "otherMarkup",
    "overhead",
    "contingency",
    "hst",
    "targetMargin",
  ] as (keyof Pricing)[];
  return (
    <>
      {fields(
        company ? (Object.keys(priceLabels) as (keyof Pricing)[]) : normal,
      )}
      <p className="muted">
        Material and subcontractor markup apply to their own internal line
        costs. General overhead &amp; profit adjustment and contingency each
        apply independently to the sum of line selling prices, not to each
        other. HST applies to the resulting subtotal. Target margin is advisory.
      </p>
      {!company && (
        <details className="advanced-pricing">
          <summary>Advanced pricing</summary>
          {fields(["internalLabourCost", "validityDays"])}
        </details>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export default function App() {
  // View-only state; never written to quote storage or customer documents.
  const [pdfOrientations, setPdfOrientations] = useState<PdfOrientations>({});
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [initial] = useState(() => {
    try {
      return { store: load(), error: "" };
    } catch (e) {
      return {
        store: seed(),
        error: `Could not read saved data: ${(e as Error).message}. Your stored data has not been overwritten. Reload after restoring your browser data.`,
      };
    }
  });
  const [store, setStore] = useState<Store>(initial.store),
    [error, setError] = useState(initial.error),
    [notice, setNotice] = useState(""),
    [saveState, setSaveState] = useState("Saved");
  const [role, setRole] = useState<Role>("Admin/Owner"),
    [page, setPage] = useState("Overview"),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Quote | null>(null),
    [preview, setPreview] = useState<Quote | null>(null),
    [tab, setTab] = useState("Customer & job"),
    [mobileMenu, setMobileMenu] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [quoteDefaults, setQuoteDefaults] = useState(store.quoteDefaults);
  const [advancedEditor, setAdvancedEditor] = useState(false);
  const [company, setCompany] = useState(store.company ?? companyDefaults);
  const [settings, setSettings] = useState(store.settings),
    [actual, setActual] = useState<Actual>({
      id: id(),
      description: "",
      category: "Labour",
      quantity: 1,
      cost: 0,
    });
  function saveStore(next: Store): boolean {
    next = { ...next, lastQuoteNumber: quoteNumberHighWater(next) };
    if (initial.error) {
      setError("Saved data needs recovery before changes can be stored.");
      return false;
    }
    try {
      persist(next);
      setStore(next);
      setError("");
      return true;
    } catch {
      setError(
        "Could not save. Browser storage may be full or unavailable. Reduce photo sizes or free browser storage, then try again.",
      );
      return false;
    }
  }
  function saveQuote(q: Quote, close = false, silent = false) {
    setSaveState("Saving…");
    const problem = validate(q);
    if (problem) {
      setError(problem);
      setSaveState("Save failed");
      return false;
    }
    const storedJob = store.jobs?.find((x) => x.id === q.id);
    const stored = store.quotes.find((x) => x.id === q.id) ?? storedJob;
    if (
      stored &&
      stored.status !== "Draft" &&
      JSON.stringify({
        lines: q.lines,
        pricing: q.pricing,
        customer: q.customer,
        name: q.name,
        description: q.description,
        terms: q.terms,
        details: q.details,
        customerScopes: q.customerScopes,
        company: q.company,
        date: q.date,
        expiry: q.expiry,
      }) !==
        JSON.stringify({
          lines: stored.lines,
          pricing: stored.pricing,
          customer: stored.customer,
          name: stored.name,
          description: stored.description,
          terms: stored.terms,
          details: stored.details,
          customerScopes: stored.customerScopes,
          company: stored.company,
          date: stored.date,
          expiry: stored.expiry,
        })
    ) {
      setError(
        "This historical quote is locked. Duplicate it to revise the estimate.",
      );
      setSaveState("Save failed");
      return false;
    }
    const exists = !!stored;
    if (
      saveStore({
        ...store,
        ...(storedJob
          ? { jobs: store.jobs!.map((x) => (x.id === q.id ? q : x)) }
          : {}),
        quotes: storedJob
          ? store.quotes
          : exists
            ? store.quotes.map((x) => (x.id === q.id ? q : x))
            : [q, ...store.quotes],
      })
    ) {
      setSaveState("Saved");
      if (!silent) setNotice("Saved on this device");
      if (close) setEditing(null);
      // Autosave must not replace newer editor state (e.g. a just-read upload).
      else if (!silent) setEditing(q);
      return true;
    }
    setSaveState("Save failed");
    return false;
  }
  const storeRef = useRef(store);
  storeRef.current = store;
  useEffect(() => {
    if (
      !editing ||
      initial.error ||
      JSON.stringify(editing) ===
        JSON.stringify(
          [...storeRef.current.quotes, ...(storeRef.current.jobs ?? [])].find(
            (q) => q.id === editing.id,
          ),
        )
    )
      return;
    setSaveState("Saving…");
    const timer = setTimeout(() => saveQuote(editing, false, true), 600);
    return () => clearTimeout(timer);
  }, [editing, initial.error]);
  function navigate(p: string, f = "All") {
    if (
      editing &&
      JSON.stringify(editing) !==
        JSON.stringify(
          [...store.quotes, ...(store.jobs ?? [])].find(
            (q) => q.id === editing.id,
          ),
        ) &&
      !confirm("Leave the quote editor? Unsaved changes will be lost.")
    )
      return;
    setEditing(null);
    setReviewing(false);
    setPreview(null);
    setPage(p);
    setFilter(f);
    setMobileMenu(false);
    setError(initial.error);
  }
  function removeQuote() {
    if (!editing || !store.quotes.some((q) => q.id === editing.id)) return;
    if (initial.error) {
      setError("Saved data needs recovery before deletion.");
      return;
    }
    const target = store.quotes.find((q) => q.id === editing.id)!;
    if (
      !confirm(
        `Permanently delete quote ${target.number} — ${target.customer.name || "Customer not added"} / ${target.name || "Untitled project"}?\n\nThis deletes the quote, attachments and plan/takeoff analysis from this device. Deletion cannot be undone.${target.job ? "\n\nThe existing job, original estimate and actual costs will be preserved separately." : ""}`,
      )
    )
      return;
    try {
      const next = deleteQuote(storeRef.current, target.id);
      persistQuoteDeletion(next, target.id);
      void removeQuoteImages(target.id).then((ok) => {
        if (!ok)
          setNotice(
            "Quote deleted; private analysis-image cleanup could not be verified because browser storage is unavailable. Retry when storage access is restored or clear this site’s browser data.",
          );
      });
      setStore(next);
      setEditing(null);
      setPreview(null);
      setReviewing(false);
      setPdfOrientations((previous) => {
        const next = { ...previous };
        for (const document of target.documents) delete next[document.id];
        return next;
      });
      setPage("Quotes");
      setFilter("All");
      setSearch("");
      setError("");
      setNotice(
        `Quote ${target.number} deleted permanently.${target.job ? " Its job was preserved in Jobs." : ""}`,
      );
    } catch {
      setError(
        "Could not delete the quote. Check browser storage and backup data, then try again.",
      );
    }
  }
  function create() {
    setEditing(
      newQuote(
        store.settings,
        store.quotes,
        store.quoteDefaults,
        store.company ?? companyDefaults,
        quoteNumberHighWater(store),
      ),
    );
    setTab("Customer & job");
    setSelectedTemplate("");
    setNotice("");
    setError(initial.error);
  }
  const active = store.quotes.filter(
    (q) => q.status === "Draft" || q.status === "Sent",
  );
  const accepted = [...store.quotes, ...(store.jobs ?? [])].filter(
    (q) => q.status === "Accepted",
  );
  const listed = (
    page === "Jobs" ? [...store.quotes, ...(store.jobs ?? [])] : store.quotes
  ).filter(
    (q) =>
      (filter === "All" || q.status === filter) &&
      `${q.name} ${q.customer.name} ${q.number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = editing;
  const retainedJob =
    !!current && !!store.jobs?.some((job) => job.id === current.id);
  const locked =
    !!current &&
    (!!current.job ||
      current.status === "Sent" ||
      current.status === "Accepted" ||
      current.status === "Completed");
  const totals = current ? calculate(estimateFor(current)) : null;
  function patch(p: Partial<Quote>) {
    if (current)
      setEditing((previous) =>
        previous?.id === current.id ? { ...previous, ...p } : previous,
      );
    setNotice("");
  }
  async function photos(files: FileList | null) {
    if (!files || !current) return;
    try {
      if (current.photos.length + files.length > 8)
        throw new Error("Keep up to 8 photos per quote.");
      const images = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(
                  file.type,
                ) ||
                file.size > 700000
              ) {
                reject(
                  new Error(
                    "Use JPEG, PNG or WebP photos smaller than 700 KB.",
                  ),
                );
                return;
              }
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("Unable to read photo."));
              reader.readAsDataURL(file);
            }),
        ),
      );
      patch({ photos: [...current.photos, ...images] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function addActual() {
    if (!current?.job) return;
    if (
      !actual.description.trim() ||
      ![actual.quantity, actual.cost].every((n) => Number.isFinite(n) && n >= 0)
    ) {
      setError(
        "Enter an actual cost description and non-negative hours/quantity and unit cost.",
      );
      return;
    }
    const q = {
      ...current,
      job: {
        ...current.job,
        actuals: [...current.job.actuals, { ...actual, id: id() }],
      },
    };
    if (saveQuote(q))
      setActual({
        id: id(),
        description: "",
        category: "Labour",
        quantity: 1,
        cost: 0,
      });
  }
  const nav = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Quotes", icon: FileText },
    { name: "Jobs", icon: BriefcaseBusiness },
    { name: "Settings", icon: Settings },
  ];
  return (
    <>
      <div className={`shell ${preview ? "printing" : ""}`}>
        <aside className={mobileMenu ? "sidebar open" : "sidebar"}>
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              navigate("Overview");
            }}
          >
            <div className="brand-mark">
              <TreePine size={26} />
            </div>
            <div>
              BACKWOODS<small>QUOTES & JOBS</small>
            </div>
          </a>
          <div className="workspace-label">YOUR WORKSPACE</div>
          <nav>
            {nav
              .filter((n) => n.name !== "Settings" || role === "Admin/Owner")
              .map((n) => (
                <button
                  key={n.name}
                  className={page === n.name ? "nav-item selected" : "nav-item"}
                  onClick={() =>
                    navigate(n.name, n.name === "Jobs" ? "Accepted" : "All")
                  }
                >
                  <n.icon size={19} />
                  {n.name}
                  {n.name === "Quotes" && <span>{active.length}</span>}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-pill">
              <span /> Local development
            </div>
            <p>
              Fictional sample data.
              <br />
              Changes stay in this browser.
            </p>
            <label className="role-picker">
              Development role
              <select
                aria-label="Development role"
                value={role}
                onChange={(e) => {
                  const r = e.target.value as Role;
                  setRole(r);
                  if (r === "Estimator" && page === "Settings")
                    navigate("Overview");
                }}
              >
                <option>Admin/Owner</option>
                <option>Estimator</option>
              </select>
            </label>
            <div className="profile">
              <div className="avatar">BW</div>
              <div>
                Backwoods team<small>{role}</small>
              </div>
            </div>
          </div>
        </aside>
        <div className="content">
          <header className="topbar">
            <button
              className="icon mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu />
            </button>
            <span>Backwoods Building & Maintenance</span>
            <span className="top-tag">ESTIMATING WORKSPACE</span>
          </header>
          <main>
            {error && (
              <div className="alert" role="alert">
                {error}
                <button
                  className="icon"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                <Check size={16} />
                {notice}
              </div>
            )}
            {current ? (
              <>
                <div className="page-heading">
                  <div>
                    <button className="back" onClick={() => navigate(page)}>
                      <ArrowLeft size={16} /> Back to workspace
                    </button>
                    <div className="eyebrow">
                      {current.number}{" "}
                      <span className={`badge ${current.status.toLowerCase()}`}>
                        {current.status}
                      </span>
                    </div>
                    <h1>{current.name || "New quote"}</h1>
                    <div
                      className={`save-indicator ${saveState === "Save failed" ? "failed" : ""}`}
                      role="status"
                    >
                      {saveState} · stored on this device
                    </div>
                    {retainedJob && (
                      <p className="tiny">
                        The source quote was deleted. This separate job retains
                        its original estimate and actual costs.
                      </p>
                    )}
                    <p>
                      {locked
                        ? "Original estimate is locked. Record job actuals separately."
                        : "A clear scope. A confident price."}
                    </p>
                  </div>
                  <div className="heading-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        if (saveQuote(current)) setPreview(current);
                      }}
                    >
                      <Printer size={17} /> Customer quote
                    </button>
                    <button
                      className="button"
                      onClick={() => saveQuote(current)}
                    >
                      <Check size={17} />{" "}
                      {retainedJob ? "Save job" : "Save quote"}
                    </button>
                  </div>
                </div>
                {!current.job && !advancedEditor && (
                  <section className="panel" aria-label="Simple quote workflow" style={{ marginBottom: 12 }}>
                    <h2>Build your quote in four steps</h2>
                    <p className="muted">
                      Upload the drawing, analyze it once, check the estimate and create the quote.
                      Unverified measurements and prices remain clearly marked; nothing is approved automatically.
                    </p>
                    <div className="tabs">
                      {[
                        { name: "1. Project", target: "Customer & job" },
                        { name: "2. Plans & AI", target: "Plans & Takeoff" },
                        { name: "3. Review estimate", target: "Simple review" },
                      ].map((step) => (
                        <button
                          key={step.name}
                          type="button"
                          className={tab === step.target ? "active" : ""}
                          onClick={() => setTab(step.target)}
                        >
                          {step.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPreview(current)}
                        disabled={!current.customer.name.trim() || !current.name.trim()}
                      >
                        4. Customer quote
                      </button>
                    </div>
                    <button className="button secondary" type="button" onClick={() => setAdvancedEditor(true)}>
                      Show advanced tools
                    </button>
                  </section>
                )}
                {(advancedEditor || !!current.job) && (
                <div className="tabs">
                  {[
                    "Customer & job",
                    "Labour",
                    "Materials",
                    "Subcontractors & Other Costs",
                    "Pricing",
                    "Plans & Takeoff",
                    ...(current.job ? ["Job actuals"] : []),
                  ].map((t) => (
                    <button
                      key={t}
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    className="totals-shortcut"
                    onClick={() =>
                      document
                        .getElementById("quote-private-summary")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    Private totals · {money(totals!.total)}
                  </button>
                </div>
                )}
                                {(advancedEditor || !!current.job) && (
                  <button type="button" className="button secondary" onClick={() => { setAdvancedEditor(false); setTab("Simple review"); }}>
                    Use simple workflow
                  </button>
                )}
                
                <div className="builder">
                  <section className="panel editor">
                    <div className="section-heading">
                      <h2>{tab}</h2>
                      {locked && <span className="badge">Estimate locked</span>}
                    </div>
                    {tab === "Customer & job" && (
                      <>
                        <fieldset disabled={locked}>
                          <div className="fields">
                            <Field label="Customer name *">
                              <input
                                value={current.customer.name}
                                onChange={(e) =>
                                  patch({
                                    customer: {
                                      ...current.customer,
                                      name: e.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="Job name *">
                              <input
                                value={current.name}
                                onChange={(e) =>
                                  patch({ name: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Phone">
                              <input
                                type="tel"
                                value={current.customer.phone}
                                onChange={(e) =>
                                  patch({
                                    customer: {
                                      ...current.customer,
                                      phone: e.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="Email">
                              <input
                                type="email"
                                value={current.customer.email}
                                onChange={(e) =>
                                  patch({
                                    customer: {
                                      ...current.customer,
                                      email: e.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <Field label="Customer mailing address (optional)">
                            <input
                              value={current.customer.mailingAddress ?? ""}
                              onChange={(e) =>
                                patch({
                                  customer: {
                                    ...current.customer,
                                    mailingAddress: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="Job address">
                            <input
                              value={current.customer.address}
                              onChange={(e) =>
                                patch({
                                  customer: {
                                    ...current.customer,
                                    address: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="Project description / scope of work">
                            <textarea
                              rows={4}
                              value={current.description}
                              onChange={(e) =>
                                patch({ description: e.target.value })
                              }
                            />
                          </Field>
                          <div className="fields">
                            <Field label="Measurements">
                              <textarea
                                value={current.measurements}
                                onChange={(e) =>
                                  patch({ measurements: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Internal notes · never on customer quote">
                              <textarea
                                value={current.notes}
                                onChange={(e) =>
                                  patch({ notes: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Quote date">
                              <input
                                type="date"
                                required
                                value={current.date}
                                onChange={(e) =>
                                  patch({
                                    date: e.target.value,
                                    expiry: expiryFor(
                                      e.target.value,
                                      current.pricing.validityDays ?? 0,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Field label="Expiry date (optional)">
                              <input
                                type="date"
                                min={current.date}
                                value={current.expiry}
                                onChange={(e) =>
                                  patch({ expiry: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Project category">
                              <select
                                value={current.templateCategory ?? ""}
                                onChange={(e) =>
                                  patch({ templateCategory: e.target.value })
                                }
                              >
                                <option value="">Choose a category</option>
                                {[
                                  ...new Set([
                                    ...templates,
                                    ...constructionTemplates.map((t) => t.name),
                                  ]),
                                ].map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                            </Field>
                          </div>
                          <p className="hint">
                            Project category is a label only. To add suggested
                            estimate items, choose and apply a construction
                            template below.
                          </p>
                          <Field label="Apply construction template">
                            <select
                              value={selectedTemplate}
                              onChange={(e) =>
                                setSelectedTemplate(e.target.value)
                              }
                            >
                              <option value="">Choose a template…</option>
                              {constructionTemplates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <button
                            type="button"
                            disabled={
                              !selectedTemplate ||
                              constructionTemplates.some(
                                (t) =>
                                  t.id === selectedTemplate &&
                                  templateApplied(current, t),
                              )
                            }
                            onClick={() => {
                              const template = constructionTemplates.find(
                                (t) => t.id === selectedTemplate,
                              );
                              if (
                                !template ||
                                templateApplied(current, template)
                              )
                                return;
                              if (
                                current.lines.length &&
                                !confirm(
                                  `Add ${template.name} suggestions? Your ${current.lines.length} existing estimate lines will remain. ${template.lines.length} new suggested items will be added with zero quantities.`,
                                )
                              )
                                return;
                              setEditing((previous) =>
                                previous
                                  ? applyTemplate(previous, template)
                                  : previous,
                              );
                              setNotice(
                                `${template.name} template applied — ${template.lines.length} suggested items added.`,
                              );
                              if (template.lines.length)
                                setTab(template.lines[0].kind);
                            }}
                          >
                            Apply selected template
                          </button>
                          <p role="status">
                            Applied templates:{" "}
                            {(current.appliedTemplateIds ?? [])
                              .map(
                                (id) =>
                                  constructionTemplates.find((t) => t.id === id)
                                    ?.name ?? id,
                              )
                              .join(", ") || "None"}
                          </p>
                          <div className="info">
                            <p>
                              Templates append suggested lines and
                              quote-specific groups. Enter your own quantities
                              and prices; quote defaults apply unless a line
                              overrides them.
                            </p>
                          </div>
                          <CustomerScopeEditor
                            quote={current}
                            onChange={(customerScopes) =>
                              patch({ customerScopes })
                            }
                          />
                          <QuoteDetailsEditor
                            value={current.details}
                            onChange={(details) => patch({ details })}
                          />
                          <Field label="Customer terms">
                            <textarea
                              rows={4}
                              value={current.terms}
                              onChange={(e) => patch({ terms: e.target.value })}
                            />
                          </Field>
                          <label className="upload">
                            <Camera size={20} /> Add job photos{" "}
                            <small>
                              Up to 8 · JPEG, PNG or WebP · under 700 KB each
                            </small>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              onChange={(e) => {
                                void photos(e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <div className="photo-grid">
                            {current.photos.map((src, i) => (
                              <div key={i}>
                                <img src={src} alt={`Job photo ${i + 1}`} />
                                <button
                                  className="icon"
                                  aria-label={`Remove photo ${i + 1}`}
                                  onClick={() =>
                                    patch({
                                      photos: current.photos.filter(
                                        (_, n) => n !== i,
                                      ),
                                    })
                                  }
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </fieldset>
                      </>
                    )}
                    {[
                      "Labour",
                      "Materials",
                      "Subcontractors & Other Costs",
                    ].includes(tab) && (
                      <LineEditor
                        quote={current}
                        kind={
                          tab === "Subcontractors & Other Costs"
                            ? "Other Costs"
                            : (tab as Kind)
                        }
                        locked={locked}
                        onChange={(lines) => patch({ lines })}
                        onGroup={(group) =>
                          patch({
                            scopeGroups: [
                              ...new Set([
                                ...(current.scopeGroups ?? []),
                                group,
                              ]),
                            ],
                          })
                        }
                      />
                    )}
                    {tab === "Simple review" && (
                      <>
                        {!locked && !!(current.documents?.length || current.analysisReports?.length || current.takeoff.length) && (
                          <section className="info" style={{ marginBottom: 20 }}>
                            <h3>Create your editable preliminary estimate</h3>
                            <p>
                              Uses this quote's already-saved plan analysis and deck
                              replacement scope. Adds editable materials, labour and
                              subcontractor allowance lines with illustrative costs.
                              No new AI request, purchased quantities, verified pile
                              count or engineer approval is implied.
                            </p>
                            <button
                              type="button"
                              className="button"
                              disabled={preliminaryBudgetAlreadyExists(current)}
                              onClick={() => {
                                try {
                                  const next = generatePreliminaryBudget(current);
                                  patch({ lines: next.lines, details: next.details });
                                  setNotice("Preliminary budget added to this quote. Review every allowance before sending or ordering.");
                                  setError("");
                                } catch (e) {
                                  setError((e as Error).message);
                                }
                              }}
                            >
                              {preliminaryBudgetAlreadyExists(current)
                                ? "Preliminary budget created"
                                : "Generate Preliminary Estimate"}
                            </button>
                          </section>
                        )}
                        {preliminaryBudgetAlreadyExists(current) && (
                          <p className="margin-warning">
                            Preliminary budget only: quantities, labour hours and
                            costs below are illustrative assumptions, not
                            confirmed prices or an approved material takeoff.
                            Verify every item before creating a customer quote.
                          </p>
                        )}
                        <section className="info" style={{ marginBottom: 20 }}>
                          <h3>Materials found in saved plan analysis</h3>
                          <p>
                            Read-only summary of material observations already saved with this quote.
                            No new AI request and no change to prices. Quantities listed here may
                            describe spans, supports or suggestions rather than purchasing units.
                          </p>
                          {buildMaterialEvidence(current).length === 0 ? (
                            <p className="margin-warning">
                              No material observations are currently saved in this quote's takeoff index.
                              The attached PDF and preliminary budget alone do not provide an
                              automatically verified materials list. Existing pricing is unchanged.
                            </p>
                          ) : (
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr><th>Material</th><th>Recorded quantity</th><th>Evidence</th><th>To verify</th></tr>
                                </thead>
                                <tbody>
                                  {buildMaterialEvidence(current).map((item) => (
                                    <tr key={item.key}>
                                      <td>{item.description}<small> {item.category}</small></td>
                                      <td>{item.quantity == null ? "Unknown" : item.quantity} {item.unit}</td>
                                      <td>{item.source}; {item.status}; {item.confidence} confidence</td>
                                      <td>{item.needsReview.length ? item.needsReview.join("; ") : "No review flags recorded; check ordering and engineer requirements"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>
                        {isCowanOriginalPlanTrial(current) && (
                          <section className="info" style={{ marginBottom: 20 }}>
                            <h3>Cowan Park original-plan trial benchmark</h3>
                            <p>
                              Test settings only: {cowanTrial.pileCount} new helical piles;
                              { " " }{cowanTrial.beamRuns} timber beam runs, each {cowanTrial.beamLengthFeet.toFixed(2)} ft,
                              { " " }{cowanTrial.beamPlies}-ply 2x10 PT ({cowanBeamLinearFeet.toFixed(2)} linear feet of individual plies);
                              { " " }{cowanTrial.joistSize} joists at {cowanTrial.joistSpacingInches} in. on centre.
                            </p>
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr><th>Material / component</th><th>Trial quantity</th><th>Verification</th></tr>
                                </thead>
                                <tbody>
                                  <tr><td>Helical piles</td><td>{cowanTrial.pileCount} locations</td><td>Trial assumption only; subcontractor price unverified</td></tr>
                                  <tr><td>2x10 PT timber beam runs</td><td>{cowanTrial.beamRuns} × 24 ft 3 in</td><td>Contractor-confirmed trial measurements</td></tr>
                                  <tr><td>2x10 PT beam plies</td><td>{cowanTrial.beamRuns * cowanTrial.beamPlies} plies; {cowanBeamLinearFeet.toFixed(2)} linear ft</td><td>Geometric length only, not stock-board count</td></tr>
                                  <tr><td>2x6 PT joists</td><td>16 in on centre</td><td>Spacing from drawing; count and cut lengths unverified</td></tr>
                                  <tr><td>Deck boards / fasteners</td><td>To measure</td><td>Not a purchase quantity</td></tr>
                                  <tr><td>Hangers / connectors</td><td>To count</td><td>Not a purchase quantity</td></tr>
                                  <tr><td>PT guards / stairs</td><td>To measure</td><td>Guard lengths and stair geometry unverified</td></tr>
                                </tbody>
                              </table>
                            </div>
                            <h4>Calculated layout scenarios (not order quantities)</h4>
                            <div className="table-scroll">
                              <table>
                                <thead><tr><th>Calculation</th><th>Result</th><th>Limits</th></tr></thead>
                                <tbody>
                                  <tr>
                                    <td>Joist stations along 28 ft 10 in run</td>
                                    <td>{cowanQuantityScenario.narrowStations} station positions</td>
                                    <td>16 in spacing, assumes an end station; not joist-board count</td>
                                  </tr>
                                  <tr>
                                    <td>Joist stations along 24 ft 3 in run</td>
                                    <td>{cowanQuantityScenario.wideStations} station positions</td>
                                    <td>16 in spacing, assumes an end station; not joist-board count</td>
                                  </tr>
                                  <tr>
                                    <td>Illustrative rectangle areas</td>
                                    <td>{cowanQuantityScenario.narrowArea.toFixed(1)} + {cowanQuantityScenario.wideArea.toFixed(1)} sq ft</td>
                                    <td>Two independent rectangular scenarios, not confirmed non-overlapping deck area</td>
                                  </tr>
                                  <tr>
                                    <td>Conditional decking surface</td>
                                    <td>{cowanQuantityScenario.combinedArea.toFixed(1)} sq ft</td>
                                    <td>Valid only if the two rectangles do not overlap and cover the exact deck footprint</td>
                                  </tr>
                                  <tr>
                                    <td>Conditional decking linear footage</td>
                                    <td>{Math.ceil(cowanQuantityScenario.deckingLinearFeet)} linear ft</td>
                                    <td>Assumes {cowanLayout.assumedDeckingFaceInches} in effective board coverage and {Math.round(cowanLayout.assumedDeckingWasteFraction * 100)}% waste; not an order or stock-board count</td>
                                  </tr>
                                  <tr>
                                    <td>Conditional 2x6 PT joist segments</td>
                                    <td>{cowanQuantityScenario.conditionalJoistPieces} projected segments</td>
                                    <td>Assumes one narrow-section piece per station plus two wide-section spans per station. Not a board order, count of hangers or approved layout.</td>
                                  </tr>
                                  <tr>
                                    <td>Joist hangers, double joists and structural connectors</td>
                                    <td>Not calculated</td>
                                    <td>Requires verified connection and actual joist layout</td>
                                  </tr>
                                  <tr>
                                    <td>Railings and stairs</td>
                                    <td>Not calculated</td>
                                    <td>Requires measured exposed edges, openings, height and stair geometry</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <h4>Trial material schedule — what can actually be counted</h4>
                            <div className="table-scroll">
                              <table>
                                <thead><tr><th>Item</th><th>Preliminary scope</th><th>Before ordering</th></tr></thead>
                                <tbody>
                                  <tr><td>2x10 PT 3-ply beams</td><td>9 plies × 24 ft 3 in; 218.25 linear ft</td><td>Stock length, engineered splices and cutting layout unverified</td></tr>
                                  <tr><td>2x6 PT joists</td><td>{cowanQuantityScenario.conditionalJoistPieces} projected segments; 16 in on centre</td><td>Verify actual joist orientations, span and double-edge pieces</td></tr>
                                  <tr><td>PT decking</td><td>About {Math.ceil(cowanQuantityScenario.deckingLinearFeet)} linear ft conditionally</td><td>Choose board profile, orientation, gaps, joinery and confirm actual footprint</td></tr>
                                  <tr><td>6x6 PT posts / helical pile caps</td><td>{cowanTrial.pileCount} test pile positions</td><td>Do not equate pile count to post count; verify retained supports and heights</td></tr>
                                  <tr><td>2x6 ledger, blocking and flashing</td><td>Specified on original drawing</td><td>Measure true ledger length and blocking layout</td></tr>
                                  <tr><td>LUS26 hangers and structural fasteners</td><td>Specified type, not counted</td><td>Verify every supported joist end and connection detail</td></tr>
                                  <tr><td>PT railings, stair stringers and treads</td><td>Included in trial scope</td><td>Guard lengths, post spacing, stair rise/run and openings missing</td></tr>
                                </tbody>
                              </table>
                            </div>
                            <p className="margin-warning">
                              This material schedule is a conditional trial worksheet, NOT an automatic purchasable bill of materials. The narrow extension is marked approximately 6 ft 10 1/4 in wide on the source plan (earlier 8 ft assumption corrected). Confirm the L-shaped footprint and what areas are rebuilt before treating the displayed decking result as a takeoff. Do not order lumber from linear-foot totals: beam joining, stock lengths,
                              hardware, joist layout and site dimensions still need verification.
                              No additional AI analysis is needed.
                            </p>
                            {cowanTrialPileLine(current) && !hasCowanTrialPiles(current) && !locked && (
                              <button
                                type="button"
                                className="button"
                                onClick={() => {
                                  try {
                                    const next = applyCowanTrialPiles(current);
                                    patch({ lines: next.lines });
                                    setNotice("12-pile trial scenario applied. The existing pile budget total is unchanged; the calculated per-pile rate is NOT a subcontractor quote.");
                                    setError("");
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                              >
                                Apply 12-pile trial scenario (keep budget total)
                              </button>
                            )}
                            {hasCowanTrialPiles(current) && (
                              <p className="margin-warning">
                                12-pile trial scenario applied. The unit cost is calculated
                                from the old lump-sum allowance, NOT a verified pile price.
                              </p>
                            )}
                          </section>
                        )}
                        <p className="muted">
                          Review everything in one place. These are the current quote lines,
                          not unverified drawing suggestions. Missing materials or prices
                          must be added or checked before sending.
                        </p>
                        {(["Materials", "Labour", "Other Costs"] as Kind[]).map((kind) => (
                          <section key={kind} style={{ marginBottom: 24 }}>
                            <h3>{kind === "Other Costs" ? "Subcontractors & other costs" : kind}</h3>
                            <LineEditor
                              quote={current}
                              kind={kind}
                              locked={locked}
                              onChange={(lines) => patch({ lines })}
                              onGroup={(group) =>
                                patch({ scopeGroups: [...new Set([...(current.scopeGroups ?? []), group])] })
                              }
                            />
                          </section>
                        ))}
                        <h3>Pricing & totals</h3>
                        <PricingFields
                          value={current.pricing}
                          disabled={locked}
                          onChange={(pricing) => patch({ pricing })}
                        />
                        <p className="muted">
                          Supplier prices, subcontractor costs, labour hours and structural
                          quantities require review. Blank figures are not estimates.
                        </p>
                        <button className="button" type="button" onClick={() => setPreview(current)}>
                          Preview customer quote
                        </button>
                      </>
                    )}
                    {tab === "Plans & Takeoff" && (
                      <PlansTakeoff
                        orientations={pdfOrientations}
                        setOrientations={setPdfOrientations}
                        simpleMode={!advancedEditor && !current.job}
                        onViewEstimate={() => setTab(!advancedEditor && !current.job ? "Simple review" : "Materials")}
                        quote={current}
                        locked={locked}
                        onChange={(q) => {
                          setEditing((previous) =>
                            previous?.id === q.id ? q : previous,
                          );
                          setNotice("");
                        }}
                        onError={setError}
                      />
                    )}
                    {tab === "Pricing" && (
                      <>
                        <p className="muted">
                          Company Settings → quote defaults → optional line
                          override. These values are this quote’s defaults.
                          Editing a line replaces its default; markups never
                          stack.
                        </p>
                        <PricingFields
                          value={current.pricing}
                          disabled={locked}
                          onChange={(p) => {
                            const updates: Partial<Quote> = { pricing: p };
                            if (
                              p.validityDays !== current.pricing.validityDays
                            ) {
                              const d = new Date(`${current.date}T12:00:00`);
                              d.setDate(d.getDate() + (p.validityDays ?? 0));
                              updates.expiry = p.validityDays
                                ? d.toLocaleDateString("en-CA")
                                : "";
                            }
                            patch(updates);
                          }}
                        />
                        <div className="info">
                          <b>Markup ≠ margin</b>
                          <p>
                            A $100 cost with 20% markup sells for $120, giving a
                            16.7% margin. Margin is profit divided by selling
                            price. HST is excluded from profit.
                          </p>
                        </div>
                      </>
                    )}
                    {tab === "Job actuals" && current.job && (
                      <div className="info">
                        <b>Change orders · foundation</b>
                        <p>
                          Original contract:{" "}
                          {money(calculate(current.job.snapshot).subtotal)}{" "}
                          before HST. Future approved changes will be recorded
                          separately, with their own scope, price, HST and
                          customer approval; they never rewrite this estimate.
                          Approval and contract adjustment entry are not enabled
                          in this pass.
                        </p>
                      </div>
                    )}
                    {tab === "Job actuals" && current.job && (
                      <>
                        <p className="muted">
                          Record actual labour as hours × internal hourly cost.
                          Record expenses as quantity × unit cost. These entries
                          never change your estimate.
                        </p>
                        <div className="actual-stats">
                          {(() => {
                            const j = jobTotals(current);
                            return (
                              <>
                                <Stat
                                  label="Estimated cost"
                                  value={money(j.cost)}
                                  note="Locked original estimate"
                                />
                                <Stat
                                  label="Actual cost"
                                  value={money(j.actual)}
                                  note={`${money(j.variance)} over / under estimate`}
                                />
                                <Stat
                                  label="Original quoted price"
                                  value={money(j.subtotal)}
                                  note="Before HST"
                                />
                                <Stat
                                  label="Expected profit"
                                  value={money(j.profit)}
                                  note={`${j.margin.toFixed(1)}% expected margin`}
                                />
                                <Stat
                                  label="Actual profit"
                                  value={money(j.actualProfit)}
                                  note={`${j.actualMargin.toFixed(1)}% actual margin`}
                                />
                              </>
                            );
                          })()}
                        </div>
                        {current.status !== "Completed" && (
                          <div className="line-card">
                            <div className="fields">
                              <Field label="Description">
                                <input
                                  value={actual.description}
                                  onChange={(e) =>
                                    setActual({
                                      ...actual,
                                      description: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Category">
                                <select
                                  value={actual.category}
                                  onChange={(e) =>
                                    setActual({
                                      ...actual,
                                      category: e.target.value,
                                    })
                                  }
                                >
                                  {["Labour", ...categories, "Materials"].map(
                                    (c) => (
                                      <option key={c}>{c}</option>
                                    ),
                                  )}
                                </select>
                              </Field>
                              <Field
                                label={
                                  actual.category === "Labour"
                                    ? "Actual hours"
                                    : "Quantity"
                                }
                              >
                                <NumberInput
                                  value={actual.quantity}
                                  onChange={(n) =>
                                    setActual({ ...actual, quantity: n })
                                  }
                                />
                              </Field>
                              <Field
                                label={
                                  actual.category === "Labour"
                                    ? "Internal cost / hour ($)"
                                    : "Unit cost ($)"
                                }
                              >
                                <NumberInput
                                  step={
                                    actual.category === "Labour" ? "1" : "0.01"
                                  }
                                  value={actual.cost}
                                  onChange={(n) =>
                                    setActual({ ...actual, cost: n })
                                  }
                                />
                              </Field>
                            </div>
                            <button className="button" onClick={addActual}>
                              <Plus size={17} /> Record actual cost
                            </button>
                          </div>
                        )}
                        <div className="actual-list">
                          {current.job.actuals.map((a) => (
                            <div key={a.id}>
                              <div>
                                <b>{a.description}</b>
                                <small>
                                  {a.category} · {a.quantity} × {money(a.cost)}
                                </small>
                              </div>
                              <strong>{money(a.quantity * a.cost)}</strong>
                              {current.status !== "Completed" && (
                                <button
                                  className="icon danger"
                                  aria-label={`Remove actual ${a.description}`}
                                  onClick={() =>
                                    saveQuote({
                                      ...current,
                                      job: {
                                        ...current.job!,
                                        actuals: current.job!.actuals.filter(
                                          (x) => x.id !== a.id,
                                        ),
                                      },
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {current.job.actuals.length === 0 && (
                          <div className="empty-inline">
                            No actuals recorded. Profit is provisional until all
                            costs are entered.
                          </div>
                        )}
                        {current.status !== "Completed" && (
                          <button
                            className="button secondary"
                            onClick={() => {
                              if (
                                confirm(
                                  "Complete this job? Confirm all actual costs have been recorded.",
                                )
                              )
                                saveQuote({ ...current, status: "Completed" });
                            }}
                          >
                            <Check size={17} /> Mark job completed
                          </button>
                        )}
                      </>
                    )}
                  </section>
                  <aside className="panel summary" id="quote-private-summary">
                    <div className="eyebrow">PRIVATE · INTERNAL ONLY</div>
                    <h2>Quote summary</h2>
                    <h3 className="subheading">Estimated actual cost</h3>
                    <dl>
                      <div>
                        <dt>Labour cost</dt>
                        <dd>{money(totals!.labourCost)}</dd>
                      </div>
                      <div>
                        <dt>Material cost (with waste)</dt>
                        <dd>{money(totals!.materialCost)}</dd>
                      </div>
                      <div>
                        <dt>Other costs</dt>
                        <dd>{money(totals!.otherCost)}</dd>
                      </div>
                      <div>
                        <dt>Total direct / estimated actual cost</dt>
                        <dd>{money(totals!.cost)}</dd>
                      </div>
                    </dl>
                    <h3 className="subheading">Customer pricing</h3>
                    <dl>
                      <div>
                        <dt>Labour selling price</dt>
                        <dd>{money(totals!.labourPrice)}</dd>
                      </div>
                      <div>
                        <dt>Materials selling price</dt>
                        <dd>{money(totals!.materialPrice)}</dd>
                      </div>
                      <div>
                        <dt>Other-cost selling price</dt>
                        <dd>{money(totals!.otherPrice)}</dd>
                      </div>
                      <div>
                        <dt>Line selling prices (base)</dt>
                        <dd>{money(totals!.base)}</dd>
                      </div>
                      <div>
                        <dt>General overhead & profit adjustment</dt>
                        <dd>{money(totals!.overhead)}</dd>
                      </div>
                      <div>
                        <dt>Contingency</dt>
                        <dd>{money(totals!.contingency)}</dd>
                      </div>
                      <div className="subtotal">
                        <dt>Selling price before tax</dt>
                        <dd>{money(totals!.subtotal)}</dd>
                      </div>
                      <div>
                        <dt>HST ({current.pricing.hst}%)</dt>
                        <dd>{money(totals!.tax)}</dd>
                      </div>
                      <div className="grand-total">
                        <dt>Customer total</dt>
                        <dd>{money(totals!.total)}</dd>
                      </div>
                    </dl>
                    <p className="calculation-explanation">
                      {money(totals!.base)} line selling prices +{" "}
                      {money(totals!.overhead)} overhead/profit +{" "}
                      {money(totals!.contingency)} contingency ={" "}
                      {money(totals!.subtotal)} before HST. Line markups replace
                      quote defaults.
                    </p>
                    <h3 className="subheading">Profit analysis</h3>
                    <div className="profit-box">
                      <span>Expected gross profit</span>
                      <strong>{money(totals!.profit)}</strong>
                      <small>{totals!.margin.toFixed(1)}% gross margin</small>
                    </div>
                    <dl>
                      <div>
                        <dt>Break-even selling price</dt>
                        <dd>{money(totals!.breakEven)}</dd>
                      </div>
                      <div>
                        <dt>Target gross margin</dt>
                        <dd>{totals!.targetMargin}%</dd>
                      </div>
                      <div>
                        <dt>Required price for target</dt>
                        <dd>
                          {totals!.targetPrice === null
                            ? "Not achievable"
                            : money(totals!.targetPrice)}
                        </dd>
                      </div>
                    </dl>
                    <p className="tiny">
                      Difference from target:{" "}
                      {(totals!.margin - totals!.targetMargin).toFixed(1)}{" "}
                      percentage points
                    </p>
                    {!totals!.belowTarget && (
                      <p className="target-met">
                        ✓ Target met · {totals!.margin.toFixed(1)}% expected /{" "}
                        {totals!.targetMargin}% target
                      </p>
                    )}
                    {totals!.belowTarget && (
                      <div className="margin-warning" role="status">
                        Expected gross margin is below the{" "}
                        {totals!.targetMargin}% target.
                        {totals!.targetPrice !== null && (
                          <p>
                            Minimum pre-tax selling price:{" "}
                            {money(totals!.targetPrice)}. Suggested increase:{" "}
                            {money(
                              Math.max(
                                0,
                                totals!.targetPrice - totals!.subtotal,
                              ),
                            )}
                            . Advisory only.
                          </p>
                        )}
                      </div>
                    )}
                    <p className="tiny">
                      Profit excludes tax. Pricing defaults are editable in
                      Settings; existing quotes keep their own settings.
                    </p>
                    <div className="workflow">
                      {current.status === "Draft" && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            setReviewing(true);
                          }}
                        >
                          Mark as sent <ArrowUpRight size={17} />
                        </button>
                      )}
                      {current.status === "Sent" && (
                        <button
                          className="button"
                          onClick={() => {
                            if (
                              confirm(
                                "Record that the customer has accepted this quote? This locks the estimate.",
                              )
                            )
                              saveQuote({ ...current, status: "Accepted" });
                          }}
                        >
                          Record acceptance <Check size={17} />
                        </button>
                      )}
                      {current.status === "Accepted" && !current.job && (
                        <button
                          className="button"
                          onClick={() => {
                            const q = convert(current);
                            if (saveQuote(q)) setTab("Job actuals");
                          }}
                        >
                          Convert to job <ArrowUpRight size={17} />
                        </button>
                      )}
                      <button
                        className="button secondary"
                        onClick={() => {
                          const q = duplicate(
                            current,
                            [...store.quotes, ...(store.jobs ?? [])],
                            quoteNumberHighWater(store),
                          );
                          setEditing(q);
                          setTab("Customer & job");
                        }}
                      >
                        <Copy size={16} /> Duplicate quote
                      </button>
                    </div>
                    {store.quotes.some((q) => q.id === current.id) && (
                      <section
                        className="quote-delete-actions"
                        aria-label="Quote actions"
                      >
                        <h3 className="subheading">Quote actions</h3>
                        <p className="tiny">
                          Permanently remove this quote from this device.
                          Existing jobs are preserved.
                        </p>
                        <button
                          className="button secondary danger"
                          onClick={removeQuote}
                        >
                          <Trash2 size={16} /> Delete quote
                        </button>
                      </section>
                    )}
                  </aside>
                </div>
              </>
            ) : page === "Settings" ? (
              <>
                <div className="page-heading">
                  <div className="heading-text">
                    <div className="eyebrow">MAKE IT YOURS</div>
                    <h1>Company settings</h1>
                    <p>Set your starting point. Every quote can be adjusted.</p>
                  </div>
                </div>
                <section className="panel settings-panel">
                  <h2>Company / contact information</h2>
                  <div className="fields">
                    {(["name", "phone", "email", "address"] as const).map(
                      (key) => (
                        <Field key={key} label={`Company ${key}`}>
                          <input
                            value={company[key]}
                            onChange={(e) =>
                              setCompany({ ...company, [key]: e.target.value })
                            }
                          />
                        </Field>
                      ),
                    )}
                  </div>
                  <h2>Default pricing</h2>
                  <p className="muted">
                    Business rates start at zero until you choose them. Sample
                    quotes use fictional illustrative rates. Company settings
                    apply only to new quotes. Existing quotes keep their copied
                    profiles; new lines inherit their quote profile.
                  </p>
                  <PricingFields
                    company
                    value={settings}
                    onChange={setSettings}
                  />
                  <QuoteDetailsEditor
                    value={quoteDefaults}
                    onChange={setQuoteDefaults}
                    company
                  />
                  <button
                    className="button"
                    onClick={() => {
                      if (
                        Object.values(settings).some(
                          (n) => !Number.isFinite(n) || n < 0,
                        )
                      ) {
                        setError("Use non-negative pricing values.");
                        return;
                      }
                      if (
                        (settings.targetMargin ?? 0) >= 100 ||
                        !Number.isInteger(settings.validityDays ?? 0)
                      ) {
                        setError(
                          "Target margin must be below 100%; validity days must be a whole number.",
                        );
                        return;
                      }
                      const paymentProblem = paymentError(
                        quoteDefaults.payment,
                      );
                      if (paymentProblem) {
                        setError(paymentProblem);
                        return;
                      }
                      if (
                        saveStore({
                          ...store,
                          settings,
                          quoteDefaults,
                          company,
                        })
                      )
                        setNotice("Pricing defaults saved");
                    }}
                  >
                    <Check size={17} /> Save defaults
                  </button>
                  <div className="data-tools">
                    <button
                      disabled={!!initial.error}
                      className="button secondary"
                      onClick={() => {
                        const blob = new Blob(
                          [JSON.stringify(store, null, 2)],
                          { type: "application/json" },
                        );
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `backwoods-quotes-v2-${new Date().toISOString().slice(0, 10)}.json`;
                        link.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      Export data backup
                    </button>
                    <p className="muted">
                      Includes private estimates and attached files. Keep this
                      backup securely. V1 records are automatically backed up in
                      browser storage before their first V2 save.
                    </p>
                  </div>
                  <div className="info">
                    <b>Development access</b>
                    <p>
                      The role switch is a development convenience, not secure
                      authentication. Estimators can manage quotes and jobs;
                      only owners can edit default pricing in the interface.
                      Production requires server-enforced access and a shared
                      database.
                    </p>
                  </div>
                </section>
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {page === "Overview"
                        ? "A GOOD DAY TO BUILD"
                        : "BACKWOODS WORKSPACE"}
                    </div>
                    <h1>
                      {page === "Overview"
                        ? "Your work, at a glance."
                        : page === "Jobs"
                          ? "From estimate to outcome."
                          : "Every project starts here."}
                    </h1>
                    <p>
                      {page === "Overview"
                        ? "Less paperwork. More time on the job."
                        : page === "Jobs"
                          ? "Keep an eye on your costs and the profit you bring home."
                          : "Build clear quotes and keep the next job moving."}
                    </p>
                  </div>
                  <button className="button" onClick={create}>
                    <Plus size={19} /> Create New Quote
                  </button>
                </div>
                {page === "Overview" && (
                  <>
                    <div className="stats-grid">
                      <Stat
                        label="Active quoted value"
                        value={money(
                          active.reduce(
                            (s, q) => s + calculate(estimateFor(q)).subtotal,
                            0,
                          ),
                        )}
                        note={`${active.length} draft & sent quotes · before HST`}
                      />
                      <Stat
                        label="Expected job profit"
                        value={money(
                          accepted.reduce(
                            (s, q) => s + calculate(estimateFor(q)).profit,
                            0,
                          ),
                        )}
                        note={`${accepted.length} accepted jobs · before HST`}
                      />
                      <div className="stat accent-stat">
                        <span>Built for your next job</span>
                        <strong>Quote with confidence.</strong>
                        <small>Know your costs. Protect your margin.</small>
                        <TreePine className="stat-tree" size={80} />
                      </div>
                    </div>
                    <div className="status-grid">
                      {(
                        ["Draft", "Sent", "Accepted", "Completed"] as const
                      ).map((s, i) => (
                        <button
                          key={s}
                          onClick={() => navigate(i < 2 ? "Quotes" : "Jobs", s)}
                        >
                          <span className={`status-dot ${s.toLowerCase()}`} />
                          <strong>
                            {
                              [
                                ...store.quotes,
                                ...(i >= 2 ? (store.jobs ?? []) : []),
                              ].filter((q) => q.status === s).length
                            }
                          </strong>
                          <span>
                            {s} {i < 2 ? "Quotes" : "Jobs"}
                          </span>
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <section className="panel quote-list">
                  <div className="list-header">
                    <div>
                      <h2>
                        {page === "Overview"
                          ? "Recent projects"
                          : page === "Jobs"
                            ? "Your jobs"
                            : "Your quotes"}
                      </h2>
                      <p className="muted">
                        {page === "Overview"
                          ? "The latest from your workspace."
                          : "Everything you need, in one place."}
                      </p>
                    </div>
                    <input
                      aria-label="Search projects"
                      className="search"
                      placeholder="Search projects or customers…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="list-tabs">
                    {(page === "Jobs"
                      ? ["Accepted", "Completed"]
                      : ["All", "Draft", "Sent", "Accepted", "Completed"]
                    ).map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "active" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                        {f === "All" ? " projects" : ""}
                      </button>
                    ))}
                  </div>
                  <div className="table-heading">
                    <span>PROJECT / CUSTOMER</span>
                    <span>STATUS</span>
                    <span>QUOTED VALUE</span>
                    <span>EXPECTED PROFIT</span>
                    <span />
                  </div>
                  {listed.length ? (
                    listed.map((q, i) => {
                      const t = calculate(estimateFor(q));
                      return (
                        <button
                          className="project-row"
                          key={q.id}
                          onClick={() => {
                            setEditing(structuredClone(q));
                            setTab(q.job ? "Job actuals" : "Customer & job");
                            setNotice("");
                          }}
                        >
                          <div className="project-cell">
                            <div className={`project-icon color-${i % 3}`}>
                              <BriefcaseBusiness size={22} />
                            </div>
                            <div>
                              <b>{q.name || "Untitled quote"}</b>
                              <small>
                                {q.customer.name || "Customer not added"}{" "}
                                <span>· {q.number}</span>
                              </small>
                            </div>
                          </div>
                          <span className={`badge ${q.status.toLowerCase()}`}>
                            {q.status}
                          </span>
                          <div className="row-amount">
                            <b>{money(t.subtotal)}</b>
                            <small>before HST</small>
                          </div>
                          <div className="row-profit">
                            <b>{money(t.profit)}</b>
                            <small>{t.margin.toFixed(1)}% margin</small>
                          </div>
                          <ArrowUpRight size={18} />
                        </button>
                      );
                    })
                  ) : (
                    <div className="empty-inline">
                      <FileText size={32} />
                      <h3>No projects here yet</h3>
                      <p>Create a quote or try another search.</p>
                      <button className="button" onClick={create}>
                        <Plus size={16} /> New Quote
                      </button>
                    </div>
                  )}
                </section>
                <div className="workspace-footer">
                  <TreePine size={16} /> BACKWOODS BUILDING & MAINTENANCE{" "}
                  <span>Built on solid numbers.</span>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
      {reviewing && current && (
        <QuoteReview
          quote={current}
          onClose={() => setReviewing(false)}
          onSend={() => {
            if (
              confirm("Mark this quote Sent and lock the estimate?") &&
              saveQuote(markSent(current))
            )
              setReviewing(false);
          }}
        />
      )}
      {preview && (
        <CustomerQuote
          quote={preview}
          onClose={() => setPreview(null)}
          onDetails={(details) => {
            const q = { ...preview, details };
            if (preview.status === "Draft") {
              if (saveQuote(q)) setPreview(q);
            } else setPreview(q);
          }}
          onMode={(mode) => {
            const q = { ...preview, mode };
            if (preview.status === "Draft") {
              if (saveQuote(q)) setPreview(q);
            } else setPreview(q);
          }}
        />
      )}
    </>
  );
}
