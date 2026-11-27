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
