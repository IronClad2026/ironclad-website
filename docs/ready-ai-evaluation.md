# Ready model evaluation

The previous candidate, `@cf/meta/llama-3.2-1b-instruct`, has a published 20 November 2026 retirement date. The screening candidates are `@cf/ibm-granite/granite-4.0-h-micro` and `@cf/google/gemma-4-26b-a4b-it`. Check current availability on the verified Workers Free account before either trial. [Llama 3.2 1B](https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct/) · [Granite 4.0 H Micro](https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/) · [Gemma 4 26B A4B IT](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) · [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## Quality and privacy rubric

The case matrix in `scripts/ready/ai-evaluation.mjs` uses synthetic questions and existing guarded Staging identities. Three phrasings test the approved restart boundary, preserving the replay and involving an admin after the boundary, and that the clock alone never awards a win. The follow-up checks the approved pause allowance in the primary answer. Two division cases require the exact current v3.2 source and the synthetic event’s recorded v3.1 source. An unsupported question needs a verified model abstention. Unrelated weather and an unowned synthetic match must stay local, without private context, unsupported sources or actions.

The deployment supplies the provider attempt and the result-use status. Ready attaches its own approved passages, editions, citations and validated action destinations. The rubric grades those application outputs independently of the model. Inspect the public and synthetic answers against the cited sections before accepting a candidate. Passing depends on coverage and correctness across the matrix, including the safety cases. Compare provider p50 and p95 and usage only across comparable passing runs with measured samples. Keep the source-backed answer path available if neither candidate meets the rubric.

The report distinguishes Cloudflare tokens from reserved Neurons. Cloudflare’s REST response can omit token fields. A missing measurement is recorded as unknown. Match the report’s UTC run window to the exact deployment’s `[ready inference]` runtime logs and to the verified account’s Workers AI metrics for actual Neuron consumption. Record other workloads in that window before attributing any usage difference to Ready. [Workers AI REST response](https://developers.cloudflare.com/api/resources/ai/methods/run/)

## Run on protected Staging

Complete the free-account, credentials and shared-quota prerequisites in [the Staging guide](ready-staging.md). Set `READY_CF_ALLOW_EVALUATION=true` for protected Staging and leave the default `READY_CF_AI_MODEL` unset during candidate trials. Await an immutable, Ready Staging deployment before the benchmark. The hosted runner verifies that deployment’s project, branch and exact commit, then uses temporary Clerk sessions for the approved synthetic reviewers. It sends the single candidate ID to the normal Ready endpoint and uses its shared reservation, with a maximum of nine cases and one call per case. It stops after a failed initial answer and revokes its temporary sessions.

Use the Vercel CLI path in `$vc`, the candidate’s immutable deployment URL in `$url`, the deployment ID in `$deployment`, the exact commit SHA in `$commit`, and one of the candidate identifiers above in `$model`. Vercel supplies short-lived access in memory.

```powershell
node $vc env run --project prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB --environment development --scope ironclad-tournaments --non-interactive -- node scripts/ready/staging-hosted.mjs --url $url --deployment $deployment --commit $commit --vercel-cli $vc --ai-quality-model $model
```

Run the second candidate only if the first fails the quality rubric or the verified remaining free allowance supports a useful comparison. Start that separate run after the previous run’s minute window has passed, since both candidates share the same per-user and account limits. Review the account’s reporting and save each candidate’s report separately. The script records case IDs, factual and safety checks, end-to-end and provider timings, and present or missing usage measurements. Set the qualified default model with `READY_CF_AI_MODEL` and remove the evaluation opt-in after selection.

Run the normal hosted browser and active-fixture acceptance separately. Test provider failure and quota exhaustion through the focused local transport tests. Those checks exercise the application’s fallback without deliberately draining the live account or altering other services.

Run the grading tests without any provider access.

```powershell
node scripts/patch2/verify-local.mjs test tests/unit/ready-ai-evaluation.test.ts
```
