import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  closeTournamentDivisionWithoutLaunch,
  generateTournamentBracket,
  launchTournamentDivision,
} from "@/app/admin/tournaments/actions";

const actionsSource = readFileSync(
  resolve(process.cwd(), "app/admin/tournaments/actions.ts"),
  "utf8"
);
const editorSource = readFileSync(
  resolve(
    process.cwd(),
    "components/admin/tournaments/TournamentEditor.tsx"
  ),
  "utf8"
);
const generationActionSource = actionsSource.slice(
  actionsSource.indexOf("export async function generateTournamentBracket("),
  actionsSource.indexOf("export async function saveBracketAssignments(")
);
const bracketId = "323e4567-e89b-42d3-a456-426614174000";

const tournamentId = "123e4567-e89b-42d3-a456-426614174000";

function launchFormData({ workspace = false } = {}) {
  const formData = new FormData();
  formData.set("tournamentBracketId", bracketId);
  if (workspace) {
    formData.set("workspaceTournamentId", tournamentId);
  }
  return formData;
}

function generationFormData() {
  const formData = new FormData();
  formData.set(
    "tournamentId",
    tournamentId
  );
  formData.set("bracketId", bracketId);
  formData.set("workspaceSection", "bracket");
  return formData;
}

function notHeldFormData({
  confirmation = "NOT HELD",
  detail = "  Below minimum roster at the operational cutoff.  ",
} = {}) {
  const formData = new FormData();
  formData.set("tournamentBracketId", bracketId);
  formData.set("workspaceTournamentId", tournamentId);
  formData.set("confirmation", confirmation);
  formData.set("detail", detail);
  return formData;
}

describe("explicit administrator division launch action", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a non-administrator before creating a service-role client", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(launchTournamentDivision(launchFormData()))
      .rejects.toThrow("Unauthorized");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("validates input and delegates the atomic launch to the scoped RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          tournament_id: "123e4567-e89b-42d3-a456-426614174000",
          tournament_bracket_id: bracketId,
          launched_at: "2026-08-06T08:30:00.000Z",
          already_launched: false,
        },
      ],
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(launchTournamentDivision(launchFormData({ workspace: true })))
      .rejects.toThrow(
        `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=bracket&bracketNotice=division-launched`
      );
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "launch_tournament_division",
      {
        p_tournament_bracket_id: bracketId,
        p_actor_clerk_user_id: adminIdentity.userId,
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/registrations");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/admin/tournaments/${tournamentId}`,
      "page"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments");
  });

  it("surfaces an idempotent repeat without changing the original launch", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          tournament_id: "123e4567-e89b-42d3-a456-426614174000",
          tournament_bracket_id: bracketId,
          launched_at: "2026-08-06T08:30:00.000Z",
          already_launched: true,
        },
      ],
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(launchTournamentDivision(launchFormData()))
      .rejects.toThrow(
        "NEXT_REDIRECT:/admin?bracketNotice=division-already-launched"
      );
  });
});

describe("private bracket generation action", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("uses only the Phase 4 launch-aware generator for initial and repeat requests", () => {
    expect(generationActionSource).toContain(
      'supabase.rpc("generate_tournament_bracket"'
    );
    expect(generationActionSource).not.toContain(
      "repair_generated_bracket_matches"
    );
    expect(generationActionSource).not.toContain(
      '.from("generated_brackets")'
    );
    expect(generationActionSource).toContain('revalidatePath("/admin")');
    expect(generationActionSource).toContain(
      'revalidatePath("/admin/registrations")'
    );
  });

  it("routes a repeat admin request through the launch-aware generator", async () => {
    const rpc = vi.fn(async () => ({
      data: "223e4567-e89b-42d3-a456-426614174000",
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(generateTournamentBracket(generationFormData()))
      .rejects.toThrow(
        `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=bracket&notice=bracket-generated`
      );
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "generate_tournament_bracket",
      {
        p_tournament_bracket_id: bracketId,
        p_generated_by: adminIdentity.userId,
      }
    );
  });
});

describe("administrator Not Held Division action", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a non-administrator before privileged access", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(
      closeTournamentDivisionWithoutLaunch(notHeldFormData())
    ).rejects.toThrow("Unauthorized");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("requires the exact deliberate confirmation before privileged access", async () => {
    authMock.mockResolvedValue(adminIdentity);

    await expect(
      closeTournamentDivisionWithoutLaunch(
        notHeldFormData({ confirmation: "not held" })
      )
    ).rejects.toThrow(
      `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=bracket&bracketNotice=division-not-held-invalid`
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("delegates to the single fixed-reason database authority", async () => {
    const notHeldAt = "2026-09-03T00:00:00.000Z";
    const rpc = vi.fn(async () => ({
      data: {
        tournamentId,
        tournamentBracketId: bracketId,
        notHeldAt,
        reasonCode: "minimum_roster_not_reached",
        activeRegistrationCount: 3,
        waitlistRegistrationCount: 2,
        alreadyNotHeld: false,
      },
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      closeTournamentDivisionWithoutLaunch(notHeldFormData())
    ).rejects.toThrow(
      `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=bracket&bracketNotice=division-not-held`
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "close_tournament_division_without_launch",
      {
        p_tournament_bracket_id: bracketId,
        p_reason_code: "minimum_roster_not_reached",
        p_detail: "Below minimum roster at the operational cutoff.",
        p_actor_clerk_user_id: adminIdentity.userId,
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/admin/tournaments/${tournamentId}`,
      "page"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments");
  });

  it("does not claim success for malformed authority output", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        tournamentId,
        tournamentBracketId: bracketId,
        notHeldAt: "not-a-time",
        reasonCode: "minimum_roster_not_reached",
        activeRegistrationCount: 3,
        waitlistRegistrationCount: 0,
        alreadyNotHeld: false,
      },
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      closeTournamentDivisionWithoutLaunch(notHeldFormData())
    ).rejects.toThrow(
      `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=bracket&bracketNotice=division-not-held-failed`
    );
    expect(console.error).toHaveBeenCalledWith(
      "Tournament Division Not Held closure failed.",
      { code: "NOT_HELD_FAILED" }
    );
  });
});

describe("generic tournament editor lifecycle boundary", () => {
  it("does not expose ordinary start or reopen status choices", () => {
    expect(editorSource).not.toContain('["in_progress", "In Progress"]');
    expect(editorSource).toContain(
      'return [["in_progress", "In Progress — managed by division launch"]]'
    );
    expect(editorSource).toContain(
      'return [["completed", "Completed — managed by match lifecycle"]]'
    );
    expect(editorSource).toContain('name="workspaceSection"');
    expect(editorSource).toContain('value="bracket"');
  });

  it("validates lifecycle transitions against authoritative stored state", () => {
    expect(actionsSource).toContain(
      '"slug, banner_image_url, status, registration_enabled, grand_final_at"'
    );
    expect(actionsSource).toContain(
      "Tournament lifecycle status is managed by Launch Division and match completion"
    );
    expect(actionsSource).toContain(
      "registrationEnabled = existingTournament.registrationEnabled"
    );
  });
});
