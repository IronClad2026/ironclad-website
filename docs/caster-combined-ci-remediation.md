# Combined Staging CI remediation proposal

Use a separate pull request from the accepted Staging head. Keep strict permission checks, and compare the full Linux workflow before and after the changes. The Phase 3 baseline evidence is recorded in [GitHub Actions run 45909717199](https://github.com/IronClad2026/ironclad-website/actions/runs/45909717199).

| Baseline failure | Smallest proposed correction |
| --- | --- |
| Tournament Media layout source assertion | Confirm the approved responsive navigation layout, then assert its actual desktop and drawer behaviour. Retain checks for discoverability and overflow. |
| Tournament workspace migration allowlist | Reconcile the expected checked-in migration set against reviewed migrations and hosted receipts. Keep the strict expected-set check and record any hosted timestamp mapping. |
| Ready analytics privacy assertion | Check the approved disabled-by-default behaviour and the exact sanctioned Ready event boundary. Keep negative checks for extra trackers, private data and activation outside the approved environment. |
| Two transactional-email cron assertions | Assert the one five-minute job, its idempotent installation and protected route. Validate relevant Vercel configuration without rejecting unrelated deployment settings. |
| Disposable Match Room setup fails with SQLSTATE 42501 | Set synthetic service-role request claims for the fixture setup call only. Clear the context before testing ordinary roles. Keep the correction out of hosted grants and policies. |
| Match Room admin-message grant assertion | Update the expected grants to the current service-only contract. Retain positive coverage through the authorised server boundary and explicit denials for anonymous and authenticated clients. |

Run the database suite from a fresh PostgreSQL 17 instance and rerun every global browser job that the upstream failures skipped. Verify the final exact deployed commit, including Ready and Patch 2 regression coverage. Keep the Ready budget dependency and Production migration reconciliation in the separate release review.
