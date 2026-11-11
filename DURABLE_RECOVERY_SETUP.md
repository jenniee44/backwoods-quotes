# Durable AI recovery (development branch)

**Do not deploy this branch until configured and tested.**

1. In Cloudflare, create a private Workers KV namespace dedicated to analysis results (for example `backwoods-analysis-results`).
2. Bind it to the **Pages** project as `ANALYSIS_RESULTS` in both Preview and Production environments as appropriate. Keep the existing `ANALYSIS_LIMITS` binding. Redeploy after configuring the binding.
3. Keep the site behind Cloudflare Access. Results are keyed by a hash of the authenticated identity and the exact submitted batch; no original PDFs or submitted images are saved in KV.
4. Server-side completed, validated responses are retained for 7 days. The recovery-only request never calls OpenAI. A new paid analysis is blocked when durable storage is not configured.
5. Test with a provider stub before using paid analysis: first call saves, second identical call reuses without provider, recovery-only retrieves, changed source is a miss, different identity is a miss, KV write failure does not return success. Verify an interrupted client can recover once the server completed and stored the result.
6. Cloudflare KV is eventually consistent and does not provide an atomic lock. The existing rate-limit lease is not a strict concurrency guarantee; for hard exactly-once billing protection use a Durable Object or transactional database coordinator with idempotency keys. The current implementation is a recovery foundation, **not** a guarantee that concurrent duplicate requests cannot incur charges.
7. Existing interrupted requests that were never stored on the server cannot be recovered retroactively.

Never commit secrets or raw customer drawings to GitHub.
