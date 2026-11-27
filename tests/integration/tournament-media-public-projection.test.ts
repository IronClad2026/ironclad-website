import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(
    /\r\n/g,
    "\n"
  );
}

describe("public Tournament media projection", () => {
  it("loads only published media for the included Tournaments in newest-first order", () => {
    const page = source("app/tournaments/page.tsx");
    const combined = source("lib/caster/tournament-video-server.ts");

    expect(page).toContain("loadCombinedTournamentMedia([...includedTournamentIds])");
    expect(combined).toContain('"caster_media_public_tournaments"');
    expect(combined).toContain("allowed.has(parsed.tournament_id)");
    expect(combined).toContain("!parsed.published");
    expect(page).toContain('.from("tournament_media")');
    expect(page).toContain('.in("tournament_id", [...includedTournamentIds])');
    expect(page).toContain('.eq("published", true)');
    expect(page).toContain('.order("created_at", { ascending: false })');
    expect(page).toContain('.order("id", { ascending: false })');
    expect(page).toContain("parseTournamentMediaDatabaseRow");
    expect(page).toContain("sortTournamentMediaNewestFirst");
    expect(page).toContain("if (!media.published");
  });

  it("projects only public-safe fields and never serializes Match IDs", () => {
    const page = source("app/tournaments/page.tsx");
    const contract = source("lib/tournament-media.ts");

    expect(contract).toMatch(
      /export type TournamentMediaItem = \{\s+id: string;\s+title: string;\s+url: string;\s+mediaType: TournamentMediaType;\s+description: string \| null;\s+casterName\?: string;\s+casterProfileHref\?: string;\s+casterScopeLabel\?: string;\s+\};/
    );
    expect(page).toContain("mediaType: media.mediaType");
    expect(page).toContain("description: media.description");
    expect(page).not.toContain("matchId: media.matchId");
    expect(page).not.toContain("createdAt: media.createdAt");
    expect(page).not.toContain("updatedAt: media.updatedAt");
    expect(page).not.toContain("actor: media.actor");
  });

  it("uses one shared card list for both public responsive paths", () => {
    const experience = source("components/TournamentsExperience.tsx");
    const media = source("components/TournamentMedia.tsx");

    expect(experience).toContain(
      '<TournamentMedia tournament={tournament} presentation="desktop" />'
    );
    expect(experience).toContain(
      '<TournamentMedia tournament={tournament} presentation="mobile" />'
    );
    expect(media).toContain('presentation: "desktop" | "mobile"');
    expect(media).toContain('target="_blank"');
    expect(media).toContain('rel="noopener noreferrer"');
    expect(media).not.toContain("rulesUrl");
    expect(media).not.toContain("battlefyUrl");
    expect(media).not.toContain("matchId");
  });
});
