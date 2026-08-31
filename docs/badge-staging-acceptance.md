# Badge Staging acceptance

This is the focused Badge validation contract. It consolidates evidence from
the production evaluators and current IronClad match, tournament, leaderboard,
and season authority. It is not a parallel tournament harness.

The tool is intentionally read-only:

```powershell
node scripts/badges/staging-acceptance.mjs `
  --confirm-project-ref zzbnneprhjicmajpjkdg
```

It hard-rejects the Production ref `nsyjtqpvyxlzyujlbzos`, has no `--apply`
mode, never loads `.env.local`, and never connects to Supabase, Clerk, or
Storage. Remote mutation and authority proof remain in the existing approved
Staging workflows. The tool only defines the fixed plan, inventories the 30
runtime PNGs, validates a sanitized evidence manifest, and prints an exact-ID
cleanup dry-run.

## Fixture policy

The plan reuses 24 of the 30 permanent `staging-synthetic-v1` UAT aliases:
eight each from Academy, Challenge, and Main. A maximum of eight are active in
one tournament scenario. No new identity pool, 256-player capacity, arbitrary
semantic role, protected Steam/Relic/current-ELO write, or general cleanup RPC
is introduced. Aliases 9 and 10 in each division remain outside the Badge plan.

The same fixed players may be reused sequentially when their authoritative
history does not invalidate the boundary being tested. Threshold, streak,
reliability, correction, and absence checks require a clean isolated target.
Tournament rehearsal evidence should be reused for generic workflow facts;
Badge execution adds only evaluator, award, idempotency, notification, Reveal,
and Badge-specific boundary evidence.

Badges 1, 18, and 19 retain an Owner-controlled provider checkpoint. Synthetic
fixtures may prove their negative cases but cannot prove protected positive
identity or registration-ELO facts. Badge 20 uses a genuinely played official
series; it never alters timestamps to bypass a deadline. Badges 5 and 28 use
existing legitimate cross-division authority because the permanent synthetic
aliases intentionally have fixed divisions.

## Shared journeys

| Journey | Badges | Fixed target | Main evidence |
| --- | --- | --- | --- |
| Provider recruit | 1 | Owner-controlled | Profile plus legitimate Steam/Relic state |
| Match career | 2–4, 11–15 | `TestAcademy1` | Played/win counts and ordered streak authority |
| Reliability | 10 | `TestAcademy2` | Played, opponent no-show, player no-show, double no-show, bye, reset/correction |
| Series shape | 16–17 | `TestChallenge1` | Ordered official game results |
| Verified upsets | 18–19 | Owner-controlled | Immutable provider-qualified registration snapshots |
| Academy career | 6–8, 21–24, 27 | `TestAcademy3` | Completion, rounds, tournament wins |
| Challenge champion | 25 | `TestChallenge2` | Challenge tournament win |
| Main champion | 26 | `TestMain1` | Main/Elite tournament win |
| Division progression | 5 | Existing legitimate authority | First completed division, then higher completed division |
| Triple Crown | 28 | Existing legitimate authority | Three division-specific tournament wins |
| Flawless | 20 | `TestChallenge3` | Championship path, at least one played series, zero game losses |
| Finalized season | 9, 29–30 | `TestMain2` | Membership plus finalized non-review standings/archive |

## Evidence manifest

Create a sanitized template on stdout:

```powershell
node scripts/badges/staging-acceptance.mjs `
  --confirm-project-ref zzbnneprhjicmajpjkdg `
  --template --run-marker badge-acceptance-20260831
```

Each of the 30 rows records the positive and negative scenario, authoritative
source IDs, exactly one award ID, repeat-evaluation result, duplicate count,
and artwork/collection mapping. `PASS` is rejected unless all required evidence
is present. The template honestly starts provider-sensitive rows as `BLOCKED`
and all other unproved rows as `INCONCLUSIVE`.

Validate the filled manifest:

```powershell
node scripts/badges/staging-acceptance.mjs `
  --confirm-project-ref zzbnneprhjicmajpjkdg `
  --verify-manifest artifacts/badge-acceptance/sanitized-evidence.json
```

The manifest rejects secret-shaped keys or values. Record IDs and safe result
facts only—never credentials, tokens, authorization headers, JWTs, private
proof paths, or raw provider payloads.

## Cleanup

Cleanup planning is read-only and derived only from recorded exact IDs:

```powershell
node scripts/badges/staging-acceptance.mjs `
  --confirm-project-ref zzbnneprhjicmajpjkdg `
  --cleanup-plan artifacts/badge-acceptance/sanitized-evidence.json
```

Permanent UAT players are never cleanup targets. An unlaunched synthetic
enrolment is eligible only through the existing
`cleanup_staging_synthetic_uat_enrolment` contract with its fixed alias and
exact tournament ID. Launched/completed competition history is retained with
Staging provenance. Notification, Reveal, or storage cleanup requires the exact
record/object ID and its existing supported contract; broad filters and
cross-run deletion are not represented by this schema.
