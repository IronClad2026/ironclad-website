"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  AccountLegalMutationBlockedError,
  requireCurrentAccountLegalAcceptance,
} from "@/lib/account-legal-mutation-guard";
import { isAccountLegalAcceptanceRpcError } from "@/lib/account-legal-rpc-error";
import {
  isMatchDiceId,
  isRollMatchDiceInput,
  parseMatchDiceRollRpcResult,
  parseMatchDiceSnapshot,
  type MatchDiceHistoryResult,
  type MatchDiceRollActionResult,
  type RollMatchDiceInput,
} from "@/lib/match-dice";
import { callVerifiedMatchStaff, getVerifiedMatchStaff } from "@/lib/match-staff-server";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

const GENERIC_ROLL_ERROR =
  "Dice Roll-Off could not be completed. Refresh the Match and try again.";

export async function getMatchDiceHistory(matchId: string): Promise<MatchDiceHistoryResult> {
  if (!isMatchDiceId(matchId)) return { ok: false, code: "invalid_request" };

  try {
    const session = await auth();
    if (!session.userId) return { ok: false, code: "auth_required" };
    const args = { p_match_id: matchId };
    const supabase = await createAuthenticatedSupabaseClient();
    let result = await supabase.rpc("get_match_dice_rolloff", args);
    if (result.error?.code === "42501" && result.error.message !== "PROFILE_NOTICE_REQUIRED") {
      const staff = await getVerifiedMatchStaff(session, false);
      if (staff) result = await callVerifiedMatchStaff(staff, "get_match_dice_rolloff", args);
    }
    if (result.error) return { ok: false, code: "unavailable" };
    const snapshot = parseMatchDiceSnapshot(result.data, matchId);
    return snapshot ? { ok: true, snapshot } : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function rollMatchDice(
  input: RollMatchDiceInput
): Promise<MatchDiceRollActionResult> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Match dice authentication failed.");
    return { ok: false, error: "Your session could not be verified. Sign in again.", code: "auth_required" };
  }

  if (!userId) {
    return { ok: false, error: "Sign in before using the Dice Roll-Off.", code: "auth_required" };
  }

  try {
    await requireCurrentAccountLegalAcceptance();
  } catch (error) {
    if (!(error instanceof AccountLegalMutationBlockedError)) throw error;
    revalidatePath("/", "layout");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  if (!isRollMatchDiceInput(input)) {
    return { ok: false, error: "The Dice Roll-Off request is invalid.", code: "invalid_request" };
  }

  let supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>;

  try {
    supabase = await createAuthenticatedSupabaseClient();
  } catch {
    console.error("Match dice authenticated client creation failed.");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  let result: { data: unknown; error: unknown };

  try {
    result = await supabase.rpc("roll_match_dice", {
      p_match_id: input.matchId,
      p_expected_activation_version: input.expectedActivationVersion,
      p_game_number: input.gameNumber,
      p_expected_tie_round: input.expectedTieRound,
    });
  } catch (error) {
    if (isAccountLegalAcceptanceRpcError(error)) revalidatePath("/", "layout");
    else console.error("Match dice roll RPC failed unexpectedly.");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  if (result.error) {
    if (isAccountLegalAcceptanceRpcError(result.error)) revalidatePath("/", "layout");
    else console.error("Match dice roll RPC rejected the request.");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  const parsed = parseMatchDiceRollRpcResult(result.data, input.matchId);
  if (!parsed) {
    console.error("Match dice roll RPC returned an invalid projection.");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  return { ok: true, data: parsed };
}
