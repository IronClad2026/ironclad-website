export const P03_STAGING_REF = "zzbnneprhjicmajpjkdg";
export type P03FixtureAlias = `TestMain${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export type P03FixtureReceipt = Readonly<{
  schemaVersion: 1;
  projectRef: typeof P03_STAGING_REF;
  source: "p03_preview_validation";
  provenance: "staging_synthetic_uat";
  fixtureContractVersion: "staging-synthetic-v1";
  status: "ready";
  slug: string;
  title: string;
  createdAt: string;
  checkedAt: string;
  tournamentId: string;
  completedTournamentId: string;
  bracketId: string;
  generatedBracketId: string;
  currentMatchId: string;
  onePlayerMatchId: string;
  completedMatchId: string;
  emptyFinalMatchId: string;
  firstAlias: "TestMain1";
  secondAlias: "TestMain3";
  aliases: readonly P03FixtureAlias[];
  registrations: readonly Readonly<{
    registrationId: string;
    alias: P03FixtureAlias;
    playerId: string;
    provenance: "staging_synthetic_uat";
  }>[];
  outboundProofVerified: true;
  notificationRecipientsVerified: true;
}>;

const ALIASES: readonly P03FixtureAlias[] = [
  "TestMain1", "TestMain2", "TestMain3", "TestMain4",
  "TestMain5", "TestMain6", "TestMain7", "TestMain8",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECEIPT_KEYS = new Set([
  "schemaVersion", "projectRef", "source", "provenance", "fixtureContractVersion",
  "status", "slug", "title", "createdAt", "checkedAt", "tournamentId",
  "completedTournamentId", "bracketId", "generatedBracketId", "currentMatchId",
  "onePlayerMatchId", "completedMatchId", "emptyFinalMatchId", "firstAlias",
  "secondAlias", "aliases", "registrations", "outboundProofVerified",
  "notificationRecipientsVerified", "mutations", "plan", "cleanup",
]);
const MUTATIONS = [
  "save_tournament",
  ...ALIASES.flatMap(() => ["enrol_staging_synthetic_uat_player", "review_tournament_registration"]),
  "publish_tournament_bracket_map_pools", "generate_tournament_bracket",
  "save_bracket_assignments", "launch_tournament_division",
  ...Array<string>(3).fill("apply_admin_official_match_result_api"),
];

function ensure(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid P03 Staging fixture receipt; hosted validation must stop.");
}
function object(value: unknown): Record<string, unknown> {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function uuid(value: unknown): string {
  ensure(typeof value === "string" && UUID.test(value));
  return value.toLowerCase();
}
function timestamp(value: unknown): string {
  ensure(typeof value === "string" && Number.isFinite(Date.parse(value)));
  ensure(new Date(value).toISOString() === value);
  return value;
}

/** Parses local scope evidence only. Callers must independently verify live
 * Staging ownership/provenance, current lifecycle, and the exact Preview. */
export function parseFixtureReceipt(value: unknown): P03FixtureReceipt {
  const receipt = object(value);
  ensure(Object.keys(receipt).every((key) => RECEIPT_KEYS.has(key)));
  ensure(receipt.schemaVersion === 1 && receipt.projectRef === P03_STAGING_REF
    && receipt.source === "p03_preview_validation"
    && receipt.provenance === "staging_synthetic_uat"
    && receipt.fixtureContractVersion === "staging-synthetic-v1"
    && receipt.status === "ready"
    && receipt.outboundProofVerified === true
    && receipt.notificationRecipientsVerified === true);
  ensure(typeof receipt.slug === "string");
  const match = /^p03-preview-validation-([a-z0-9][a-z0-9-]{7,47})$/.exec(receipt.slug);
  ensure(match && receipt.title === `P03 Preview Validation ${match[1]}`);
  ensure(Array.isArray(receipt.aliases) && receipt.aliases.length === ALIASES.length
    && receipt.aliases.every((alias, index) => alias === ALIASES[index]));
  ensure(receipt.firstAlias === "TestMain1" && receipt.secondAlias === "TestMain3");
  ensure(Array.isArray(receipt.mutations) && receipt.mutations.length === MUTATIONS.length
    && receipt.mutations.every((name, index) => name === MUTATIONS[index]));
  const createdAt = timestamp(receipt.createdAt);
  const checkedAt = timestamp(receipt.checkedAt);
  ensure(Date.parse(checkedAt) >= Date.parse(createdAt));

  const tournamentId = uuid(receipt.tournamentId);
  const completedTournamentId = uuid(receipt.completedTournamentId);
  ensure(tournamentId === completedTournamentId);
  const bracketId = uuid(receipt.bracketId);
  const generatedBracketId = uuid(receipt.generatedBracketId);
  const currentMatchId = uuid(receipt.currentMatchId);
  const onePlayerMatchId = uuid(receipt.onePlayerMatchId);
  const completedMatchId = uuid(receipt.completedMatchId);
  const emptyFinalMatchId = uuid(receipt.emptyFinalMatchId);
  ensure(new Set([currentMatchId, onePlayerMatchId, completedMatchId, emptyFinalMatchId]).size === 4);

  ensure(Array.isArray(receipt.registrations) && receipt.registrations.length === ALIASES.length);
  const registrations = receipt.registrations.map((value, index) => {
    const row = object(value);
    ensure(Object.keys(row).length === 4
      && Object.keys(row).every((key) => ["registrationId", "alias", "playerId", "provenance"].includes(key)));
    ensure(row.alias === ALIASES[index] && row.provenance === "staging_synthetic_uat");
    return Object.freeze({
      registrationId: uuid(row.registrationId), alias: ALIASES[index],
      playerId: uuid(row.playerId), provenance: "staging_synthetic_uat" as const,
    });
  });
  ensure(new Set(registrations.map((row) => row.registrationId)).size === 8);
  ensure(new Set(registrations.map((row) => row.playerId)).size === 8);

  return Object.freeze({
    schemaVersion: 1, projectRef: P03_STAGING_REF, source: "p03_preview_validation",
    provenance: "staging_synthetic_uat", fixtureContractVersion: "staging-synthetic-v1",
    status: "ready", slug: receipt.slug, title: receipt.title as string,
    createdAt, checkedAt, tournamentId, completedTournamentId, bracketId, generatedBracketId,
    currentMatchId, onePlayerMatchId, completedMatchId, emptyFinalMatchId,
    firstAlias: "TestMain1", secondAlias: "TestMain3",
    aliases: Object.freeze([...ALIASES]), registrations: Object.freeze(registrations),
    outboundProofVerified: true, notificationRecipientsVerified: true,
  });
}
