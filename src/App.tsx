import { useState, useEffect, useRef } from "react";
import CustomerScopeEditor from "./CustomerScopeEditor";
import CustomerQuote from "./CustomerQuote";
import NumberInput from "./NumberInput";
import LineEditor from "./LineEditor";
import QuoteDetailsEditor from "./QuoteDetailsEditor";
import PlansTakeoff from "./PlansTakeoff";
import QuoteReview from "./QuoteReview";
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
    const stored = store.quotes.find((x) => x.id === q.id);
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
        quotes: exists
          ? store.quotes.map((x) => (x.id === q.id ? q : x))
          : [q, ...store.quotes],
      })
    ) {
      setSaveState("Saved");
      if (!silent) setNotice("Saved on this device");
      if (close) setEditing(null);
      else setEditing(q);
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
        JSON.stringify(storeRef.current.quotes.find((q) => q.id === editing.id))
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
        JSON.stringify(store.quotes.find((q) => q.id === editing.id)) &&
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
  function create() {
    setEditing(
      newQuote(
        store.settings,
        store.quotes,
        store.quoteDefaults,
        store.company ?? companyDefaults,
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
  const accepted = store.quotes.filter((q) => q.status === "Accepted");
  const listed = store.quotes.filter(
    (q) =>
      (filter === "All" || q.status === filter) &&
      `${q.name} ${q.customer.name} ${q.number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = editing;
  const locked =
    !!current &&
    (!!current.job ||
      current.status === "Sent" ||
      current.status === "Accepted" ||
      current.status === "Completed");
  const totals = current ? calculate(estimateFor(current)) : null;
  function patch(p: Partial<Quote>) {
    if (current) setEditing({ ...current, ...p });
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
                      <Check size={17} /> Save quote
                    </button>
                  </div>
                </div>
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
                    {tab === "Plans & Takeoff" && (
                      <PlansTakeoff
                        onViewEstimate={() => setTab("Materials")}
                        quote={current}
                        locked={locked}
                        onChange={(q) => {
                          setEditing(q);
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
                          const q = duplicate(current, store.quotes);
                          setEditing(q);
                          setTab("Customer & job");
                        }}
                      >
                        <Copy size={16} /> Duplicate quote
                      </button>
                    </div>
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
                            {store.quotes.filter((q) => q.status === s).length}
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
