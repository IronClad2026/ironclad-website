import { createHash, randomUUID } from "node:crypto";

import {
  assertMutationGateOpen,
  decodeJwtSubject,
  STAGING_PROJECT,
} from "./project-guard.mjs";
import {
  classifyCleanup,
  protectLaunchedHistory,
  recordCreated,
  recordExpectedAward,
  registerManifestSecretDenyList,
} from "./manifest.mjs";

export const ADMIN_ACTOR = "badge-e2e-admin";
export const OFFICIAL_MAP_POOL_IDS = Object.freeze([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
]);

const REPLAY_BYTES = Buffer.from(
  "IronClad badge staging E2E replay fixture\n",
  "utf8"
);

export async function createFixtureContext({
  targetContext,
  runMarker,
  manifest,
  runMode = "main",
}) {
  assertMutationGateOpen(targetContext);

  const { createClient } = await import("@supabase/supabase-js");
  const environment = targetContext.environment;
  const authenticatedSubject = decodeJwtSubject(environment.authenticatedJwt);

  if (!authenticatedSubject) {
    throw new Error(
      "BADGE_E2E_STAGING_AUTHENTICATED_JWT must contain a non-empty sub claim."
    );
  }

  const serviceRole = createClient(
    environment.supabaseUrl,
    environment.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  const anon = createClient(environment.supabaseUrl, environment.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const authenticated = createClient(
    environment.supabaseUrl,
    environment.anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${environment.authenticatedJwt}`,
        },
      },
    }
  );

  registerManifestSecretDenyList(manifest, [
    environment.serviceRoleKey,
    environment.anonKey,
    environment.authenticatedJwt,
    environment.supabaseAccessToken,
  ]);

  const { data: runData, error: runError } = await serviceRole.rpc(
    "begin_staging_badge_e2e_run",
    {
      p_fixture_secret: environment.syntheticFixtureSecret,
      p_run_marker: runMarker,
      p_mode: runMode,
    }
  );
  if (runError) {
    throw new Error(`Badge E2E run initialization failed: ${runError.message}`);
  }
  const run = first(runData);
  if (!run?.run_id) throw new Error("Badge E2E run initialization returned no run ID.");

  return {
    adminActor: `${ADMIN_ACTOR}:${runMarker}`,
    anon,
    authenticated,
    authenticatedSubject,
    clients: {
      anon,
      authenticated,
      serviceRole,
    },
    expectedAwardsByPlayer: new Map(),
    harnessEnvironment: environment,
    syntheticFixtureSecret: environment.syntheticFixtureSecret,
    fixtureAllocationSequence: 0,
    badgeRunId: run.run_id,
    manifest,
    mutationGate: targetContext.mutationGate,
    project: STAGING_PROJECT,
    runMarker,
    serviceRole,
    supabase: serviceRole,
  };
}

export async function createFixturePlayer(ctx, options = {}) {
  assertMutationGateOpen(ctx);

  const label = slugPart(options.label ?? "player");
  const elo = Number.isInteger(options.elo)
    ? options.elo
    : eloForBracket(options.bracketName ?? "Challenge");
  if (!ctx.syntheticFixtureSecret) {
    throw new Error("BADGE_E2E_STAGING_SYNTHETIC_FIXTURE_SECRET is required.");
  }
  ctx.fixtureAllocationSequence += 1;
  const semanticRole = `${label}-${ctx.fixtureAllocationSequence}`;
  const division = options.bracketName ?? divisionForElo(elo).replace(" / Pro", "");
  const { data, error } = await ctx.supabase.rpc(
    "provision_staging_badge_e2e_player",
    {
      p_fixture_secret: ctx.syntheticFixtureSecret,
      p_run_marker: ctx.runMarker,
      p_semantic_role: semanticRole,
      p_division: division,
    }
  );

  if (error) {
    throw new Error(`Fixture player creation failed: ${error.message}`);
  }

  const provisioned = first(data);
  if (!provisioned?.player_id) throw new Error("Fixture player provisioning returned no player.");
  const profile = { id: provisioned.player_id, clerk_user_id: `user_${semanticRole}` };

  recordCreated(ctx.manifest, "playerIds", data.id);
  classifyCleanup(
    ctx.manifest,
    data.id,
    "SAFE_TO_DELETE",
    "Unlaunched player prerequisite unless linked to launched tournament history."
  );

  return {
    id: profile.id,
    clerkUserId: profile.clerk_user_id,
    displayName: `Badge ${label}`,
    steamId64: null,
    coh3ProfileId: null,
    elo: provisioned.synthetic_elo,
    syntheticAlias: `BadgeE2E-${ctx.runMarker}-${division}${provisioned.allocation_index}`,
    semanticRole,
  };
}

export async function createFixturePlayers(ctx, count, options = {}) {
  const players = [];

  for (let index = 0; index < count; index += 1) {
    players.push(
      await createFixturePlayer(ctx, {
        ...options,
        label: `${options.label ?? "player"}-${index + 1}`,
      })
    );
  }

  return players;
}

export async function createRegistration(ctx, input) {
  assertMutationGateOpen(ctx);

  const { player, tournament, bracket } = input;
  if (!ctx.syntheticFixtureSecret || !player.syntheticAlias) {
    throw new Error("Synthetic fixture enrollment context is unavailable.");
  }
  const { data: enrollment, error: enrollmentError } = await ctx.supabase.rpc(
    "enrol_staging_synthetic_uat_player",
    {
      p_fixture_secret: ctx.syntheticFixtureSecret,
      p_alias: player.syntheticAlias,
      p_tournament_id: tournament.id,
      p_tournament_bracket_id: bracket.id,
      p_waitlist_confirmed: false,
    }
  );
  if (enrollmentError) {
    throw new Error(`Fixture registration submission failed: ${enrollmentError.message}`);
  }
  const enrolled = first(enrollment);
  if (!enrolled?.registration_id) {
    throw new Error("Fixture registration submission did not return an ID.");
  }
  const { error: reviewError } = await ctx.supabase.rpc(
    "review_tournament_registration",
    {
      p_registration_id: enrolled.registration_id,
      p_registration_status: input.status ?? "approved",
      p_admin_notes: `${ctx.runMarker} fixture registration`,
    }
  );
  if (reviewError) {
    throw new Error(`Fixture registration review failed: ${reviewError.message}`);
  }
  const { data, error } = await ctx.supabase
    .from("registrations")
    .select("id, profile_id, clerk_user_id, player_name")
    .eq("id", enrolled.registration_id)
    .single();
  if (error) throw new Error(`Fixture registration load failed: ${error.message}`);
  recordCreated(ctx.manifest, "registrationIds", data.id);
  classifyCleanup(ctx.manifest, data.id, "FAILED_BEFORE_LAUNCH", "Registration can be deleted only if its tournament never launched.");
  return {
    id: data.id,
    playerId: data.profile_id,
    clerkUserId: data.clerk_user_id,
    playerName: data.player_name,
    registrationAcceptanceId: null,
  };

  /* legacy path removed */
  /*
  const legalDocuments = await loadEffectiveLegalDocumentSet(ctx);
  const { data: submitted, error: submitError } = await ctx.supabase.rpc(
    "submit_verified_player_registration",
    {
      p_profile_id: player.id,
      p_clerk_user_id: player.clerkUserId,
      p_steam_id64: player.steamId64,
      p_tournament_id: tournament.id,
      p_tournament_bracket_id: bracket.id,
      p_relic_elo: player.elo,
      p_relic_faction: "US Forces",
      p_relic_division: divisionForElo(player.elo),
      p_relic_calculation_version: `badge-e2e-${ctx.runMarker}`,
      p_rulebook_document_id: legalDocuments.rulebook.id,
      p_ppa_document_id: legalDocuments.ppa.id,
      p_terms_document_id: legalDocuments.terms.id,
      p_privacy_document_id: legalDocuments.privacy.id,
      p_rulebook_accepted: true,
      p_ppa_accepted: true,
      p_terms_accepted: true,
      p_privacy_acknowledged: true,
      p_age_18_confirmed: true,
      p_account_and_steam_ownership_confirmed: true,
      p_waitlist_confirmed: false,
    }
  );

  if (submitError) {
    throw new Error(`Fixture registration submission failed: ${submitError.message}`);
  }

  const submittedRegistration = first(submitted);
  if (!submittedRegistration?.id) {
    throw new Error("Fixture registration submission did not return an ID.");
  }

  if (submittedRegistration.waitlist_confirmation_required) {
    throw new Error("Fixture registration unexpectedly required waitlist confirmation.");
  }

  const desiredStatus = input.status ?? "approved";
  const { error: reviewError } = await ctx.supabase.rpc(
    "review_tournament_registration",
    {
      p_registration_id: submittedRegistration.id,
      p_registration_status: desiredStatus,
      p_admin_notes: `${ctx.runMarker} fixture registration`,
    }
  );

  if (reviewError) {
    throw new Error(`Fixture registration review failed: ${reviewError.message}`);
  }

  const { data, error } = await ctx.supabase
    .from("registrations")
    .select("id, profile_id, clerk_user_id, player_name")
    .eq("id", submittedRegistration.id)
    .single();

  if (error) {
    throw new Error(`Fixture registration load failed: ${error.message}`);
  }

  recordCreated(ctx.manifest, "registrationIds", data.id);
  const registrationAcceptanceId = await recordRegistrationAcceptance(
    ctx,
    data.id
  );
  classifyCleanup(
    ctx.manifest,
    data.id,
    "FAILED_BEFORE_LAUNCH",
    "Registration can be deleted only if its tournament never launched."
  );

  return {
    id: data.id,
    playerId: data.profile_id,
    clerkUserId: data.clerk_user_id,
    playerName: data.player_name,
    registrationAcceptanceId,
  };
  */
}

export async function loadEffectiveLegalDocumentSet(ctx) {
  if (ctx.effectiveLegalDocuments) {
    return ctx.effectiveLegalDocuments;
  }

  const { data, error } = await ctx.supabase
    .from("legal_documents")
    .select("id, document_kind")
    .eq("status", "effective")
    .not("sha256", "is", null)
    .lte("effective_at", new Date().toISOString())
    .order("effective_at", { ascending: false });

  if (error) {
    throw new Error(`Legal document fixture preflight failed: ${error.message}`);
  }

  const documents = {};
  for (const document of data ?? []) {
    if (!documents[document.document_kind]) {
      documents[document.document_kind] = document;
    }
  }

  for (const kind of ["rulebook", "ppa", "terms", "privacy"]) {
    if (!documents[kind]?.id) {
      throw new Error(`No effective ${kind} legal document is available.`);
    }
  }

  ctx.effectiveLegalDocuments = documents;
  return documents;
}

export async function updatePlayerElo(ctx, player, elo) {
  assertMutationGateOpen(ctx);

  const { error } = await ctx.supabase
    .from("players")
    .update({
      current_elo: elo,
      relic_verified_elo: elo,
      relic_verified_division: divisionForElo(elo),
      relic_elo_calculation_version: `badge-e2e-${ctx.runMarker}`,
      relic_elo_verified_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  if (error) {
    throw new Error(`Fixture player ELO update failed: ${error.message}`);
  }

  player.elo = elo;
  return player;
}

export async function uploadReplayFixtures(ctx, paths) {
  assertMutationGateOpen(ctx);

  const hash = createHash("sha256").update(REPLAY_BYTES).digest("hex");
  const hashes = [];

  for (const [index, path] of paths.entries()) {
    const gameBytes = Buffer.concat([
      REPLAY_BYTES,
      Buffer.from(`${ctx.runMarker}:${index + 1}:${path}\n`, "utf8"),
    ]);
    const gameHash = createHash("sha256").update(gameBytes).digest("hex");
    const { error } = await ctx.supabase.storage
      .from("match-proofs")
      .upload(path, gameBytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    if (error) {
      throw new Error(`Replay fixture upload failed: ${error.message}`);
    }

    recordCreated(ctx.manifest, "storagePaths", path);
    protectLaunchedHistory(ctx.manifest, { storagePaths: [path] });
    hashes.push(gameHash);
  }

  if (hashes.length === 0 && hash.length === 64) {
    return [];
  }

  return hashes;
}

export function replayFixturePath(ctx, matchId, gameNumber, suffix = "result") {
  return `${ctx.runMarker}/${matchId}/game-${gameNumber}-${suffix}-${randomUUID()}.rec`;
}

export function expectAward(ctx, playerId, badgeSlug, scenario) {
  const existing = ctx.expectedAwardsByPlayer.get(playerId) ?? new Set();
  existing.add(badgeSlug);
  ctx.expectedAwardsByPlayer.set(playerId, existing);
  recordExpectedAward(ctx.manifest, {
    playerId,
    badgeSlug,
    scenario,
  });
}

export function expectedAwardsForPlayer(ctx, playerId) {
  return ctx.expectedAwardsByPlayer.get(playerId) ?? new Set();
}

export function bracketNameToType(bracketName) {
  if (bracketName === "Academy") return "academy";
  if (bracketName === "Challenge") return "challenge";
  return "main";
}

export function eloForBracket(bracketName) {
  if (bracketName === "Academy") return 900;
  if (bracketName === "Challenge") return 1200;
  return 1500;
}

export function divisionForElo(elo) {
  if (elo < 1100) return "Academy";
  if (elo < 1400) return "Challenge";
  return "Main / Pro";
}

export function slugPart(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "fixture";
}

export function shortId(value) {
  return String(value).replace(/-/g, "").slice(0, 10);
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
