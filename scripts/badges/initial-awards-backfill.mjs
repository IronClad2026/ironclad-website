import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";

export const SUPABASE_CLI_VERSION = "2.114.0";
export const VERCEL_CLI_VERSION = "59.1.4";
export const VERCEL_SCOPE = "ironclad-tournaments";
export const BACKFILL_BATCH_SIZE = 25;
export const REST_PAGE_SIZE = 500;
export const APPROVED_APPLICATION_HEAD =
  "ac612018f6c27963a59df84815d0a76ebbcbd27e";
export const APPROVED_TOOLING_BASE_HEAD = APPROVED_APPLICATION_HEAD;
export const AUTHORIZED_TOOLING_PATHS = Object.freeze([
  "docs/achievement-badge-production-cutover-runbook.md",
  "scripts/badges/initial-awards-backfill.mjs",
  "tests/integration/badge-initial-backfill-contract.test.ts",
  "tests/unit/badge-initial-backfill-cli.test.ts",
]);
export const PINNED_RUNTIME_MODULE_PATHS = Object.freeze([
  "lib/badge-notifications.ts",
  "lib/badges/authority.ts",
  "lib/badges/reconciliation.ts",
  "lib/badges/reveals.ts",
  "lib/supabase-admin.ts",
]);

export const BACKFILL_TARGETS = Object.freeze({
  staging: Object.freeze({
    name: "ironclad-staging",
    ref: "zzbnneprhjicmajpjkdg",
  }),
  production: Object.freeze({
    name: "ironclad-v2",
    ref: "nsyjtqpvyxlzyujlbzos",
    baseUrl: "https://www.ironcladtournaments.com",
  }),
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const CLERK_USER_ID_PATTERN = /^user_[A-Za-z0-9]+$/;
const BADGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ALLOWLIST_BYTES = 2 * 1024 * 1024;
const MAX_ALLOWLIST_PLAYERS = 10_000;

export class BadgeBackfillCutoverError extends Error {
  constructor(code, details = undefined) {
    super("Achievement Badge backfill cutover failed.");
    this.name = "BadgeBackfillCutoverError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, details = undefined) {
  throw new BadgeBackfillCutoverError(code, details);
}

export function parseArguments(argv) {
  const parsed = {
    allowlistFile: null,
    allowlistSha256: null,
    apply: false,
    baseUrl: null,
    confirmProjectRef: null,
    expectedApplicationHead: null,
    expectedToolingHead: null,
    help: false,
    target: null,
  };

  const valueOptions = new Map([
    ["--allowlist-file", "allowlistFile"],
    ["--allowlist-sha256", "allowlistSha256"],
    ["--base-url", "baseUrl"],
    ["--confirm-project-ref", "confirmProjectRef"],
    ["--expected-application-head", "expectedApplicationHead"],
    ["--expected-tooling-head", "expectedToolingHead"],
    ["--target", "target"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--apply") {
      if (parsed.apply) fail("ARGUMENT_DUPLICATE");
      parsed.apply = true;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }

    const key = valueOptions.get(argument);
    if (!key) fail("ARGUMENT_UNKNOWN");
    if (parsed[key] !== null) fail("ARGUMENT_DUPLICATE");

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("ARGUMENT_VALUE_MISSING");
    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

export function validateOptions(options) {
  const target = BACKFILL_TARGETS[options.target];
  if (!target) fail("TARGET_INVALID");
  if (options.confirmProjectRef !== target.ref) {
    fail("PROJECT_CONFIRMATION_MISMATCH");
  }
  const expectedApplicationHead =
    options.expectedApplicationHead ?? APPROVED_APPLICATION_HEAD;
  if (!GIT_SHA_PATTERN.test(expectedApplicationHead)) {
    fail("EXPECTED_APPLICATION_HEAD_INVALID");
  }
  if (
    options.target === "production" &&
    expectedApplicationHead !== APPROVED_APPLICATION_HEAD
  ) {
    fail("PRODUCTION_APPLICATION_HEAD_MISMATCH");
  }
  if (!GIT_SHA_PATTERN.test(options.expectedToolingHead ?? "")) {
    fail("EXPECTED_TOOLING_HEAD_INVALID");
  }
  if (!SHA256_PATTERN.test(options.allowlistSha256 ?? "")) {
    fail("ALLOWLIST_FILE_SHA256_INVALID");
  }
  if (!options.allowlistFile) fail("ALLOWLIST_FILE_REQUIRED");

  const baseUrl = validateBaseUrl(options.baseUrl, options.target);
  return {
    ...options,
    baseUrl,
    expectedApplicationHead,
    targetConfig: target,
  };
}

export function validateBaseUrl(value, targetName) {
  let parsed;
  try {
    parsed = new URL(value ?? "");
  } catch {
    fail("BASE_URL_INVALID");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    fail("BASE_URL_INVALID");
  }

  const origin = parsed.origin.toLowerCase();
  if (targetName === "production") {
    if (origin !== BACKFILL_TARGETS.production.baseUrl) {
      fail("PRODUCTION_BASE_URL_MISMATCH");
    }
  } else if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(
      parsed.hostname
    )
  ) {
    fail("STAGING_DEPLOYMENT_URL_INVALID");
  }

  return origin;
}

export function canonicalizePlayerIds(playerIds) {
  if (!Array.isArray(playerIds)) fail("ALLOWLIST_PLAYER_IDS_INVALID");

  const unique = new Set();
  for (const value of playerIds) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      fail("ALLOWLIST_PLAYER_ID_INVALID");
    }
    if (unique.has(value)) fail("ALLOWLIST_PLAYER_ID_DUPLICATE");
    unique.add(value);
  }

  const sorted = [...unique].sort();
  if (sorted.length === 0 || sorted.length > MAX_ALLOWLIST_PLAYERS) {
    fail("ALLOWLIST_PLAYER_COUNT_INVALID");
  }
  return sorted;
}

export function serializePlayerIds(playerIds) {
  return playerIds.length === 0 ? "" : `${playerIds.join("\n")}\n`;
}

export function hashPlayerIds(playerIds) {
  return createHash("sha256")
    .update(serializePlayerIds(playerIds), "utf8")
    .digest("hex");
}

export function parseAllowlistDocument(text, { target, projectRef }) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    fail("ALLOWLIST_JSON_INVALID");
  }

  if (!isRecord(document)) fail("ALLOWLIST_DOCUMENT_INVALID");
  const keys = Object.keys(document).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== "playerIds" ||
    keys[1] !== "projectRef" ||
    keys[2] !== "schemaVersion" ||
    keys[3] !== "target"
  ) {
    fail("ALLOWLIST_DOCUMENT_SHAPE_INVALID");
  }
  if (
    document.schemaVersion !== 1 ||
    document.target !== target ||
    document.projectRef !== projectRef
  ) {
    fail("ALLOWLIST_DOCUMENT_TARGET_MISMATCH");
  }

  const playerIds = canonicalizePlayerIds(document.playerIds);
  if (
    document.playerIds.some(
      (playerId, index) => playerId !== playerIds[index]
    )
  ) {
    fail("ALLOWLIST_PLAYER_IDS_NOT_CANONICAL");
  }
  if (target === "staging" && playerIds.length !== 1) {
    fail("STAGING_ALLOWLIST_MUST_CONTAIN_ONE_PLAYER");
  }

  return { playerIds, playerIdsSha256: hashPlayerIds(playerIds) };
}

export function readAllowlistFile(
  allowlistPath,
  expected,
  repositoryRoot = process.cwd()
) {
  const absolutePath = isAbsolute(allowlistPath)
    ? resolve(allowlistPath)
    : resolve(repositoryRoot, allowlistPath);

  let realPath;
  let metadata;
  try {
    realPath = realpathSync(absolutePath);
    metadata = statSync(realPath);
  } catch {
    fail("ALLOWLIST_FILE_UNAVAILABLE");
  }

  const repositoryRealPath = realpathSync(repositoryRoot);
  const repositoryRelativePath = relative(repositoryRealPath, realPath);
  if (
    repositoryRelativePath === "" ||
    (!repositoryRelativePath.startsWith("..") &&
      !isAbsolute(repositoryRelativePath))
  ) {
    fail("ALLOWLIST_FILE_MUST_BE_OUTSIDE_REPOSITORY");
  }
  if (
    !metadata.isFile() ||
    metadata.size <= 0 ||
    metadata.size > MAX_ALLOWLIST_BYTES
  ) {
    fail("ALLOWLIST_FILE_INVALID");
  }

  let bytes;
  try {
    bytes = readFileSync(realPath);
  } catch {
    fail("ALLOWLIST_FILE_UNAVAILABLE");
  }

  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  if (fileSha256 !== expected.fileSha256) {
    fail("ALLOWLIST_FILE_HASH_MISMATCH");
  }

  return {
    ...parseAllowlistDocument(bytes.toString("utf8"), expected),
    fileSha256,
  };
}

export function decodeJwtPayload(jwt) {
  if (typeof jwt !== "string") fail("SERVICE_ROLE_JWT_INVALID");
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts.every((part) => part.length > 0)) {
    fail("SERVICE_ROLE_JWT_INVALID");
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    if (!isRecord(payload)) fail("SERVICE_ROLE_JWT_INVALID");
    return payload;
  } catch (error) {
    if (error instanceof BadgeBackfillCutoverError) throw error;
    fail("SERVICE_ROLE_JWT_INVALID");
  }
}

export function validateRuntimeEnvironment(
  environment,
  target,
  now = Date.now()
) {
  const rawUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl ?? "");
  } catch {
    fail("SUPABASE_URL_INVALID");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.port ||
    parsedUrl.hostname !== `${target.ref}.supabase.co` ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    fail("SUPABASE_PROJECT_URL_MISMATCH");
  }
  if (typeof publishableKey !== "string" || publishableKey.length === 0) {
    fail("SUPABASE_PUBLISHABLE_KEY_MISSING");
  }

  const payload = decodeJwtPayload(serviceRoleKey);
  if (
    payload.role !== "service_role" ||
    payload.ref !== target.ref ||
    payload.iss !== "supabase" ||
    (typeof payload.exp === "number" && payload.exp * 1000 <= now)
  ) {
    fail("SERVICE_ROLE_PROJECT_MISMATCH");
  }

  return {
    publishableKey,
    serviceRoleKey,
    supabaseUrl: parsedUrl.origin,
  };
}

export function buildDatabaseAttestationSql(playerIds) {
  const canonicalPlayerIds = canonicalizePlayerIds(playerIds);
  const values = canonicalPlayerIds
    .map((playerId) => `('${playerId}'::uuid)`)
    .join(",\n      ");

  return `begin transaction isolation level repeatable read read only;
set local search_path = pg_catalog, extensions;

with
  allowlisted(id) as (
    values
      ${values}
  ),
  open_players as (
    select player.id, player.clerk_user_id
    from public.players as player
    where player.account_closed_at is null
  ),
  synthetic_open_players as (
    select open_player.id
    from open_players as open_player
    join ironclad_private.staging_synthetic_uat_players as fixture
      on fixture.player_id = open_player.id
  ),
  unavailable_identity_open_players as (
    select open_player.id
    from open_players as open_player
    where open_player.clerk_user_id is null
      or btrim(open_player.clerk_user_id) = ''
      or open_player.clerk_user_id !~ '^user_[A-Za-z0-9]+$'
  ),
  legitimate_open_candidates as (
    select open_player.id
    from open_players as open_player
    left join synthetic_open_players as synthetic_player
      on synthetic_player.id = open_player.id
    left join unavailable_identity_open_players as unavailable_player
      on unavailable_player.id = open_player.id
    where synthetic_player.id is null
      and unavailable_player.id is null
  ),
  allowlisted_status as (
    select
      allowlisted.id,
      open_player.id is not null as is_open,
      synthetic_player.id is not null as is_synthetic,
      unavailable_player.id is not null as identity_unavailable
    from allowlisted
    left join open_players as open_player
      on open_player.id = allowlisted.id
    left join synthetic_open_players as synthetic_player
      on synthetic_player.id = allowlisted.id
    left join unavailable_identity_open_players as unavailable_player
      on unavailable_player.id = allowlisted.id
  ),
  legitimate_open_allowlisted as (
    select status.id
    from allowlisted_status as status
    where status.is_open
      and not status.is_synthetic
      and not status.identity_unavailable
  ),
  open_serialized as (
    select
      count(*)::bigint as row_count,
      coalesce(string_agg(id::text, E'\\n' order by id), '')
        || case when count(*) = 0 then '' else E'\\n' end as value
    from open_players
  ),
  candidate_serialized as (
    select
      count(*)::bigint as row_count,
      coalesce(string_agg(id::text, E'\\n' order by id), '')
        || case when count(*) = 0 then '' else E'\\n' end as value
    from legitimate_open_candidates
  ),
  allowlist_serialized as (
    select
      count(*)::bigint as row_count,
      coalesce(string_agg(id::text, E'\\n' order by id), '')
        || case when count(*) = 0 then '' else E'\\n' end as value
    from allowlisted
  ),
  legitimate_open_allowlist_serialized as (
    select
      count(*)::bigint as row_count,
      coalesce(string_agg(id::text, E'\\n' order by id), '')
        || case when count(*) = 0 then '' else E'\\n' end as value
    from legitimate_open_allowlisted
  )
select
  open_serialized.row_count as open_player_count,
  encode(digest(convert_to(open_serialized.value, 'UTF8'), 'sha256'), 'hex')
    as open_player_sha256,
  candidate_serialized.row_count as candidate_player_count,
  encode(digest(convert_to(candidate_serialized.value, 'UTF8'), 'sha256'), 'hex')
    as candidate_player_sha256,
  (select count(*)::bigint from synthetic_open_players)
    as synthetic_open_player_count,
  (select count(*)::bigint from unavailable_identity_open_players)
    as unavailable_identity_open_player_count,
  allowlist_serialized.row_count as allowlist_player_count,
  encode(digest(convert_to(allowlist_serialized.value, 'UTF8'), 'sha256'), 'hex')
    as allowlist_player_sha256,
  legitimate_open_allowlist_serialized.row_count
    as legitimate_open_allowlist_player_count,
  encode(
    digest(
      convert_to(legitimate_open_allowlist_serialized.value, 'UTF8'),
      'sha256'
    ),
    'hex'
  ) as legitimate_open_allowlist_player_sha256,
  (select count(*)::bigint from allowlisted_status where not is_open)
    as allowlist_closed_or_missing_count,
  (select count(*)::bigint from allowlisted_status where is_synthetic)
    as allowlist_synthetic_overlap_count,
  (select count(*)::bigint from allowlisted_status where identity_unavailable)
    as allowlist_unavailable_identity_count
from
  open_serialized,
  candidate_serialized,
  allowlist_serialized,
  legitimate_open_allowlist_serialized;

rollback;`;
}

export function validateDatabaseAttestation(
  value,
  { target, playerCount, playerSha256 }
) {
  if (!isRecord(value)) fail("DATABASE_ATTESTATION_INVALID");

  const parsed = {
    allowlistClosedOrMissingCount: nonnegativeInteger(
      value.allowlist_closed_or_missing_count
    ),
    allowlistPlayerCount: nonnegativeInteger(value.allowlist_player_count),
    allowlistPlayerSha256: sha256OrFail(value.allowlist_player_sha256),
    allowlistSyntheticOverlapCount: nonnegativeInteger(
      value.allowlist_synthetic_overlap_count
    ),
    allowlistUnavailableIdentityCount: nonnegativeInteger(
      value.allowlist_unavailable_identity_count
    ),
    candidatePlayerCount: nonnegativeInteger(value.candidate_player_count),
    candidatePlayerSha256: sha256OrFail(value.candidate_player_sha256),
    legitimateOpenAllowlistPlayerCount: nonnegativeInteger(
      value.legitimate_open_allowlist_player_count
    ),
    legitimateOpenAllowlistPlayerSha256: sha256OrFail(
      value.legitimate_open_allowlist_player_sha256
    ),
    openPlayerCount: nonnegativeInteger(value.open_player_count),
    openPlayerSha256: sha256OrFail(value.open_player_sha256),
    syntheticOpenPlayerCount: nonnegativeInteger(
      value.synthetic_open_player_count
    ),
    unavailableIdentityOpenPlayerCount: nonnegativeInteger(
      value.unavailable_identity_open_player_count
    ),
  };

  if (
    parsed.allowlistPlayerCount !== playerCount ||
    parsed.allowlistPlayerSha256 !== playerSha256 ||
    parsed.legitimateOpenAllowlistPlayerCount !== playerCount ||
    parsed.legitimateOpenAllowlistPlayerSha256 !== playerSha256 ||
    parsed.allowlistClosedOrMissingCount !== 0 ||
    parsed.allowlistSyntheticOverlapCount !== 0 ||
    parsed.allowlistUnavailableIdentityCount !== 0
  ) {
    fail("ALLOWLIST_DATABASE_ATTESTATION_MISMATCH");
  }

  if (
    target === "production" &&
    (parsed.candidatePlayerCount !== playerCount ||
      parsed.candidatePlayerSha256 !== playerSha256)
  ) {
    fail("PRODUCTION_CANDIDATE_ATTESTATION_MISMATCH");
  }

  return {
    allowlistClosedOrMissingCount: parsed.allowlistClosedOrMissingCount,
    allowlistCount: parsed.allowlistPlayerCount,
    allowlistHashMatches: true,
    allowlistSyntheticOverlapCount: parsed.allowlistSyntheticOverlapCount,
    allowlistUnavailableIdentityCount:
      parsed.allowlistUnavailableIdentityCount,
    allAllowlistedPlayersLegitimateOpen: true,
    candidateHashMatches:
      target === "production"
        ? parsed.candidatePlayerSha256 === playerSha256
        : null,
    candidatePlayerCount:
      target === "production" ? parsed.candidatePlayerCount : null,
    candidatePlayerSha256:
      target === "production" ? parsed.candidatePlayerSha256 : null,
    globalOpenCount:
      target === "production" ? parsed.openPlayerCount : null,
    syntheticOpenPlayerCount:
      target === "production" ? parsed.syntheticOpenPlayerCount : null,
    unavailableIdentityOpenPlayerCount:
      target === "production"
        ? parsed.unavailableIdentityOpenPlayerCount
        : null,
  };
}

export function diffAwardRows(beforeRows, afterRows) {
  const before = indexAwardRows(beforeRows);
  const after = indexAwardRows(afterRows);

  for (const [awardId, beforeRow] of before) {
    const afterRow = after.get(awardId);
    if (!afterRow || stableJson(afterRow) !== stableJson(beforeRow)) {
      fail("EXISTING_AWARD_CHANGED_DURING_BACKFILL");
    }
  }

  return [...after.values()].filter((row) => !before.has(row.id));
}

export function aggregateBackfillResults(results) {
  const badgeCounts = {};
  const errorsByCode = {};
  let awardsCreated = 0;
  let playersEvaluated = 0;

  for (const result of results) {
    if (!isRecord(result)) fail("BACKFILL_RESULT_INVALID");
    const resultAwardsCreated = nonnegativeInteger(result.awardsCreated);
    const resultPlayersEvaluated = nonnegativeInteger(result.playersEvaluated);
    if (!isRecord(result.badgeCounts) || !Array.isArray(result.errors)) {
      fail("BACKFILL_RESULT_INVALID");
    }

    awardsCreated += resultAwardsCreated;
    playersEvaluated += resultPlayersEvaluated;

    for (const [slug, rawCount] of Object.entries(result.badgeCounts)) {
      if (!BADGE_SLUG_PATTERN.test(slug)) fail("BACKFILL_RESULT_INVALID");
      const count = nonnegativeInteger(rawCount);
      badgeCounts[slug] = (badgeCounts[slug] ?? 0) + count;
    }

    for (const error of result.errors) {
      const code =
        isRecord(error) && typeof error.code === "string"
          ? sanitizeCode(error.code)
          : "BADGE_BACKFILL_FAILED";
      errorsByCode[code] = (errorsByCode[code] ?? 0) + 1;
    }
  }

  return {
    awardsCreated,
    badgeCounts: Object.fromEntries(
      Object.entries(badgeCounts).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    errorCount: Object.values(errorsByCode).reduce(
      (total, count) => total + count,
      0
    ),
    errorsByCode: Object.fromEntries(
      Object.entries(errorsByCode).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    playersEvaluated,
  };
}

export function validateBackfillPass(
  pass,
  { expectedPlayers, expectedNewAwards, requireZero }
) {
  if (
    pass.playersEvaluated !== expectedPlayers ||
    pass.errorCount !== 0 ||
    pass.awardsCreated !== expectedNewAwards ||
    (requireZero && pass.awardsCreated !== 0)
  ) {
    fail(requireZero ? "IDEMPOTENCY_PASS_FAILED" : "BACKFILL_PASS_FAILED", {
      awardsCreated: pass.awardsCreated,
      errorCount: pass.errorCount,
      errorsByCode: pass.errorsByCode,
      playersEvaluated: pass.playersEvaluated,
    });
  }

  const badgeCountTotal = Object.values(pass.badgeCounts).reduce(
    (total, count) => total + count,
    0
  );
  if (badgeCountTotal !== pass.awardsCreated) {
    fail("BACKFILL_BADGE_COUNT_MISMATCH");
  }
  return pass;
}

export function validateNewAwardMetadata(rows) {
  if (
    rows.some(
      (row) =>
        !isRecord(row.source_metadata) ||
        row.source_metadata.evaluationMode !== "backfill"
    )
  ) {
    fail("NEW_AWARD_EVALUATION_MODE_MISMATCH");
  }
  return true;
}

export function validateLoadedAuthority(value) {
  if (
    !isRecord(value) ||
    typeof value.backfillInitialBadgeAwards !== "function" ||
    !isRecord(value.server) ||
    typeof value.server.close !== "function"
  ) {
    fail("BACKFILL_AUTHORITY_EXPORT_INVALID");
  }

  return {
    backfillInitialBadgeAwards: value.backfillInitialBadgeAwards,
    server: value.server,
  };
}

export async function runInitialAwardsBackfill(
  rawOptions,
  {
    environment = process.env,
    repositoryRoot = process.cwd(),
    commandRunner = runCheckedCommand,
    clientFactory = createClient,
    authorityLoader = loadBadgeAuthority,
  } = {}
) {
  const options = validateOptions(rawOptions);
  const target = options.targetConfig;
  const allowlist = readAllowlistFile(
    options.allowlistFile,
    {
      fileSha256: options.allowlistSha256,
      projectRef: target.ref,
      target: options.target,
    },
    repositoryRoot
  );
  const runtime = validateRuntimeEnvironment(environment, target);

  verifyGitState(options, commandRunner, repositoryRoot);
  verifySupabaseProject(target, commandRunner, repositoryRoot);
  const deployment = verifyVercelDeployment(
    options,
    commandRunner,
    repositoryRoot
  );

  const sqlAttestation = queryDatabaseAttestation(
    target,
    allowlist.playerIds,
    commandRunner,
    repositoryRoot
  );
  const databaseAttestation = validateDatabaseAttestation(sqlAttestation, {
    playerCount: allowlist.playerIds.length,
    playerSha256: allowlist.playerIdsSha256,
    target: options.target,
  });

  const supabase = clientFactory(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const serviceRolePlayers = await loadAllowlistedPlayers(
    supabase,
    allowlist.playerIds
  );
  if (
    serviceRolePlayers.length !== allowlist.playerIds.length ||
    hashPlayerIds(serviceRolePlayers) !== allowlist.playerIdsSha256
  ) {
    fail("SERVICE_ROLE_ALLOWLIST_ATTESTATION_MISMATCH");
  }

  const beforeAwards = await loadAwardRows(supabase, allowlist.playerIds);
  const baselineNonBackfillAwards = beforeAwards.filter(
    (award) => !isBackfillAward(award)
  );
  if (
    options.target === "production" &&
    baselineNonBackfillAwards.length !== 0
  ) {
    fail("PRODUCTION_BASELINE_AWARD_MODE_MISMATCH", {
      baselineAwardCount: beforeAwards.length,
      nonBackfillAwardCount: baselineNonBackfillAwards.length,
    });
  }
  const existingBackfillAwards = beforeAwards.filter(isBackfillAward);
  const existingBackfillNotificationCount = await countMatchingNotifications(
    supabase,
    existingBackfillAwards.map((award) => award.id)
  );
  const existingBackfillRevealCount = await countMatchingReveals(
    supabase,
    existingBackfillAwards.map((award) => award.id)
  );
  if (
    existingBackfillNotificationCount !== 0 ||
    existingBackfillRevealCount !== 0
  ) {
    fail("EXISTING_BACKFILL_POSTCONDITION_FAILED", {
      matchingNotifications: existingBackfillNotificationCount,
      matchingReveals: existingBackfillRevealCount,
      retainedBackfillAwards: existingBackfillAwards.length,
    });
  }

  const report = {
    allowlist: {
      count: allowlist.playerIds.length,
      fileSha256: allowlist.fileSha256,
      playerIdsSha256: allowlist.playerIdsSha256,
    },
    authority: null,
    before: {
      awardCount: beforeAwards.length,
      nonBackfillAwardCount: baselineNonBackfillAwards.length,
      retainedBackfillAwardCount: existingBackfillAwards.length,
      retainedBackfillNotifications: existingBackfillNotificationCount,
      retainedBackfillReveals: existingBackfillRevealCount,
    },
    databaseAttestation,
    deployment,
    expectedApplicationHead: options.expectedApplicationHead,
    expectedToolingHead: options.expectedToolingHead,
    firstPass: null,
    mode: options.apply ? "apply" : "preflight",
    ok: true,
    postconditions: null,
    projectRef: target.ref,
    secondPass: null,
    serviceRoleAttestation: {
      allowlistCount: serviceRolePlayers.length,
      allowlistHashMatches: true,
    },
    target: options.target,
    toolingBaseHead: APPROVED_TOOLING_BASE_HEAD,
  };

  if (!options.apply) {
    let preflightAuthorityServer;
    try {
      const loaded = await authorityLoader(repositoryRoot);
      preflightAuthorityServer = isRecord(loaded) ? loaded.server : null;
      validateLoadedAuthority(loaded);
      report.authority = {
        envFile: false,
        exportVerified: true,
        loader: "vite-ssr",
      };
      return { ...report, code: "BADGE_BACKFILL_PREFLIGHT_READY" };
    } finally {
      if (typeof preflightAuthorityServer?.close === "function") {
        await preflightAuthorityServer.close();
      }
    }
  }

  const immediateDeployment = verifyVercelDeployment(
    options,
    commandRunner,
    repositoryRoot
  );
  assertSameDeployment(deployment, immediateDeployment);
  const immediateSqlAttestation = validateDatabaseAttestation(
    queryDatabaseAttestation(
      target,
      allowlist.playerIds,
      commandRunner,
      repositoryRoot
    ),
    {
      playerCount: allowlist.playerIds.length,
      playerSha256: allowlist.playerIdsSha256,
      target: options.target,
    }
  );
  if (stableJson(immediateSqlAttestation) !== stableJson(databaseAttestation)) {
    fail("DATABASE_ATTESTATION_CHANGED_BEFORE_APPLY");
  }

  let authorityServer;
  try {
    const loaded = await authorityLoader(repositoryRoot);
    authorityServer = isRecord(loaded) ? loaded.server : null;
    const { backfillInitialBadgeAwards } = validateLoadedAuthority(loaded);
    report.authority = {
      envFile: false,
      exportVerified: true,
      loader: "vite-ssr",
    };

    const firstResults = await runBatchedBackfill({
      backfillInitialBadgeAwards,
      playerIds: allowlist.playerIds,
      supabase,
    });
    const firstPass = aggregateBackfillResults(firstResults);
    const afterFirstAwards = await loadAwardRows(
      supabase,
      allowlist.playerIds
    );
    const firstNewAwards = diffAwardRows(beforeAwards, afterFirstAwards);
    const firstBackfillCohort = afterFirstAwards.filter(isBackfillAward);
    report.firstPass = firstPass;
    validateNewAwardMetadata(firstNewAwards);

    const firstNotificationCount = await countMatchingNotifications(
      supabase,
      firstBackfillCohort.map((award) => award.id)
    );
    const firstRevealCount = await countMatchingReveals(
      supabase,
      firstBackfillCohort.map((award) => award.id)
    );
    if (firstNotificationCount !== 0 || firstRevealCount !== 0) {
      fail("BACKFILL_PRESENTATION_SIDE_EFFECT_DETECTED", {
        matchingNotifications: firstNotificationCount,
        matchingReveals: firstRevealCount,
        retainedBackfillAwards: firstBackfillCohort.length,
        retainedNewAwards: firstNewAwards.length,
      });
    }
    if (firstPass.errorCount !== 0) {
      fail("BACKFILL_PASS_PARTIAL_FAILURE", {
        awardsCreated: firstPass.awardsCreated,
        completedBatches: firstResults.length,
        errorCount: firstPass.errorCount,
        errorsByCode: firstPass.errorsByCode,
        pass: "first",
        retainedNewAwards: firstNewAwards.length,
      });
    }

    validateBackfillPass(firstPass, {
      expectedNewAwards: firstNewAwards.length,
      expectedPlayers: allowlist.playerIds.length,
      requireZero: false,
    });

    const afterFirstPassDatabaseAttestation = validateDatabaseAttestation(
      queryDatabaseAttestation(
        target,
        allowlist.playerIds,
        commandRunner,
        repositoryRoot
      ),
      {
        playerCount: allowlist.playerIds.length,
        playerSha256: allowlist.playerIdsSha256,
        target: options.target,
      }
    );
    if (
      stableJson(afterFirstPassDatabaseAttestation) !==
      stableJson(databaseAttestation)
    ) {
      fail("DATABASE_ATTESTATION_CHANGED_AFTER_FIRST_PASS", {
        retainedFirstPassNewAwards: firstNewAwards.length,
      });
    }

    const secondResults = await runBatchedBackfill({
      backfillInitialBadgeAwards,
      playerIds: allowlist.playerIds,
      supabase,
    });
    const secondPass = aggregateBackfillResults(secondResults);
    const afterSecondAwards = await loadAwardRows(
      supabase,
      allowlist.playerIds
    );
    const secondNewAwards = diffAwardRows(
      afterFirstAwards,
      afterSecondAwards
    );
    const finalBackfillCohort = afterSecondAwards.filter(isBackfillAward);
    report.secondPass = secondPass;
    validateNewAwardMetadata(secondNewAwards);

    const finalNotificationCount = await countMatchingNotifications(
      supabase,
      finalBackfillCohort.map((award) => award.id)
    );
    const finalRevealCount = await countMatchingReveals(
      supabase,
      finalBackfillCohort.map((award) => award.id)
    );
    if (finalNotificationCount !== 0 || finalRevealCount !== 0) {
      fail("BACKFILL_PRESENTATION_SIDE_EFFECT_DETECTED", {
        matchingNotifications: finalNotificationCount,
        matchingReveals: finalRevealCount,
        retainedBackfillAwards: finalBackfillCohort.length,
        retainedNewAwards:
          firstNewAwards.length + secondNewAwards.length,
      });
    }
    if (secondPass.errorCount !== 0) {
      fail("BACKFILL_PASS_PARTIAL_FAILURE", {
        awardsCreated: secondPass.awardsCreated,
        completedBatches: secondResults.length,
        errorCount: secondPass.errorCount,
        errorsByCode: secondPass.errorsByCode,
        pass: "second",
        retainedNewAwards: secondNewAwards.length,
      });
    }

    validateBackfillPass(secondPass, {
      expectedNewAwards: secondNewAwards.length,
      expectedPlayers: allowlist.playerIds.length,
      requireZero: true,
    });

    const finalDatabaseAttestation = validateDatabaseAttestation(
      queryDatabaseAttestation(
        target,
        allowlist.playerIds,
        commandRunner,
        repositoryRoot
      ),
      {
        playerCount: allowlist.playerIds.length,
        playerSha256: allowlist.playerIdsSha256,
        target: options.target,
      }
    );
    if (
      stableJson(finalDatabaseAttestation) !== stableJson(databaseAttestation)
    ) {
      fail("DATABASE_ATTESTATION_CHANGED_DURING_BACKFILL", {
        retainedFirstPassNewAwards: firstNewAwards.length,
      });
    }

    report.postconditions = {
      databaseAttestationUnchanged: true,
      databaseAttestationUnchangedAfterFirstPass: true,
      evaluationModeBackfill: true,
      firstPassNewAwards: firstNewAwards.length,
      matchingNotifications: finalNotificationCount,
      matchingReveals: finalRevealCount,
      secondPassNewAwards: secondNewAwards.length,
      secondPassZero: true,
      validatedBackfillCohortAwards: finalBackfillCohort.length,
    };
  } finally {
    if (typeof authorityServer?.close === "function") {
      await authorityServer.close();
    }
  }

  const finalDeployment = verifyVercelDeployment(
    options,
    commandRunner,
    repositoryRoot
  );
  assertSameDeployment(deployment, finalDeployment);

  return { ...report, code: "BADGE_BACKFILL_COMPLETE" };
}

export async function loadBadgeAuthority(repositoryRoot = process.cwd()) {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    envFile: false,
    logLevel: "silent",
    resolve: { tsconfigPaths: true },
    root: repositoryRoot,
    server: { middlewareMode: true },
    ssr: {
      noExternal: ["server-only"],
      resolve: { conditions: ["react-server"] },
    },
  });

  try {
    const authorityModule = await server.ssrLoadModule(
      "/lib/badges/authority.ts"
    );
    return {
      backfillInitialBadgeAwards:
        authorityModule.backfillInitialBadgeAwards,
      server,
    };
  } catch {
    await server.close();
    fail("BACKFILL_AUTHORITY_LOAD_FAILED");
  }
}

export async function runBatchedBackfill({
  backfillInitialBadgeAwards,
  playerIds,
  supabase,
}) {
  const results = [];
  for (const batch of chunks(playerIds, BACKFILL_BATCH_SIZE)) {
    try {
      const result = await backfillInitialBadgeAwards({
        playerIds: batch,
        supabase,
      });
      results.push(result);
      if (Array.isArray(result?.errors) && result.errors.length > 0) {
        break;
      }
    } catch {
      fail("BACKFILL_BATCH_FAILED", {
        completedBatches: results.length,
      });
    }
  }
  return results;
}

async function loadAllowlistedPlayers(supabase, playerIds) {
  const returnedIds = [];
  for (const batch of chunks(playerIds, BACKFILL_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("players")
      .select("id, clerk_user_id, account_closed_at")
      .in("id", batch)
      .is("account_closed_at", null);
    if (error || !Array.isArray(data)) fail("PLAYER_ALLOWLIST_LOAD_FAILED");

    for (const row of data) {
      if (
        !isRecord(row) ||
        typeof row.id !== "string" ||
        !UUID_PATTERN.test(row.id) ||
        row.account_closed_at !== null ||
        typeof row.clerk_user_id !== "string" ||
        !CLERK_USER_ID_PATTERN.test(row.clerk_user_id)
      ) {
        fail("PLAYER_ALLOWLIST_ROW_INVALID");
      }
      returnedIds.push(row.id);
    }
  }
  return canonicalizePlayerIds(returnedIds);
}

async function loadAwardRows(supabase, playerIds) {
  const rows = [];
  for (const playerBatch of chunks(playerIds, BACKFILL_BATCH_SIZE)) {
    for (let offset = 0; ; offset += REST_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("player_badge_awards")
        .select("id, player_id, badge_slug, source_metadata")
        .in("player_id", playerBatch)
        .order("id", { ascending: true })
        .range(offset, offset + REST_PAGE_SIZE - 1);
      if (error || !Array.isArray(data)) fail("AWARD_SNAPSHOT_LOAD_FAILED");
      rows.push(...data.map(parseAwardRow));
      if (data.length < REST_PAGE_SIZE) break;
    }
  }
  return [...indexAwardRows(rows).values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

async function countMatchingNotifications(supabase, awardIds) {
  let count = 0;
  for (const awardBatch of chunks(awardIds, BACKFILL_BATCH_SIZE)) {
    const eventKeys = awardBatch.map(
      (awardId) => `badge-award:${awardId}:unlocked`
    );
    const { count: batchCount, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", "badge.unlocked")
      .in("event_key", eventKeys);
    if (error || !Number.isInteger(batchCount) || batchCount < 0) {
      fail("NOTIFICATION_POSTCONDITION_LOAD_FAILED");
    }
    count += batchCount;
  }
  return count;
}

async function countMatchingReveals(supabase, awardIds) {
  let count = 0;
  for (const awardBatch of chunks(awardIds, BACKFILL_BATCH_SIZE)) {
    const { count: batchCount, error } = await supabase
      .from("player_badge_reveals")
      .select("id", { count: "exact", head: true })
      .in("player_badge_award_id", awardBatch);
    if (error || !Number.isInteger(batchCount) || batchCount < 0) {
      fail("REVEAL_POSTCONDITION_LOAD_FAILED");
    }
    count += batchCount;
  }
  return count;
}

function parseAwardRow(value) {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.player_id !== "string" ||
    !UUID_PATTERN.test(value.player_id) ||
    typeof value.badge_slug !== "string" ||
    !BADGE_SLUG_PATTERN.test(value.badge_slug) ||
    !isRecord(value.source_metadata)
  ) {
    fail("AWARD_SNAPSHOT_ROW_INVALID");
  }

  return {
    badge_slug: value.badge_slug,
    id: value.id,
    player_id: value.player_id,
    source_metadata: value.source_metadata,
  };
}

function isBackfillAward(row) {
  return row.source_metadata.evaluationMode === "backfill";
}

function indexAwardRows(rows) {
  const indexed = new Map();
  for (const rawRow of rows) {
    const row = parseAwardRow(rawRow);
    if (indexed.has(row.id)) fail("AWARD_SNAPSHOT_DUPLICATE_ID");
    indexed.set(row.id, row);
  }
  return indexed;
}

function queryDatabaseAttestation(
  target,
  playerIds,
  commandRunner,
  repositoryRoot
) {
  const temporarySqlPath = join(
    tmpdir(),
    `ironclad-badge-backfill-${target.ref}-${randomUUID()}.sql`
  );

  try {
    writeFileSync(temporarySqlPath, buildDatabaseAttestationSql(playerIds), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const output = runSupabase(
      [
        "--output-format",
        "json",
        "db",
        "query",
        "--linked",
        "--project-ref",
        target.ref,
        "--file",
        temporarySqlPath,
      ],
      commandRunner,
      repositoryRoot,
      "DATABASE_ATTESTATION_QUERY_FAILED"
    );
    const result = parseLastJsonObject(output, "DATABASE_ATTESTATION_INVALID");
    if (!Array.isArray(result.rows) || result.rows.length !== 1) {
      fail("DATABASE_ATTESTATION_INVALID");
    }
    return result.rows[0];
  } finally {
    if (existsSync(temporarySqlPath)) unlinkSync(temporarySqlPath);
  }
}

function verifyGitState(options, commandRunner, repositoryRoot) {
  const head = commandRunner(
    "git",
    ["rev-parse", "HEAD"],
    repositoryRoot,
    "GIT_HEAD_LOAD_FAILED"
  ).trim();
  if (head !== options.expectedToolingHead) {
    fail("GIT_TOOLING_HEAD_MISMATCH");
  }

  const status = commandRunner(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    repositoryRoot,
    "GIT_STATUS_LOAD_FAILED"
  );
  if (status.trim().length > 0) fail("GIT_WORKTREE_DIRTY");

  const mergeBase = commandRunner(
    "git",
    [
      "merge-base",
      APPROVED_TOOLING_BASE_HEAD,
      options.expectedToolingHead,
    ],
    repositoryRoot,
    "GIT_TOOLING_BASE_LOAD_FAILED"
  ).trim();
  if (mergeBase !== APPROVED_TOOLING_BASE_HEAD) {
    fail("GIT_TOOLING_BASE_MISMATCH");
  }

  const toolingRange = [
    APPROVED_TOOLING_BASE_HEAD,
    options.expectedToolingHead,
  ].join("..");
  const toolingDiffPaths = parseGitPathList(
    commandRunner(
      "git",
      [
        "diff",
        "--name-only",
        "--no-renames",
        toolingRange,
        "--",
      ],
      repositoryRoot,
      "GIT_TOOLING_DIFF_LOAD_FAILED"
    ),
    "GIT_TOOLING_DIFF_INVALID"
  );
  if (
    stableJson(toolingDiffPaths) !==
    stableJson([...AUTHORIZED_TOOLING_PATHS].sort())
  ) {
    fail("GIT_TOOLING_DIFF_MISMATCH");
  }

  const runtimeModuleDiffPaths = parseGitPathList(
    commandRunner(
      "git",
      [
        "diff",
        "--name-only",
        "--no-renames",
        toolingRange,
        "--",
        ...PINNED_RUNTIME_MODULE_PATHS,
      ],
      repositoryRoot,
      "GIT_RUNTIME_MODULE_DIFF_LOAD_FAILED"
    ),
    "GIT_RUNTIME_MODULE_DIFF_INVALID"
  );
  if (runtimeModuleDiffPaths.length !== 0) {
    fail("GIT_RUNTIME_MODULE_MISMATCH");
  }
}

function parseGitPathList(value, code) {
  if (typeof value !== "string") fail(code);
  const paths = value.split(/\r?\n/u).filter((path) => path.length > 0);
  if (new Set(paths).size !== paths.length) fail(code);
  return paths.sort();
}

function verifySupabaseProject(target, commandRunner, repositoryRoot) {
  const output = runSupabase(
    ["--output", "json", "projects", "list"],
    commandRunner,
    repositoryRoot,
    "SUPABASE_PROJECT_LIST_FAILED"
  );
  let projects;
  try {
    projects = JSON.parse(output);
  } catch {
    fail("SUPABASE_PROJECT_LIST_INVALID");
  }
  if (!Array.isArray(projects)) fail("SUPABASE_PROJECT_LIST_INVALID");

  const matches = projects.filter(
    (project) =>
      isRecord(project) &&
      project.id === target.ref &&
      project.name === target.name &&
      project.status === "ACTIVE_HEALTHY"
  );
  if (matches.length !== 1) fail("SUPABASE_PROJECT_IDENTITY_MISMATCH");
}

function verifyVercelDeployment(options, commandRunner, repositoryRoot) {
  const inspected = parseLastJsonObject(
    runVercel(
      ["inspect", options.baseUrl, "--json", "--no-color"],
      commandRunner,
      repositoryRoot,
      "VERCEL_DEPLOYMENT_INSPECTION_FAILED"
    ),
    "VERCEL_DEPLOYMENT_INSPECTION_INVALID"
  );
  if (
    typeof inspected.id !== "string" ||
    !/^dpl_[A-Za-z0-9]+$/.test(inspected.id) ||
    typeof inspected.url !== "string" ||
    inspected.readyState !== "READY"
  ) {
    fail("VERCEL_DEPLOYMENT_NOT_READY");
  }
  if (
    options.target === "staging" &&
    `https://${inspected.url.toLowerCase()}` !== options.baseUrl
  ) {
    fail("STAGING_DEPLOYMENT_ALIAS_REJECTED");
  }
  if (options.target === "production" && inspected.target !== "production") {
    fail("PRODUCTION_DEPLOYMENT_TARGET_MISMATCH");
  }

  const metadata = parseLastJsonObject(
    runVercel(
      [
        "api",
        `/v13/deployments/${inspected.id}`,
        "--raw",
        "--scope",
        VERCEL_SCOPE,
      ],
      commandRunner,
      repositoryRoot,
      "VERCEL_DEPLOYMENT_METADATA_FAILED"
    ),
    "VERCEL_DEPLOYMENT_METADATA_INVALID"
  );
  if (
    metadata.id !== inspected.id ||
    metadata.readyState !== "READY" ||
    metadata.gitSource?.sha !== options.expectedApplicationHead
  ) {
    fail("VERCEL_DEPLOYMENT_HEAD_MISMATCH");
  }
  if (
    options.target === "staging" &&
    metadata.target === "production"
  ) {
    fail("STAGING_DEPLOYMENT_TARGET_MISMATCH");
  }
  if (
    options.target === "production" &&
    metadata.target !== "production"
  ) {
    fail("PRODUCTION_DEPLOYMENT_TARGET_MISMATCH");
  }

  return {
    id: metadata.id,
    gitSha: metadata.gitSource.sha,
    target: metadata.target ?? "preview",
  };
}

function assertSameDeployment(expected, actual) {
  if (stableJson(expected) !== stableJson(actual)) {
    fail("VERCEL_DEPLOYMENT_CHANGED_DURING_BACKFILL");
  }
}

function runSupabase(
  arguments_,
  commandRunner,
  repositoryRoot,
  failureCode
) {
  return runNpx(
    ["--yes", `supabase@${SUPABASE_CLI_VERSION}`, ...arguments_],
    commandRunner,
    repositoryRoot,
    failureCode
  );
}

function runVercel(
  arguments_,
  commandRunner,
  repositoryRoot,
  failureCode
) {
  return runNpx(
    ["--yes", `vercel@${VERCEL_CLI_VERSION}`, ...arguments_],
    commandRunner,
    repositoryRoot,
    failureCode
  );
}

function runNpx(
  arguments_,
  commandRunner,
  repositoryRoot,
  failureCode
) {
  if (process.platform !== "win32") {
    return commandRunner(
      "npx",
      arguments_,
      repositoryRoot,
      failureCode
    );
  }

  const npxCli = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js"
  );
  if (!existsSync(npxCli)) fail("NPX_LAUNCHER_UNAVAILABLE");
  return commandRunner(
    process.execPath,
    [npxCli, ...arguments_],
    repositoryRoot,
    failureCode
  );
}

export function runCheckedCommand(command, arguments_, cwd, failureCode) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: buildCommandEnvironment(process.env),
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
  if (result.error || result.status !== 0) fail(failureCode);
  return String(result.stdout);
}

export function buildCommandEnvironment(environment) {
  const retainedAuthenticationVariables = new Set([
    "SUPABASE_ACCESS_TOKEN",
    "VERCEL_OIDC_TOKEN",
    "VERCEL_TOKEN",
  ]);
  const sanitized = {};

  for (const [name, value] of Object.entries(environment)) {
    if (typeof value !== "string") continue;
    if (retainedAuthenticationVariables.has(name)) {
      sanitized[name] = value;
      continue;
    }
    if (
      /(?:API_KEY|AUTH_TOKEN|DATABASE_URL|DIRECT_URL|(?:^|_)KEY$|PASSWORD|PRIVATE_KEY|SECRET|SERVICE_ROLE|TOKEN)/i.test(
        name
      )
    ) {
      continue;
    }
    sanitized[name] = value;
  }

  return sanitized;
}

function parseLastJsonObject(value, code) {
  if (typeof value !== "string") fail(code);
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "{") continue;
    try {
      return JSON.parse(value.slice(index));
    } catch {
      // CLI status prefixes may contain braces. Continue to the JSON payload.
    }
  }
  fail(code);
}

function nonnegativeInteger(value) {
  const normalized =
    typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : value;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 0
  ) {
    fail("NONNEGATIVE_INTEGER_INVALID");
  }
  return normalized;
}

function sha256OrFail(value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("SHA256_VALUE_INVALID");
  }
  return value;
}

function sanitizeCode(value) {
  const normalized = value.toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(normalized)
    ? normalized
    : "BADGE_BACKFILL_FAILED";
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeFailure(error, options) {
  const productionMutationMayHaveOccurred = Boolean(
    options?.apply && options?.target === "production"
  );
  if (error instanceof BadgeBackfillCutoverError) {
    return {
      code: error.code,
      details: error.details,
      ok: false,
      productionMutationMayHaveOccurred,
    };
  }
  return {
    code: "BADGE_BACKFILL_UNEXPECTED_FAILURE",
    ok: false,
    productionMutationMayHaveOccurred,
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/badges/initial-awards-backfill.mjs \\
    --target <staging|production> \\
    --confirm-project-ref <exact-project-ref> \\
    --base-url <exact-immutable-deployment-origin> \\
    [--expected-application-head <40-character-deployed-git-sha>] \\
    --expected-tooling-head <40-character-local-git-sha> \\
    --allowlist-file <private-json-path-outside-repository> \\
    --allowlist-sha256 <sha256-of-exact-file-bytes> \\
    [--apply]

The application head defaults to the approved application release; Production
cannot override it. The local tooling head is always explicit and must be a
clean descendant containing exactly the approved operator-only files. Without
--apply, the command performs read-only identity, deployment, database,
allowlist, and award-baseline checks. --apply runs the existing controlled
backfill twice over one frozen allowlist and requires the second pass to create
zero awards. Player identifiers and credentials are never printed.`);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const report = await runInitialAwardsBackfill(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify(sanitizeFailure(error, options), null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  await main();
}
