# Archived Ready model evaluation

This record describes the earlier evaluation. The current Staging assistant uses prepared cloud choices and authorised live reads. Cloudflare AI is disabled and the hosted acceptance runner verifies zero inference attempts.

The previous candidate, `@cf/meta/llama-3.2-1b-instruct`, has a published 20 November 2026 retirement date. The screening candidates are `@cf/ibm-granite/granite-4.0-h-micro` and `@cf/google/gemma-4-26b-a4b-it`. Check current availability on the verified Workers Free account before either trial. [Llama 3.2 1B](https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct/) · [Granite 4.0 H Micro](https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/) · [Gemma 4 26B A4B IT](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) · [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## Quality and privacy rubric

The case matrix in `scripts/ready/ai-evaluation.mjs` uses synthetic questions and existing guarded Staging identities. Three phrasings test the approved restart boundary, preserving the replay and involving an admin after the boundary, and that the clock alone never awards a win. The follow-up checks the approved pause allowance in the primary answer. Two division cases require the exact current v3.2 source and the synthetic event’s recorded v3.1 source. An unsupported question needs a verified model abstention. Unrelated weather and an unowned synthetic match must stay local, without private context, unsupported sources or actions.

The deployment supplies the provider attempt and the result-use status. Ready attaches its own approved passages, editions, citations and validated action destinations. The rubric grades those application outputs independently of the model. Inspect the public and synthetic answers against the cited sections before accepting a candidate. Passing depends on coverage and correctness across the matrix, including the safety cases. Compare provider p50 and p95 and usage only across comparable passing runs with measured samples. Keep the source-backed answer path available if neither candidate meets the rubric.

The report distinguishes Cloudflare tokens from reserved Neurons. Cloudflare’s REST response can omit token fields. A missing measurement is recorded as unknown. Match the report’s UTC run window to the exact deployment’s `[ready inference]` runtime logs and to the verified account’s Workers AI metrics for actual Neuron consumption. Record other workloads in that window before attributing any usage difference to Ready. [Workers AI REST response](https://developers.cloudflare.com/api/resources/ai/methods/run/)

## Historical hosted runs

The earlier hosted rubric used temporary Clerk sessions and an immutable Staging deployment. It recorded factual and safety checks, latency, and available provider-usage measurements.

Run the grading tests without any provider access.

```powershell
node scripts/patch2/verify-local.mjs test tests/unit/ready-ai-evaluation.test.ts
```
