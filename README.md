# Backwoods Quotes

A mobile-first internal estimating, customer quoting and job-profitability app for **Backwoods Building & Maintenance**.

## Stack and development

React 19 + TypeScript + Vite, with Lucide icons, bundled DM Sans/Manrope fonts, plain responsive CSS, Vitest calculation tests, ESLint and Playwright browser checks. This small client application keeps the first version easy to maintain; business logic lives independently of the UI in `src/model.ts`.

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
- Accepted estimates are locked. Conversion deep-copies the original lines and settings; actual labour/expenses live separately. Completed jobs show estimated versus actual costs and margins.
- Duplicate quotes into new drafts without actuals. Category metadata prepares for Deck, Fence, Framing, Flooring, Drywall, Renovation and Service/maintenance templates; a template-management UI is deferred.
- Fictional initial quotes for three customers, clearly identified in the interface.
- Admin/Owner and Estimator development role switch. Only owners see/edit defaults. Both roles can manage quotes and jobs.

## Storage and access limitations

This is a working **single-browser development V1**, not a deployed multi-user service. Quotes/settings/photos are stored under `backwoods-quotes-v1` in browser localStorage and survive reloads on that browser and origin. Do not enter sensitive real customer information yet. Clearing browser data removes records; there is no shared synchronization or backup. Tabs are not synchronized; use one editing tab. Storage errors are shown without discarding the in-memory quote. Photos are limited to eight JPEG/PNG/WebP files under 700 KB each; the browser's total quota may require smaller photos.

The role selector is not login authentication or a security boundary. A production deployment needs identity, server-side authorization and a database; users must never receive other tenants’ internal costing data. Customer quote preview is a separate allowlisted presentation, not a public sharing endpoint.

Business defaults are initially zero except 13% HST. Sample quotes use fictional illustrative rates (15% material markup, $75 customer hourly rate, 5% overhead, 3% contingency). Change defaults before creating real estimates.

## Data structure

- `Store`: versioned settings and quotes.
- `Quote`: identity, status, customer, project details, photos, dates, terms, presentation mode, optional template category, pricing and lines.
- `Line`: type, description, quantity, unit, cost, customer labour rate, material markup, nullable full-line selling override and other-cost category.
- `Job`: immutable original `Estimate` snapshot, conversion timestamp and separate actual entries.
- `Actual`: description, category, quantity/hours and actual unit/hourly cost.
- `QuoteTemplate`: reusable estimate, category, description and terms for future template management (type only in V1).

Customers are embedded snapshots within quotes in V1. A future database can normalize customer records while preserving historical quote details. IDs use UUIDs. Quote numbers increment from BW-1001 locally; production numbering must be assigned transactionally on the server.

## Pricing calculations

Currency is CAD. Each line and percentage addition rounds to cents; display uses Canadian currency formatting.

- Internal labour cost = hours × internal hourly cost.
- Labour selling price = hours × customer hourly rate.
- Material direct cost = quantity × unit cost.
- Material selling price = direct cost × (1 + markup / 100), unless a full-line selling override is set (zero is a valid override).
- Other-cost selling price defaults to direct cost, with optional full-line override.
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
