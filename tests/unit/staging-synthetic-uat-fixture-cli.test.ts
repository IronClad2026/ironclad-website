import { describe, expect, it, vi } from "vitest";

import {
  APPROVED_FIXTURES,
  FIXTURE_CONTRACT_VERSION,
  FIXTURE_SOURCE,
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  buildClerkFixtureIdentity,
  buildRedactedFailure,
  buildRedactedLoginResult,
  buildRedactedResult,
  getFixtureDefinition,
  isOfficialClerkTestEmail,
  parseArgs,
  validateClerkFixtureUser,
  validateRuntimeGuards,
  FUTURE_FIXTURE_POOLS,
  PREPARED_REGISTRATION_IDENTITIES,
  getFixtureDivision,
  STAGING_CLERK_FRONTEND_DOMAIN,
  STAGING_CLERK_INSTANCE_ID,
  assertClerkDevelopmentInstance,
  executeFixtureCommand,
  verifyFixtureLogins,
} from "../../scripts/lib/staging-synthetic-uat.mjs";

const FIXED_NOW = 1_800_000_000_000;
const VALID_FIXTURE_SECRET =
  "9f4c2a7e6d1b8c350ad7e1496bc2385f417cd928e05ba6317f8342dec19a506b";
const VALID_EMAIL =
  "ironclad-testacademy1+clerk_test@example.test";
const VALID_PASSWORD = "Fixture-Only-Password-7491";

const expectedCatalogue = [
  ...[700, 750, 800, 850, 900, 950, 1000, 1050, 1075, 1099].map(
    (syntheticElo, index) => ({
      alias: `TestAcademy${index + 1}`,
      syntheticElo,
      syntheticDivision: "Academy",
    })
  ),
  ...[1100, 1150, 1200, 1225, 1250, 1275, 1300, 1350, 1375, 1399].map(
    (syntheticElo, index) => ({
      alias: `TestChallenge${index + 1}`,
      syntheticElo,
      syntheticDivision: "Challenge",
    })
  ),
  ...[1400, 1450, 1500, 1550, 1600, 1700, 1800, 1900, 2000, 2200].map(
    (syntheticElo, index) => ({
      alias: `TestMain${index + 1}`,
      syntheticElo,
      syntheticDivision: "Main / Pro",
    })
  ),
  ...[1625, 1650, 1675, 1699].map((syntheticElo, index) => ({
    alias: `TestMain${index + 11}`, syntheticElo, syntheticDivision: "Main",
  })),
  ...[1701, 1750, 1850, 2100].map((syntheticElo, index) => ({
    alias: `TestPro${index + 1}`, syntheticElo, syntheticDivision: "Pro",
  })),
];

function encodeJwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeJwt(payload: Record<string, unknown>) {
  return [
    encodeJwtPart({ alg: "HS256", typ: "JWT" }),
    encodeJwtPart(payload),
    "a".repeat(43),
  ].join(".");
}

function makeServiceRoleJwt(
  overrides: Partial<{
    exp: number;
    iss: string;
    ref: string;
    role: string;
  }> = {}
) {
  return makeJwt({
    exp: Math.floor(FIXED_NOW / 1000) + 3600,
    iss: "supabase",
    ref: STAGING_SUPABASE_REF,
    role: "service_role",
    ...overrides,
  });
}

function makeValidEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: makeServiceRoleJwt(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      `pk_test_${Buffer.from(`${STAGING_CLERK_FRONTEND_DOMAIN}$`).toString("base64")}`,
    CLERK_SECRET_KEY: "sk_test_fixture_contract_secret_key",
    STAGING_SYNTHETIC_UAT_FIXTURE_SECRET: VALID_FIXTURE_SECRET,
    STAGING_SYNTHETIC_UAT_TESTACADEMY1_EMAIL: VALID_EMAIL,
    STAGING_SYNTHETIC_UAT_TESTACADEMY1_PASSWORD: VALID_PASSWORD,
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    ...overrides,
  };
}

function makeValidClerkUser() {
  const identity = buildClerkFixtureIdentity("TestAcademy1");

  return {
    id: "user_TestAcademy1Canary",
    external_id: identity.externalId,
    first_name: identity.firstName,
    last_name: null,
    username: null,
    password_enabled: true,
    banned: false,
    locked: false,
    primary_email_address_id: "idn_fixture_canary",
    email_addresses: [
      {
        id: "idn_fixture_canary",
        email_address: VALID_EMAIL,
        verification: { status: "verified" },
      },
    ],
    phone_numbers: [],
    web3_wallets: [],
    external_accounts: [],
    public_metadata: identity.publicMetadata,
    private_metadata: identity.privateMetadata,
    unsafe_metadata: {},
  };
}

describe("Staging synthetic UAT fixture catalogue", () => {
  it("preserves thirty original identities and adds exactly eight reserved identities", () => {
    expect(Object.values(APPROVED_FIXTURES)).toEqual(
      expectedCatalogue.map((fixture) => ({
        ...fixture,
        source: FIXTURE_SOURCE,
        contractVersion: FIXTURE_CONTRACT_VERSION,
      }))
    );
    expect(Object.isFrozen(APPROVED_FIXTURES)).toBe(true);
    expect(new Set(Object.keys(APPROVED_FIXTURES)).size).toBe(38);
  });

  it("provides nine future Main and nine future Pro players without changing provenance", () => {
    expect(FUTURE_FIXTURE_POOLS.main).toEqual(["TestMain1", "TestMain2", "TestMain3", "TestMain4", "TestMain5", "TestMain11", "TestMain12", "TestMain13", "TestMain14"]);
    expect(FUTURE_FIXTURE_POOLS.pro).toEqual(["TestMain6", "TestMain7", "TestMain8", "TestMain9", "TestMain10", "TestPro1", "TestPro2", "TestPro3", "TestPro4"]);
    expect(getFixtureDefinition("TestMain6").syntheticDivision).toBe("Main / Pro");
    expect(getFixtureDivision("TestMain6")).toBe("Pro");
    expect(getFixtureDivision("TestMain6", "legacy_three_v1")).toBe("Main / Pro");
    expect(() => getFixtureDivision("TestMain6", "unknown")).toThrow("arguments_rejected");
  });

  it("keeps all prepared identities unique, valid uint64, and exactly allowlisted", () => {
    const identities = Object.values(PREPARED_REGISTRATION_IDENTITIES);
    expect(identities).toHaveLength(26);
    expect(new Set(identities.map((entry) => entry.steamId64)).size).toBe(26);
    expect(identities.every((entry) => BigInt(entry.steamId64) <= BigInt("18446744073709551615"))).toBe(true);
    expect(PREPARED_REGISTRATION_IDENTITIES.TestAcademy1.elo).toBe(1000);
    expect(getFixtureDefinition("TestAcademy1").syntheticElo).toBe(700);
    for (const alias of [...FUTURE_FIXTURE_POOLS.main, ...FUTURE_FIXTURE_POOLS.pro]) {
      expect(PREPARED_REGISTRATION_IDENTITIES[alias].elo).toBe(getFixtureDefinition(alias).syntheticElo);
    }
  });

  it("parses only the fixed TestAcademy1 Badge progression command", () => {
    expect(
      parseArgs([
        "enrol-badge-progression",
        "--tournament-id",
        "11111111-1111-4111-8111-111111111111",
        "--bracket-id",
        "22222222-2222-4222-8222-222222222222",
      ])
    ).toEqual({
      command: "enrol-badge-progression",
      alias: "TestAcademy1",
      tournamentId: "11111111-1111-4111-8111-111111111111",
      bracketId: "22222222-2222-4222-8222-222222222222",
      confirmWaitlist: false,
    });

    expect(() =>
      parseArgs([
        "enrol-badge-progression",
        "--alias",
        "TestAcademy2",
        "--tournament-id",
        "11111111-1111-4111-8111-111111111111",
        "--bracket-id",
        "22222222-2222-4222-8222-222222222222",
      ])
    ).toThrowError("arguments_rejected");
  });

  it("rejects aliases outside the exact reserved, case-sensitive set", () => {
    for (const alias of [
      "TestAdmin",
      "TestAcademy0",
      "TestAcademy11",
      "testAcademy1",
      "TestMain01",
      "TestMain15",
      "TestPro5",
      "TestAcademy1 ",
      "arbitrary-user",
    ]) {
      expect(() => getFixtureDefinition(alias)).toThrowError("alias_rejected");
    }
  });
});

describe("Staging synthetic UAT runtime guards", () => {
  it("accepts only the exact Staging project, service role, test Clerk keys, and test email", () => {
    const result = validateRuntimeGuards(
      makeValidEnvironment(),
      "TestAcademy1",
      FIXED_NOW
    );

    expect(result.fixture).toEqual({
      alias: "TestAcademy1",
      syntheticElo: 700,
      syntheticDivision: "Academy",
      source: FIXTURE_SOURCE,
      contractVersion: FIXTURE_CONTRACT_VERSION,
    });
    expect(result.supabaseUrl).toBe(
      `https://${STAGING_SUPABASE_REF}.supabase.co`
    );
    expect(isOfficialClerkTestEmail(result.email)).toBe(true);
  });

  it("rejects the Production project URL and Production project JWT ref independently", () => {
    expect(() =>
      validateRuntimeGuards(
        makeValidEnvironment({
          NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
        }),
        "TestAcademy1",
        FIXED_NOW
      )
    ).toThrowError("supabase_project_rejected");

    expect(() =>
      validateRuntimeGuards(
        makeValidEnvironment({
          SUPABASE_SERVICE_ROLE_KEY: makeServiceRoleJwt({
            ref: PRODUCTION_SUPABASE_REF,
          }),
        }),
        "TestAcademy1",
        FIXED_NOW
      )
    ).toThrowError("service_role_rejected");
  });

  it.each(["anon", "authenticated"])(
    "rejects the %s Supabase JWT role",
    (role) => {
      expect(() =>
        validateRuntimeGuards(
          makeValidEnvironment({
            SUPABASE_SERVICE_ROLE_KEY: makeServiceRoleJwt({ role }),
          }),
          "TestAcademy1",
          FIXED_NOW
        )
      ).toThrowError("service_role_rejected");
    }
  );

  it("rejects a missing fixture secret and Production runtime labels", () => {
    expect(() =>
      validateRuntimeGuards(
        makeValidEnvironment({
          STAGING_SYNTHETIC_UAT_FIXTURE_SECRET: undefined,
        }),
        "TestAcademy1",
        FIXED_NOW
      )
    ).toThrowError("fixture_secret_rejected");

    expect(() =>
      validateRuntimeGuards(
        makeValidEnvironment({ NODE_ENV: "production" }),
        "TestAcademy1",
        FIXED_NOW
      )
    ).toThrowError("runtime_environment_rejected");

    expect(() =>
      validateRuntimeGuards(
        makeValidEnvironment({ VERCEL_ENV: "production" }),
        "TestAcademy1",
        FIXED_NOW
      )
    ).toThrowError("runtime_environment_rejected");
  });

  it("rejects live or malformed Clerk keys and non-test email identities", () => {
    for (const overrides of [
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_not_permitted_fixture_key" },
      { CLERK_SECRET_KEY: "sk_live_not_permitted_fixture_key" },
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_short" },
      { CLERK_SECRET_KEY: "sk_test_short" },
    ]) {
      expect(() =>
        validateRuntimeGuards(
          makeValidEnvironment(overrides),
          "TestAcademy1",
          FIXED_NOW
        )
      ).toThrowError("clerk_environment_rejected");
    }

    expect(() =>
      validateRuntimeGuards(
        makeValidEnvironment({
          STAGING_SYNTHETIC_UAT_TESTACADEMY1_EMAIL:
            "testacademy1@example.test",
        }),
        "TestAcademy1",
        FIXED_NOW
      )
    ).toThrowError("clerk_test_identity_rejected");
  });

  it("rejects expired, malformed, wrong-issuer, and wrong-ref service credentials", () => {
    const invalidCredentials = [
      "not-a-jwt",
      makeServiceRoleJwt({ exp: Math.floor(FIXED_NOW / 1000) - 1 }),
      makeServiceRoleJwt({ iss: "not-supabase" }),
      makeServiceRoleJwt({ ref: "some-other-project" }),
    ];

    for (const credential of invalidCredentials) {
      expect(() =>
        validateRuntimeGuards(
          makeValidEnvironment({ SUPABASE_SERVICE_ROLE_KEY: credential }),
          "TestAcademy1",
          FIXED_NOW
        )
      ).toThrowError("service_role_rejected");
    }
  });
});

describe("Staging synthetic UAT Clerk identity and redaction", () => {
  it("binds both Clerk keys to the exact approved Development instance", async () => {
    const config = validateRuntimeGuards(makeValidEnvironment(), "TestAcademy1", FIXED_NOW);
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith("/instance")
        ? { id: STAGING_CLERK_INSTANCE_ID, environment_type: "development" }
        : { data: [{ is_satellite: false, frontend_api_url: STAGING_CLERK_FRONTEND_DOMAIN }] },
    }));
    await expect(assertClerkDevelopmentInstance(config, fetchImpl as never)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(() => validateRuntimeGuards(makeValidEnvironment({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("other.clerk.accounts.dev$").toString("base64")}`,
    }), "TestAcademy1", FIXED_NOW)).toThrow("clerk_environment_rejected");
  });

  it("rejects the wrong Clerk instance before provisioning any user or database row", async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith("/instance")
        ? { id: "ins_wrongDevelopment", environment_type: "development" }
        : { data: [{ is_satellite: false, frontend_api_url: STAGING_CLERK_FRONTEND_DOMAIN }] },
    }));
    await expect(executeFixtureCommand(parseArgs(["provision", "--alias", "TestAcademy1"]), {
      env: makeValidEnvironment(), rootDir: ".", fetchImpl: fetchImpl as never, now: FIXED_NOW,
    })).rejects.toThrow("clerk_environment_rejected");
    expect(fetchImpl.mock.calls.every(([url]) => url.endsWith("/instance") || url.endsWith("/domains"))).toBe(true);
  });

  it("reconciles only the password of the exact existing fixture identity", async () => {
    const existing = makeValidClerkUser();
    const fetchImpl = vi.fn(async (url: string, init: { method: string; body?: string }) => ({
      ok: true,
      json: async () => url.endsWith("/instance")
        ? { id: STAGING_CLERK_INSTANCE_ID, environment_type: "development" }
        : url.endsWith("/domains")
          ? { data: [{ is_satellite: false, frontend_api_url: STAGING_CLERK_FRONTEND_DOMAIN }] }
          : url.includes("?external_id=") ? [existing]
            : init.method === "PATCH" ? existing : { verified: true },
    }));
    const result = await executeFixtureCommand(parseArgs([
      "reconcile-password", "--alias", "TestAcademy1", "--env-dir", "C:/private-staging",
    ]), { env: makeValidEnvironment(), rootDir: ".", fetchImpl: fetchImpl as never, now: FIXED_NOW });
    expect(result).toMatchObject({ operation: "reconcile-password", loginVerified: true });
    const mutations = fetchImpl.mock.calls.filter(([, init]) => init.method === "PATCH");
    expect(mutations).toHaveLength(1);
    expect(mutations[0][0]).toBe(`https://api.clerk.com/v1/users/${existing.id}`);
    expect(JSON.parse(mutations[0][1].body!)).toEqual({ password: VALID_PASSWORD });
    expect(JSON.stringify(result)).not.toContain(VALID_PASSWORD);
    expect(JSON.stringify(result)).not.toContain(existing.id);
  });

  it("batch-verifies login after one instance check without mutating identities", async () => {
    const existing = makeValidClerkUser();
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith("/instance")
        ? { id: STAGING_CLERK_INSTANCE_ID, environment_type: "development" }
        : url.endsWith("/domains")
          ? { data: [{ is_satellite: false, frontend_api_url: STAGING_CLERK_FRONTEND_DOMAIN }] }
          : url.includes("?external_id=") ? [existing] : { verified: true },
    }));
    const result = await verifyFixtureLogins({
      aliases: ["TestAcademy1"], env: makeValidEnvironment(), rootDir: ".",
      fetchImpl: fetchImpl as never, now: FIXED_NOW,
    });
    expect(result).toEqual([expect.objectContaining({ alias: "TestAcademy1", loginVerified: true })]);
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith("/instance"))).toHaveLength(1);
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith("/domains"))).toHaveLength(1);
    expect(fetchImpl.mock.calls.map(([url]) => url).every((url) =>
      url.endsWith("/instance") || url.endsWith("/domains") ||
      url.includes("?external_id=") || url.endsWith("/verify_password")
    )).toBe(true);
    expect(JSON.stringify(result)).not.toContain(VALID_PASSWORD);
    expect(JSON.stringify(result)).not.toContain(existing.id);
    await expect(verifyFixtureLogins({
      aliases: ["TestAcademy1", "TestAcademy1"], env: makeValidEnvironment(), rootDir: ".",
      fetchImpl: fetchImpl as never, now: FIXED_NOW,
    })).rejects.toThrow("arguments_rejected");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("separates a future Pro enrolment from its unchanged legacy account provenance", () => {
    const fixture = getFixtureDefinition("TestMain6");
    const raw = {
      alias: fixture.alias, player_id: "11111111-1111-4111-8111-111111111111",
      registration_id: "22222222-2222-4222-8222-222222222222",
      synthetic_elo: 1700, synthetic_division: "Pro", provenance: FIXTURE_SOURCE,
      contract_version: "staging-synthetic-v2", registration_status: "pending",
      created: true, queue_position: null, waitlist_confirmation_required: false,
    };
    expect(buildRedactedResult("enrol", fixture, raw)).toMatchObject({
      syntheticDivision: "Pro", contractVersion: "staging-synthetic-v2", pending: true,
    });
    expect(fixture.syntheticDivision).toBe("Main / Pro");
    expect(() => buildRedactedResult("enrol", fixture, { ...raw, synthetic_division: "Main" })).toThrow("rpc_response_rejected");
    expect(() => buildRedactedResult("enrol", fixture, { ...raw, contract_version: "staging-synthetic-v1" })).toThrow("rpc_response_rejected");
  });

  it("accepts only the exact non-admin Clerk Development fixture identity", () => {
    const config = validateRuntimeGuards(
      makeValidEnvironment(),
      "TestAcademy1",
      FIXED_NOW
    );
    const validUser = makeValidClerkUser();

    expect(validateClerkFixtureUser(validUser, config)).toBe(validUser);

    expect(() =>
      validateClerkFixtureUser(
        {
          ...validUser,
          email_addresses: [
            {
              ...validUser.email_addresses[0],
              email_address: "testacademy1@example.test",
            },
          ],
        },
        config
      )
    ).toThrowError("clerk_test_identity_rejected");

    expect(() =>
      validateClerkFixtureUser(
        {
          ...validUser,
          public_metadata: { role: "admin" },
        },
        config
      )
    ).toThrowError("clerk_test_identity_rejected");
  });

  it("returns only redacted canary facts and requires real provider fields to remain null", () => {
    const fixture = getFixtureDefinition("TestAcademy1");
    const playerId = "11111111-1111-4111-8111-111111111111";
    const rawResult = {
      alias: fixture.alias,
      player_id: playerId,
      profile_complete: true,
      profile_public: false,
      has_steam_identity: false,
      has_provider_facts: false,
      current_elo: null,
      synthetic_elo: fixture.syntheticElo,
      synthetic_division: fixture.syntheticDivision,
      provenance: FIXTURE_SOURCE,
      contract_version: FIXTURE_CONTRACT_VERSION,
      created: true,
      fixture_secret: VALID_FIXTURE_SECRET,
      clerk_email: VALID_EMAIL,
      clerk_password: VALID_PASSWORD,
      clerk_user_id: "user_secret_identifier",
    };
    const result = buildRedactedResult("provision", fixture, rawResult, {
      clerkUserCreated: true,
      passwordVerified: true,
      avatarUploaded: true,
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      alias: "TestAcademy1",
      operation: "provision",
      status: "ok",
      syntheticElo: 700,
      syntheticDivision: "Academy",
      profileComplete: true,
      profilePrivate: true,
      steamIdentityClaimed: false,
      providerFactsClaimed: false,
      provenanceVerified: true,
    });
    for (const sensitiveValue of [
      playerId,
      VALID_FIXTURE_SECRET,
      VALID_EMAIL,
      VALID_PASSWORD,
      "user_secret_identifier",
    ]) {
      expect(serialized).not.toContain(sensitiveValue);
    }

    expect(() =>
      buildRedactedResult("provision", fixture, {
        ...rawResult,
        current_elo: 700,
      })
    ).toThrowError("rpc_response_rejected");
  });

  it("does not reflect credentials or arbitrary exception messages in success or failure output", () => {
    const fixture = getFixtureDefinition("TestAcademy1");
    const loginOutput = buildRedactedLoginResult(fixture);
    const failureOutput = buildRedactedFailure(
      new Error(
        `${VALID_FIXTURE_SECRET}:${VALID_EMAIL}:${VALID_PASSWORD}:user_hidden`
      ),
      { command: "verify-login", alias: "TestAcademy1" }
    );
    const serialized = JSON.stringify({ loginOutput, failureOutput });

    expect(failureOutput).toEqual({
      alias: "TestAcademy1",
      operation: "verify-login",
      status: "operation_failed",
      syntheticElo: 700,
      syntheticDivision: "Academy",
      contractVersion: FIXTURE_CONTRACT_VERSION,
      succeeded: false,
    });
    for (const sensitiveValue of [
      VALID_FIXTURE_SECRET,
      VALID_EMAIL,
      VALID_PASSWORD,
      "user_hidden",
    ]) {
      expect(serialized).not.toContain(sensitiveValue);
    }
  });

  it("redacts the fixed cross-division acceptance RPC result", () => {
    const result = buildRedactedResult(
      "enrol-badge-progression",
      getFixtureDefinition("TestAcademy1"),
      {
        player_id: "11111111-1111-4111-8111-111111111111",
        registration_id: "22222222-2222-4222-8222-222222222222",
        registration_status: "pending",
        synthetic_elo: 1100,
        synthetic_division: "Challenge",
        scenario_key: "badge-05-28-cross-division",
        created: true,
        fixture_secret: VALID_FIXTURE_SECRET,
      }
    );

    expect(result).toEqual({
      alias: "TestAcademy1",
      operation: "enrol-badge-progression",
      status: "ok",
      syntheticElo: 1100,
      syntheticDivision: "Challenge",
      contractVersion: "staging-badge-cross-division-v1",
      fixtureEnrolmentCreated: true,
      pending: true,
      manualReview: false,
      approved: false,
      provenanceVerified: true,
      providerFactsClaimed: false,
    });
    expect(JSON.stringify(result)).not.toContain(VALID_FIXTURE_SECRET);
  });

  it("rejects a mismatched cross-division ELO and division pair", () => {
    const fixture = getFixtureDefinition("TestAcademy1");

    expect(() =>
      buildRedactedResult("enrol-badge-progression", fixture, {
        player_id: "11111111-1111-4111-8111-111111111111",
        registration_id: "22222222-2222-4222-8222-222222222222",
        registration_status: "pending",
        synthetic_elo: 1100,
        synthetic_division: "Main / Pro",
        scenario_key: "badge-05-28-cross-division",
        created: true,
      })
    ).toThrow("rpc_response_rejected");
  });
});
