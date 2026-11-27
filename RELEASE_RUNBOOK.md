# Backwoods Quotes release runbook

## Release gates

- Record the tested feature commit, build result, complete Chromium result, targeted WebKit result and installed Safari result separately. Use synthetic quotes and a loopback test origin.
- Verify migration and isolated backup restoration using the procedure below. Require counts, quote IDs and attachment hashes to match. Verify historical totals and job snapshots, preserved settings and a nondecreasing quote-number counter.
- Obtain the owner's approval of the exact target deployment. Have the owner or an authorized operator verify the deployment project's identity, production branch, origin, Access policy, server permissions, private result and rate-limit bindings, and rollback target. Keep credentials and deployment records in the approved private system.
- Decide whether the paid analysis endpoint is in release scope. An approved release with paid analysis disabled still needs access controls. Enabling paid analysis requires separate approval of the spending cap and allowed users. Existing KV attempt limits are best effort across isolates and cannot substitute for a hard spend cap.
- Require a recent known-good rollback target and a rehearsal with synthetic data. Preview success alone does not validate production authentication or migration on the production origin.

## Migration and backup verification

1. Start the candidate with the existing Node toolchain. Set `BACKWOODS_E2E=1` and bind Vite to `127.0.0.1` with a fresh port and `--strictPort`. Run a separate browser context or Safari automation window. Disconnect from public project endpoints and keep the local API runtime stopped.
2. Seed a synthetic legacy workspace before the app starts. Include a draft, sent quote, converted job with actuals, attachment large enough to exercise migration, populated company and pricing defaults, and a high quote-number counter. Save expected IDs, counts, pricing snapshots, and SHA-256 hashes of attachment bytes. Capture the original legacy JSON for byte comparison.
3. Load the candidate and verify hydration completes before editing. Confirm the legacy bytes are unchanged and the authoritative workspace preserves the expected records, settings, hashes, snapshots and number counter. Reload and repeat. Open two tabs, attempt a stale edit, and confirm the committed version wins with a visible error on the stale writer. Verify a corrupt legacy fixture blocks startup and remains available for recovery.
4. Export a workspace backup. Restore into a separate disposable context via the documented import flow. Use a compatible synthetic baseline when testing full restoration. Test full restore refusal when it would replace or remove an existing record, and compare the workspace before and after refusal. Use add-missing mode for nonconflicting projects and verify it leaves settings alone. Verify that restoring an older backup does not lower the number counter.
5. For the owner-approved production verification window, have the owner make a pre-change export and record the production origin and expected records privately. Verify those records by read-only inspection after the approved rollout. Reserve write tests for disposable fixtures. Stop the rollout on any mismatch, corruption message or unexpected sign-in or API behavior.

## Cowan Park offline recovery

1. Rehearse with synthetic records. For a real rehearsal, use only owner-supplied copies of the target and the independently identified donor, in an isolated workspace seeded with those two records. Keep originals and a pre-recovery export immutable. If the target is historical or a job, use an owner-authorized editable rehearsal copy and record its relationship to the original privately.
2. Start the loopback candidate with `BACKWOODS_E2E=1` and the API runtime stopped. Verify the original PDF revision and SHA-256 digest, and the saved observations' source PDF, document ID and physical page. Identify the donor you intend to use and require a uniquely mapped matching PDF in the target. Abort on an ambiguous attachment, evidence from a different revision or a missing observation. A report with no eligible saved takeoff observations requires manual review of the original and does not trigger a new request.
3. Open the rehearsal draft and select **Recover matching drawing observations** in Plans & Takeoff. Select the verified source by quote number and project name. Review the saved analysis date, when available, and the listed drawing, page and observations. Confirm the source and drawing before choosing **Recover from selected quote**. Use the local recovery control only and leave paid analysis controls untouched.
4. Compare before and after. The donor, original quote, prices, estimate lines, existing observations and PDFs must match. Only new Proposed observations should appear on the rehearsal draft, with the target document ID, blank quantities and the recorded donor. Repeat once to confirm no additions. Review each observation against the drawing. Keep subcontract work separate and leave joist quantities pending contractor confirmation.
5. Export the rehearsal result separately. Have the owner review the proposed observations and approve the intended destination before any application to an existing quote. A rehearsal export is evidence for review, not a reason to replace the production workspace.

## Temporary native Safari permission

1. Open Safari and choose **Develop → Developer Settings**. If Develop is hidden, turn on Safari's web developer features under **Safari → Settings → Advanced** and remember its original setting.
2. Turn on **Allow remote automation** only for the test window. Keep other Safari settings and macOS privacy permissions as they are. This procedure requires no Full Disk Access, Apple Events automation, administrator command or personal folder access. [Apple's WebDriver setup](https://developer.apple.com/documentation/safari-developer-tools/macos-enabling-webdriver)
3. Run the installed Safari WebDriver against the loopback candidate and use only its isolated automation window. Use synthetic documents and a narrow desktop viewport for responsive checks. Verify startup, reload, rotated PDF preview, IndexedDB persistence and isolated restore, saved-observation recovery, catalogue and crew calculations, and the print preview. Record browser version and outcomes. WebKit and a narrow desktop viewport leave actual iPhone Safari behavior unverified. [Apple's isolated automation windows](https://developer.apple.com/documentation/webkit/about-webdriver-for-safari)
4. End the WebDriver session, stop the driver and local server, then turn **Allow remote automation** off. Restore the web developer features toggle to its original state if you changed it.

## Rollback

- Before approval, record the actual project, origin, active deployment ID or prior commit, rollback operator, and private backup location. Verify the candidate and rollback target in the correct project. Treat unexpected activation of paid analysis, authorization failure, missing records or attachment mismatches as stop conditions.
- Rehearse on a disposable origin with synthetic inputs. Test the previous build after the candidate has written IndexedDB. A legacy build that reads localStorage can show a stale snapshot after a code rollback. If the previous build cannot safely read the authoritative store, keep writes paused and use a compatible corrective build or an owner-approved recovery procedure.
- On an authorized Cloudflare Pages production rollback, select the preserved successful production deployment in the correct project. Preview deployments are ineligible. For a preview-only release, have the operator restore the previously approved build through the preview branch's approved release process. Keep the hostname and origin stable. [Cloudflare Pages rollback documentation](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- A code rollback leaves browser and server data in place. Preserve a separate export of the incident state and the pre-release export. Verify build identity and Access first, then recheck IDs, attachments and prices read-only. Resume writes only when the authoritative workspace reconciles. Any recovery import into existing business records requires separate owner approval.

## Pricing audit and remaining work

- Catalogue price is copied into an explicitly selected material line for its purchase unit. Required quantity times one plus waste determines purchasing quantity. Stock length supplies context for review and does not convert quantities. A unit change clears a tracked copied price and supplier metadata. Older lines that lack catalogue provenance still need manual review after a unit change.
- Crew-hours equal task quantity divided by the product of nominal crew productivity and the efficiency fraction. Worker-hours equal crew-hours times headcount. Loaded hourly wage includes the employee burden percentage. Equipment uses crew-hours, appears on a separate line and updates that linked line on repeat use. Example with 24 units, six units per crew-hour, 80% efficiency and two workers yields five crew-hours and ten worker-hours. A 40 hourly wage with 25% burden gives 500 labour cost, plus 75 equipment at 15 per crew-hour. Exact values feed quote math and display totals round to cents.
- Existing estimates remain independent of catalogue revisions. Historical quotes keep their snapshots. Materials, labour, equipment and subcontract allowances retain their own quote-line categories. Gross contribution is revenue less included direct costs, excluding HST and unrecorded overhead.
- Essential gates are installed Safari verification, owner identification and approval of the actual release environment, authorized verification of Access and rollback readiness, and owner approval to release. Real Cowan Park recovery is a separate gate for applying changes to that quote. It requires the donor and target copies, contractor joist specification and owner approval of any write.
- Optional follow-ups include automatic stock conversion, reusable task presets, mixed-wage crew breakdowns, cleanup of previously entered duplicate equipment lines, authenticated sync, staff roles and supplier or accounting integrations. Service, data-sharing and role decisions are needed only if those integrations enter scope.

### Local smoke-test setup on this Mac

From the existing project folder, start the candidate without the API proxy:

```sh
cd "$HOME/Projects/backwoods-quotes"
export PATH="$PWD/.local-dev/node-v24.11.1-darwin-arm64/bin:$PATH"
BACKWOODS_E2E=1 npm run dev -- --host 127.0.0.1 --port 5182 --strictPort
```

Use `http://127.0.0.1:5182` only in the isolated Safari automation window. If the port is occupied, choose a different unused loopback port and keep it fixed for the whole migration or rollback rehearsal. Stop the server when the testing window ends.
