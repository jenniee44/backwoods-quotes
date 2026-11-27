# Backwoods Quotes development plan

## Safety rules
Preserve production branch v2-preview, original production URL, all existing quote IDs, attachments, analysis, historical pricing, jobs and settings. Never commit private customer backups or credentials. Do not clear browser storage or repeat paid AI analysis for testing. Use synthetic fixtures. Do not merge until release gates pass and owner approves.

## Baseline
Prior validation run #19 passed typecheck, unit tests and build at f4b5077. Browser tests not confirmed. Owner backup previously verified with eight quotes; Cowan Park BW-1038 has drawing and pricing but no saved analysis in that backup. Another quote has analysis of identical PDF; reuse requires provenance and document-ID validation.

## Phase 1: storage and recovery (open)
- BW-001: migrate legacy localStorage to IndexedDB safely.
- BW-002: serialize read-modify-write transactions, prevent lost updates across tabs, protect stale editor writes.
- BW-003: hydrate settings/company/defaults from authoritative store.
- BW-004: support emergency recovery import and conflict-aware restoration, including settings.
- BW-005: validate durable data, block interaction until hydration, handle corrupt legacy data without overwriting it.
- BW-007/008: preserve production origin; backup/restore and retention policy; no misleading permanent deletion claims.
- Gate: synthetic browser tests for migration, large attachments, reload, concurrent saves, settings, recovery, deletion and historical quote locking.

## Phase 2: manual quoting
Regression tests for pricing, tax, margin, quote duplication, status transitions, print privacy, job conversion, actual costs and mobile workflow.

## Phase 3: drawing estimating
BW-006: validate fractional/tolerance dimensions, scope conflicts, duplicate evidence, assemblies and purchasing quantities. Recover existing Cowan Park analysis without paid requests where possible. Verify joist specification with contractor; do not invent missing quantities. Separate subcontracted work.

## Phase 4: pricing and labour
Reusable material price catalogue, stock lengths, task-specific productivity, labour-only/material-only/subcontract items, crew efficiency, employee burden and equipment costing. Distinguish gross contribution from net profit.

## Phase 5: release
Run typecheck, unit tests, build and browser regression tests. Verify Safari/mobile and isolated backup restore. Review authentication, server permissions, API cost safeguards and rollback. Owner approval before production merge.

## Phase 6: future
Authenticated cloud synchronization, employee permissions, supplier pricing and accounting integrations.

## Status convention
Implemented is not verified. Record commit, test result and deployment separately. All phases remain open until their gates pass.

## Local validation on macOS

- Base commit: `b8d5ffc36e2f4e351489b003e7e49d68055737f3` on `feature/evidence-based-estimating`. The changes below were validated against this base.
- Toolchain: Apple Silicon, project-local Node 24.11.1 and npm 11.6.2, locked dependencies, and headless Chrome. Three component filenames were changed to avoid case-insensitive module resolution conflicts.
- Phase 1: verified legacy attachment migration and corrupt-record preservation, stale writes and concurrent tabs, settings and backup restore, quote numbering after restore and deletion, and preservation of a converted job when its quote is removed. Deletion messaging now describes active-workspace removal and acknowledges retained copies.
- Phase 2: verified selected mobile and desktop workflows for manual estimates, pricing inputs, historical locking, customer print privacy, job conversion, actual costs, and backup export.
- Phase 3: verified selected synthetic drawing workflows for rotated PDFs, proposals, contractor scope, purchasing lists, and private diagnostics. Recovery using owner-supplied records and contractor verification remain open.
- Results: typecheck and production build passed. All 835 unit tests and 30 targeted Chrome browser checks passed. The full browser suite and Safari release checks remain open.
- Release: no production merge or deployment.

### Offline drawing recovery rehearsal

1. Use a separate browser test profile and a local app origin. Rehearse with a synthetic backup first. Owner-supplied exports are required for any rehearsal with real records. Keep exports outside version control.
2. In the isolated workspace, confirm the intended target draft, its original quote number and pricing, and the independently identified source quote. Compare the attached PDF bytes and require a single matching attachment with an unambiguous document ID. Stop if provenance is unclear.
3. In Plans & Takeoff, choose **Recover matching drawing observations**. This reads saved takeoff observations locally. The source quote stays intact. Recovered observations keep a source reference, link to the target attachment, and start as proposals with blank quantities.
4. Compare the result with the original drawing and review the scope, dimensions, approvals, and purchasing quantities. Keep subcontracted work separate. Obtain the contractor's joist specification before filling any joist quantity that depends on it.
5. Export a separate rehearsal result and compare it with the starting backup. Record the reviewed observations and unresolved items without including customer data in this repository. Owner approval is required before applying recovery to any existing quote.

### Release and external dependencies

- Local browser tests bind to loopback and disable the analysis API proxy. Paid-provider calls are never required by these checks. The drawing replay uses synthetic inputs by default.
- The analysis handler checks origin, verifies Cloudflare Access assertions and requires production rate-limit storage. The client development role switch is not authentication. Before release, verify the actual Access policy, worker bindings and private result permissions in a separately approved environment.
- Rollback must preserve the production hostname and browser origin. Record the last known good deployment before release, rehearse rollback with synthetic data, and keep workspace backup restoration separate from rollback.
- Native Safari requires a fresh WebDriver session. WebKit regression results can be recorded independently. No production release or live integration has been authorized.
- Cloud sync, staff permissions, supplier pricing, and accounting integrations need the owner's access rules, service choices, and authorization before connecting accounts. Use synthetic contracts and fixtures until those decisions are available.

### Validation update

- On November 27, 2026, the synthetic suite passed all 157 Chromium browser tests and 15 targeted WebKit tests. Typecheck, the production build, and 837 unit tests passed. Tests include the offline drawing-recovery unit cases. The production environment was not used.
- The first published validation commit is `079661f120f73a64470289e82b5e6db4f66c2573`. Native Safari WebDriver is pending the Safari automation setting. Recovery on real records and contractor confirmation remain pending.

### Integrated local development

- Phase 1: the first legacy migration and durable snapshot validation now run in one IndexedDB transaction. A cold-start test verifies simultaneous tabs use the same workspace. The validated migration, restore, and retention policies remain local and preserve the legacy source.
- Phase 2: the Chromium suite covers manual quoting, numerical input, pricing and margins, historical snapshots, mobile navigation, print privacy, duplication, conversion to jobs, and actual costs.
- Phase 3: a browser rehearsal confirms exact attachment matching, quote-local document IDs, idempotent proposed-only recovery, unchanged pricing and donor records, and zero analysis requests. A live rehearsal still needs owner-supplied copies of both relevant records and the contractor's joist specification.
- Phase 4: the local material price catalogue supports price per unit, available stock length, supplier and SKU. Applying a catalogue entry requires a matching unit and an explicit draft edit. Crew costing uses explicit task productivity, efficiency, headcount, wage, burden and equipment rates. Labour, materials, equipment and subcontractor lines remain separate. Reported contribution excludes HST and unrecorded business overhead.
- Phase 5: local typecheck and build passed, along with 839 unit tests, all 160 Chromium browser tests, and 18 targeted WebKit checks. The prior regression and recovery commit is `77ad3303c28bde8219bf51f46d89aa02256cdaa8`. Native Safari automation is disabled on this Mac. Production checks still require owner approval and access to the release environment.
- Phase 6: before implementing live connections, decide which roles may access customer records, who can sync or approve price changes, which supplier and accounting services to connect, and which data may leave the device. Planning and local synthetic tests require no account access.

## Final release preparation

See [Release runbook](RELEASE_RUNBOOK.md) for the release gates, synthetic migration and restore checks, offline Cowan Park rehearsal, temporary Safari permissions, rollback and pricing audit. Real recovery, native Safari and release approval remain open. Keep those results separate from automated coverage.

The November 27 release-preparation candidate passed typecheck, the production build, 841 unit tests, all 161 Chromium browser tests and 19 targeted WebKit checks. It identifies a single donor for offline recovery, preserves existing quote/job placement during full backup restore, clears a copied price when its unit changes and updates existing linked crew equipment instead of adding another charge. The dry runs used synthetic data and made no paid requests. Native Safari, production configuration verification and owner approval remain release gates.
