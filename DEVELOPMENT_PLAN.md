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
