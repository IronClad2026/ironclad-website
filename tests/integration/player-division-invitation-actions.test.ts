import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

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
  respondToTournamentDivisionInvitationAction,
  type PlayerDivisionInvitationActionState,
} from "@/app/dashboard/registration-actions";

const invitationId = "11111111-1111-4111-8111-111111111111";
const targetTournamentId = "22222222-2222-4222-8222-222222222222";
const targetBracketId = "33333333-3333-4333-8333-333333333333";
const initialState: PlayerDivisionInvitationActionState = {
  status: "idle",
  message: "",
};

describe("player optional Division invitation response", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires an authenticated recipient before privileged access", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await respondToTournamentDivisionInvitationAction(
      initialState,
      responseForm("accept")
    );

    expect(result.status).toBe("error");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("records acceptance then opens the existing normal registration flow", async () => {
    const rpc = responseRpc("accepted");
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      respondToTournamentDivisionInvitationAction(
        initialState,
        responseForm("accept")
      )
    ).rejects.toThrow(
      "NEXT_REDIRECT:/tournaments?tournament=ironclad-open-two&register=1"
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "respond_to_tournament_division_invitation",
      {
        p_invitation_id: invitationId,
        p_recipient_clerk_user_id: playerIdentity.userId,
        p_response: "accept",
      }
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(
      "submit_verified_player_registration"
    );
  });

  it("records decline without creating a registration", async () => {
    const rpc = responseRpc("declined");
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await respondToTournamentDivisionInvitationAction(
      initialState,
      responseForm("decline")
    );

    expect(result).toEqual({
      status: "success",
      message: "Invitation declined. No registration was created.",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("treats authoritative invalidation as unavailable", async () => {
    const rpc = responseRpc("invalidated");
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await respondToTournamentDivisionInvitationAction(
      initialState,
      responseForm("accept")
    );

    expect(result.status).toBe("error");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("contains no alternate registration writer", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/dashboard/registration-actions.ts"),
      "utf8"
    );
    const start = source.indexOf(
      "export async function respondToTournamentDivisionInvitationAction"
    );
    const end = source.indexOf("type AuthenticatedSupabaseClient", start);
    const invitationAction = source.slice(start, end);

    expect(invitationAction).not.toContain(".from(\"registrations\")");
    expect(invitationAction).not.toContain(
      "submit_verified_player_registration"
    );
  });
});

function responseForm(response: string) {
  const formData = new FormData();
  formData.set("invitationId", invitationId);
  formData.set("response", response);
  return formData;
}

function responseRpc(status: "accepted" | "declined" | "invalidated") {
  return vi.fn(async () => ({
    data: {
      invitationId,
      status,
      targetTournamentId,
      targetTournamentSlug: "ironclad-open-two",
      targetTournamentBracketId: targetBracketId,
      ...(status === "invalidated"
        ? { invalidationReason: "target_registration_unavailable" }
        : {}),
    },
    error: null,
  }));
}
