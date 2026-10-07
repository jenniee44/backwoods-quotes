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
- Duplicate quotes into new drafts without actuals. Apply the editable Deck template; Basement / Renovation, Framing, Fence, Addition, Garage / Shed and Custom / Blank templates also provide editable groups and suggested lines.
- Fictional initial quotes for three customers, clearly identified in the interface.
- Admin/Owner and Estimator development role switch. Only owners see/edit defaults. Both roles can manage quotes and jobs.

## Storage and access limitations

This is a working **single-browser development V1**, not a deployed multi-user service. Quotes/settings/photos are stored under `backwoods-quotes-v1` in browser localStorage and survive reloads on that browser and origin. Do not enter sensitive real customer information yet. Clearing browser data removes records; there is no shared synchronization or backup. Tabs are not synchronized; use one editing tab. Storage errors are shown without discarding the in-memory quote. Job photos are limited to eight JPEG/PNG/WebP files under 700 KB each; Plans & Takeoff has separate PDF/image limits described below. The browser's total quota may require smaller files.

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

Customer documents can independently hide quantities or labour hours and group detailed lines by customer-friendly scope group. Scope groups are editable with common Deck suggestions. Grouped output sums selling prices and does not show internal rates, costs, waste, markup, notes, profit or margin. Simplified output remains a single project amount. Overhead/profit and contingency are normally distributed into scope selling prices, with cent reconciliation; no artificial coordination line is added. Contingency can be explicitly exposed as an allowance.

Quotes include editable payment/deposit schedule, assumptions, exclusions, change orders, timeline, permit and engineering responsibilities, expiry, existing terms and acceptance area. Owner defaults can populate future quotes; `QuoteTemplate.details` supports template-specific text. Actual customer wording should be reviewed for each project.

Drafts can save without customer/scope information or completed lines. Mark as Sent opens a checklist warning about missing customer/job name, scope, labour, materials, line descriptions, zero selling prices, low margin, missing payment schedule and expiry. Warnings require explicit acknowledgement to proceed. Sending snapshots and locks the estimate and customer details. Sent and accepted quotes can be duplicated for revisions. Later defaults/templates do not change historical prices. Conversion to a job copies the sent snapshot and keeps actuals separate. Display options on an already-sent print preview are temporary; they do not rewrite the historical record.

### Deck template and Plans & Takeoff

Choose a construction template from Customer & job. It **appends** suggested scope groups and lines while preserving existing lines. Template quantities start at zero. Quote defaults provide rates/markups unless the contractor overrides them; no Muskoka prices or engineering assumptions are invented. Lines remain editable. The template registry includes Deck, Basement / Renovation, Framing, Fence, Addition, Garage / Shed and Custom / Blank. Further templates can be added later.

Plans & Takeoff supports PDF, JPEG, PNG and WebP attachments (eight documents per quote, up to 2 MB each). PDFs render inside the app with PDF.js and page controls; originals can be downloaded. Documents can be replaced or removed. The browser's overall storage quota can be reached before these limits—use compressed drawings and keep original plans elsewhere. Attachments are saved with the quote; the file reader does not auto-save. This is a local-storage foundation, not large-plan archival storage.

Takeoff items store description, quantity, custom/common unit, attached-document ID, optional page number, notes/source references, confidence and Proposed/Reviewed status (Reviewed is the contractor approval gate). Only contractor-reviewed items can be converted to estimate lines, once per item. Changes reset status to Proposed. Replacing/removing a source resets related items for review but leaves previously converted estimate lines untouched; check those separately. Takeoff confidence is user-assessed, not an engineering assurance.

There is **no AI drawing interpretation** in V2. Future analysis should populate `TakeoffItem` records as Proposed, with document/page provenance, requiring contractor review before `takeoffToLine` conversion. Rendering a PDF does not validate its engineering or measurements.

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

Recommended later work: proper authentication/shared database, object storage for large plans, customer sharing/acceptance, additional template management, and reviewed AI takeoff proposals. Those remain separate from this complete manual V2 workflow; no accounting, payroll, inventory or scheduling has been added.

## Refinements following V2 field testing

The `v2-preview` branch includes these refinements; main remains V1. Company Settings → quote defaults → optional line overrides is explicit in `effectiveLine`. New lines have inheritance flags for labour cost, customer rate and markup. Editing a line switches that value to an override; selecting “Use quote …” re-enables inheritance. Material and subcontractor markup are applied exactly once. Old V1/V2 lines without flags retain explicit stored values, so their historical selling prices do not change. `pricingRevision: 3` updates new-quote presentation defaults to quantities OFF, hours OFF and grouped scopes ON while keeping existing quote preferences and document text.

The normal Pricing tab shows the seven common quote controls. Advanced pricing contains internal labour cost and quote validity. A calculation explanation reconciles line selling prices, overhead/profit, contingency and subtotal. Existing document defaults remain editable in Settings and copied into new quotes.

Scope groups belong to a quote/template, never a global Deck list. New custom quotes start with no groups. Typing a group makes it available to other line types on the same quote; committed custom groups are retained in its catalog. Templates preload their own catalogs. Unit and group pickers are searchable, touch-friendly and permit custom text. Materials have expandable supplier, SKU and material notes fields, all excluded from customer projections.

Detailed customer scopes combine Labour, Materials and Subcontractors & Other Costs in the same group. Unassigned lines use “Project Work” rather than exposing raw descriptions in grouped mode. Internal overhead/profit and contingency are allocated proportionally by selling value using largest-remainder cent allocation, so every customer section sums exactly to the subtotal. Showing contingency separately is explicit opt-in. Quantities and labour hours are independently opt-in; enabling quantities can disclose line descriptions beneath a group, so inspect the customer preview before sending.

Short permit/engineering entries such as “homeowner” render as complete customer-facing responsibility sentences. Fully written custom sentences remain unchanged. This is wording assistance, not legal or engineering advice.

Quotes autosave locally after a 600 ms pause in model changes. The header shows Saving…, Saved or Save failed. Invalid data or storage quota errors leave the last saved record intact and show an error; correct it and retry. Blank numeric text is temporary until blur/save, so a still-focused blank field has not yet changed the saved numeric model. Manual Save remains available. Tabs stay at the top of the viewport while scrolling. Sending requires checklist review and a native confirmation; `sentAt` records the timestamp and the financial snapshot locks.

Plans & Takeoff explicitly shows Upload → Proposed → Contractor review → Approve → Convert. Analyze plans is disabled/future-state; there is no automatic drawing interpretation. The `WorkflowStage` type prepares Lead through Paid without adding status buttons. Accepted jobs have a Change Orders foundation panel, and `ChangeOrder` / `changeOrderTotals` prepare separately approved contract adjustments. Entry, approval and job-contract adjustment application are intentionally deferred; original accepted estimates remain untouched. These are architecture hooks, not claims of a working change-order approval service.

Regression coverage includes inheritance vs overrides, double-markup prevention, exact customer group reconciliation, metadata privacy, expiry boundaries, template/group reuse, sent snapshots, numeric steps/blank commits and autosave failure. Physical Safari testing on your Mac/iPhone is recommended after this branch is built by your preview project.
