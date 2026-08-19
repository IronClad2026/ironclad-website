"use server";

import { auth } from "@clerk/nextjs/server";
import {
  isSubmitPollVoteInput,
  parsePollVoteResult,
  type PollVoteResult,
  type SubmitPollVoteInput,
} from "@/lib/polls";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export type PollBallotActionResult =
  | { ok: true; data: PollVoteResult }
  | {
      ok: false;
      error: string;
      code: "auth_required" | "invalid_request" | "save_failed";
    };

const GENERIC_BALLOT_ERROR =
  "Your ballot could not be saved. Refresh the Poll and try again.";

export async function castPollBallot(
  input: SubmitPollVoteInput
): Promise<PollBallotActionResult> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Poll ballot authentication failed.");
    return {
      ok: false,
      error: "Your session could not be verified. Sign in again.",
      code: "auth_required",
    };
  }

  if (!userId) {
    return { ok: false, error: "Sign in before voting in this Poll.", code: "auth_required" };
  }

  if (!isSubmitPollVoteInput(input)) {
    return { ok: false, error: "The Poll ballot request is invalid.", code: "invalid_request" };
  }

  let supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>;

  try {
    supabase = await createAuthenticatedSupabaseClient();
  } catch {
    console.error("Poll ballot authenticated client creation failed.");
    return { ok: false, error: GENERIC_BALLOT_ERROR, code: "save_failed" };
  }

  let result: { data: unknown; error: unknown };

  try {
    result = await supabase.rpc("cast_poll_ballot", {
      p_poll_id: input.pollId,
      p_expected_revision: input.expectedRevision,
      p_option_ids: input.selectedOptionIds,
    });
  } catch {
    console.error("Poll ballot RPC failed unexpectedly.");
    return { ok: false, error: GENERIC_BALLOT_ERROR, code: "save_failed" };
  }

  if (result.error) {
    console.error("Poll ballot RPC rejected the request.");
    return { ok: false, error: GENERIC_BALLOT_ERROR, code: "save_failed" };
  }

  const parsed = parsePollVoteResult(result.data, input.pollId);
  if (!parsed) {
    console.error("Poll ballot RPC returned an invalid projection.");
    return { ok: false, error: GENERIC_BALLOT_ERROR, code: "save_failed" };
  }

  return { ok: true, data: parsed };
}
