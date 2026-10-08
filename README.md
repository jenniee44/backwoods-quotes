# Backwoods Quotes — V2

A mobile-first internal estimating, customer quoting and job-profitability app for **Backwoods Building & Maintenance**.

## Stack and development

React 19 + TypeScript + Vite, with PDF.js plan rendering, Lucide icons, bundled DM Sans/Manrope fonts, plain responsive CSS, Vitest calculation tests, ESLint and Playwright browser checks. This small client application keeps the first version easy to maintain; business logic lives independently of the UI in `src/model.ts`.

Requires Node.js 22 or 24 and npm. From this repository:

```sh
npm ci
npm run dev
npm run build
npm run preview
npm test
npm run lint
```

Vite serves the development application on port 5173. For a restricted cloud machine, use `npm ci --cache /tmp/backwoods-npm-cache`. No credentials, external APIs or database are needed.

Browser tests: `npx playwright test`. The cloud config uses `/usr/bin/chromium`. For another machine, remove `executablePath` from `playwright.config.ts` and run `npx playwright install chromium` first. Screenshots and a sample printed PDF are written to `/tmp` by the browser tests.

## Current features

- Responsive overview with active draft/sent value, accepted-job expected profit, status counts, searchable quotes and jobs.
- Create and save customers, job details, scope, measurements, private notes and job photos.
- Separate labour hours/internal cost/customer rate; material quantity, unit, cost, markup and optional selling-price override; categorized other costs with optional selling-price override.
- Editable owner defaults and quote-specific overhead/profit, contingency and HST settings.
- Draft → Sent → Accepted → Converted job → Completed workflow. “Mark as sent” records status; it does not send email. Acceptance is recorded by the team following customer approval.
- Simplified or detailed customer quote, print styles and browser Print / Save PDF. Internal notes, measurements, photos, costs and profit calculations never appear in the customer document. Detailed quotes group common scopes and incorporate internal pricing additions into scope selling prices.
- Acceptance signature area, scope, terms, quote number/date and optional expiry.
- Sent and accepted estimates are locked. Conversion deep-copies the original lines and settings; actual labour/expenses live separately. Completed jobs show estimated versus actual costs and margins.
- Duplicate quotes into new drafts without actuals. Apply the editable Deck template; Basement Renovation, Bathroom Renovation, Kitchen Renovation, Framing / Carpentry, Addition, Interior Renovation, Exterior / Siding, Repairs & Maintenance, Custom / Blank Quote, plus the retained Fence and Garage / Shed templates also provide editable groups and suggested lines.
- Fictional initial quotes for three customers, clearly identified in the interface.
- Admin/Owner and Estimator development role switch. Only owners see/edit defaults. Both roles can manage quotes and jobs.

## Storage and access limitations

This is a working **single-browser development app**, not a deployed multi-user service. Quotes/settings/photos are stored under `backwoods-quotes-v1` in browser localStorage and survive reloads on that browser and origin. Do not enter sensitive real customer information yet. Clearing browser data removes records; there is no shared synchronization or backup. Tabs are not synchronized; use one editing tab. Storage errors are shown without discarding the in-memory quote. Job photos are limited to eight JPEG/PNG/WebP files under 700 KB each; Plans & Takeoff has separate PDF/image limits described below. The browser's total quota may require smaller files.

The role selector is not login authentication or a security boundary. A production deployment needs identity, server-side authorization and a database; users must never receive other tenants’ internal costing data. Customer quote preview is a separate allowlisted presentation, not a public sharing endpoint.

Business defaults are initially zero except 13% HST. Sample quotes use fictional illustrative rates (15% material markup, $75 customer hourly rate, 5% overhead, 3% contingency). Change defaults before creating real estimates.

## Data structure

- `Store`: versioned settings and quotes.
- `Quote`: identity, status, customer, project details, photos, dates, terms, presentation mode, optional template category, pricing and lines.
- `Line`: type, description, quantity, unit, cost, customer labour rate, material markup, nullable full-line selling override and other-cost category.
- `Job`: immutable original `Estimate` snapshot, conversion timestamp and separate actual entries.
- `Actual`: description, category, quantity/hours and actual unit/hourly cost.
- `QuoteTemplate`: named scope groups, suggested lines and optional customer-document defaults; Deck is implemented in V2.

Customers are embedded snapshots within quotes in V1. A future database can normalize customer records while preserving historical quote details. IDs use UUIDs. Quote numbers increment from BW-1001 locally; production numbering must be assigned transactionally on the server.

## Pricing calculations

Currency is CAD. Each line and percentage addition rounds to cents; display uses Canadian currency formatting.

- Internal labour cost = hours × internal hourly cost.
- Labour selling price = hours × customer hourly rate.
- Material direct cost = required quantity × (1 + waste / 100) × unit cost.
- Material selling price = direct cost × (1 + markup / 100), unless a full-line selling override is set (zero is a valid override).
- Other-cost selling price = direct cost × (1 + markup / 100), with optional full-line override; 0% markup passes through at cost.
- Base = sum of line selling prices.
- Overhead/profit addition = base × configured percentage.
- Contingency = base × configured percentage (not compounded on overhead).
- Subtotal = base + overhead/profit addition + contingency.
- HST = subtotal × configured HST percentage; customer total = subtotal + HST.
- Expected profit = subtotal − direct costs.
- Expected margin = expected profit / subtotal × 100. Zero subtotal returns 0% to avoid division by zero.

**Markup is not margin:** $100 cost with 20% markup sells for $120; profit margin is 16.67%. HST is excluded from profit and margins. Overhead/profit is a selling-price allowance; fixed company overhead is not automatically deducted as a job expense. Enter allocated actual overhead as a separate expense if needed.

Job reporting always uses the original snapshot: actual cost sums actual quantities/hours × actual unit costs, actual profit = original subtotal − actual cost, actual margin = actual profit / original subtotal, cost variance = actual cost − estimated cost (positive means over estimate). Profit is provisional until all actual costs are entered.

## Project layout

```
src/App.tsx             Screens and quote/job editor
src/CustomerQuote.tsx   Isolated customer document with print-safe data
src/model.ts           Types, pricing, lifecycle, persistence, seed
src/model.test.ts      Calculation and lifecycle regression tests
src/style.css          Mobile/desktop/print styles
src/main.tsx           React entry
e2e/workflow.spec.ts   Browser workflow, privacy, storage and layout checks
```

## Next development steps

1. Add a backend with a relational database, migrations, backups and audited server-side estimate snapshots.
2. Add proper owner/estimator authentication and server-enforced permissions; separate customer documents from internal data at the API boundary.
3. Move photo uploads to authenticated object storage with size limits and image processing.
4. Add export/import, customer lookup, template management and transactional quote numbering.
5. Add dedicated PDF generation and customer acceptance/email sharing with secure expiring links.
6. Add concurrency handling, audit logs, retention policy and deployment monitoring before production use.

V1 deliberately excludes invoicing, payroll, bookkeeping, scheduling, time clocks, inventory and QuickBooks integration.

## V2 upgrade

V2 extends V1 in place. Existing branding, customer quoting, job actuals, quote duplication and profitability reporting remain. The development role switch and browser-local storage limitations still apply.

### Estimating defaults and faster entry

Settings now includes internal labour cost, customer labour rate, material and Other Costs markup, contingency, HST, optional overhead/profit adjustment, target minimum gross margin and default validity days. Values start at zero except 13% HST; validity zero means no automatic expiry. Settings also stores customer-document defaults, including payment schedule, assumptions, exclusions, change orders, timeline, permit and engineering responsibilities, and display preferences.

New quotes copy defaults; existing quotes never read live defaults. New lines inherit their quote’s rate/markup profile until explicitly overridden. Changes to that quote profile affect inherited lines, while overridden and legacy lines retain their own values. Company Settings changes affect only newly created quotes. Changing quote validity days updates its expiry; expiry remains directly editable. Estimated labour hours are hidden from customer documents by default.

All numeric controls keep an edit string separately from the numeric data model. Focusing a zero clears it for natural replacement. Blank numeric edits are held locally; they commit their default on blur (including when Save is clicked). Zero-valued fields do not acquire unwanted leading zeros. Percentages, rates and validity days step by 1; quantities and unit costs support decimals. Blank selling overrides remain `null` (automatic). A zero override explicitly charges zero. Page-number blanks mean no page reference. Negative/non-finite numbers are rejected when saving.

### V2 formulas

For materials, **purchase quantity = required quantity × (1 + waste% / 100)**; **material cost = purchase quantity × unit cost**. Quantities are not automatically rounded to whole boards/bags: the contractor must choose appropriate purchasing quantities/waste. Waste changes purchased cost, whereas markup changes the selling price. Customer quantities use required quantities, never waste-adjusted purchase quantities.

Labour selling price uses customer hours × rate; internal cost uses hours × internal rate. Materials and Other Costs sell at their direct cost × (1 + markup% / 100), unless overridden. Other Costs markup 0 passes through at cost. Each line rounds to cents.

Contingency and optional overhead/profit additions both use the sum of line selling prices, independently. They are optional selling-price adjustments, not a second automatic profit calculation. No adjustment compounds on the other, and no global material markup is applied a second time. HST applies only to the final subtotal.

Gross profit = pre-tax subtotal − total direct job costs. Gross margin = gross profit / subtotal. Break-even price = total direct job costs. **Target selling price = direct job costs / (1 − target margin / 100)**, rounded UP to the nearest cent to avoid missing the target. Target margins must be below 100%. Targets are advisory; the app never silently changes your selling prices to meet them. Company fixed overhead is not automatically deducted: this is job gross profit, not company net profit.

The internal summary breaks down costs and selling prices by Labour / Materials / Other Costs, plus contingency, adjustment, subtotal, HST, gross profitability, break-even and target price. An amber warning identifies margins below the quote's inherited/edited target.

### Customer documents and lifecycle

Customer documents can independently hide quantities or labour hours. Detailed mode always aggregates customer-facing scope sections. Scope labels and descriptions are editable per quote. Grouped output sums selling prices and does not show internal rates, costs, waste, markup, notes, profit or margin. Simplified output remains a single project amount. Overhead/profit and contingency are normally distributed into scope selling prices, with cent reconciliation; no artificial coordination line is added. Contingency can be explicitly exposed as an allowance.

Quotes include editable payment/deposit schedule, assumptions, exclusions, change orders, timeline, permit and engineering responsibilities, expiry, existing terms and acceptance area. Owner defaults can populate future quotes; `QuoteTemplate.details` supports template-specific text. Actual customer wording should be reviewed for each project.

Drafts can save without customer/scope information or completed lines. Mark as Sent opens a checklist warning about missing customer/job name, scope, labour, materials, line descriptions, zero selling prices, low margin, missing payment schedule and expiry. Warnings require explicit acknowledgement to proceed. Sending snapshots and locks the estimate and customer details. Sent and accepted quotes can be duplicated for revisions. Later defaults/templates do not change historical prices. Conversion to a job copies the sent snapshot and keeps actuals separate. Display options on an already-sent print preview are temporary; they do not rewrite the historical record.

### Deck template and Plans & Takeoff

Choose a construction template from Customer & job, then press Apply selected template. Project category is just a label; it does not insert items. Empty quotes apply immediately; quotes with existing lines ask for confirmation. The applied template name and added-item count are shown, and the first populated section opens. Repeat applications are blocked in both UI and model, including complete matching catalogs from older V2 quotes without application history. It **appends** suggested scope groups and lines while preserving existing lines. Template quantities start at zero. Quote defaults provide rates/markups unless the contractor overrides them; no Muskoka prices or engineering assumptions are invented. Lines remain editable. The template registry includes Deck, Basement Renovation, Bathroom Renovation, Kitchen Renovation, Framing / Carpentry, Addition, Interior Renovation, Exterior / Siding, Repairs & Maintenance, Custom / Blank Quote, plus the retained Fence and Garage / Shed. Further templates can be added later.

Plans & Takeoff supports PDF, JPEG, PNG and WebP attachments (eight documents per quote, up to 2 MB each). PDFs render inside the app with PDF.js and page controls; originals can be downloaded. Documents can be replaced or removed. The browser's overall storage quota can be reached before these limits—use compressed drawings and keep original plans elsewhere. Attachments are saved with the quote; the file reader does not auto-save. This is a local-storage foundation, not large-plan archival storage.

Takeoff items store description, quantity, custom/common unit, attached-document ID, optional page number, notes/source references, confidence and Proposed/Reviewed status (Reviewed is the contractor approval gate). Only contractor-reviewed items can be converted to estimate lines, once per item. Changes reset status to Proposed. Replacing/removing a source resets related items for review but leaves previously converted estimate lines untouched; check those separately. Takeoff confidence is user-assessed, not an engineering assurance.

Optional **AI-assisted drawing interpretation** is now implemented through the secured Pages Function described below. Analysis populates `TakeoffItem` records as Proposed, with document/page provenance, requiring explicit contractor review and approval before `takeoffToLine` conversion. Rendering a PDF does not validate its engineering or measurements.

### Safe V1 migration and backups

The storage key stays `backwoods-quotes-v1` for continuity on the **same browser and origin**. The record format is now version 2. `migrate` validates V1 data, clones it, adds empty/new defaults, and preserves customers, notes, photos, quote numbers, dates, actuals and original financial figures. Existing Other Costs lines get 0% markup because V1 ignored their inherited markup field. Existing materials get 0% waste. Historical sent/accepted quotes receive snapshots preserving their prices. Existing customer-document text is retained.

Loading migrates in memory without writing over V1. Before the first V2 save, the original JSON is copied unchanged to `backwoods-quotes-v1-backup`; only then is V2 saved to the original key. If backup/save fails, an error is shown and the original record remains. Invalid/unsupported records are never replaced with seed data. Owner Settings has **Export data backup**, which downloads the current V2 records, including private costing and files. Keep backups securely. Do not switch a V2 browser back to V1: V1 cannot read the new version. Different deployments, ports or devices do not share localStorage.

### Testing V2 before pushing/deploying

On your computer, extract the V2 source ZIP provided with the completion report, or use this local checkout/commit (the GitHub main branch still contains V1 until you choose to push V2). A fresh clone from GitHub before pushing V2 will only contain V1. Install Node.js 22 or 24 first if needed, then open Terminal in the extracted parent directory:

```sh
cd backwoods-quotes
npm ci
npm run dev
```

Open `http://localhost:5173` in your computer's browser. No credentials or environment variables are required. For an isolated trial, use a new browser profile with fictional data; this does not exercise migration of your existing browser records. To test migration, serve V2 on the exact origin previously used for V1; keep a backup and never clear browser data. A separate Vercel or other deployment origin will start with new sample data.

To test on your iPhone without deploying: connect your computer and iPhone to the same Wi-Fi. Keep the Vite server running, find your computer's local IPv4 address in its network settings, then open `http://YOUR-COMPUTER-IP:5173` in Safari. Allow the development server through your computer firewall only on your private local network. The app supports UUID generation on HTTP LAN previews. This cloud onboarding machine does not provide a public preview URL; run the repository on your own computer for this approach. Chromium tests simulate a 390px mobile viewport; physical iPhone/Safari testing remains recommended.

Try this checklist:

1. Set defaults and payment/display text in Settings; create a quote and confirm inheritance.
2. Add 40 boards at $18, 10% waste, 15% markup: purchase 44, direct cost $792, selling $910.80.
3. Enter separate labour cost/customer rates and Other Costs markup; clear numeric fields and try a zero selling override.
4. Apply the Deck template, edit groups and complete its zero-value placeholders.
5. Attach a small PDF, record a takeoff item, review it and convert it to a material line.
6. Preview simplified and grouped detailed quotes; toggle quantities/hours and Print / Save PDF. Check that internal information stays private.
7. Mark Sent, acknowledge checklist warnings, record customer acceptance, convert to a job and record actuals.
8. Change defaults, reload and confirm the historical estimate remains unchanged. Export a backup.

Automated validation:

```sh
npm run lint
npm test
npm run build
npm run test:e2e
```

Recommended later work: proper authentication/shared database, object storage for large plans, customer sharing/acceptance, additional template management, and further live-plan validation of AI takeoff proposals. Shared services remain separate from the V2 workflow; no accounting, payroll, inventory or scheduling has been added.

## Refinements following V2 field testing

The `v2-preview` branch includes these refinements; main remains V1. Company Settings → quote defaults → optional line overrides is explicit in `effectiveLine`. New lines have inheritance flags for labour cost, customer rate and markup. Editing a line switches that value to an override; selecting “Use quote …” re-enables inheritance. Material and subcontractor markup are applied exactly once. Old V1/V2 lines without flags retain explicit stored values, so their historical selling prices do not change. `pricingRevision: 3` updates new-quote presentation defaults to quantities OFF, hours OFF and grouped scopes ON while keeping existing quote preferences and document text.

The normal Pricing tab shows the seven common quote controls. Advanced pricing contains internal labour cost and quote validity. A calculation explanation reconciles line selling prices, overhead/profit, contingency and subtotal. Existing document defaults remain editable in Settings and copied into new quotes.

Scope groups belong to a quote/template, never a global Deck list. New custom quotes start with no groups. Typing a group makes it available to other line types on the same quote; committed custom groups are retained in its catalog. Templates preload their own catalogs. Unit and group pickers are searchable, touch-friendly and permit custom text. Materials have expandable supplier, SKU and material notes fields, all excluded from customer projections.

Detailed customer scopes combine Labour, Materials and Subcontractors & Other Costs in the same group. Unassigned lines use “Project Work” rather than exposing raw descriptions in grouped mode. Internal overhead/profit and contingency are allocated proportionally by selling value using largest-remainder cent allocation, so every customer section sums exactly to the subtotal. Showing contingency separately is explicit opt-in. Quantities and labour hours are independently opt-in; enabling quantities can disclose line descriptions beneath a group, so inspect the customer preview before sending.

Short permit/engineering entries such as “homeowner” render as complete customer-facing responsibility sentences. Fully written custom sentences remain unchanged. This is wording assistance, not legal or engineering advice.

Quotes autosave locally after a 600 ms pause in model changes. The header shows Saving…, Saved or Save failed. Invalid data or storage quota errors leave the last saved record intact and show an error; correct it and retry. Blank numeric text is temporary until blur/save, so a still-focused blank field has not yet changed the saved numeric model. Manual Save remains available. Tabs stay at the top of the viewport while scrolling. Sending requires checklist review and a native confirmation; `sentAt` records the timestamp and the financial snapshot locks.

Plans & Takeoff explicitly shows Upload → Proposed → Contractor review → Approve → Convert. Analyze Plans uses the secured AI endpoint described below when its server configuration is available; manual takeoff remains available. The `WorkflowStage` type prepares Lead through Paid without adding status buttons. Accepted jobs have a Change Orders foundation panel, and `ChangeOrder` / `changeOrderTotals` prepare separately approved contract adjustments. Entry, approval and job-contract adjustment application are intentionally deferred; original accepted estimates remain untouched. These are architecture hooks, not claims of a working change-order approval service.

Regression coverage includes inheritance vs overrides, double-markup prevention, exact customer group reconciliation, metadata privacy, expiry boundaries, template/group reuse, sent snapshots, numeric steps/blank commits and autosave failure. Physical Safari testing on your Mac/iPhone is recommended after this branch is built by your preview project.

## Production-readiness refinement (local V2 preview)

The React/TypeScript/Vite application and static Cloudflare Pages build remain intact. The subsequent AI implementation adds the server-side Pages Function described below, without committing provider credentials. `npm run build` type-checks both browser and server code and produces the static `dist/` folder; Cloudflare also compiles `functions/`.

- **Allowance entry:** Other Costs with unit `allowance` and quantity one (or an unpriced zero template suggestion) show a single Estimated cost field. Entering the amount sets quantity one. Quantity-based entry remains available; switching an existing line to an allowance preserves its extended internal cost and selling override. No saved line is repriced on load. Coordination is a real project-cost allowance; the UI warns against also using it as general overhead recovery.
- **Customer documents:** Summary is the UI label for the existing `Simplified` stored mode. Detailed output always aggregates customer scopes and never falls back to private line descriptions, even with an older ungrouped preference. The grouping indicator is always checked for privacy. Quantities and labour hours remain explicit opt-ins; even then private line descriptions are not projected. Zero selling-value rows are excluded before overhead/contingency allocation. `customerDocument()` is an explicit public allowlist used by the renderer. It also suppresses known old helper/placeholder lines at display time without deleting saved text. Customer scope descriptions are intentional public content; review them before sending.
- **Editable scope sections:** Optional `Quote.customerScopes` contains `{label, description, sourceGroups}` mappings. Bathroom templates map granular internal groups to six broad public sections. Existing bathroom quotes use these presentation defaults when the new metadata is absent; their estimated values do not change. Customer & job has a Customer scope sections editor. Other/custom scope groups remain editable and aggregate by public label.
- **Company defaults:** Optional `Store.company` stores company name/contact/address. Each new quote snapshots it into optional `Quote.company`; older quotes use the Backwoods branding fallback. Optional customer `mailingAddress` is separate from the existing job `address`. Settings already owns recurring pricing, terms, payment, assumptions, exclusions, change-order language and validity; copies remain independent on existing quotes. Empty optional sections do not print. Permit/engineering responsibilities and customer document text remain editable per quote.
- **Payments:** Explicit percentages in a payment schedule must sum to 100% (decimal percentages supported). A blank/non-percentage schedule is allowed. Invalid percentage totals block saving and the Print button, with an actionable message; old saved schedules still load. Payment examples are placeholders, not configured legal/payment promises.
- **Profitability:** `model.calculate()` remains the single formula source. The private summary separates direct cost, customer pricing and gross profit, and displays target status, margin difference and the advisory minimum pre-tax price/increase. HST is never profit. General overhead & profit adjustment and contingency each apply to the same base selling-price sum, independently. The quote price is never changed automatically to reach a target.
- **Takeoff:** Stored `Reviewed` remains compatible; the UI calls it Approved. New converted lines retain optional private `takeoffSource` snapshots (source document name/page, quantity/unit, confidence and notes), so removing a drawing/takeoff does not remove traceability or estimate lines. Edits still require review again. Old converted rows without snapshots retain their existing takeoff IDs.
- **Compatibility:** All new fields are optional and validated when present; V1/V2 numeric estimates, original backups, status snapshots and actual costs remain supported. No automatic rewrite of historical pricing or removal of quote information is introduced. Local browser storage remains the data store.
- **Printing:** Letter paper, hidden editor/preview controls, repeated table headers, heading/content grouping, non-orphaned paragraphs, usable signatures and totals. Long terms can flow across pages. Mobile/tablet/desktop overflow checks and long-PDF tests are included.

### Secure plan analysis and future shared data

`src/planAnalysis.ts` isolates the `PlanAnalysisService` contract and validates/adopts suggestions as **Proposed** only. Analyze Plans calls the secured `/api/plan-analysis` Pages Function using server-side secrets, as documented below. No fake results or browser API keys are implemented. Provider approval/converted IDs cannot bypass contractor review. Analysis is estimating assistance, not engineering/design/code/permit approval. Obtain explicit contractor review and approval before conversion.

Persistence already has one boundary: `model.load()` / `model.persist()` and `migrate()`; components do not directly read/write localStorage. Future shared data/auth should replace that boundary with an authenticated company-scoped repository, retain versioned migrations/backups, add server-side role checks and concurrency handling, and move attachments to authorized object storage. The current development role switch is not production authentication. Shared data and full application login remain deferred; Cloudflare Access protects the AI endpoint, while estimates remain local to each browser.

For manual Safari testing: create a Bathroom quote; enter one plumbing allowance; edit broad customer section text; check zero sections disappear; switch Summary/Detailed; verify defaults remain independent after Settings changes; check a decimal/blank input and a payment schedule totalling 100%; approve a takeoff then replace/remove its drawing; print a long Letter quote and review page breaks, signature, totals and privacy.

## AI-assisted Plans & Takeoff — V2 preview

### What is implemented

The existing workflow now supports **Upload → Analyze → Review → Approve → Convert → View Estimate**. PDF/JPG/JPEG/PNG (and existing WebP attachments) are supported. Choose which attached documents to include. Each file is limited to 2 MB, PDF attachments to 50 pages, and one analysis to **8 MB total** (up to eight smaller files). Browser storage may fill before those limits: export backups, select manageable source sets and keep unnecessary personal information out of plans. Original attachments and extracted results still use local browser storage, not a new database.

`functions/api/plan-analysis.ts` is a Cloudflare Pages Function at `/api/plan-analysis`. `server/handler.ts` owns authentication, same-origin checks, bounded requests, file validation, rate limits and generic errors. `server/access.ts` verifies Cloudflare Access JWT signatures/issuer/audience/expiry against Access's public keys. `server/provider.ts` isolates OpenAI Responses with **GPT-5.4 Mini (`gpt-5.4-mini`)**, multimodal PDF/image input, strict structured JSON output and `store:false`. `gpt-5.4-mini` is the default; `OPENAI_MODEL` can override it with another compatible model. There is no provider SDK/key in the Vite client and no automatic pricing, scope acceptance, customer-record extraction or engineering verification.

`shared/analysis.ts` defines and validates the schema on server and client. Results contain project/drawing metadata, informational dimensions, proposed components, source ID/page/reference, confidence, assumptions and warnings. Unknown quantities remain **null**, labelled Requires contractor input, never converted to invented zeros. Evidence labels separate Plan fact, Calculated quantity, Estimating suggestion and Contractor input required. The prompt explicitly surfaces DO NOT SCALE / VERIFY ON SITE / BY OTHERS / OWNER SUPPLIED / OPTIONAL / ALTERNATE / NOT IN CONTRACT notes and prohibits authoritative pixel scaling, prices and business assumptions. The app validates PDF readability on attachment; the server validates size/MIME/signatures and lets the provider reject unreadable contents. File signatures are not a complete PDF/image security scanner.

`src/planAnalysis.ts` performs same-origin API requests, file-content fingerprinting, adoption and review guards. Every estimate-relevant suggestion enters **Proposed**; new dimensions and document observations remain in the Plan Summary, with no approval IDs/status trusted from the response. A contractor must enter missing values and explicitly mark each item reviewed before approval. Untouched low-confidence items cannot be bulk approved. Editing resets review/approval. Approve selected and Approve all reviewed operate only after review; rejected or informational items cannot become estimate lines. Labour must use verified hours, not a count of components. Reviewed destination controls conversion. New lines use the existing pricing engine/company quote profile, with zero unknown material/other costs and a Pricing required notice. Existing manual rows and customers are untouched.

Optional takeoff metadata includes origin, evidence type, category/destination, assumptions/warnings, source name, analysis ID/fact key and review acknowledgement. Optional `Quote.analysisReports` holds private project/dimension summaries, warnings, assumptions, timestamp and file-content fingerprints. Repeated analysis of identical selected files is blocked; repeated identical facts across overlapping analyses are skipped. Existing manual `Reviewed` status remains compatible as legacy approval; new AI rows use explicit Reviewed → Approved. Converted-line provenance persists after source deletion. Public customer documents continue to consume their existing explicit allowlist: none of these private metadata fields are projected.

### Required external services

- An **OpenAI API account with API billing** and a project API key. A ChatGPT subscription alone does not provide API credits. Create a project/key at <https://platform.openai.com/api-keys>. Use a dedicated project, review billing and configure usage alerts/limits supported by your account. Budget alerts are not necessarily hard spending caps.
- Cloudflare Pages Functions, **Cloudflare Access** (allow only your team's email addresses) and a **KV namespace** for private analysis quotas. No shared quote database or authentication migration is introduced. The existing development role switch remains unrelated to endpoint authorization.

No live credentials are configured in this workspace. The owner reports a successful live residential deck-plan analysis on the existing preview. The subsequent takeoff-quality improvements below have been tested locally with isolated fixtures, not revalidated against that drawing through a live provider call. Automated tests use clearly isolated fixtures, never product-side pretend AI results.

### Beginner-friendly Cloudflare setup — only after approval

These instructions apply to a **separate V2 preview hostname/environment**. Do not change the production V1 hostname, its Access rules or Production variables.

1. In OpenAI, create the API project/key and enable API billing. Keep the key private; do not paste it into this chat, React code, GitHub, a `VITE_` variable or browser Settings.
2. In Cloudflare, open the Pages project → **Settings → Variables and Secrets** → select **Preview**. Add **Secret** `OPENAI_API_KEY` with your OpenAI API key. Add **Text** variable `OPENAI_MODEL` with `gpt-5.4-mini` (optional; this is the default). Do not set `DEV_ALLOW_LOCAL` in Cloudflare.
3. In Cloudflare **Zero Trust → Access → Applications**, add a **Self-hosted** application for the exact V2 preview alias (for example, `v2-preview.YOUR-PROJECT.pages.dev`). Protect the whole preview hostname, not the V1 domain. Add an Allow policy containing only your approved email addresses, with email one-time PIN or your chosen identity provider. If a separate Preview project is used, use its actual hostname instead.
4. Copy that application's **Application Audience (AUD)**. In Pages **Preview** variables, add `CF_ACCESS_AUD` with that value. Find your Access **team domain** (for example, `your-team.cloudflareaccess.com`) in Zero Trust settings; add it as `CF_ACCESS_TEAM_DOMAIN`, without `https://` or a slash. These identify the Access application; they are not provider API keys.
5. In Cloudflare **Storage & databases → KV**, create a namespace such as `backwoods-preview-analysis-limits`. In Pages **Settings → Bindings**, add a **KV Namespace** binding named exactly `ANALYSIS_LIMITS`, pointing to that namespace for Preview. It stores only hashed identity/file keys and counters/short-lived locks, not plans, extracted text or provider keys.
6. Use a **Git-based Pages preview build** with command `npm run build`, output directory `dist`, and the repository root as the root directory. Pages must also compile the repository's `functions/` folder. Dragging only static `dist` files into the old static-site uploader does **not** install the API function. Publishing `v2-preview` triggers its connected Cloudflare build; do not change the V1 deployment.
7. Open the protected V2 preview alias and sign in using your allowed email. Create a draft, upload a redacted/readable deck plan, select its files, and click **Analyze Plans**. First verify all source pages, dimensions, notes, units, evidence classifications and missing quantities. Mark reviewed, approve, then convert. Enter your own supplier costs/waste and verify quote rates before sending anything to a customer.

The endpoint fails closed if Access, the server key or production KV binding is absent. Access tokens are cryptographically verified, not merely trusted because a header exists. Cross-origin POSTs are rejected. Unprotected hash preview URLs do not bypass the JWT check. KV applies a **best-effort 20 attempts/day/user** and a two-minute identical-request lock; attempts include failed provider calls. KV is eventually consistent, so this is not an atomic concurrency/spending guarantee. For a hard multi-user quota, use a Durable Object/atomic backend later; provider-side spend controls and a Cloudflare rate-limit rule are advisable before broader use. Browser cancellation/disconnect may not prevent a provider charge for a request already started.

### Local development

Use the repository's Node/npm version requirements, then:

```sh
npm ci
npm run build
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` **locally** to put the API key in `OPENAI_API_KEY`. It is ignored by Git. Do not change the empty tracked example to contain a real key. `DEV_ALLOW_LOCAL="true"` bypasses Access only for actual localhost/127.0.0.1 request URLs; keep this development server private. Run the API in one terminal:

```sh
npm run dev:api -- --ip 127.0.0.1 --compatibility-date 2026-10-06
```

Run Vite in another, restricted to your own machine when using a paid key:

```sh
npm run dev -- --host 127.0.0.1
```

Vite proxies `/api` to the local Cloudflare runtime at port 8788. Static `vite preview` alone cannot run the API. The cloud workspace needed a writable CLI configuration/log location, so its verified command also set `XDG_CONFIG_HOME=/tmp/backwoods-cloudflare-config`, `WRANGLER_LOG_PATH=/tmp/backwoods-wrangler.log` and `WRANGLER_SEND_METRICS=false`. These are local tooling settings, not Cloudflare production bindings. Local tests do not need a paid key.

### Privacy, validation and remaining checks

The **selected original files** (including any embedded names/addresses, title blocks and metadata) are sent over HTTPS through Cloudflare to OpenAI, along with opaque source IDs. Filenames sent to the provider are generic. Prompts tell the model not to intentionally extract personal information; that cannot guarantee a plan contains none. Redact unnecessary details yourself. No company costs, rates, profit, quote/customer records or business notes are sent. The code does not log file contents/extracted text or return credentials. `store:false` disables stored Responses; provider abuse-monitoring/retention rules still apply—review <https://platform.openai.com/docs/guides/your-data>. Local reports/backups contain private takeoff information and should be kept securely.

Run `npm test` (model/schema/provider/handler tests), `npm run test:e2e`, `npm run lint`, `npm run typecheck`, and `npm run build`. The build type-checks both browser and server code. Wrangler locally compiles the actual Pages Function. Tests cover schemas, unknown quantities, low-confidence review gates, edit/reset, approval/rejection, conversions, duplicate protections, preserved manual pricing, private provenance, auth signatures/audience, API failures, file limits, cancellations, and customer allowlist privacy.

For a new preview, configure the key/Access/KV and verify allowed versus denied login and function routing. Existing working V2 configurations remain compatible; no new binding or secret is required. After any takeoff-quality update is published with approval, repeat a **real OpenAI call with your deck plan** and audit each fact. The benchmark drawing and live credentials are not available in this workspace, so extraction quality of the latest prompt remains unverified locally. Large/scanned/multi-revision plans may return partial information, require contractor input or need splitting. This feature is estimating assistance, not structural design, code/permit approval or authoritative site measurements. Shared/cloud file storage, complete shared-user authentication and hard atomic quotas remain future work. Nothing in this task was committed, pushed, merged or deployed.

### Contractor takeoff quality improvements (local; awaiting publication)

`server/instructions.ts` prioritizes readable construction specifications, explicit dimensions, physical components, supported calculations, scope and verification before metadata. It includes a deck reading checklist without project-specific counts, and applies the same evidence rules to renovations, bathrooms, additions and framing. Labour scopes remain useful descriptions with **null hours** until entered by the contractor. No model-generated labour hours are adopted.

The strict provider schema adds contractor summary sections and per-item `scopeGroup`, `specification`, `location`, `sourceFacts`, `calculationBasis`, `quantityMethod`, `itemRole` and `subcontractorBasis`. These fields are optional on historical saved records and older responses. Existing quotes/reports are not rewritten. `scopeGroup` uses the existing free-text construction-scope architecture, while `category` continues to use the existing trade/cost dropdown. AI groups and evidence remain private; conversion does not automatically use AI group text as customer-document labels.

`shared/takeoff.ts` normalizes validated new results on server and client. Declared visual scaling, calculations without both source facts and a calculation basis, counts without source facts, and unknown methods leave quantities blank. Written dimensions are not discarded just because DO NOT SCALE is present. It cannot independently verify that a model correctly read the source or performed correct arithmetic; review the visible equation and drawing before approval. Normal carpentry is not classified as subcontracted without positive by-others evidence. Reasonable separate trades remain flagged suggestions requiring confirmation.

Document observations/support symbols stay in summary source information, not convertible cards. A support-location count can be attached as footing evidence only when document/page/location/count match, without generating another material row. Conservative semantic deduplication normalizes narrow synonyms (such as concrete footings/piers), keeping distinct documents, pages, locations, specifications, quantities and destinations separate. Duplicate evidence/assumptions/warnings merge within new results using the lower confidence. Conflicting quantities/specifications remain separate and receive a warning. Overlapping results skip retained matching AI items without modifying their review, approval, conversion or original evidence. Manual rows never participate in AI deduplication. Broad/fuzzy paraphrases still need contractor review.

The review UI groups construction scope, keeps item/specification, quantity/unit, confidence/evidence, source page and the first verification warning visible, and puts source facts/calculation basis/assumptions/advanced edits in expandable **Evidence & editing details**. Review/Approve/Reject/selection/approved-only conversion remain explicit. Evidence edits reset review and approval. Summary shows project/sheets, major scope, readable specifications, dimensions, unknowns and site verification; longer lists and source observations expand as needed.

Converted-line `takeoffSource` snapshots preserve calculation basis, source facts, specification/location, evidence type, confidence and warnings privately even after source removal, and remain available through expandable private evidence in the estimate editor. The customer document allowlist is unchanged, with regression tests for non-zero customer pricing and removed sources, plus browser/PDF privacy checks. Browser tests use the configured Chromium executable; PDF text assertions also require Poppler’s `pdftotext` on the test machine (installed in this cloud workspace). `gpt-5.4-mini`, Cloudflare Access, `ANALYSIS_LIMITS`, upload limits, rate limits, provider URL and secret configuration remain unchanged. No new configuration is needed for an already working V2 preview. These local changes have not been committed, pushed, merged or deployed.

### Original PDF fidelity and detailed construction-sheet reading

The prior PDF.js preview used `scale = min(2, 900 / pageWidth)` and a single whole-page canvas, displayed with `width:100%`. It had no in-app re-rendering zoom and did not explicitly account for device pixel density. A 36-inch-wide sheet was rasterized to only 900 pixels (about **25 DPI**); 6-point text was about two pixels tall. This was a **preview defect**, not PDF upload recompression. Upload has always used FileReader's original data URL, and the provider still sends those identical bytes as OpenAI Responses `input_file`. No preview thumbnail is used as an analysis source. OpenAI's internal PDF rendering/vision resolution is outside this app's control and has not been measured here; an unreadable AI result does not prove that the original drawing was blurry.

The viewer now zooms/re-renders original PDF operators and scrolls a virtual page, rendering only the visible viewport at device density (up to 3×, with a 2048-pixel-side allocation cap). This avoids giant Safari canvases and keeps the sheet inside the editor rather than widening the whole page. **Fit sheet** is for navigation; choose **Zoom drawing**, then scroll to notes/details. Available source detail is re-rendered, not interpolated from an old 900-pixel bitmap. Original downloads remain byte-identical. The fallback remains downloading the original into your PDF app if a browser cannot render it.

Analysis retains the **original native PDF**, and `src/preparePlanAnalysis.ts` adds a bounded supplemental **selectable text layer** extracted by PDF.js. It preserves physical page references, readable glyph strings/line breaks and page dimensions; no OCR is used. Text is limited to 8,000 characters per page, 60,000 per source and 120,000 per request. Truncation, unavailable text and absent selectable layers are explicitly labelled in the request and the **Analysis source quality** disclosure. The full original PDF is still sent when the text supplement is truncated. Supplemental text is temporary and is not persisted into customer fields/backups. Glyph mappings/reading order can be imperfect; the prompt requires cross-checking the original visual information, flagging conflicts, and leaving unknown values as Contractor input required.

For fine notes on a large sheet, zoom/scroll to the region and click **Include this view in analysis (250 DPI)**. `src/pdfSource.ts` renders that visible region **directly from the original PDF** at 250 DPI to compact PNG or high-quality JPEG (see analysis package encoding below), independent of preview/device resolution. It never copies the preview canvas, converts the whole sheet into a thumbnail, recompresses the PDF, or resizes original uploaded images. A detail must be at most 4096 pixels per side, eight million pixels and 2 MB; too-large regions are **refused**, with guidance to zoom into a smaller area. There is no automatic resolution reduction; encoding-only JPEG fallback is bounded to 96%/92% quality for derived views. These are rendered detail regions, not OCR or authoritative scaled measurements. Enlarging an embedded low-resolution scan cannot recover missing information.

Up to **24 temporary detail views (up to 20 automatic)** can accompany selected PDFs. They carry original source ID, physical page, top-left bounds in the rotated PDF viewport and render dimensions/DPI. The server validates bounds, count, PNG/JPEG header/dimensions, declared encoding quality and size; the provider sends them as separate `input_image` content with `detail:"high"`, while retaining native PDF context and the same original source IDs/pages. Detail coordinates are source locations only, never permission to infer construction dimensions from pixels. The structured takeoff output, review/approval requirements and public customer allowlist are unchanged. Original bytes plus details share an **8 MB** binary per-request budget, each original remains at most **2 MB**, and JSON remains bounded to **12 MB**. No new upload/API/Cloudflare configuration is required. Remove details/select fewer sources when over a limit; originals are never silently degraded.

Details remain temporary when leaving the tab and are invalidated by replacing/removing the corresponding original PDF. File fingerprinting and KV duplicate locks include detail-view content, so genuinely different views can be analyzed without weakening daily rate limits. Text is untrusted drawing content (including possible title-block personal data), not instructions; redact unnecessary information in the original before uploading. No extracted text, previews or detail views can enter customer quotes/PDFs through the customer-document allowlist. Native PDFs, extra text and detail images can increase provider input tokens/cost; no live cost or model reading-quality measurement was performed locally.

Quality regression tests use a synthetic 36×24-inch vector sheet with 6-point construction notes. They verify byte-identical downloads/API source, exact selectable text extraction, Retina/scroll re-rendering, independent 250 DPI lossless detail generation, oversized-region refusal, stale-view invalidation and customer/PDF privacy. Unit/server tests cover text/page/file/request limits and retained native provider input. Physical Safari and a repeat live call with your actual plan remain necessary to validate the final user-visible/model reading quality. These changes are local; no commit, push, deployment or external configuration change was made.

PDF viewer rotation is a view-only clockwise quarter turn (Rotate left/right), remembered per document/page for the current app session, including when switching editor tabs. It never rewrites the attachment. Zoom/Fit sheet and panning use the rotated PDF.js viewport. Temporary 250 DPI details render the visible region directly from the original PDF in that orientation, include absolute clockwise `rotation` (including intrinsic PDF `/Rotate`) and rotated top-left point coordinates, and retain the existing lossless size limits. Replacing the source resets its view orientation and invalidates detail views. Original PDFs still travel through native PDF analysis; rotation does not alter selectable text or customer documents.

Saved quotes can be permanently deleted from the editor’s always-visible **Quote actions → Delete quote** section. The explicit confirmation identifies the quote/customer/project and warns that deletion cannot be undone. Cancellation leaves storage untouched; success returns to Quotes. Deletion removes the quote and its embedded photos, plans, takeoff and analysis metadata, and redacts that quote from the local legacy migration backup without removing unrelated backup records. Exported/downloaded backups outside the app are not changed.

`Store.lastQuoteNumber` records the highest saved/deleted quote number, initialized from existing records when loading older data; new and duplicated quotes use it so deletion cannot recycle numbers. If a deleted quote has a job, `Store.jobs` keeps a separate job context record (using the existing editor-compatible record shape), its customer/contract context, original estimate figures, actual costs, workflow and change orders. Quote-only uploads, analysis, photos, internal notes and attachment provenance are excluded from that retained record. Jobs remain visible, editable and exportable through Jobs, without recreating the deleted quote. Settings and other quote/job records remain unchanged. Deletion reports storage/backup failures and does not show success until persistence completes.

Plans & Takeoff now separates structured `sourceObservations` (transcribed facts with source/page/detail-view index, confidence and evidence) from proposed estimate candidates. New analyses are prompted to return specific components instead of generic framing placeholders. Supported readable component observations and specifications attached to dimension records can be promoted into material candidates; a dimension/spacing value is never substituted for purchase quantity. Summary prose without structured source evidence is not parsed into quantities. Existing quotes/reports remain compatible and are not rewritten.

Material candidates use Posts, Beams, Joists, Ledger, Blocking, Footings / concrete, Hangers / connectors, Structural fasteners, Decking, Fascia / trim, Guards / railings, or Stairs / stringers. These are material categories, separate from the existing subcontractor/other-cost dropdown. Specifications stay visible even when quantity remains blank. Counted beam **runs** do not become boards or linear footage. Labour hours remain contractor-entered. Specialized trades are not automatically subcontracted; explicit by-others evidence is required for AI subcontractor suggestions, and contractors can select destinations during review.

`supportBasis` distinguishes total visible locations, apparent new work, existing work, by-others work and not-established status. Total visible support counts remain informational. Footing candidates and explicitly flagged inclusion scopes require a contractor-only `scopeVerified` checkbox before review/approval/conversion; editing measurements/evidence or replacing/removing sources resets it. Different support bases do not silently merge or become count conflicts; same-basis conflicts still require reconciliation. Source/detail provenance and structured observations remain internal and never enter the customer document projection. Converted material lines retain specification and zero initial material cost; the pricing engine/default inheritance remains unchanged. This improves extraction/review flow, not engineering verification: readable specifications still do not establish purchase lengths, connection totals, missing quantities or contract scope. No OCR/scaling guesses are added. More structured evidence may consume more output tokens; the existing provider token cap and limits remain unchanged.

### Analysis package budgets and detail encoding

The former **4 MB decoded binary / 6 MB JSON** limits were conservative application-selected limits in `shared/analysis.ts`, `src/planAnalysis.ts` and `server/handler.ts`, not an OpenAI or Cloudflare 4 MB constraint. The application now uses shared **8 MB decoded original-plus-detail / 12 MB UTF-8 JSON** caps (`shared/analysisPackage.ts`). These deliberately leave headroom for base64 expansion, extracted text/metadata, body buffering/parsing and the additional provider request serialization. They are far below the [Cloudflare request-body limit](https://developers.cloudflare.com/workers/platform/limits/) (100 MB even on Free/Pro), the documented 128 MB Worker memory budget, and [OpenAI PDF input limits](https://platform.openai.com/docs/guides/pdf-files) (50 MB combined files per request). These are application budgets, not promises that every provider context/model/page count fits. No external configuration changes are required. Remote documentation was not accessible from this development environment; deployment/runtime memory and live provider usage were not load-tested.

Original PDF/images still retain the **2 MB per-file** cap and are never resized, recompressed or replaced. The per-request **24 details / eight sources / 50 pages per PDF** limits remain. A single 2 MB source plus four ordinary close-ups should normally fit after efficient encoding; there is no unconditional fit guarantee for arbitrarily dense drawings. Multi-page sets remain explicit bounded packages selected by the contractor; larger selected detail sets now use the bounded batching boundary described below, without dropping data.

Detail capture still renders original PDF operators at **250 DPI**, with unchanged pixel dimensions, source/page/region/rotation provenance and existing eight-million-pixel / 4096-side limits. Compact linework PNG remains lossless. If an individual PNG exceeds its 2 MB detail cap, capture tries **96% then 92% JPEG** at the same pixel dimensions, otherwise refuses the crop. For aggregate packages above the 8 MB budget, preparation tries 96% JPEG from each original captured image only when it is smaller, stopping as soon as the budget is met. It uses the 92% pass only if the result still exceeds the 8 MB hard budget. It never repeatedly compresses a previous optimization, resizes, uses preview pixels, removes selected views or rewrites original attachments. Encoding/quality is carried through the server allowlist alongside the existing geometry, and JPEG dimensions/signatures and minimum declared quality are validated. Browser quality factors are encoder settings, not a guarantee of model readability; JPEG may introduce artifacts. The model is instructed to leave unreadable information as Contractor Input Required.

The **Analysis package** indicator beside Analyze Plans shows selected original bytes, actual prepared detail bytes, detail count, total decoded size and the 8 MB budget. It recalculates after selection, attachment replacement/removal and detail changes; analysis is disabled while preparing or when too large. Optimization savings/quality tradeoffs are disclosed. An oversized warning lists selected sources and page/detail references and offers removal/deselection; nothing is automatically omitted. JSON/text overhead is separately bounded to 12 MB before fetch and on the server. Failure/cancellation preserves quote data and captures. Prepared images remain temporary internal aids, excluded from stored quotes, customer document projection and backups. Analysis may use more input tokens/cost now that a larger bounded package is permitted; rate limits, duplicate protection, Access authentication, review, pricing and the default `gpt-5.4-mini` remain unchanged. Browser storage quotas, model context limits, JPEG artifacts, embedded scan quality and physical Safari/live drawing readability remain practical limitations.

### Compact takeoff review and verified material calculators

Plans & Takeoff uses an editable table grouped by material category/construction scope, with expandable evidence, scope choices and calculator inputs. On phones, horizontal scrolling stays inside the table; expanded forms fit the viewer width. The missing-information checklist identifies unknown quantities, absent product specifications, required scope verification, missing calculator inputs and unresolved foundation alternatives. Completing a suggested material item opens the matching blank calculator where a narrow category mapping is available; no dimensions or quantities are guessed.

`shared/materialCalculators.ts` is a registry of explicit imperial-unit formulas with editable inputs and waste (no default allowance): rectangular surface area, decking boards by verified board coverage/stock/cut layout, joists with verified spacing and continuous stock length, beam stock from contractor-defined plies/pieces and approved cut/splice layout, counted posts/footing assemblies, round-footing concrete volume, railing/trim footage, tread boards, stringers from verified spacing/cut length, wall studs with explicit opening/corner adjustments, drywall/sheathing sheets and packaged flooring/renovation coverage. Inputs start blank and remain Contractor Input Required until complete and verified. Integer counts, positive dimensions, feasible exclusions, sufficient stock length and 0–100% waste are validated. Formula/input evidence and recipes persist privately with takeoff records. Editing inputs/specifications resets calculator verification and approval; directly editing quantity or unit exits the calculator. Estimates still require contractor review and existing conversion safeguards; no labour hours or prices are generated.

These are purchase/count calculations, not structural/stair design or automated scale measurement. Contractor verification must cover endpoint layout, cut patterns, usable product coverage, openings, member lengths, support placement, approved splices and specifications. Irregular layouts, engineering, missing written dimensions, unavailable product data, stair geometry/code compliance and labour hours still need contractor input. The registry is project-independent and can support decks, garages, additions, renovations and houses; formulas are never selected or populated from guessed project assumptions.

Existing/by-others work is excluded from approval/conversion unless explicitly verified for inclusion. New-work scope can also be excluded. Contractors identify mutually exclusive options with an alternative assembly group and method. Potential concrete/helical alternatives in the same or unidentified location require explicit group assignment; intentional mixed designs can use separate verified assembly groups. Approval, bulk approval and conversion check conflicts; converted lines retain private alternative provenance so removing a takeoff row cannot bypass the price guard. Converted takeoff rows are read-only and retained; estimate lines remain separately editable. Exact unreviewed duplicates can be consolidated without adding their quantities, retaining evidence, warnings, assumptions and detail references and using the lowest confidence. Distinct specifications, pages, assemblies, scope choices or recipes, and reviewed/converted items remain separate. Source observations and estimate candidates stay distinct. Existing Cloudflare Access/rate limits, OpenAI configuration/default model, request/package preparation, PDF navigation and customer-document allowlists remain unchanged.

### Focused takeoff review usability

Missing-information checklists start collapsed with an outstanding-item count. Grouped material summaries expand into wrapping laptop/mobile controls, extracted facts, verified calculator inputs, remaining contractor inputs and approval/conversion actions. Extracted specifications and quantities stay populated; calculators never parse ambiguous notes or assume dimensions.

Potential beam, post, joist and guard overlaps are flagged for comparison (hardware/hangers and labour are separate). Approval, bulk approval and conversion require an explicit comparison decision. Contractors can confirm genuinely separate records or confirm consolidation of unreviewed matching specifications, locations, scopes, methods and quantities. Consolidation never sums quantities and retains the second full record as rejected evidence; missing/conflicting specifications or assemblies cannot be merged. Critical changes invalidate stored comparison decisions. Comparisons are private takeoff metadata and never appear in customer documents.

### Automatic Detail Selection

After attaching a PDF, **Auto-Generate Detail Views** uses PDF.js selectable-text positions and construction keywords to suggest close-ups of foundations, framing, beams/joists/posts/connections, written dimensions, specifications, stairs/landings, guards, elevations/sections and schedules. Small text receives priority; heavily overlapping regions are suppressed. Scans without a text layer receive explicitly labelled geometric coverage suggestions, not OCR or semantic detections. Suggestions locate source content only; they never establish construction dimensions, quantities or engineering designs.

Up to 20 automatic / 24 total temporary views are rendered sequentially from original PDF operators at 250 DPI, with the existing 8-million-pixel / 4096-side / 2 MB image limits and PNG-first, bounded high-quality JPEG encoding. Preview one image at a time, zoom, rename, remove or edit sheet-percentage crop bounds and Apply to render again from the original. Manual viewport capture remains available. Contractors must inspect automatic views and confirm review before analysis. Attachments remain byte-identical; temporary views/names and extracted metadata stay out of customer documents and backups.

Each request retains all selected original files and selectable text, with at most 8 MB decoded data / 12 MB JSON and unchanged file, rate-limit, Access and server-side protections. Larger detail sets use sequential batches with stable source/page/global detail references; outputs are merged through existing semantic duplicate handling without summing quantities. No partial results are added if any batch fails, is cancelled, encounters changed sources, or exceeds aggregate structured-output limits. Requests may incur additional cost and reach existing rate limits; there are no automatic retries or rate-limit bypasses. Original files must fit the request budget with at least one detail; select fewer sources/smaller crops otherwise.

Automatic selection is a heuristic and can miss or misidentify regions, particularly scans, rotated text, unusual sheet layouts or dense multipage sets. It is not click-to-measure, OCR, structural design or an assurance of legibility. Inspect crops and supplement manually; unreadable specifications/dimensions remain Contractor Input Required. No OpenAI/Cloudflare configuration changes are needed; default remains `gpt-5.4-mini`.

Detail views now show image thumbnails immediately, including while their inspectors are collapsed. Click a thumbnail to open zoom, scroll/drag panning, renaming and region-adjustment controls. The original-sheet overview highlights the selected region and updates while editing its bounds; Apply region adjustment regenerates the 250 DPI crop from the original PDF. The overview is a navigation aid only, never an analysis source. Inspection confirmation and analysis remain blocked until every selected automatic thumbnail has loaded at its expected pixel dimensions; an image-load error asks the contractor to regenerate or remove the view. The 20 automatic / 24 total limits, original PDF analysis path and bounded batching are unchanged.
