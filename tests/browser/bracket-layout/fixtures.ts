import type { GeneratedTournamentMatch, TournamentParticipant } from "@/lib/tournaments";

export type BracketMode = "public" | "admin" | "player";
export const FIXTURE_ACTIVATION = "2026-09-01T12:00:00.000Z";
export const FIXTURE_DEADLINE = "2099-09-30T12:30:00.000Z";
export const LONG_NAME = "SteelVanguard_Unbroken_Competitive_Commander_With_A_Deliberately_Long_Name";

export function bracketFixture(size: 8 | 16) {
  const participants: TournamentParticipant[] = Array.from({ length: size }, (_, index) => ({
    registrationId: "registration-" + (index + 1),
    name: index % 3 === 0 ? LONG_NAME + "_" + (index + 1) : "Commander " + (index + 1),
    country: null, elo: null, status: "approved",
    bracketId: "synthetic-bracket", bracketName: "Academy",
  }));
  const matches: GeneratedTournamentMatch[] = [];
  const roundCount = Math.log2(size);
  for (let round = 1; round <= roundCount; round++) {
    const count = size / 2 ** round;
    for (let index = 0; index < count; index++) {
      const number = matches.length + 1;
      const firstRound = round === 1;
      const one = firstRound ? participants[index * 2].registrationId : null;
      const two = firstRound ? participants[index * 2 + 1].registrationId : null;
      const match: GeneratedTournamentMatch = {
        id: "fixture-match-" + number,
        seriesBestOf: 3,
        roundName: count === 1 ? "Final" : count === 2 ? "Semifinals" : count === 4 ? "Quarterfinals" : "Round of 16",
        roundNumber: round, matchNumber: number,
        status: "scheduled", activationVersion: 0, activatedAt: null, deadlineAt: null,
        outcomeType: null, deadlineRuledAt: null,
        extensionMinutes: null, extendedAt: null, holdStartedAt: null, holdReleasedAt: null,
        playerOneRegistrationId: one, playerTwoRegistrationId: two,
        playerOneSlot: one ? index * 2 + 1 : null, playerTwoSlot: two ? index * 2 + 2 : null,
        playerOneScore: null, playerTwoScore: null, winnerRegistrationId: null,
      };
      if (firstRound && index === 0) Object.assign(match, {
        status: "completed", activationVersion: 1, activatedAt: FIXTURE_ACTIVATION,
        playerOneScore: 2, playerTwoScore: 1, winnerRegistrationId: one,
      });
      if (firstRound && index === 1) Object.assign(match, {
        status: "in_progress", activationVersion: 1, activatedAt: FIXTURE_ACTIVATION,
        deadlineAt: FIXTURE_DEADLINE, extensionMinutes: 90, extendedAt: FIXTURE_ACTIVATION,
      });
      if (firstRound && index === 2) Object.assign(match, {
        status: "in_progress", activationVersion: 1, activatedAt: FIXTURE_ACTIVATION,
        deadlineAt: FIXTURE_DEADLINE, holdStartedAt: FIXTURE_ACTIVATION,
      });
      if ((firstRound && index === 3) || (round === 2 && index === 0)) Object.assign(match, {
        playerOneRegistrationId: participants[0].registrationId, playerOneSlot: 1,
        playerTwoRegistrationId: null, playerTwoSlot: null,
      });
      if (firstRound && index === 4) Object.assign(match, {
        status: "pending_review", activationVersion: 1, activatedAt: FIXTURE_ACTIVATION,
      });
      if (firstRound && index === 5) Object.assign(match, {
        playerOneRegistrationId: null, playerTwoRegistrationId: null,
        playerOneSlot: null, playerTwoSlot: null,
      });
      if (firstRound && index === 6) Object.assign(match, {
        status: "completed", outcomeType: "deadline_double_forfeit", activationVersion: 1,
        activatedAt: FIXTURE_ACTIVATION, deadlineRuledAt: FIXTURE_ACTIVATION,
      });
      matches.push(match);
    }
  }
  return { matches, participantsById: new Map(participants.map((player) => [player.registrationId, player])), registrationIds: participants.map((player) => player.registrationId) };
}