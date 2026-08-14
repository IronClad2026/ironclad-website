import { describe, expect, it } from "vitest";
import {
  formatTournamentParticipantFact,
  mapPublicTournamentParticipant,
  tournamentParticipantMatchesQuery,
  type TournamentParticipantRegistrationSnapshot,
} from "@/lib/tournaments";

const snapshot: TournamentParticipantRegistrationSnapshot = {
  registrationId: "11111111-1111-4111-8111-111111111111",
  playerName: "HistoricalIGN",
  country: "AU",
  submittedElo: 1452,
  verifiedElo: null,
  status: "approved",
  bracketId: "22222222-2222-4222-8222-222222222222",
  bracketName: "Main / Pro Bracket",
};

describe("public tournament participant projection", () => {
  it("uses immutable registration facts for an opted-in competitor", () => {
    expect(
      mapPublicTournamentParticipant(snapshot, {
        publicProfileEnabled: true,
        accountClosedAt: null,
      })
    ).toEqual({
      registrationId: snapshot.registrationId,
      name: "HistoricalIGN",
      country: "AU",
      elo: 1452,
      status: "approved",
      bracketId: snapshot.bracketId,
      bracketName: snapshot.bracketName,
    });
  });

  it("prefers the verified registration ELO snapshot when present", () => {
    const participant = mapPublicTournamentParticipant(
      { ...snapshot, submittedElo: 1300, verifiedElo: 1452 },
      { publicProfileEnabled: true, accountClosedAt: null }
    );

    expect(participant.elo).toBe(1452);
  });

  it("keeps factual competition identity but masks an opted-out competitor", () => {
    expect(
      mapPublicTournamentParticipant(snapshot, {
        publicProfileEnabled: false,
        accountClosedAt: null,
      })
    ).toEqual(
      expect.objectContaining({
        name: "HistoricalIGN",
        country: null,
        elo: null,
      })
    );
  });

  it("pseudonymizes a closed historical competitor", () => {
    expect(
      mapPublicTournamentParticipant(snapshot, {
        publicProfileEnabled: false,
        accountClosedAt: "2026-08-14T00:00:00.000Z",
      })
    ).toEqual(
      expect.objectContaining({
        registrationId: snapshot.registrationId,
        name: "Former Competitor",
        country: null,
        elo: null,
      })
    );
  });

  it("fails closed on optional facts when privacy state is unavailable", () => {
    expect(mapPublicTournamentParticipant(snapshot, null)).toEqual(
      expect.objectContaining({
        name: "HistoricalIGN",
        country: null,
        elo: null,
      })
    );
  });

  it("renders and searches masked fields without fake values", () => {
    const participant = mapPublicTournamentParticipant(snapshot, {
      publicProfileEnabled: false,
      accountClosedAt: null,
    });

    expect(formatTournamentParticipantFact(participant.country)).toBe("—");
    expect(formatTournamentParticipantFact(participant.elo)).toBe("—");
    expect(tournamentParticipantMatchesQuery(participant, "historical")).toBe(
      true
    );
    expect(tournamentParticipantMatchesQuery(participant, "null")).toBe(false);
    expect(tournamentParticipantMatchesQuery(participant, "0")).toBe(false);
  });
});
