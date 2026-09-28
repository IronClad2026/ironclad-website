import type { P03FixtureReceipt } from "./fixture";

type ReadRows = (table: string, query: string) => Promise<Record<string, unknown>[]>;
function requireScope(condition: unknown): asserts condition {
  if (!condition) throw new Error("BLOCKED: reviewed disposable Staging fixture ownership or provenance changed; no fixture operations are permitted.");
}

/** Independently binds the local receipt to live public Staging scope. */
export async function verifyReceiptScope(receipt: P03FixtureReceipt, read: ReadRows) {
  const events = await read("tournaments", `id=eq.${receipt.tournamentId}&select=id,slug,title&limit=1`);
  requireScope(events.length === 1 && events[0].slug === receipt.slug && events[0].title === receipt.title);
  const divisions = await read("tournament_brackets", `id=eq.${receipt.bracketId}&select=id,tournament_id&limit=1`);
  requireScope(divisions.length === 1 && divisions[0].tournament_id === receipt.tournamentId);
  const brackets = await read("generated_brackets", `id=eq.${receipt.generatedBracketId}&select=id,tournament_bracket_id&limit=1`);
  requireScope(brackets.length === 1 && brackets[0].tournament_bracket_id === receipt.bracketId);
  const registrations = await read("registrations", `tournament_id=eq.${receipt.tournamentId}&select=id,profile_id,registration_provenance&limit=50`);
  requireScope(registrations.length === 8 && receipt.registrations.every((expected) => registrations.some((actual) =>
    actual.id === expected.registrationId && actual.profile_id === expected.playerId && actual.registration_provenance === receipt.provenance)));
  const ids = [receipt.currentMatchId, receipt.completedMatchId, receipt.onePlayerMatchId, receipt.emptyFinalMatchId];
  const matches = await read("tournament_matches", `id=in.(${ids.join(",")})&select=id,generated_bracket_id,status,player_one_registration_id,player_two_registration_id&limit=4`);
  requireScope(matches.length === 4 && matches.every((match) => match.generated_bracket_id === receipt.generatedBracketId &&
    [match.player_one_registration_id, match.player_two_registration_id].every((id) => id === null || receipt.registrations.some((registration) => registration.registrationId === id))));
  const get = (id: string) => matches.find((match) => match.id === id);
  const current = get(receipt.currentMatchId);
  requireScope(current?.status === "in_progress" && current.player_one_registration_id === receipt.registrations.find((row) => row.alias === receipt.firstAlias)?.registrationId &&
    current.player_two_registration_id === receipt.registrations.find((row) => row.alias === receipt.secondAlias)?.registrationId);
  const tbd = get(receipt.onePlayerMatchId);
  const empty = get(receipt.emptyFinalMatchId);
  requireScope(get(receipt.completedMatchId)?.status === "completed" && tbd?.status === "scheduled" &&
    Number(Boolean(tbd.player_one_registration_id)) + Number(Boolean(tbd.player_two_registration_id)) === 1 &&
    empty?.status === "scheduled" && !empty.player_one_registration_id && !empty.player_two_registration_id);
}
