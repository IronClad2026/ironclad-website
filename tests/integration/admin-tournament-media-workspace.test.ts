// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import TournamentManagementMenu, {
  TournamentDesktopSectionNavigation,
} from "@/components/admin/tournaments/TournamentManagementMenu";

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
const tournamentId = "11111111-1111-4111-8111-111111111111";
const sectionLinks = [
  ["Overview", "overview"],
  ["Edit Tournament", "edit"],
  ["Registrations", "registrations"],
  ["Players / Waitlist", "players-waitlist"],
  ["Notifications", "notifications"],
  ["Assistance", "assistance"],
  ["Bracket", "bracket"],
  ["Matches / Results", "matches"],
  ["Replay Archive", "replays"],
  ["Media", "media"],
  ["Map Pool", "map-pool"],
  ["Tournament Controls", "controls"],
] as const;

function expectWorkspaceLinks(navigation: HTMLElement) {
  const links = within(navigation).getAllByRole("link");
  expect(links).toHaveLength(sectionLinks.length);
  for (const [index, [label, section]] of sectionLinks.entries()) {
    expect(links[index]).toHaveAccessibleName(label);
    expect(links[index]).toHaveAttribute(
      "href",
      `/admin/tournaments/${tournamentId}?section=${section}`
    );
  }
  expect(within(navigation).getByRole("link", { current: "page" }))
    .toHaveAccessibleName("Media");
}

describe("Admin Tournament Media workspace contract", () => {
  afterEach(cleanup);

  it("keeps Media in the focused route, desktop nav, and drawer", () => {
    expect(workspace).toContain('"media",');
    expect(workspace).toContain('if (section === "media")');
    expect(workspace).toContain("<AdminTournamentMedia");
    expect(menu).toContain('| "media"');
    expect(menu).toContain(
      '{ icon: Clapperboard, label: "Media", section: "media" }'
    );
    expect(menu).toContain("?section=${item.section}");
    expect(header).toContain('media: "Media"');
    expect(header).toContain("<TournamentDesktopSectionNavigation");
    expect(header).toContain("<TournamentManagementMenu");

    render(createElement(TournamentDesktopSectionNavigation, {
      activeSection: "media",
      tournamentId,
    }));
    const desktop = screen.getByRole("navigation", {
      name: "Tournament management sections",
    });
    expect(desktop).toHaveClass("hidden", "xl:block");
    expect(within(desktop).getByRole("list"))
      .toHaveClass("grid-cols-3", "2xl:grid-cols-6");
    expectWorkspaceLinks(desktop);

    render(createElement(TournamentManagementMenu, {
      activeSection: "media",
      tournamentId,
    }));
    const trigger = screen.getByRole("button", {
      name: "Open Tournament management menu",
    });
    expect(trigger).toHaveClass("xl:hidden");
    fireEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Manage Tournament" });
    expectWorkspaceLinks(within(drawer).getByRole("navigation", {
      name: "Tournament management sections",
    }));
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
