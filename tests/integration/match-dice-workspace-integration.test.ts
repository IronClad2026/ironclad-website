import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/TournamentsExperience.tsx"),
  "utf8"
);

describe("authenticated match dice workspace integration", () => {
  it("integrates one on-demand dice workspace before existing result controls", () => {
    expect(source).toContain('from "@/components/MatchDiceRollOff"');
    expect(source).toContain("function AuthenticatedMatchDiceRollOff");
    expect(source).toContain("<AuthenticatedMatchDiceRollOff");

    const dice = source.indexOf("<AuthenticatedMatchDiceRollOff");
    const results = source.indexOf("<MatchResultControls", dice);
    expect(dice).toBeGreaterThan(-1);
    expect(results).toBeGreaterThan(dice);
  });

  it("adds an own-match affordance without making unrelated cards interactive", () => {
    expect(source).toContain("selectedPlayerMatchId");
    expect(source).toContain("onPlayerMatchSelect");
    expect(source).toContain("Your Match");
    expect(source).toContain("Open Match");
    expect(source).toContain("viewerRegistrationIds");
  });

  it("keeps round-robin unsupported and private history out of the page payload", () => {
    expect(source).toContain('bracketFormat === "single_elimination"');
    expect(source).not.toContain("matchDiceRolls:");
    expect(source).not.toContain("diceHistory:");
  });

  it("uses the sanitized authenticated read RPC and participant Server Action", () => {
    expect(source).toContain('"get_match_dice_rolloff"');
    expect(source).toContain("parseMatchDiceSnapshot");
    expect(source).toContain("rollMatchDice");
    expect(source).not.toContain("createSupabaseAdminClient");
  });

  it("keeps Admin dice history read-only and suppresses terminal mutation controls", () => {
    expect(source).toContain("forceReadOnly");
    expect(source).toContain("readOnly={terminalTournament}");
    expect(source).toContain("!readOnly && deadlineManaged");
    expect(source).toContain("!readOnly && (");
  });

  it("keeps the near-full-screen Match workspace keyboard and safe-area aware", () => {
    expect(source).toContain("dialogRef");
    expect(source).toContain("closeButtonRef");
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("env(safe-area-inset-top)");
    expect(source).toContain("h-[100dvh]");
    expect(source).toContain("sm:h-[90dvh]");
    expect(source).toContain("const dialogTitleId = useId()");
    expect(source).toContain("if (opener?.isConnected) opener.focus()");
  });
});
