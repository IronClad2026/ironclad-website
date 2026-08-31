import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const workspace = read("app/admin/tournaments/[tournamentId]/page.tsx");
const menu = read(
  "components/admin/tournaments/TournamentManagementMenu.tsx"
);
const header = read(
  "components/admin/tournaments/TournamentWorkspaceHeader.tsx"
);
const media = read(
  "components/admin/tournaments/AdminTournamentMedia.tsx"
);
const actions = read("app/admin/tournaments/media-actions.ts");

describe("Admin Tournament Media workspace contract", () => {
  it("adds Media as the ninth focused section in route, desktop nav, and drawer", () => {
    expect(workspace).toContain('"media",');
    expect(workspace).toContain('if (section === "media")');
    expect(workspace).toContain("<AdminTournamentMedia");
    expect(menu).toContain('| "media"');
    expect(menu).toContain(
      '{ icon: Clapperboard, label: "Media", section: "media" }'
    );
    expect(menu).toContain("?section=${item.section}");
    expect(menu).toContain("2xl:grid-cols-9");
    expect(header).toContain('media: "Media"');
  });

  it("keeps terminal Tournaments manageable without a lifecycle lock", () => {
    const mediaBranch = workspace.slice(
      workspace.indexOf('if (section === "media")'),
      workspace.indexOf('if (section === "map-pool")')
    );
    expect(mediaBranch).not.toContain("isAdminTournamentWorkspaceTerminal");
    expect(media).not.toContain("terminal");
    expect(actions).not.toContain('eq("status"');
  });

  it("keeps publication separate from edit and removal explicitly confirmed", () => {
    expect(media).toContain("Publication state");
    expect(media).toContain("setTournamentMediaPublished");
    expect(media).toContain("Publish");
    expect(media).toContain("Hide");
    expect(media).toContain("Remove this media link? This cannot be undone.");
    expect(media).toContain("Confirm Remove");
    expect(media).toContain('role="group"');
  });

  it("scopes optional Match choices and every mutation on the trusted server", () => {
    expect(media).toContain("Associated Match (optional)");
    expect(actions).toContain("loadTournamentMatchOptions");
    expect(actions).toContain("verifyMatchScope");
    expect(actions).toContain('.eq("tournament_id", tournamentId)');
    expect(actions).toContain('.eq("tournament_id", parsed.tournamentId)');
    expect(actions.match(/await requireAdmin\(\)/g)).toHaveLength(5);
    expect(actions.match(/await verifyTournament\(/g)).toHaveLength(4);
  });
});
