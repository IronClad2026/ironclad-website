"use server";

import { auth } from "@clerk/nextjs/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import {
  isRollMatchDiceInput,
  parseMatchDiceRollRpcResult,
  type MatchDiceRollActionResult,
  type RollMatchDiceInput,
} from "@/lib/match-dice";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

const GENERIC_ROLL_ERROR =
  "Dice Roll-Off could not be completed. Refresh the Match and try again.";

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

  await requireCurrentAccountLegalAcceptance();

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
  } catch {
    console.error("Match dice roll RPC failed unexpectedly.");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  if (result.error) {
    console.error("Match dice roll RPC rejected the request.");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  const parsed = parseMatchDiceRollRpcResult(result.data, input.matchId);
  if (!parsed) {
    console.error("Match dice roll RPC returned an invalid projection.");
    return { ok: false, error: GENERIC_ROLL_ERROR, code: "roll_failed" };
  }

  return { ok: true, data: parsed };
}
