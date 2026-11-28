// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CasterCoverageList, DivisionCasterCoverage, MatchCasterCoverage, selectPublicCasterCoverage } from "@/components/caster/CasterCoverage";
import type { CasterCoverageAssignment } from "@/lib/caster/coverage";
import { getCasterCoverageCopy } from "@/lib/caster/coverage-copy";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";

const caster = {
  slug: "ironclad-test-caster", display_name: "Synthetic Official Caster",
  publication_id: "30000000-0000-4000-8000-000000000001", avatar: "30000000-0000-4000-8000-000000000002",
};

function record(overrides: Partial<CasterCoverageAssignment> = {}): CasterCoverageAssignment {
  return {
    id: "tournament", version: 1, scope: "tournament", status: "scheduled",
    tournament_id: "fixture-tournament", tournament_slug: "ironclad-staging-tournament", tournament_title: "IronClad Staging Tournament",
    game: "Company of Heroes 3", division_id: null, division_name: null, match_id: null, match_label: null,
    scheduled_at: "2026-12-27T01:15:00Z", covered_at: null, verified_at: null, target_available: true,
    broadcast_url: "https://www.twitch.tv/ironclad", recording_url: null, caster,
    ...overrides,
  };
}

const division = () => record({ id: "division", scope: "division", division_id: "main", division_name: "Main" });
const match = () => record({ ...division(), id: "match", scope: "match", match_id: "match-1", match_label: "Final" });

afterEach(cleanup);

describe("Caster coverage on public tournament surfaces", () => {
  it("uses the closest exact scope for the same caster and retains other explicitly labeled parent assignments", () => {
    const parentCaster = { ...caster, slug: "tournament-caster", display_name: "Tournament Caster" };
    const rows = [record(), match(), division(), record({ id: "another-parent", caster: parentCaster }), record({ ...match(), id: "other-match", match_id: "match-2" })];
    expect(selectPublicCasterCoverage(rows).map((value) => value.id)).toEqual(["tournament", "another-parent"]);
    expect(selectPublicCasterCoverage(rows, { divisionId: "main" }).map((value) => value.id)).toEqual(["division", "another-parent"]);
    expect(selectPublicCasterCoverage(rows, { divisionId: "main", matchId: "match-1" }).map((value) => value.id)).toEqual(["match", "another-parent"]);
    expect(selectPublicCasterCoverage(rows, { divisionId: "unrelated", matchId: "match-1" }).map((value) => value.id)).toEqual(["tournament", "another-parent"]);
  });

  it("omits terminal unavailable rows and does not represent inherited assignments alone as match coverage", () => {
    const rows = [record(), division(), record({ ...match(), status: "cancelled" }), record({ ...match(), target_available: false })];
    const { container } = render(<MatchCasterCoverage matchId="match-1" divisionId="main" records={rows} locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a public match disclosure with exact status, scope, broadcaster and revision-scoped avatar", () => {
    render(<MatchCasterCoverage matchId="match-1" divisionId="main" records={[record(), match()]} locale="en" />);
    const disclosure = screen.getByText("Official Caster Coverage").closest("details")!;
    disclosure.open = true;
    expect(disclosure).toHaveAttribute("data-caster-match-coverage", "match-1");
    const scoped = within(disclosure);
    expect(scoped.getByText("Scheduled")).toBeInTheDocument();
    expect(scoped.getByText("Main · Final")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: /Synthetic Official Caster/ })).toHaveAttribute("href", `/casters/${caster.slug}`);
    expect(scoped.getByRole("link", { name: "Watch broadcast" })).toHaveAttribute("href", "https://www.twitch.tv/ironclad");
    expect(disclosure.querySelector("img")).toHaveAttribute("src", `/api/caster/public-media/${caster.slug}/${caster.publication_id}/${caster.avatar}`);
    expect(scoped.queryByText("Tournament", { exact: true })).toBeNull();
    expect(scoped.queryByText("Completed and verified")).toBeNull();
  });

  it("displays a directly assigned division distinctly from tournament-level coverage", () => {
    const { container } = render(<DivisionCasterCoverage divisionId="main" records={[record(), division(), match()]} locale="en" />);
    expect(container.querySelector('[data-caster-division-coverage="main"]')).not.toBeNull();
    expect(screen.getByText("Division", { exact: true })).toBeVisible();
    expect(screen.queryByText("Tournament", { exact: true })).toBeNull();
    expect(screen.queryByText("Main · Final")).toBeNull();
  });

  it("renders a Former Caster credit with the public event date and without user or recording links", () => {
    const archived = match();
    render(<MatchCasterCoverage matchId="match-1" divisionId="main" records={[{
      ...archived, status: "completed", former_caster: true, caster: undefined, covered_at: "2026-11-27",
      verified_at: "2026-11-28", recording_url: "https://www.youtube.com/watch?v=abcdefghijk",
    }]} locale="en" />);
    const disclosure = screen.getByText("Official Caster Coverage").closest("details")!;
    disclosure.open = true;
    expect(within(disclosure).getByText("Former Caster")).toBeVisible();
    expect(within(disclosure).getByText("Completed and verified")).toBeVisible();
    expect(disclosure.querySelector("time")).toHaveAttribute("datetime", "2026-11-27");
    expect(disclosure.querySelector("img, a")).toBeNull();
  });
});

describe("Verified caster history and private Studio", () => {
  it("retains verified historical match detail with the tournament fallback and no private proof links", () => {
    const reviewed = record({ ...match(), status: "completed", target_available: false, covered_at: "2026-12-27T04:00:00Z",
      verified_at: "2026-12-28T01:00:00Z", recording_url: "https://www.youtube.com/watch?v=abcdefghijk", media_url: "https://ironclad.example/api/match-proofs/private" });
    render(<CasterCoverageList records={[record(), reviewed]} mode="history" locale="en" />);
    const section = screen.getByRole("region", { name: "Verified IronClad Coverage" });
    expect(within(section).getByText("Completed and verified")).toBeVisible();
    expect(within(section).getByText("Company of Heroes 3 · Main · Final · Historical match")).toBeVisible();
    expect(within(section).getByRole("link", { name: "View brackets" })).toHaveAttribute("href", "/tournaments?tournament=ironclad-staging-tournament&tab=brackets");
    expect(within(section).getByRole("link", { name: "Watch recording" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=abcdefghijk");
    expect(within(section).queryByText("Scheduled")).toBeNull();
    expect(within(section).queryByRole("link", { name: "Open tournament media" })).toBeNull();
  });

  it("collapses public history until a valid completed and verified coverage row is present", () => {
    const { container } = render(<CasterCoverageList records={[record(), record({ status: "completed" })]} mode="history" locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the verified snapshot without a tournament link when the original public tournament is gone", () => {
    const reviewed = record({ ...match(), status: "completed", target_available: false, tournament_slug: null,
      covered_at: "2026-12-27T04:00:00Z", verified_at: "2026-12-28T01:00:00Z", broadcast_url: null });
    render(<CasterCoverageList records={[reviewed]} mode="history" locale="en" />);
    const section = screen.getByRole("region", { name: "Verified IronClad Coverage" });
    expect(within(section).getByText("IronClad Staging Tournament")).toBeVisible();
    expect(within(section).queryByRole("link")).toBeNull();
  });

  it("shows a localized private empty state, past statuses and current links without edit controls", () => {
    const { rerender } = render(<CasterCoverageList records={[]} mode="studio" locale="en" unavailable />);
    expect(screen.getByText("Casting assignments are temporarily unavailable.")).toBeVisible();
    rerender(<CasterCoverageList records={[record(), record({ ...match(), status: "unfulfilled" })]} mode="studio" locale="en" />);
    expect(screen.getByText("Scheduled assignments")).toBeVisible();
    expect(screen.getByText("Past assignments")).toBeVisible();
    expect(screen.getByText("Unfulfilled")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Watch broadcast" })).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each(SUPPORTED_LOCALES)("renders the coverage status and scope in %s", (locale) => {
    const copy = getCasterCoverageCopy(locale);
    render(<CasterCoverageList records={[record()]} mode="studio" locale={locale} />);
    expect(screen.getByRole("heading", { name: copy.studioTitle })).toBeVisible();
    expect(screen.getByText(copy.scheduled, { exact: true })).toBeVisible();
    expect(screen.getByText(copy.tournament, { exact: true })).toBeVisible();
  });
});
