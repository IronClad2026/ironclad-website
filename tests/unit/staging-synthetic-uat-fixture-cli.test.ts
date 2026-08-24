import { describe, expect, it } from "vitest";

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
  validateClerkFixtureUser,
  validateRuntimeGuards,
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
      "pk_test_fixture_contract_publishable_key",
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
  it("contains only the thirty reserved aliases with exact ELO and divisions", () => {
    expect(Object.values(APPROVED_FIXTURES)).toEqual(
      expectedCatalogue.map((fixture) => ({
        ...fixture,
        source: FIXTURE_SOURCE,
        contractVersion: FIXTURE_CONTRACT_VERSION,
      }))
    );
    expect(Object.isFrozen(APPROVED_FIXTURES)).toBe(true);
    expect(new Set(Object.keys(APPROVED_FIXTURES)).size).toBe(30);
  });

  it("rejects aliases outside the exact reserved, case-sensitive set", () => {
    for (const alias of [
      "TestAdmin",
      "TestAcademy0",
      "TestAcademy11",
      "testAcademy1",
      "TestMain01",
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
});
