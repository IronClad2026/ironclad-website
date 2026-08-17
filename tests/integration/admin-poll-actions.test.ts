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
  cancelPoll,
  loadAdminPollSnapshot,
  previewPollEligibility,
  publishPoll,
  publishPollFinalDecision,
  savePollDraft,
} from "@/app/admin/polls/actions";
import AdminPollsPage from "@/app/admin/polls/page";

const pollId = "123e4567-e89b-42d3-a456-426614174000";
const tournamentId = "223e4567-e89b-42d3-a456-426614174000";
const optionIds = [
  "323e4567-e89b-42d3-a456-426614174000",
  "423e4567-e89b-42d3-a456-426614174000",
];

function bindingDraftForm() {
  const formData = new FormData();
  formData.set("purpose", "tournament_decision");
  formData.set("audienceKind", "tournament_approved");
  formData.set("tournamentId", tournamentId);
  formData.set("question", "Which maps should form the next pool?");
  formData.set("context", "Choose up to two maps.");
  formData.set("optionSource", "text");
  formData.set("maxSelections", "2");
  formData.set("winnerCount", "2");
  formData.set("authority", "binding");
  formData.set("resultVisibility", "after_close");
  formData.set("publicFinalTotals", "false");
  formData.set("opensAt", "2026-08-18T10:00:00.000Z");
  formData.set("closesAt", "2026-08-19T10:00:00.000Z");
  formData.append("optionLabels", "Road to Tunis");
  formData.append("optionLabels", "Faymonville");
  return formData;
}

describe("administrator Polls & Decisions actions", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a non-administrator before creating a trusted client", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(savePollDraft(bindingDraftForm())).rejects.toThrow(
      "Unauthorized"
    );
    await expect(loadAdminPollSnapshot(pollId)).rejects.toThrow("Unauthorized");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects the Admin Polls route before creating a trusted client", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(
      AdminPollsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects a forged refresh identifier before creating a trusted client", async () => {
    authMock.mockResolvedValue(adminIdentity);

    await expect(loadAdminPollSnapshot("forged-poll")).resolves.toEqual({
      ok: false,
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects Community Feedback configured as Binding before trusted access", async () => {
    const formData = bindingDraftForm();
    formData.set("purpose", "community_feedback");
    formData.set("audienceKind", "active_players");
    formData.set("tournamentId", "");
    authMock.mockResolvedValue(adminIdentity);

    await expect(savePollDraft(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/polls?notice=invalid-draft"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("saves a strictly parsed top-K Draft through the service-only RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { poll_id: pollId, saved: true },
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(savePollDraft(bindingDraftForm())).rejects.toThrow(
      `NEXT_REDIRECT:/admin/polls?notice=draft-saved&selected=${pollId}`
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_poll_draft", {
      p_poll_id: null,
      p_purpose: "tournament_decision",
      p_audience_kind: "tournament_approved",
      p_tournament_id: tournamentId,
      p_tournament_bracket_id: null,
      p_question: "Which maps should form the next pool?",
      p_context: "Choose up to two maps.",
      p_option_source: "text",
      p_options: [
        { position: 1, label: "Road to Tunis" },
        { position: 2, label: "Faymonville" },
      ],
      p_max_selections: 2,
      p_winner_count: 2,
      p_authority: "binding",
      p_result_visibility: "after_close",
      p_public_final_totals: false,
      p_opens_at: "2026-08-18T10:00:00.000Z",
      p_closes_at: "2026-08-19T10:00:00.000Z",
      p_selected_player_ids: [],
      p_actor_clerk_user_id: adminIdentity.userId,
    });
  });

  it("rejects winner and selection limits outside the locked contract", async () => {
    const formData = bindingDraftForm();
    formData.set("maxSelections", "6");
    formData.set("winnerCount", "3");
    authMock.mockResolvedValue(adminIdentity);

    await expect(savePollDraft(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/polls?notice=invalid-draft"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("preserves blank option positions so strict Draft validation rejects them", async () => {
    const formData = bindingDraftForm();
    formData.delete("optionLabels");
    formData.append("optionLabels", "Road to Tunis");
    formData.append("optionLabels", "   ");
    formData.append("optionLabels", "Faymonville");
    authMock.mockResolvedValue(adminIdentity);

    await expect(savePollDraft(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/polls?notice=invalid-draft"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("validates publish, cancellation, and final-decision identifiers before trusted access", async () => {
    authMock.mockResolvedValue(adminIdentity);
    const invalid = new FormData();
    invalid.set("pollId", "forged");
    invalid.set("reason", "A valid cancellation reason.");
    invalid.append("optionIds", optionIds[0]);

    await expect(publishPoll(invalid)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/polls?notice=invalid-publish"
    );
    await expect(cancelPoll(invalid)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/polls?notice=invalid-cancel"
    );
    await expect(publishPollFinalDecision(invalid)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/polls?notice=invalid-final-decision"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("previews and publishes by identifier while accepting only a validated publication result", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { poll_id: pollId, eligible_count: 12, players: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          poll_id: pollId,
          published_at: "2026-08-18T09:00:00.000Z",
          eligible_count: 12,
        },
        error: null,
      });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.set("pollId", pollId);

    await expect(previewPollEligibility(formData)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/polls?notice=eligibility-preview&eligible=12&selected=${pollId}`
    );
    await expect(publishPoll(formData)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/polls?notice=published&eligible=12&selected=${pollId}`
    );
    expect(rpc).toHaveBeenNthCalledWith(1, "preview_poll_eligibility", {
      p_poll_id: pollId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "publish_poll", {
      p_poll_id: pollId,
      p_actor_clerk_user_id: adminIdentity.userId,
    });
  });

  it("rejects malformed Admin refresh projections instead of forwarding raw data", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        poll: {
          id: pollId,
          private_actor: "must-not-cross-the-action-boundary",
        },
      },
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(loadAdminPollSnapshot(pollId)).resolves.toEqual({ ok: false });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_admin_poll", {
      p_poll_id: pollId,
    });
  });

  it("delegates cancellation and final publication without accepting actor identity", async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });
    const cancelData = new FormData();
    cancelData.set("pollId", pollId);
    cancelData.set("reason", "Published audience was configured incorrectly.");
    const finalData = new FormData();
    finalData.set("pollId", pollId);
    finalData.append("optionIds", optionIds[0]);
    finalData.append("optionIds", optionIds[1]);
    finalData.set("rationale", "The final Advisory set reflects tournament needs.");

    await expect(cancelPoll(cancelData)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/polls?notice=cancelled&selected=${pollId}`
    );
    await expect(publishPollFinalDecision(finalData)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/polls?notice=final-decision-published&selected=${pollId}`
    );
    expect(rpc).toHaveBeenNthCalledWith(1, "cancel_poll", {
      p_poll_id: pollId,
      p_reason: "Published audience was configured incorrectly.",
      p_actor_clerk_user_id: adminIdentity.userId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_poll_decision", {
      p_poll_id: pollId,
      p_selected_option_ids: optionIds,
      p_rationale: "The final Advisory set reflects tournament needs.",
      p_actor_clerk_user_id: adminIdentity.userId,
    });
  });

  it("permits an empty Admin selection when a Binding outcome has no cutoff tie", async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.set("pollId", pollId);

    await expect(publishPollFinalDecision(formData)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/polls?notice=final-decision-published&selected=${pollId}`
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("finalize_poll_decision", {
      p_poll_id: pollId,
      p_selected_option_ids: [],
      p_rationale: null,
      p_actor_clerk_user_id: adminIdentity.userId,
    });
  });
});
