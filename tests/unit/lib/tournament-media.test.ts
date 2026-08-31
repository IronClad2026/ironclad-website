import { describe, expect, it } from "vitest";
import {
  mapTournamentMediaAdminItem,
  mapTournamentMediaItem,
  normalizeTournamentMediaUrl,
  parseTournamentMediaDatabaseRow,
  parseTournamentMediaDraftInput,
  sortTournamentMediaNewestFirst,
  type TournamentMediaDatabaseRow,
} from "@/lib/tournament-media";

const mediaId = "123e4567-e89b-42d3-a456-426614174000";
const tournamentId = "223e4567-e89b-42d3-a456-426614174000";
const matchId = "323e4567-e89b-42d3-a456-426614174000";

const databaseRow: TournamentMediaDatabaseRow = {
  id: mediaId,
  tournament_id: tournamentId,
  title: "Grand Final Cast",
  url: "https://www.youtube.com/watch?v=ironclad",
  media_type: "match_cast",
  description: "Player A vs Player B",
  match_id: matchId,
  published: true,
  created_at: "2026-08-31T01:00:00.000Z",
  updated_at: "2026-08-31T01:00:00.000Z",
};

describe("Tournament media contract", () => {
  it("normalizes ordinary HTTPS links without restricting providers", () => {
    expect(
      normalizeTournamentMediaUrl(
        "  https://www.twitch.tv/videos/123?collection=ironclad  "
      )
    ).toBe("https://www.twitch.tv/videos/123?collection=ironclad");
    expect(normalizeTournamentMediaUrl("https://example.com/vod/1")).toBe(
      "https://example.com/vod/1"
    );
  });

  it("rejects non-HTTPS, credential-bearing, malformed, and oversized links", () => {
    expect(normalizeTournamentMediaUrl("http://example.com/vod")).toBeNull();
    expect(normalizeTournamentMediaUrl("javascript:alert(1)")).toBeNull();
    expect(
      normalizeTournamentMediaUrl("https://user:secret@example.com/vod")
    ).toBeNull();
    expect(normalizeTournamentMediaUrl("not a url")).toBeNull();
    expect(
      normalizeTournamentMediaUrl(`https://example.com/${"a".repeat(2050)}`)
    ).toBeNull();
  });

  it("parses and safely normalizes one Admin draft", () => {
    expect(
      parseTournamentMediaDraftInput({
        mediaId: null,
        tournamentId,
        title: "  Full Tournament Cast  ",
        url: " https://youtu.be/ironclad ",
        mediaType: "full_tournament",
        description: "  Complete event coverage.  ",
        matchId: null,
        published: false,
      })
    ).toEqual({
      ok: true,
      value: {
        mediaId: null,
        tournamentId,
        title: "Full Tournament Cast",
        url: "https://youtu.be/ironclad",
        mediaType: "full_tournament",
        description: "Complete event coverage.",
        matchId: null,
        published: false,
      },
    });
  });

  it("preserves multiline descriptions while rejecting other control characters", () => {
    const base = {
      mediaId: null,
      tournamentId,
      title: "Cast",
      url: "https://example.com/cast",
      mediaType: "video",
      matchId: null,
      published: false,
    };

    expect(
      parseTournamentMediaDraftInput({
        ...base,
        description: "Opening series.\r\nGrand Final coverage.",
      })
    ).toMatchObject({
      ok: true,
      value: {
        description: "Opening series.\r\nGrand Final coverage.",
      },
    });
    expect(
      parseTournamentMediaDraftInput({
        ...base,
        description: "Opening series.\tGrand Final coverage.",
      }).ok
    ).toBe(false);
  });

  it("rejects invalid types, identifiers, field lengths, and publication state", () => {
    const base = {
      mediaId: null,
      tournamentId,
      title: "Cast",
      url: "https://example.com/cast",
      mediaType: "video",
      description: null,
      matchId: null,
      published: false,
    };

    expect(
      parseTournamentMediaDraftInput({ ...base, tournamentId: "wrong" }).ok
    ).toBe(false);
    expect(
      parseTournamentMediaDraftInput({ ...base, mediaType: "stream" }).ok
    ).toBe(false);
    expect(
      parseTournamentMediaDraftInput({ ...base, title: "x".repeat(161) }).ok
    ).toBe(false);
    expect(
      parseTournamentMediaDraftInput({
        ...base,
        description: "x".repeat(501),
      }).ok
    ).toBe(false);
    expect(
      parseTournamentMediaDraftInput({ ...base, matchId: "wrong" }).ok
    ).toBe(false);
    expect(
      parseTournamentMediaDraftInput({ ...base, published: "yes" }).ok
    ).toBe(false);
  });

  it("accepts only the explicit database projection and maps public/Admin views", () => {
    const parsed = parseTournamentMediaDatabaseRow(databaseRow);
    expect(parsed).toEqual(databaseRow);
    expect(parsed && mapTournamentMediaItem(parsed)).toEqual({
      id: mediaId,
      title: "Grand Final Cast",
      url: "https://www.youtube.com/watch?v=ironclad",
      mediaType: "match_cast",
      description: "Player A vs Player B",
    });
    expect(parsed && mapTournamentMediaAdminItem(parsed)).toEqual({
      id: mediaId,
      tournamentId,
      title: "Grand Final Cast",
      url: "https://www.youtube.com/watch?v=ironclad",
      mediaType: "match_cast",
      description: "Player A vs Player B",
      matchId,
      published: true,
      createdAt: "2026-08-31T01:00:00.000Z",
      updatedAt: "2026-08-31T01:00:00.000Z",
    });
    expect(
      parseTournamentMediaDatabaseRow({ ...databaseRow, private_note: "no" })
    ).toBeNull();
  });

  it("sorts Admin entries newest first with a deterministic UUID tie-break", () => {
    expect(
      sortTournamentMediaNewestFirst([
        {
          id: mediaId,
          createdAt: "2026-08-31T01:00:00.000Z",
        },
        {
          id: matchId,
          createdAt: "2026-08-31T02:00:00.000Z",
        },
      ]).map((item) => item.id)
    ).toEqual([matchId, mediaId]);
  });
});
