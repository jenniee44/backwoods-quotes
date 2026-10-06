import { useState } from "react";
import CustomerQuote from "./CustomerQuote";
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
  categories,
  convert,
  duplicate,
  id,
  jobTotals,
  linePrice,
  load,
  money,
  newLine,
  newQuote,
  persist,
  seed,
  templates,
  validate,
} from "./model";
import type { Quote, Role, Store, Pricing, Kind, Line, Actual } from "./model";

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
function NumberInput({
  value,
  onChange,
  ...props
}: {
  value: number;
  onChange: (n: number) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      required
      value={value}
      onChange={(e) =>
        onChange(e.target.value === "" ? 0 : Number(e.target.value))
      }
      {...props}
    />
  );
}
const priceLabels: Record<keyof Pricing, string> = {
  materialMarkup: "Material markup (%)",
  labourRate: "Customer labour rate ($/hour)",
  overhead: "Overhead / profit addition (%)",
  contingency: "Contingency (%)",
  hst: "HST (%)",
};
function PricingFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Pricing;
  onChange: (p: Pricing) => void;
  disabled?: boolean;
}) {
  return (
    <div className="fields">
      {(Object.keys(priceLabels) as (keyof Pricing)[]).map((k) => (
        <Field key={k} label={priceLabels[k]}>
          <NumberInput
            value={value[k]}
            disabled={disabled}
            onChange={(n) => onChange({ ...value, [k]: n })}
          />
        </Field>
      ))}
    </div>
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
    [notice, setNotice] = useState("");
  const [role, setRole] = useState<Role>("Admin/Owner"),
    [page, setPage] = useState("Overview"),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Quote | null>(null),
    [preview, setPreview] = useState<Quote | null>(null),
    [tab, setTab] = useState("Customer & job"),
    [mobileMenu, setMobileMenu] = useState(false);
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
  function saveQuote(q: Quote, close = false) {
    const problem = validate(q);
    if (problem) {
      setError(problem);
      return false;
    }
    const exists = store.quotes.some((x) => x.id === q.id);
    if (
      saveStore({
        ...store,
        quotes: exists
          ? store.quotes.map((x) => (x.id === q.id ? q : x))
          : [q, ...store.quotes],
      })
    ) {
      setNotice("Saved on this device");
      if (close) setEditing(null);
      else setEditing(q);
      return true;
    }
    return false;
  }
  function navigate(p: string, f = "All") {
    if (
      editing &&
      JSON.stringify(editing) !==
        JSON.stringify(store.quotes.find((q) => q.id === editing.id)) &&
      !confirm("Leave the quote editor? Unsaved changes will be lost.")
    )
      return;
    setEditing(null);
    setPreview(null);
    setPage(p);
    setFilter(f);
    setMobileMenu(false);
    setError(initial.error);
  }
  function create() {
    setEditing(newQuote(store.settings, store.quotes));
    setTab("Customer & job");
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
      current.status === "Accepted" ||
      current.status === "Completed");
  const totals = current ? calculate(current.job?.snapshot ?? current) : null;
  function patch(p: Partial<Quote>) {
    if (current) setEditing({ ...current, ...p });
    setNotice("");
  }
  function patchLine(l: Line) {
    if (current)
      patch({ lines: current.lines.map((x) => (x.id === l.id ? l : x)) });
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
                    "Other Costs",
                    "Pricing",
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
                                  patch({ date: e.target.value })
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
                            <Field label="Project category · future templates">
                              <select
                                value={current.templateCategory ?? ""}
                                onChange={(e) =>
                                  patch({ templateCategory: e.target.value })
                                }
                              >
                                <option value="">Choose a category</option>
                                {templates.map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                            </Field>
                          </div>
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
                    {(
                      ["Labour", "Materials", "Other Costs"] as string[]
                    ).includes(tab) && (
                      <>
                        <p className="muted">
                          {tab === "Labour"
                            ? "Your cost and the customer rate are separate. Only the selling price appears on the quote."
                            : tab === "Materials"
                              ? "Markup adds to your material cost. Override the full line selling price when needed."
                              : "Record the direct cost. Use a selling price override to charge a different amount."}
                        </p>
                        {current.lines
                          .filter((l) => l.kind === tab)
                          .map((l) => (
                            <fieldset
                              disabled={locked}
                              className="line-card"
                              key={l.id}
                            >
                              <div className="line-title">
                                <Field label="Description *">
                                  <input
                                    value={l.description}
                                    placeholder={
                                      tab === "Labour"
                                        ? "e.g. Deck construction"
                                        : "e.g. Cedar deck boards"
                                    }
                                    onChange={(e) =>
                                      patchLine({
                                        ...l,
                                        description: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <button
                                  className="icon danger"
                                  aria-label={`Remove ${l.description || "line"}`}
                                  onClick={() =>
                                    patch({
                                      lines: current.lines.filter(
                                        (x) => x.id !== l.id,
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                              <div className="fields compact">
                                <Field
                                  label={
                                    tab === "Labour"
                                      ? "Estimated hours"
                                      : "Quantity"
                                  }
                                >
                                  <NumberInput
                                    value={l.quantity}
                                    onChange={(n) =>
                                      patchLine({ ...l, quantity: n })
                                    }
                                  />
                                </Field>
                                {tab !== "Labour" && (
                                  <Field label="Unit">
                                    <input
                                      value={l.unit}
                                      onChange={(e) =>
                                        patchLine({
                                          ...l,
                                          unit: e.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                )}
                                <Field
                                  label={
                                    tab === "Labour"
                                      ? "Internal cost / hour ($)"
                                      : "Unit cost ($)"
                                  }
                                >
                                  <NumberInput
                                    value={l.cost}
                                    onChange={(n) =>
                                      patchLine({ ...l, cost: n })
                                    }
                                  />
                                </Field>
                                {tab === "Labour" && (
                                  <Field label="Customer rate / hour ($)">
                                    <NumberInput
                                      value={l.rate}
                                      onChange={(n) =>
                                        patchLine({ ...l, rate: n })
                                      }
                                    />
                                  </Field>
                                )}
                                {tab === "Materials" && (
                                  <Field label="Markup (%)">
                                    <NumberInput
                                      value={l.markup}
                                      onChange={(n) =>
                                        patchLine({ ...l, markup: n })
                                      }
                                    />
                                  </Field>
                                )}
                                {tab === "Other Costs" && (
                                  <Field label="Category">
                                    <select
                                      value={l.category}
                                      onChange={(e) =>
                                        patchLine({
                                          ...l,
                                          category: e.target.value,
                                        })
                                      }
                                    >
                                      {categories.map((c) => (
                                        <option key={c}>{c}</option>
                                      ))}
                                    </select>
                                  </Field>
                                )}
                                <Field label="Selling price override ($)">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Automatic"
                                    value={l.override ?? ""}
                                    onChange={(e) =>
                                      patchLine({
                                        ...l,
                                        override:
                                          e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                      })
                                    }
                                  />
                                </Field>
                              </div>
                              <div className="line-footer">
                                <span>
                                  Internal cost{" "}
                                  <b>{money(l.quantity * l.cost)}</b>
                                </span>
                                <span>
                                  Customer price <b>{money(linePrice(l))}</b>
                                </span>
                              </div>
                            </fieldset>
                          ))}
                        {!current.lines.some((l) => l.kind === tab) && (
                          <div className="empty-inline">
                            No {tab.toLowerCase()} yet. Add the first line
                            below.
                          </div>
                        )}
                        <button
                          disabled={locked}
                          className="button secondary"
                          onClick={() =>
                            patch({
                              lines: [
                                ...current.lines,
                                newLine(tab as Kind, current.pricing),
                              ],
                            })
                          }
                        >
                          <Plus size={18} /> Add{" "}
                          {tab === "Other Costs"
                            ? "cost"
                            : tab === "Labour"
                              ? "labour"
                              : "material"}
                        </button>
                      </>
                    )}
                    {tab === "Pricing" && (
                      <>
                        <p className="muted">
                          Quote-specific settings. Overhead/profit and
                          contingency are each added to the line selling-price
                          base, before tax.
                        </p>
                        <PricingFields
                          value={current.pricing}
                          disabled={locked}
                          onChange={(p) => patch({ pricing: p })}
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
                  <aside className="panel summary">
                    <div className="eyebrow">PRIVATE · INTERNAL ONLY</div>
                    <h2>Quote summary</h2>
                    <dl>
                      <div>
                        <dt>Estimated actual cost</dt>
                        <dd>{money(totals!.cost)}</dd>
                      </div>
                      <div>
                        <dt>Line selling prices</dt>
                        <dd>{money(totals!.base)}</dd>
                      </div>
                      <div>
                        <dt>Overhead / profit addition</dt>
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
                    <div className="profit-box">
                      <span>Expected profit</span>
                      <strong>{money(totals!.profit)}</strong>
                      <small>{totals!.margin.toFixed(1)}% profit margin</small>
                    </div>
                    <p className="tiny">
                      Profit excludes tax. Pricing defaults are editable in
                      Settings; existing quotes keep their own settings.
                    </p>
                    <div className="workflow">
                      {current.status === "Draft" && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            if (!current.lines.length) {
                              setError(
                                "Add at least one line before marking sent.",
                              );
                              return;
                            }
                            saveQuote({ ...current, status: "Sent" });
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
                    <h1>Pricing settings</h1>
                    <p>Set your starting point. Every quote can be adjusted.</p>
                  </div>
                </div>
                <section className="panel settings-panel">
                  <h2>Default pricing</h2>
                  <p className="muted">
                    Business rates start at zero until you choose them. Sample
                    quotes use fictional illustrative rates. Changes apply to
                    new quotes and newly added lines only.
                  </p>
                  <PricingFields value={settings} onChange={setSettings} />
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
                      if (saveStore({ ...store, settings }))
                        setNotice("Pricing defaults saved");
                    }}
                  >
                    <Check size={17} /> Save defaults
                  </button>
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
                          active.reduce((s, q) => s + calculate(q).subtotal, 0),
                        )}
                        note={`${active.length} draft & sent quotes · before HST`}
                      />
                      <Stat
                        label="Expected job profit"
                        value={money(
                          accepted.reduce(
                            (s, q) =>
                              s + calculate(q.job?.snapshot ?? q).profit,
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
                      const t = calculate(q.job?.snapshot ?? q);
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
                              <b>{q.name}</b>
                              <small>
                                {q.customer.name} <span>· {q.number}</span>
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
      {preview && (
        <CustomerQuote
          quote={preview}
          onClose={() => setPreview(null)}
          onMode={(mode) => {
            const q = { ...preview, mode };
            if (saveQuote(q)) setPreview(q);
          }}
        />
      )}
    </>
  );
}
