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
- Simplified or detailed customer quote, print styles and browser Print / Save PDF. Internal notes, measurements, photos, costs and profit calculations never appear in the customer document. Detailed quotes show selling lines and a combined coordination/allowance amount.
- Acceptance signature area, scope, terms, quote number/date and optional expiry.
- Sent and accepted estimates are locked. Conversion deep-copies the original lines and settings; actual labour/expenses live separately. Completed jobs show estimated versus actual costs and margins.
- Duplicate quotes into new drafts without actuals. Apply the editable Deck template; category metadata prepares for more construction templates.
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

New quotes copy defaults; existing quotes never read live defaults. Quote-specific rate/markup defaults apply to newly added lines, while existing lines retain their own editable values. Changing quote validity days updates its expiry; expiry remains directly editable. Estimated labour hours are hidden from customer documents by default.

All numeric controls keep an edit string separately from the numeric data model. Focusing a zero clears it for natural replacement. Blank numeric edits calculate as zero; leaving the field normalizes to zero. Blank selling overrides remain `null` (automatic). A zero override explicitly charges zero. Page-number blanks mean no page reference. Negative/non-finite numbers are rejected when saving.

### V2 formulas

For materials, **purchase quantity = required quantity × (1 + waste% / 100)**; **material cost = purchase quantity × unit cost**. Quantities are not automatically rounded to whole boards/bags: the contractor must choose appropriate purchasing quantities/waste. Waste changes purchased cost, whereas markup changes the selling price. Customer quantities use required quantities, never waste-adjusted purchase quantities.

Labour selling price uses customer hours × rate; internal cost uses hours × internal rate. Materials and Other Costs sell at their direct cost × (1 + markup% / 100), unless overridden. Other Costs markup 0 passes through at cost. Each line rounds to cents.

Contingency and optional overhead/profit additions both use the sum of line selling prices, independently. They are optional selling-price adjustments, not a second automatic profit calculation. No adjustment compounds on the other, and no global material markup is applied a second time. HST applies only to the final subtotal.

Gross profit = pre-tax subtotal − total direct job costs. Gross margin = gross profit / subtotal. Break-even price = total direct job costs. **Target selling price = direct job costs / (1 − target margin / 100)**, rounded UP to the nearest cent to avoid missing the target. Target margins must be below 100%. Targets are advisory; the app never silently changes your selling prices to meet them. Company fixed overhead is not automatically deducted: this is job gross profit, not company net profit.

The internal summary breaks down costs and selling prices by Labour / Materials / Other Costs, plus contingency, adjustment, subtotal, HST, gross profitability, break-even and target price. An amber warning identifies margins below the quote's inherited/edited target.

### Customer documents and lifecycle

Customer documents can independently hide quantities or labour hours and group detailed lines by customer-friendly scope group. Scope groups are editable with common Deck suggestions. Grouped output sums selling prices and does not show internal rates, costs, waste, markup, notes, profit or margin. Simplified output remains a single project amount. Coordination/allowances are shown as a combined customer selling amount; no calculation is disclosed.

Quotes include editable payment/deposit schedule, assumptions, exclusions, change orders, timeline, permit and engineering responsibilities, expiry, existing terms and acceptance area. Owner defaults can populate future quotes; `QuoteTemplate.details` supports template-specific text. Actual customer wording should be reviewed for each project.

Drafts can save without customer/scope information or completed lines. Mark as Sent opens a checklist warning about missing customer/job name, scope, labour, materials, line descriptions, zero selling prices, low margin, missing payment schedule and expiry. Warnings require explicit acknowledgement to proceed. Sending snapshots and locks the estimate and customer details. Sent and accepted quotes can be duplicated for revisions. Later defaults/templates do not change historical prices. Conversion to a job copies the sent snapshot and keeps actuals separate. Display options on an already-sent print preview are temporary; they do not rewrite the historical record.

### Deck template and Plans & Takeoff

Apply Deck template from Customer & job. It **appends** suggested scope groups and lines while preserving existing lines. All template quantities, costs, rates and markups start at zero for contractor entry; no Muskoka price or engineering assumptions are invented. Lines remain editable. The registry/types allow additional Renovation, Framing, Garage, Addition, Shed, Interior finishing and Cottage repair templates later.

Plans & Takeoff supports PDF, JPEG, PNG and WebP attachments (eight documents per quote, up to 2 MB each). PDFs render inside the app with PDF.js and page controls; originals can be downloaded. Documents can be replaced or removed. The browser's overall storage quota can be reached before these limits—use compressed drawings and keep original plans elsewhere. Attachments are saved with the quote; the file reader does not auto-save. This is a local-storage foundation, not large-plan archival storage.

Takeoff items store description, quantity, custom/common unit, attached-document ID, optional page number, notes/source references, confidence and Proposed/Reviewed status. Only contractor-reviewed items can be converted to estimate lines, once per item. Changes reset status to Proposed. Replacing/removing a source resets related items for review but leaves previously converted estimate lines untouched; check those separately. Takeoff confidence is user-assessed, not an engineering assurance.

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
