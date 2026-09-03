import { fileURLToPath } from "node:url";
import {
  loadFixtureEnvironment,
  validateRuntimeGuards,
} from "./lib/staging-synthetic-uat.mjs";

const ACADEMY_ALIASES = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `TestAcademy${index + 1}`)
);
const REGISTRATION_IDENTITIES = Object.freeze(
  Object.fromEntries(
    ACADEMY_ALIASES.map((alias, index) => [
      alias,
      Object.freeze({
        steamId64: `1844674407370955100${index + 1}`,
        steamUsername: "Staging Academy UAT",
      }),
    ])
  )
);
const INTEGRITY_TABLES = Object.freeze([
  "player_badge_awards",
  "player_badge_reveals",
  "leaderboard_point_events",
  "leaderboard_player_season_stats",
  "leaderboard_player_all_time_stats",
  "leaderboard_season_champions",
]);

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function parseCommand(argv) {
  const [operation, ...options] = argv;

  if (!["inspect", "prepare"].includes(operation)) {
    throw new Error("arguments_rejected");
  }

  let environmentDirectory = rootDir;
  let apply = false;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];

    if (option === "--apply" && !apply) {
      apply = true;
      continue;
    }

    if (
      option === "--env-dir" &&
      typeof options[index + 1] === "string" &&
      options[index + 1].length > 0 &&
      environmentDirectory === rootDir
    ) {
      environmentDirectory = options[index + 1];
      index += 1;
      continue;
    }

    throw new Error("arguments_rejected");
  }

  if ((operation === "prepare") !== apply) {
    throw new Error("arguments_rejected");
  }

  return { operation, environmentDirectory };
}

function fail(code) {
  process.stderr.write(`${JSON.stringify({ status: code, succeeded: false })}\n`);
  process.exitCode = 1;
}

async function requestJson(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error("staging_request_failed");
  }

  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

function requireSingleRow(value, code) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(code);
  }

  return value[0];
}

async function inspectAlias(config) {
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const fixture = requireSingleRow(
    await requestJson(
      `${config.supabaseUrl}/rest/v1/rpc/inspect_staging_synthetic_uat_player`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_fixture_secret: config.fixtureSecret,
          p_alias: config.fixture.alias,
        }),
      }
    ),
    "fixture_response_invalid"
  );

  if (typeof fixture?.player_id !== "string") {
    throw new Error("fixture_response_invalid");
  }

  const playerUrl = new URL(`${config.supabaseUrl}/rest/v1/players`);
  playerUrl.searchParams.set(
    "select",
    [
      "id",
      "clerk_user_id",
      "display_name",
      "in_game_name",
      "steam_id64",
      "steam_username",
      "profile_completed",
      "current_elo",
      "relic_verified_elo",
      "relic_verified_faction",
      "relic_verified_division",
      "relic_elo_calculation_version",
    ].join(",")
  );
  playerUrl.searchParams.set("id", `eq.${fixture.player_id}`);

  const player = requireSingleRow(
    await requestJson(playerUrl, { method: "GET", headers }),
    "player_response_invalid"
  );

  if (
    player.id !== fixture.player_id ||
    player.in_game_name !== config.fixture.alias ||
    typeof player.clerk_user_id !== "string" ||
    !player.clerk_user_id.startsWith("user_")
  ) {
    throw new Error("player_response_invalid");
  }

  const registrationsUrl = new URL(
    `${config.supabaseUrl}/rest/v1/registrations`
  );
  registrationsUrl.searchParams.set(
    "select",
    [
      "id",
      "tournament_id",
      "tournament_bracket_id",
      "registration_status",
      "registration_provenance",
      "created_at",
    ].join(",")
  );
  registrationsUrl.searchParams.set("profile_id", `eq.${fixture.player_id}`);
  registrationsUrl.searchParams.set("order", "created_at.asc,id.asc");

  const registrations = await requestJson(registrationsUrl, {
    method: "GET",
    headers,
  });

  if (!Array.isArray(registrations)) {
    throw new Error("registration_response_invalid");
  }

  const integrity = await loadIntegrityCounts(
    config,
    fixture.player_id,
    headers
  );

  return {
    alias: config.fixture.alias,
    playerId: player.id,
    clerkUserId: player.clerk_user_id,
    profileCompleted: player.profile_completed === true,
    steamId64: player.steam_id64,
    steamUsername: player.steam_username,
    currentElo: player.current_elo,
    relicVerifiedElo: player.relic_verified_elo,
    relicVerifiedFaction: player.relic_verified_faction,
    relicVerifiedDivision: player.relic_verified_division,
    relicCalculationVersion: player.relic_elo_calculation_version,
    integrity,
    registrations,
  };
}

async function loadIntegrityCounts(config, playerId, headers) {
  const entries = await Promise.all(
    INTEGRITY_TABLES.map(async (table) => {
      const url = new URL(`${config.supabaseUrl}/rest/v1/${table}`);
      url.searchParams.set("select", "player_id");
      url.searchParams.set("player_id", `eq.${playerId}`);
      const rows = await requestJson(url, { method: "GET", headers });

      if (!Array.isArray(rows)) {
        throw new Error("integrity_response_invalid");
      }

      return [table, rows.length];
    })
  );

  return Object.fromEntries(entries);
}

async function prepareAlias(config, before) {
  const definition = REGISTRATION_IDENTITIES[config.fixture.alias];

  if (!definition || before.clerkUserId.length === 0) {
    throw new Error("identity_definition_invalid");
  }

  let changed = false;

  if (before.steamId64 === null && before.steamUsername === null) {
    const headers = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    const playerUrl = new URL(`${config.supabaseUrl}/rest/v1/players`);
    playerUrl.searchParams.set("select", "id,steam_id64,steam_username");
    playerUrl.searchParams.set("id", `eq.${before.playerId}`);
    playerUrl.searchParams.set("clerk_user_id", `eq.${before.clerkUserId}`);
    const updated = requireSingleRow(
      await requestJson(playerUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          steam_id64: definition.steamId64,
          steam_username: definition.steamUsername,
        }),
      }),
      "identity_update_invalid"
    );

    if (
      updated.id !== before.playerId ||
      updated.steam_id64 !== definition.steamId64 ||
      updated.steam_username !== definition.steamUsername
    ) {
      throw new Error("identity_update_invalid");
    }

    changed = true;
  } else if (
    before.steamId64 !== definition.steamId64 ||
    before.steamUsername !== definition.steamUsername
  ) {
    throw new Error("existing_identity_rejected");
  }

  const after = await inspectAlias(config);

  if (
    after.steamId64 !== definition.steamId64 ||
    after.steamUsername !== definition.steamUsername ||
    after.profileCompleted !== true ||
    after.currentElo !== before.currentElo ||
    after.relicVerifiedElo !== before.relicVerifiedElo ||
    after.relicVerifiedFaction !== before.relicVerifiedFaction ||
    after.relicVerifiedDivision !== before.relicVerifiedDivision ||
    after.relicCalculationVersion !== before.relicCalculationVersion ||
    JSON.stringify(after.integrity) !== JSON.stringify(before.integrity) ||
    JSON.stringify(after.registrations) !== JSON.stringify(before.registrations)
  ) {
    throw new Error("identity_verification_failed");
  }

  return { ...after, preparationApplied: changed };
}

async function assertPreparationPreflight(config, players) {
  if (
    new Set(players.map((player) => player.playerId)).size !== players.length ||
    new Set(players.map((player) => player.clerkUserId)).size !== players.length
  ) {
    throw new Error("identity_preflight_failed");
  }

  const expectedOwners = new Map(
    players.map((player) => [
      REGISTRATION_IDENTITIES[player.alias].steamId64,
      player.playerId,
    ])
  );
  const steamIds = [...expectedOwners.keys()];
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
  const playersUrl = new URL(`${config.supabaseUrl}/rest/v1/players`);
  playersUrl.searchParams.set("select", "id,steam_id64");
  playersUrl.searchParams.set("steam_id64", `in.(${steamIds.join(",")})`);
  const existingOwners = await requestJson(playersUrl, {
    method: "GET",
    headers,
  });

  if (
    !Array.isArray(existingOwners) ||
    existingOwners.some(
      (owner) =>
        typeof owner?.steam_id64 !== "string" ||
        owner.id !== expectedOwners.get(owner.steam_id64)
    )
  ) {
    throw new Error("identity_preflight_failed");
  }

  for (const player of players) {
    const definition = REGISTRATION_IDENTITIES[player.alias];
    const isUnprepared =
      player.steamId64 === null && player.steamUsername === null;
    const isPrepared =
      player.steamId64 === definition.steamId64 &&
      player.steamUsername === definition.steamUsername;

    if (!isUnprepared && !isPrepared) {
      throw new Error("identity_preflight_failed");
    }
  }
}

async function loadTournamentContext(config, players) {
  const tournamentIds = [
    ...new Set(
      players.flatMap((player) =>
        player.registrations.map((registration) => registration.tournament_id)
      )
    ),
  ];

  if (tournamentIds.length === 0) {
    return [];
  }

  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
  const tournamentsUrl = new URL(`${config.supabaseUrl}/rest/v1/tournaments`);
  tournamentsUrl.searchParams.set(
    "select",
    "id,title,status,registration_enabled,registration_open_at,registration_close_at"
  );
  tournamentsUrl.searchParams.set("id", `in.(${tournamentIds.join(",")})`);
  tournamentsUrl.searchParams.set("order", "created_at.asc,id.asc");
  const tournaments = await requestJson(tournamentsUrl, {
    method: "GET",
    headers,
  });

  if (!Array.isArray(tournaments)) {
    throw new Error("tournament_response_invalid");
  }

  return tournaments;
}

async function main() {
  const { operation, environmentDirectory } = parseCommand(
    process.argv.slice(2)
  );
  const env = await loadFixtureEnvironment({ rootDir: environmentDirectory });
  const configs = ACADEMY_ALIASES.map((alias) =>
    validateRuntimeGuards(env, alias)
  );
  const first = configs[0];

  if (
    configs.some(
      (config) =>
        config.supabaseUrl !== first.supabaseUrl ||
        config.serviceRoleKey !== first.serviceRoleKey ||
        config.fixtureSecret !== first.fixtureSecret
    )
  ) {
    throw new Error("runtime_environment_rejected");
  }

  const beforePlayers = [];

  for (const config of configs) {
    beforePlayers.push(await inspectAlias(config));
  }

  let players = beforePlayers;

  if (operation === "prepare") {
    await assertPreparationPreflight(first, beforePlayers);
    players = [];

    for (let index = 0; index < configs.length; index += 1) {
      players.push(await prepareAlias(configs[index], beforePlayers[index]));
    }
  }

  const tournaments = await loadTournamentContext(first, players);

  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      succeeded: true,
      operation,
      stagingProjectConfirmed: true,
      players,
      tournaments,
    })}\n`
  );
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : "operation_failed");
}
