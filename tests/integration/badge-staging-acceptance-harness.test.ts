import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BADGE_DEFINITIONS } from "@/lib/badges/catalog";

import {
  ACCEPTANCE_PROVENANCE,
  BADGE_ACCEPTANCE_SCENARIOS,
  FIXED_UAT_ALIASES,
  FIXED_UAT_POOLS,
  MAX_CONCURRENT_UAT_PLAYERS,
  PRODUCTION_PROJECT_REF,
  SCENARIO_GROUPS,
  STAGING_PROJECT_REF,
  assertStagingProjectRef,
  buildCleanupPlan,
  createAcceptanceTemplate,
  inspectBadgeArtwork,
  validateAcceptanceManifest,
} from "../../scripts/badges/staging-acceptance-plan.mjs";
import {
  buildTemplateForTest,
  parseArguments,
} from "../../scripts/badges/staging-acceptance.mjs";

const PLAYER_ID = "10000000-0000-4000-8000-000000000001";
const AWARD_ID = "10000000-0000-4000-8000-000000000002";
const SOURCE_ID = "10000000-0000-4000-8000-000000000003";
const TOURNAMENT_ID = "10000000-0000-4000-8000-000000000004";
const REGISTRATION_ID = "10000000-0000-4000-8000-000000000005";

type BadgeResultFixture = {
  authorityEvidence: { status: string; sourceIds: string[] };
  awardEvidence: {
    status: string;
    playerId: string | null;
    awardId: string | null;
    rowCount: number;
  };
  idempotency: {
    status: string;
    evaluationAttempts: number;
    repeatCreatedCount: number | null;
    duplicateRows: number | null;
  };
  artworkCollection: { status: string };
  finalStatus: string;
};

type AcceptanceResourceFixture = {
  kind: string;
  id: string;
  cleanupDisposition: string;
  provenance: string;
  runMarker: string;
  alias?: string;
  tournamentId?: string;
};

type AcceptanceManifestFixture = {
  runMarker: string;
  resources: AcceptanceResourceFixture[];
};

describe("Badge Staging acceptance target guard", () => {
  it("accepts only the exact Staging ref and hard-rejects Production", () => {
    expect(assertStagingProjectRef(STAGING_PROJECT_REF)).toBe(
      STAGING_PROJECT_REF
    );
    expect(() => assertStagingProjectRef(PRODUCTION_PROJECT_REF)).toThrowError(
      "production_project_rejected"
    );
    expect(() => assertStagingProjectRef("aaaaaaaaaaaaaaaaaaaa")).toThrowError(
      "staging_project_rejected"
    );
    expect(() => assertStagingProjectRef(undefined)).toThrowError(
      "staging_project_rejected"
    );
  });

  it("has no apply, provision, or cleanup execution mode", () => {
    for (const forbidden of ["--apply", "--mutate", "--cleanup", "--provision"]) {
      expect(() =>
        parseArguments([
          "--confirm-project-ref",
          STAGING_PROJECT_REF,
          forbidden,
        ])
      ).toThrowError("mutation_mode_rejected");
    }

    expect(
      parseArguments(["--confirm-project-ref", STAGING_PROJECT_REF])
    ).toMatchObject({ mode: "plan", confirmProjectRef: STAGING_PROJECT_REF });
  });
});

describe("Badge Staging scenario plan", () => {
  it("maps all 30 canonical Badges exactly once in sequential order", () => {
    expect(BADGE_ACCEPTANCE_SCENARIOS).toHaveLength(30);
    expect(BADGE_ACCEPTANCE_SCENARIOS.map((scenario) => scenario.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1)
    );
    expect(new Set(BADGE_ACCEPTANCE_SCENARIOS.map((scenario) => scenario.slug))).toHaveProperty(
      "size",
      30
    );
    expect(
      BADGE_ACCEPTANCE_SCENARIOS.map(({ number, slug, assetPath }) => ({
        number,
        slug,
        assetPath,
      }))
    ).toEqual(
      BADGE_DEFINITIONS.map((definition) => ({
        number: definition.number,
        slug: definition.slug,
        assetPath: definition.assets.artwork,
      }))
    );

    const groupedNumbers = SCENARIO_GROUPS.flatMap((group) => group.badges).sort(
      (left, right) => left - right
    );
    expect(groupedNumbers).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1)
    );
  });

  it("reuses a bounded fixed UAT catalogue instead of allocating 256 players", () => {
    expect(MAX_CONCURRENT_UAT_PLAYERS).toBe(8);
    expect(FIXED_UAT_ALIASES).toHaveLength(24);
    expect(new Set(FIXED_UAT_ALIASES)).toHaveProperty("size", 24);

    for (const pool of Object.values(FIXED_UAT_POOLS)) {
      expect(pool).toHaveLength(8);
    }
    for (const group of SCENARIO_GROUPS) {
      if (group.targetAlias) {
        expect(FIXED_UAT_ALIASES).toContain(group.targetAlias);
        expect(group.fixturePool).not.toBeNull();
        expect(
          FIXED_UAT_POOLS[group.fixturePool as keyof typeof FIXED_UAT_POOLS]
        ).toContain(group.targetAlias);
      }
    }

    const source = readFileSync(
      resolve(process.cwd(), "scripts/badges/staging-acceptance-plan.mjs"),
      "utf8"
    );
    expect(source).not.toMatch(/\b256\b/u);
    expect(source).not.toMatch(/semantic.?role/iu);
  });

  it("keeps protected provider positives external and Badge 20 on real authority", () => {
    for (const number of [1, 18, 19]) {
      const scenario = BADGE_ACCEPTANCE_SCENARIOS[number - 1];
      expect(scenario.ownerProviderRequired).toBe(true);
      expect(
        SCENARIO_GROUPS.find((group) => group.key === scenario.group)?.execution
      ).toBe("owner-provider-checkpoint");
    }

    const badge20 = BADGE_ACCEPTANCE_SCENARIOS[19];
    expect(badge20.positiveScenario).toMatch(/genuinely played/iu);
    expect(badge20.negativeScenario).toMatch(/all-bye/iu);
    expect(
      SCENARIO_GROUPS.find((group) => group.key === badge20.group)?.purpose
    ).toMatch(/no timestamp manipulation/iu);
  });

  it("maps all 30 PNGs and confirms every file is alpha-capable", () => {
    const inventory = inspectBadgeArtwork(process.cwd());

    expect(inventory).toHaveLength(30);
    expect(inventory.every((asset) => asset.alphaCapable)).toBe(true);
    expect(inventory.map((asset) => asset.assetPath)).toEqual(
      Array.from({ length: 30 }, (_, index) => `/assets/badges/${index + 1}.png`)
    );
  });
});

describe("Badge Staging evidence manifest", () => {
  it("creates a sanitized, fixed 30-Badge matrix with honest checkpoints", () => {
    const manifest = buildTemplateForTest();
    const result = validateAcceptanceManifest(manifest);

    expect(manifest.badgeResults).toHaveLength(30);
    expect(manifest.permanentUatAliases).toEqual(FIXED_UAT_ALIASES);
    expect(manifest.badgeResults[0].finalStatus).toBe("BLOCKED");
    expect(manifest.badgeResults[17].finalStatus).toBe("BLOCKED");
    expect(manifest.badgeResults[18].finalStatus).toBe("BLOCKED");
    expect(manifest.badgeResults[19].finalStatus).toBe("INCONCLUSIVE");
    expect(result.allBadgesPass).toBe(false);
  });

  it("does not accept PASS without authority, award, idempotency, and artwork evidence", () => {
    const incomplete = buildTemplateForTest();
    incomplete.badgeResults[0].finalStatus = "PASS";

    expect(() => validateAcceptanceManifest(incomplete)).toThrowError(
      "manifest_pass_evidence_incomplete:1"
    );

    const complete = buildTemplateForTest();
    markBadgePass(
      complete.badgeResults[0] as unknown as BadgeResultFixture
    );
    expect(validateAcceptanceManifest(complete).counts.PASS).toBe(1);
  });

  it("rejects secret-shaped values and secret-shaped keys", () => {
    const valueLeak = buildTemplateForTest();
    Object.assign(valueLeak, { diagnostic: "Bearer eyJunsafe-value" });
    expect(() => validateAcceptanceManifest(valueLeak)).toThrowError(
      /manifest_secret_rejected/iu
    );

    const keyLeak = buildTemplateForTest();
    Object.assign(keyLeak, { serviceRoleKey: "redacted" });
    expect(() => validateAcceptanceManifest(keyLeak)).toThrowError(
      /manifest_secret_key_rejected/iu
    );
  });

  it("creates only an exact-ID, provenance-scoped cleanup dry-run plan", () => {
    const manifest = createAcceptanceTemplate({
      projectRef: STAGING_PROJECT_REF,
      runMarker: "badge-acceptance-cleanup",
      createdAt: "2026-08-31T00:00:00.000Z",
    } as Parameters<typeof createAcceptanceTemplate>[0] & {
      projectRef: string;
    }) as unknown as AcceptanceManifestFixture;
    manifest.resources.push({
      kind: "uat-enrolment",
      id: REGISTRATION_ID,
      alias: "TestAcademy1",
      tournamentId: TOURNAMENT_ID,
      cleanupDisposition: "supported-exact-id",
      provenance: ACCEPTANCE_PROVENANCE,
      runMarker: manifest.runMarker,
    });
    manifest.resources.push({
      kind: "tournament",
      id: TOURNAMENT_ID,
      cleanupDisposition: "retain-authoritative-history",
      provenance: ACCEPTANCE_PROVENANCE,
      runMarker: manifest.runMarker,
    });

    expect(buildCleanupPlan(manifest)).toEqual([
      {
        kind: "uat-enrolment",
        id: REGISTRATION_ID,
        runMarker: manifest.runMarker,
        provenance: ACCEPTANCE_PROVENANCE,
        alias: "TestAcademy1",
        tournamentId: TOURNAMENT_ID,
        wouldMutate: false,
      },
    ]);

    manifest.resources[0].alias = "arbitrary-role";
    expect(() => buildCleanupPlan(manifest)).toThrowError(
      "manifest_resource_alias_rejected"
    );
  });
});

describe("Badge Staging harness mutation boundary", () => {
  it("contains no Badge award mutation or protected provider write path", () => {
    const source = [
      "scripts/badges/staging-acceptance-plan.mjs",
      "scripts/badges/staging-acceptance.mjs",
    ]
      .map((path) => readFileSync(resolve(process.cwd(), path), "utf8"))
      .join("\n");

    expect(source).not.toMatch(
      /\.from\(\s*["']player_badge_awards["']\s*\)[\s\S]{0,240}\.(?:insert|upsert|update|delete)\s*\(/iu
    );
    expect(source).not.toMatch(
      /\b(?:steam_id64|current_elo|relic_verified_elo)\b\s*[:=]/iu
    );
    expect(source).not.toMatch(/supabase\.from|supabase\.rpc|fetch\s*\(/iu);
  });
});

function markBadgePass(result: BadgeResultFixture) {
  result.authorityEvidence.status = "PASS";
  result.authorityEvidence.sourceIds = [SOURCE_ID];
  result.awardEvidence = {
    status: "PASS",
    playerId: PLAYER_ID,
    awardId: AWARD_ID,
    rowCount: 1,
  };
  result.idempotency = {
    status: "PASS",
    evaluationAttempts: 2,
    repeatCreatedCount: 0,
    duplicateRows: 0,
  };
  result.artworkCollection.status = "PASS";
  result.finalStatus = "PASS";
}
